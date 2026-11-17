import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'close-only-roundtrip',
  summary: 'an event whose handler only calls `popup_destroy( )` / `popover_destroy( )` — a roundtrip just to close',
  detail: 'The frontend closes a popup or popover by itself: `client->follow_up_action( val = client->cs_event-popup_close )` (or `popover_close`) written as the button\'s handler closes the slot in the browser, with no request, no draft load and save and no busy indicator. A Cancel or Close button wired to a backend event whose branch does nothing but `client->popup_destroy( )` pays all of that to get the same result. Judged only where the swap is exact: the branch is a `WHEN` of the CASE over the event or an `ELSEIF client->check_on_event( … )`, its only statement is the destroy, and every raise of the event in the class is a plain `client->_event( … )` wired to a `press`, with no arguments and no event options (an `afterClose` or `escapeHandler` stays the app\'s business), and none comes from the frontend (a timer, a shortcut, an `onclose`). A branch that also saves, writes state, opens the next popup or leaves the app is backend work and is not reported — and neither is a branch with a comment in it: the comment is the author saying why the close goes through the backend on purpose (a companion control that snapshots its state right before every roundtrip), or where the logic of a placeholder goes.',
  example: `view->tag( \`Button\` )->a( n = \`text\` v = \`Cancel\` )->a( n = \`press\` v = client->_event( \`CANCEL\` ) ).
…
CASE client->get_event( ).
  WHEN \`SAVE\`.
    save( ).
  WHEN \`DELETE\`.
    delete( ).
  WHEN \`CANCEL\`.
    client->popup_destroy( ).
ENDCASE.`,
  remedy: `view->tag( \`Button\` )->a( n = \`text\` v = \`Cancel\` )->a( n = \`press\` v = client->follow_up_action( val = client->cs_event-popup_close ) ).
…
CASE client->get_event( ).
  WHEN \`SAVE\`.
    save( ).
  WHEN \`DELETE\`.
    delete( ).
ENDCASE.`,
  fixNote: 'Every `client->_event( … )` that raises the event is rewritten to `client->follow_up_action( val = client->cs_event-popup_close )` (`popover_close` for a popover), and the branch is deleted together with the blank lines in front of it. Reported without a fix where the CASE would keep fewer than two WHEN branches (abaplint\'s `short_case`), or where the branch is the IF that opens the chain.',
});
