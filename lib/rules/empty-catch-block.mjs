import { defineRule } from '../rule.mjs';

/* Purely structural: a CATCH statement followed by nothing before the next
 * CATCH, CLEANUP or ENDTRY. A comment does not fill the block - it is no
 * statement, and SLIN reads it the same way. */
const ENDS_THE_BLOCK = new Set(['ENDTRY', 'CATCH', 'CLEANUP']);

export default defineRule({
  id: 'empty-catch-block',
  severity: 'hint',
  category: 'structure',
  scope: 'class',
  summary: 'an empty CATCH block without `##NO_HANDLER`',
  detail: 'The extended check (SLIN/ATC) runs in real systems, not in a systemless pipeline — so an empty handler ships through a green CI and surfaces as a finding on somebody else\'s system. `##NO_HANDLER` on the CATCH statement is how a deliberately empty handler says so. Purely structural: a CATCH statement followed by nothing before the next CATCH, CLEANUP or ENDTRY. A comment does not fill the block — SLIN reads it the same way, and the pragma is the sanctioned answer, not prose. A hint, like `redundant-conv-i`: the code is correct, the extended check is what speaks.',
  example: `TRY.
    risky( ).
  CATCH cx_root.   " SLIN: empty handler
ENDTRY.`,
  remedy: `TRY.
    risky( ).
  CATCH cx_root ##NO_HANDLER.   " deliberate, and says so
ENDTRY.`,
  message: (f) => `empty CATCH${f.member ? ` ${f.member}` : ''} block — the extended check (SLIN) reports it on every real system; a deliberately empty handler says so with ##NO_HANDLER on the CATCH statement`,
  check({ model, report }) {
    for (const s of model.statementsOf('CATCH')) {
      if (s.pragmas.includes('##NO_HANDLER')) continue;
      const next = model.next(s);
      if (!next || !ENDS_THE_BLOCK.has(next.keyword)) continue;
      // the first exception named, past an optional BEFORE UNWIND
      const words = s.tokens.slice(1).filter((t) => t.kind === 'word');
      const named = words[0]?.upper === 'BEFORE' && words[1]?.upper === 'UNWIND' ? words[2] : words[0];
      // dedupe carries the offset so two empty catches of the SAME exception
      // in one class stay two findings (the collapse key would merge them)
      report({ member: named?.text ?? '', dedupe: String(s.start), offset: s.start });
    }
  },
});
