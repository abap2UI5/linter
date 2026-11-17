import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-arg-out-of-range',
  summary: '`get_event_arg( n )` past the `t_arg` the event declares',
  detail: 'The arguments are static — they are written at the raise site — so reading past them is never anything but a mistake: initial in ABAP, a 500 in the transpiled runtime, and either way not the value the handler works with. Judged only for a literal index, inside the handler of an event the class raises itself with `client->_event( )`, and never across a method boundary: an event arriving from a `message_box_display( onclose = )` callback or a frontend action carries arguments from a source this pass cannot see.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${$source>/id}\` ) ) ) ).
CASE client->get( )-event.
  WHEN \`PICK\`.
    DATA(second) = client->get_event_arg( 2 ).   " PICK sends one argument
ENDCASE.`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( val = \`PICK\` t_arg = VALUE #( ( \`\${$source>/id}\` ) ) ) ).
CASE client->get( )-event.
  WHEN \`PICK\`.
    DATA(id) = client->get_event_arg( 1 ).   " the one argument PICK sends
ENDCASE.`,
});
