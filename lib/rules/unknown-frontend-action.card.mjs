import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-frontend-action',
  summary: 'a literal action name outside the frontend dispatch table',
  detail: 'A `client->_event_client( )` / `client->follow_up_action( )` naming its action as a string literal is dispatched exactly like the `cs_event-` constant — but the constant is compile-checked and the literal is not, and `FrontendAction.execute` looks the name up in its handler table and does **nothing at all** on a miss: no exception, not even a console line. Case matters — the runtime never upper-cases, so `set_title` misses where `SET_TITLE` works. Anything not name-shaped is `follow_up_action`\'s raw-JavaScript escape hatch and is not judged.',
  example: 'client->follow_up_action( val = `set_title` t_arg = VALUE #( ( `Hi` ) ) ).   " the table is case-sensitive: swallowed silently',
  remedy: 'client->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( `Hi` ) ) ).',
  fixNote: 'Only when the written name is a dispatch-table name up to letter case (`set_title` for `SET_TITLE`): the literal is rewritten. Any other name keeps the finding.',
});
