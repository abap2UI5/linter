import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'control-call-arg-count',
  summary: 'more `t_arg` values than the control method declares',
  detail: 'The frontend declares the argument kinds of every control method it knows, and `castArgs` ends on `kinds.slice(0, count)` — so an argument past the declared ones is never passed to the control. It is not an error anywhere: the call runs, with fewer arguments than the source appears to give it, and the extra value reads as intent to every later reader. `back`, `close`, `focus`, `collapseAll` and the other no-argument methods are the common case; `setExpanded` given two is the other. A method the frontend does NOT declare is open by design (any public, non-denylisted one) and is never judged on arity.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ( \`page2\` ) ) )   " back takes none`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`nav\` ) ( \`back\` ) ) )`,
});
