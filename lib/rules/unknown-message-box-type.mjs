import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';
import { MESSAGE_BOX_TYPES, MESSAGE_TYPE_LETTERS } from '../frontend-actions.mjs';

function check({ code, source, src, report }) {
  /* A box TYPE the server does not know. `box_resolve` lower-cases the type
   * and looks it up among the sap.m.MessageBox display methods (the type IS
   * the method of the MESSAGE_BOX global call); a miss is no error - the box
   * falls back to a plain show( ): no icon, and no title of its kind. So an
   * error box written `type = \`E\`` - the ABAP message-type letter, the
   * natural slip - opens as a neutral box the user reads as information.
   * Letter case is free (the server folds it). Only a literal is judged; the
   * four letters with a box of their own (E/W/S/I) carry the fix. */
  for (const m of code.matchAll(/client->message_box_display\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const arg = namedArgMarks(body).find((a) => a.name === 'type');
    const lit = arg?.value.match(/^([`'])([^`']*)\1$/);
    if (!lit || MESSAGE_BOX_TYPES.includes(lit[2].trim().toLowerCase())) continue;
    const written = lit[2];
    const suggestion = MESSAGE_TYPE_LETTERS[written.trim().toUpperCase()];
    const at = open + 1 + arg.vstart + 1;
    const fixable = suggestion && source.slice(at, at + written.length) === written;
    report({
      value: written, offset: open + 1 + arg.nameStart,
      ...(suggestion ? { suggestion } : {}),
      ...(fixable ? { fixes: [{ start: at, end: at + written.length, text: suggestion }] } : {}),
    });
  }
}

export default defineRule({
  id: 'unknown-message-box-type',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => {
    return `message_box_display( type = \`${f.value}\` ) is no MessageBox type — the server falls back to a plain show( ) box, with no icon and no title of its kind; the types are ${MESSAGE_BOX_TYPES.join(', ')}`
      + (f.suggestion ? ` — did you mean \`${f.suggestion}\` (the message type letter ${f.value.trim().toUpperCase()})?` : '');
  },
  check,
});
