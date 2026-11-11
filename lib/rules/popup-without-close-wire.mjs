import { defineRule } from '../rule.mjs';

function check({ d, src, report }) {
  /* A Dialog nothing can close. `popup_display( )` opens a sap.m.Dialog that
   * has no close affordance of its own: no button, no `afterClose`/
   * `escapeHandler` wire — only Escape, which the app never hears about. A
   * method that builds a `Dialog` root and wires NO event at all (no
   * `_event( )`, no `_event_client( )`, no `follow_up_action( )`, no
   * `_event_nav_app_leave( )` - the wire that leaves the app on press, which
   * closes the dialog with it - anywhere
   * in it) has left the dialog without a way back to the app. Judged per
   * METHOD rather than per statement, because a dialog's buttons are often
   * chained in a second statement on the same handle; a method that hands
   * the buttons to a helper is the shape this cannot see, which is why it is
   * a hint. */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    // the VERBS are case-free, the control name in the literal is not: only a
    // literal spelled exactly `Dialog` names sap.m.Dialog
    const dlg = [...mm[0].matchAll(new RegExp(`->\\s*(?:${d.open}|${d.leaf})\\(\\s*(?:n\\s*=\\s*)?\`(\\w+)\``, 'gi'))]
      .find((c) => c[1] === 'Dialog');
    if (!dlg) continue;
    if (/\b_event\s*\(|\b_event_client\s*\(|\b_event_nav_app_leave\s*\(|\bfollow_up_action\s*\(/i.test(mm[0])) continue;
    report({ control: 'Dialog', offset: mm.index + dlg.index });
  }
}

export default defineRule({
  id: 'popup-without-close-wire',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `Dialog` built without a single event wire — nothing can close it',
  detail: 'A `sap.m.Dialog` shown through `popup_display( )` has no close affordance of its own: no button, no close icon. The app closes it — `popup_destroy( )` or a new display from the branch that handles a button\'s `press`, an `afterClose` or an `escapeHandler` — and all of those are event wires. A method that builds a `Dialog` root and wires NO event anywhere in it (no `_event( )`, no `_event_client( )`, no `follow_up_action( )`) has left the dialog with Escape as its only exit, and the app never hears about that. Judged per METHOD, because a dialog\'s buttons are often chained in a second statement on the same handle; a method that hands the buttons to a helper is the shape this cannot see, which is why it is a hint.',
  example: `METHOD render_dialog.
  DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
  popup->ele( \`Dialog\` )->a( n = \`title\` v = \`Hi\` )->tag( \`Text\` )->a( n = \`text\` v = \`hello\` ).
  result = popup->stringify( ).
ENDMETHOD.`,
  remedy: `METHOD render_dialog.
  DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
  popup->ele( \`Dialog\`
      )->a( n = \`title\` v = \`Hi\`
      )->tag( \`Text\`
          )->a( n = \`text\` v = \`hello\`
      )->ele( \`buttons\`
          )->tag( \`Button\`
              )->a( n = \`text\`  v = \`Close\`
              )->a( n = \`press\` v = client->_event( \`CLOSE\` ) ).
  result = popup->stringify( ).
ENDMETHOD.`,
  message: (f) => 'a Dialog with no event wired anywhere in the method that builds it — no button, no afterClose, nothing tells the app to close it; only Escape closes it, and the app never hears about that',
  check,
});
