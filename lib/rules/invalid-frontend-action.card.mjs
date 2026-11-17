import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-frontend-action',
  summary: 'a frontend-action `t_arg` outside the set the runtime accepts',
  detail: 'A `client->_event_client( )` / `client->follow_up_action( )` wire is dispatched in the browser by name, and a name outside the whitelist raises nothing anywhere: FrontendAction logs to the console and the control does nothing when pressed. Judged only for literal arguments and only where the runtime\'s set is closed — the `CONTROL_GLOBAL` object and its method, the `BINDING_CALL` method, and `CONTROL_BY_ID`\'s obsolete empty view slot (which shifts the method out of position). `CONTROL_BY_ID`\'s method list is open by design and is never judged. A filter-row operator that is an accepted one up to letter case (`contains` for `Contains`) carries a did-you-mean and a `--fix`, since the set is case-sensitive upstream and the miss leaves the binding unfiltered.',
  example: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","contains","x"]]]\` ) ) ).`,
  remedy: `client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`tab\` ) ( \`items\` ) ( \`filter\` ) ( \`[[["NAME","Contains","x"]]]\` ) ) ).`,
  fixNote: 'Only the filter-row operator, and only where the written one is an accepted operator up to letter case (`contains` for `Contains`): the token is rewritten inside the payload literal. A global object, a method or an operator no single accepted name matches that way is reported without a suggestion — `MESSAGE_TOASTER` for `MESSAGE_TOAST` is an edit, not a case miss, and the linter does not guess at those.',
});
