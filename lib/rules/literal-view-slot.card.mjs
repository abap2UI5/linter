import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'literal-view-slot',
  summary: 'a view slot retyped as a string where `cs_view` has a constant for it',
  detail: 'The mirror image of `unknown-view-slot`, and the reason that rule keeps finding work to do. `view = `MAIN`` is correct — and nothing checks it: the value travels to the browser as an object key, so a rename, a typo or the wrong half of the pairing dispatches to no view at all, silently. `client->cs_view-main` cannot fail that way, because the ABAP compiler resolves the name: `cs_view-mian` does not activate. It also spells the one pairing nobody remembers — the constant is `cs_view-nested` and its VALUE is `NEST`, `cs_view-nested2` is `NEST2` — which is exactly the mistake `unknown-view-slot` reports once the literal is written out. A hint, because the wire works today; `--fix` writes the constant in place.',
  example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`NEST\`   " works, but nothing checks it
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-nested
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  fixNote: 'replaces the literal with the `client->cs_view-…` constant carrying that value — an exact one-token substitution, nothing to guess.',
});
