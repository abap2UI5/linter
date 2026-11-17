import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-name-case-mismatch',
  summary: 'an event raised as `save` and handled as `SAVE` — the handler never runs',
  detail: 'The event name travels to the browser and back as a string, and `client->get_event( )` / `check_on_event( )` compare it letter for letter. A raise spelled differently from its handler — `_event( `save` )` against `WHEN `SAVE`` — is a dead control that looks handled: the name is there, in both places, and a case-blind reading (which is what `event-without-handler` does, on purpose) sees it as fine. Reported where exactly ONE handled spelling is the raised name up to case; two handled spellings of one name are left alone rather than chosen between. The fix writes the handler\'s spelling into the raise, because the handler is the one place the name is compared.',
  example: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`save\` ) )
" … CASE client->get_event( ).
"      WHEN \`SAVE\`.   " never reached`,
  remedy: `view->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`SAVE\` ) )
" … CASE client->get_event( ).
"      WHEN \`SAVE\`.`,
  fixNote: 'The raised literal is rewritten to the handler\'s spelling — `_event( \\`save\\` )` becomes `_event( \\`SAVE\\` )` — inside the literal\'s own quotes; the arguments around it are untouched.',
});
