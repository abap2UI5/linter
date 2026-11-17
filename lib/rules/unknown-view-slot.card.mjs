import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-view-slot',
  summary: 'a literal view slot outside MAIN / NEST / NEST2 / POPUP / POPOVER',
  detail: 'The `view` parameter (and `SET_SIZE_LIMIT`\'s view key) names one of the five slots, case-sensitively: the server compares it as an ABAP string and the browser uses it as an object key. The natural guesses all miss — `main` (lower case), and `NESTED` for `cs_view-nested`, whose VALUE is `NEST`. For `CONTROL_BY_ID` a wrong slot is worse than none: a named slot **suppresses the global id fallback**, so the wire dies although the id exists in an open view. A slot that is a real one up to letter case (`main` for `MAIN`) carries a did-you-mean and a `--fix`; `NESTED` is not one and keeps the finding.',
  example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`main\`   " the slot is MAIN - and \`NESTED\` would be NEST
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-main
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  fixNote: 'Only where the written slot is one of the five up to letter case (`main` for `MAIN`): the literal is rewritten in place, inside its own quotes. `NESTED` matches nothing that way and keeps the finding — the constant `cs_view-nested` spells `NEST`, which is the author\'s to write.',
});
