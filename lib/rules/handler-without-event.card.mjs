import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'handler-without-event',
  summary: 'a handler for an event nothing raises',
  detail: 'The inverse of `event-without-handler`: a `WHEN `X`` (or `check_on_event( `X` )`, or a comparison of the event read against a literal) whose name no `client->_event( )` in the class raises — and no keyboard shortcut, timer or `hash_attach_changed` wire, and no `onclose` of a message box or toast (the parameter, or `"onClose"` in the option object) either. A typo in one of the two names has eaten a feature, or the control went and its branch stayed. A hint, like its twin, because a view never breaks over it. Judged only when both sides are knowable: every raise and every handler is a literal, the class raises at least one event itself, and the client handle is not handed to another object (a helper that builds the view raises on this class\'s behalf). A `WHEN` counts only in a `CASE` over the event — the event read itself, a variable assigned from it, or a method parameter the class hands it to; a `CASE` over an operator or a character is not a dispatcher. A raise spelled in another case is `event-name-case-mismatch`\'s finding, not this one\'s.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) ).
CASE client->get_event( ).
  WHEN \`SAVE_\`.   " nothing raises SAVE_
    client->message_toast_display( \`saved\` ).
ENDCASE.`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) ).
CASE client->get_event( ).
  WHEN \`SAVE\`.
    client->message_toast_display( \`saved\` ).
ENDCASE.`,
});
