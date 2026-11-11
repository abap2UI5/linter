import { defineRule } from '../rule.mjs';
import { ifBlockEnd, ifBranchEnd } from '../abap-source.mjs';
import { dispatchFacts, hasOwnElse } from '../lifecycle-rules.mjs';

function check({ src, report }) {
  const { redisplays } = dispatchFacts(src);
  /* Lifecycle checks split into separate IF blocks instead of one IF/ELSEIF
   * chain. The lifecycle flags are not all mutually exclusive, so separate
   * blocks can execute more than one branch on a single roundtrip — the
   * classic symptom is work done twice after a navigation. An ELSEIF chain
   * makes the branches exclusive by construction (the spelling has no word
   * boundary before its IF, so it never counts here). The one other
   * exclusive form is the GUARD idiom — an IF block that leaves the method
   * (`IF client->check_on_event( \`GO\` ). … RETURN. ENDIF.`): control never
   * flows from it into the next block, so it does not count either. */

  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const open = [];
    for (const c of mm[0].matchAll(/\bIF\s+(?:me->)?\w*client\s*->(check_on_\w+)\s*\(/gi)) {
      const end = ifBranchEnd(mm[0], c.index + c[0].length);
      if (!/\bRETURN\b|\bLEAVE\b/i.test(mm[0].slice(c.index, end))) open.push(c);
    }
    if (open.length >= 2) {
      /* The fix folds ADJACENT blocks: `ENDIF.` followed by nothing but
       * whitespace and the next lifecycle `IF` becomes one `ELSEIF`. Only
       * where the first block carries no ELSE at its own level (an ELSEIF
       * after an ELSE does not compile) - a block with statements between
       * the two, or one nested in the other, is reported without a fix. */
      const fixes = [];
      for (let i = 0; i + 1 < open.length; i++) {
        const condEnd = open[i].index + open[i][0].length;
        const blockEnd = ifBlockEnd(mm[0], condEnd);
        const gap = mm[0].slice(blockEnd, open[i + 1].index);
        if (!/^\s*\.\s*$/.test(gap) || hasOwnElse(mm[0], condEnd)) continue;
        /* One pair the fold breaks rather than repairs: an init block that
         * seeds and displays NOTHING, followed by a navigated block that
         * displays. `check_on_init( )` implies `check_on_navigated( )`, so
         * today both blocks run on the first roundtrip and the app comes up
         * with its view; folded, the ELSEIF is never reached on that
         * roundtrip and the first screen stays empty. The guide's shape
         * repeats the display in the init arm - a decision, not a mechanical
         * edit - so the finding stays and carries no fix for this pair. */
        if (/^check_on_init$/i.test(open[i][1]) && /^check_on_navigated$/i.test(open[i + 1][1])) {
          const nextCondEnd = open[i + 1].index + open[i + 1][0].length;
          const initBlock = mm[0].slice(condEnd, blockEnd);
          const navigatedBlock = mm[0].slice(nextCondEnd, ifBlockEnd(mm[0], nextCondEnd));
          if (!redisplays(initBlock) && redisplays(navigatedBlock)) continue;
        }
        fixes.push({ start: mm.index + blockEnd - 'ENDIF'.length, end: mm.index + open[i + 1].index + 'IF'.length, text: 'ELSEIF' });
      }
      report({
        member: open[1][1],
        count: open.length, offset: mm.index + open[1].index,
        ...(fixes.length ? { fixes } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'separate-lifecycle-ifs',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'lifecycle checks in separate `IF` blocks instead of one `IF`/`ELSEIF` chain',
  detail: 'The lifecycle flags (`check_on_init`, `check_on_event`, `check_on_navigated`, …) are not all mutually exclusive, so separate `IF` blocks can execute more than one branch on a single roundtrip — the classic symptom is work done twice after a navigation. One `IF`/`ELSEIF` chain makes the branches exclusive by construction. The guard idiom is exclusive too and is never reported: an `IF` block that leaves the method (`IF client->check_on_event( \\`GO\\` ). … RETURN. ENDIF.`) cannot flow into the next block.',
  example: `IF client->check_on_init( ).
  " …
ENDIF.
IF client->check_on_navigated( ).   " a second IF: both branches can run
  " …
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  " …
ELSEIF client->check_on_navigated( ).
  " …
ENDIF.`,
  fixNote: 'Adjacent blocks are folded: an `ENDIF.` followed by nothing but the next lifecycle `IF` becomes one `ELSEIF`. A block that carries an `ELSE`, or statements between the two, is reported without a fix. So is the one pair the fold would break: a `check_on_init( )` block that seeds and displays nothing, followed by a `check_on_navigated( )` block that displays — `check_on_init` implies `check_on_navigated`, so today both run on the first roundtrip, and folded, the first screen would stay empty. Repeat the display in the init arm (the guide\'s shape) or move the seed there; that is a decision, not a mechanical edit.',
  message: (f) => `a second IF client->${f.member}( ) in the same method — lifecycle checks belong in one IF/ELSEIF chain; separate IF blocks can run more than one branch per roundtrip`,
  check,
});
