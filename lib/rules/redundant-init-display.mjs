import { defineRule } from '../rule.mjs';
import { ifBranchEnd } from '../abap-source.mjs';
import { dispatchFacts } from '../lifecycle-rules.mjs';

function check({ src, source, report }) {
  const { bodies, redisplays } = dispatchFacts(src);
  /* The INVERSE of the two rules below: a lifecycle fork that decides nothing.
   *
   * `check_on_init( )` is "this app INSTANCE never ran", and it IMPLIES
   * `check_on_navigated( )` — every path to an instance's first `main( )`
   * raises the navigated flag as well (`factory_first_start` for a fresh start
   * and for a draft restore, `factory_system_startup`, `prepare_app_stack` for
   * both legs of a nav_app_call). The interface says so itself. So two shapes
   * are pure redundancy:
   *
   *   IF client->check_on_init( ) OR client->check_on_navigated( ).
   *   → the OR can never change the verdict; the second call alone is it.
   *
   *   IF client->check_on_init( ).      ELSEIF client->check_on_navigated( ).
   *     client->view_display( … ).        client->view_display( … ).
   *   → the arms are the same statement, so the fork is four lines saying what
   *     the ELSEIF says on its own.
   *
   * The fork is judged only where BOTH arms are one IDENTICAL display call.
   * Where the navigated arm does anything else — an on_navigation( ), an app
   * return handled first — the fork really does decide something and the init
   * arm stays; reading the branches less exactly is what would report those.
   * 201 classes in the corpus carried one of the two forms. */
  {
    /* Statements of a branch, literal-aware: a `.` inside a backtick literal
     * or a |…| template does not end a statement, and scrub( ) keeps literal
     * CONTENT (it only blanks comments), so splitting on a bare dot would cut
     * one statement into two and let a two-statement branch read as one. */
    const statements = (text) => {
      const out = [];
      let cur = '';
      let str = null;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (str) {
          cur += c;
          if (str === '|' && c === '\\') { cur += text[++i] ?? ''; continue; }
          if (c === str) str = null;
          continue;
        }
        if (c === '`' || c === '|' || c === "'") { str = c; cur += c; continue; }
        if (c === '.') {
          const t = cur.trim().replace(/\s+/g, ' ');
          if (t) out.push(t);
          cur = '';
          continue;
        }
        cur += c;
      }
      return out;
    };
    const DISPLAY_CALL = /^(?:me->)?\w*client\s*->\s*(?:view_display|nest2?_view_display|popup_display|popover_display)\s*\(/i;

    /* Both shapes carry a fix, and both are exact by the implication above:
     * the OR form loses the init call and the OR; the fork loses its init arm
     * and its ELSEIF becomes the IF. Each is offered only where the ORIGINAL
     * source spells the span the same as the scrubbed copy — a comment inside
     * it would be deleted with the code, which is the guess fix.mjs forbids. */
    const same = (start, end) => !source || source.slice(start, end) === src.slice(start, end);

    for (const m of src.matchAll(/\bIF\s+((?:me->)?\w*client\s*->check_on_(init|navigated)\s*\(\s*\))(\s+OR\s+)((?:me->)?\w*client\s*->check_on_(init|navigated)\s*\(\s*\))\s*\./gi)) {
      if (m[2].toLowerCase() === m[4].toLowerCase()) continue;
      const first = m.index + m[0].indexOf(m[1]);
      const second = first + m[1].length + m[3].length;
      // delete the init call together with the OR beside it
      const [start, end] = m[2].toLowerCase() === 'init'
        ? [first, second]
        : [first + m[1].length, second + m[4].length];
      report({
        member: 'OR', offset: m.index,
        ...(same(start, end) ? { fixes: [{ start, end, text: '' }] } : {}),
      });
    }

    for (const m of src.matchAll(/\bIF\s+(?:me->)?\w*client\s*->check_on_init\s*\(\s*\)\s*\./gi)) {
      const initEnd = ifBranchEnd(src, m.index + m[0].length);
      const el = src.slice(initEnd).match(/^\s*ELSEIF\s+(?:me->)?\w*client\s*->check_on_navigated\s*\(\s*\)\s*\./i);
      if (!el) continue;
      const navStart = initEnd + el[0].length;
      const initStmts = statements(src.slice(m.index + m[0].length, initEnd));
      const navStmts = statements(src.slice(navStart, ifBranchEnd(src, navStart)));
      if (initStmts.length !== 1 || navStmts.length !== 1) continue;
      if (initStmts[0] !== navStmts[0]) continue;
      /* the one statement is a display call - written out, or the usual
       * corpus spelling `view_display( )` / `me->set_view( )`, a helper of
       * this class that displays: two identical helper calls decide as
       * little as two identical client calls do */
      const helper = initStmts[0].match(/^(?:me->)?(\w+)\s*\(/);
      const displays = DISPLAY_CALL.test(initStmts[0])
        || (helper && bodies.has(helper[1].toLowerCase()) && redisplays(bodies.get(helper[1].toLowerCase()).text));
      if (!displays) continue;
      // delete from the IF up to and including the `ELSE` of the ELSEIF, so
      // the navigated branch's own condition is what opens the block
      const end = initEnd + el[0].search(/ELSEIF/i) + 'ELSE'.length;
      report({
        member: 'fork', offset: m.index,
        ...(same(m.index, end) ? { fixes: [{ start: m.index, end, text: '' }] } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'redundant-init-display',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a lifecycle fork whose two arms do the same thing',
  detail: '`check_on_init( )` is "this app INSTANCE never ran", and it **implies** `check_on_navigated( )`: every path to an instance\'s first `main( )` raises the navigated flag too — `factory_first_start` for a fresh start and for a draft restore, `factory_system_startup`, and `prepare_app_stack` for both legs of a `nav_app_call`. The interface states it. So `IF check_on_init( ) OR check_on_navigated( )` can never change its verdict on the OR, and an init branch whose only statement is the same display call its `ELSEIF check_on_navigated( )` twin makes is four lines saying what the ELSEIF says alone. The fork is only reported where BOTH arms are one identical display call — where the navigated arm does anything else (an `on_navigation( )`, an app return handled first) the fork really does decide something and the init arm stays.',
  example: `IF client->check_on_init( ) OR client->check_on_navigated( ).   " the OR decides nothing
  client->view_display( view->stringify( ) ).
ENDIF.`,
  remedy: `IF client->check_on_navigated( ).   " on_init implies it - one branch is enough
  client->view_display( view->stringify( ) ).
ENDIF.`,
  fixNote: 'The OR form loses the `check_on_init( )` call together with the `OR` beside it, whichever side it is on; the fork loses its whole init arm — from the `IF` up to the `ELSE` of the `ELSEIF`, which then opens the block as the `IF`. Both are exact by the implication the rule rests on. A span with a comment inside it is reported without a fix, because deleting a comment nobody asked about would be a guess.',
  message: (f) => f.member === 'OR'
        ? 'check_on_init( ) OR check_on_navigated( ) — init true implies navigated true, so the OR can never change the verdict; check_on_navigated( ) alone is the condition'
        : 'both arms of the fork are the same display call — check_on_init( ) implies check_on_navigated( ), so the init branch decides nothing; drop it and keep the ELSEIF',
  check,
});
