import { defineRule } from '../rule.mjs';
import { displayFlow } from '../lifecycle-rules.mjs';
import { branchTail } from '../abap-source.mjs';

function check({ src, report }) {
  const { blank, afterStatement, displayCallIn, DISPLAY_ONE } = displayFlow(src);
  /* A display after nav_app_call( ) in the same sequence. The call hands the
   * roundtrip to another app: what the browser shows next is THAT app's
   * view, and a view_display( ) issued behind it in the same flow is work
   * the user never sees — or, for a popup, a dialog that opens over the
   * app being left. Usually a missing RETURN. */
  for (const m of blank.matchAll(/\b(?:me->)?\w*client\s*->\s*nav_app_call\s*\(/gi)) {
    const from = afterStatement(m.index);
    if (from === -1) continue;
    const tail = branchTail(src, from);
    const d = displayCallIn(tail.text, DISPLAY_ONE);
    if (d) report({ member: d.member, offset: from + d.index, dedupe: String(m.index) });
  }
}

export default defineRule({
  id: 'display-after-nav-app-call',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a display call after `nav_app_call( )` in the same flow',
  detail: '`nav_app_call( )` hands the roundtrip to another app: what the browser shows next is THAT app\'s view. A `view_display( )` issued behind it, in the same statement sequence, builds a view nobody sees — and a `popup_display( )` behind it opens a dialog over the app being left. Nearly always a missing `RETURN` after the call. Judged on the sequence the call sits in: a display in a nested block, or after an `ELSE`/`WHEN`/`ENDIF` boundary, is another flow and is not reported.',
  example: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  client->view_display( render( ) ).   " never seen
ENDMETHOD.`,
  remedy: `METHOD on_event.
  client->nav_app_call( NEW zcl_detail( id ) ).
  RETURN.
ENDMETHOD.`,
  message: (f) => `${f.member}( ) after nav_app_call( ) in the same flow — the roundtrip already belongs to the called app, so this display is never seen (a missing RETURN?)`,
  check,
});
