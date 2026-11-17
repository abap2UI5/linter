import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-message-box-type',
  summary: 'a `message_box_display( type = … )` outside the box types — the box opens as a plain `show( )`',
  detail: 'The type travels as the METHOD of the whitelisted `MESSAGE_BOX` global call, so it has to be one of the sap.m.MessageBox display methods: `information` (the default), `warning`, `error`, `success`, `confirm`, `alert` or `show`. The server lower-cases what the app wrote and looks it up in that list (`box_resolve` in `z2ui5_cl_ui5_srv_message`); a type that is not in it is no error — the box falls back to a plain `show( )`, so it opens with no icon and no title of its kind, and an error the user should not miss reads like a note. The natural slip is the ABAP message-type letter: `E`, `W`, `S`, `I`. Letter case is free, and only a literal type is judged.',
  example: 'client->message_box_display( text = `Order not saved.` type = `E` ).   " opens as a plain box',
  remedy: 'client->message_box_display( text = `Order not saved.` type = `error` ).',
  fixNote: 'A type written as one of the four message-type letters that have a box of their own is rewritten to that box type inside its literal: `E` to `error`, `W` to `warning`, `S` to `success`, `I` to `information`. Any other unknown type keeps the finding — `A` and `X` have no box, and a word could be meant as any of them.',
});
