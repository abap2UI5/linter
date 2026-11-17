import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-without-handler',
  summary: 'an event nothing reacts to',
  detail: 'Usually a dead control — but in abap2UI5 an event also forces a roundtrip, and that alone synchronises the model back into ABAP. So this is a hint, never an error, and it is skipped entirely when handler names are not literals. A handler is a `WHEN `X`` (alternatives with `OR` included) under a `CASE client->get_event( )`, a `check_on_event( `X` )`, or a comparison of the read against a literal wherever it stands — the single-branch dispatcher abaplint\'s `short_case` demands for a one-event class (`IF client->get_event( ) = `X`.`), its `ELSEIF` and `OR` continuations, the operator spelled `EQ`, and the literal on the left. `WHEN OTHERS` at the dispatcher\'s own level handles everything.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) )
" … and no WHEN \`SAVE\` anywhere in the class`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) )
" … CASE client->get_event( ).
"      WHEN \`SAVE\`.`,
});
