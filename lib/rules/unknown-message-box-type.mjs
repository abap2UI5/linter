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
  summary: 'a `message_box_display( type = … )` outside the box types — the box opens as a plain `show( )`',
  detail: 'The type travels as the METHOD of the whitelisted `MESSAGE_BOX` global call, so it has to be one of the sap.m.MessageBox display methods: `information` (the default), `warning`, `error`, `success`, `confirm`, `alert` or `show`. The server lower-cases what the app wrote and looks it up in that list (`box_resolve` in `z2ui5_cl_ui5_srv_message`); a type that is not in it is no error — the box falls back to a plain `show( )`, so it opens with no icon and no title of its kind, and an error the user should not miss reads like a note. The natural slip is the ABAP message-type letter: `E`, `W`, `S`, `I`. Letter case is free, and only a literal type is judged.',
  example: 'client->message_box_display( text = `Order not saved.` type = `E` ).   " opens as a plain box',
  remedy: 'client->message_box_display( text = `Order not saved.` type = `error` ).',
  fixNote: 'A type written as one of the four message-type letters that have a box of their own is rewritten to that box type inside its literal: `E` to `error`, `W` to `warning`, `S` to `success`, `I` to `information`. Any other unknown type keeps the finding — `A` and `X` have no box, and a word could be meant as any of them.',
  message: (f) => {
    return `message_box_display( type = \`${f.value}\` ) is no MessageBox type — the server falls back to a plain show( ) box, with no icon and no title of its kind; the types are ${MESSAGE_BOX_TYPES.join(', ')}`
      + (f.suggestion ? ` — did you mean \`${f.suggestion}\` (the message type letter ${f.value.trim().toUpperCase()})?` : '');
  },
  check,
});
