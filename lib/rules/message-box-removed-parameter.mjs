import { defineRule } from '../rule.mjs';
import { MESSAGE_BOX_REMOVED, MESSAGE_TOAST_REMOVED } from '../abap-helpers.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ code, src, report }) {
  /* A parameter `message_box_display( )` / `message_toast_display( )` no
   * longer has. abap2UI5#2748 (2026-09-13) took the pure UI5 options off both
   * signatures - they travel as the option object of the CONTROL_GLOBAL wire
   * now (`MESSAGE_BOX` / `MESSAGE_TOAST`, last t_arg) - so a call naming one
   * does not compile on a current pin, and a systemless pipeline sees that
   * only when somebody imports the transport: the same silence
   * get-viewname-removed covers, one method over. No fix: the value has to
   * move into a different call. */
  for (const m of code.matchAll(/client->(message_(box|toast)_display)\s*\(/gi)) {
    const { body } = parenRegion(src, m.index + m[0].length - 1);
    if (body === undefined) continue;
    const gone = m[2].toLowerCase() === 'box' ? MESSAGE_BOX_REMOVED : MESSAGE_TOAST_REMOVED;
    for (const arg of namedArgMarks(body)) {
      if (!gone.includes(arg.name)) continue;
      report({ member: arg.name, value: m[1].toLowerCase(), offset: m.index + m[0].length + arg.nameStart });
    }
  }
}

export default defineRule({
  id: 'message-box-removed-parameter',
  severity: 'error',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `${f.value}( ) has no parameter ${f.member} any more (abap2UI5#2748 took the pure UI5 options off both message methods) — the class does not compile; pass it in the option object of the CONTROL_GLOBAL wire instead: t_arg = VALUE #( ( \`${f.value === 'message_box_display' ? 'MESSAGE_BOX' : 'MESSAGE_TOAST'}\` ) ( … ) ( \`{"${f.member}":…}\` ) )`,
  check,
});
