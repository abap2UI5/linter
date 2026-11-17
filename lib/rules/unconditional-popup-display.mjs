import { defineRule } from '../rule.mjs';
import { displayFlow } from '../lifecycle-rules.mjs';
import { branchTail } from '../abap-source.mjs';
import { blankLiterals } from '../abap.mjs';

function check({ src, report }) {
  const { blank, displayCallIn, POPUP_ONE } = displayFlow(src);
  /* A popup or popover displayed on EVERY roundtrip. `popup_display( )`
   * loads the fragment anew and opens it each time it is called — there is
   * no "unchanged, keep it" path on the frontend — so a call at the top
   * level of main( ), outside any branch and behind no guard, rebuilds the
   * dialog on every event the app receives: the field being typed in loses
   * focus, the scroll position resets, a selection is gone. Every popup
   * class in the framework itself displays from its check_on_init( ) branch
   * or behind a RETURN guard. Judged on z2ui5_if_app~main only, and only
   * where no RETURN/LEAVE/CHECK/EXIT precedes the call — a guard block that
   * leaves the method makes everything after it conditional. */
  for (const mm of blank.matchAll(/\bMETHOD\s+z2ui5_if_app~main\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
    const body = mm[1];
    const base = mm.index + mm[0].length - 'ENDMETHOD'.length - body.length;
    const tail = branchTail(body, 0);
    const m = displayCallIn(tail.text, POPUP_ONE);
    if (!m) continue;
    if (/\b(?:RETURN|LEAVE|CHECK|EXIT)\b/i.test(blankLiterals(body.slice(0, m.index)))) continue;
    report({ member: m.member, offset: base + m.index });
  }
}

export default defineRule({
  id: 'unconditional-popup-display',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `${f.member}( ) at the top level of main( ) runs on EVERY roundtrip — the frontend loads and opens the fragment anew each time, so every event rebuilds the dialog (focus lost, scroll reset); display it from the branch that opens it`,
  check,
});
