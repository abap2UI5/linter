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
  message: (f) => 'a Dialog with no event wired anywhere in the method that builds it — no button, no afterClose, nothing tells the app to close it; only Escape closes it, and the app never hears about that',
  check,
});
