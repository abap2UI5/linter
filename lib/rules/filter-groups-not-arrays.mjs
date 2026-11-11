import { defineRule, short } from '../rule.mjs';
import { filterGroups, parsePayload } from '../wire-readers.mjs';

function check({ action, args, report }) {
  if (action !== 'binding_call' || args[2]?.value !== 'filter'
      || typeof args[3]?.value !== 'string' || !args[3].value.trimStart().startsWith('[')) return;
  const groups = parsePayload(args[3].value);
  if (groups === undefined || !Array.isArray(groups)) return;
  /* Every element dropped by that same filter means the payload will
   * reach `binding.filter([])` — the binding is CLEARED, not filtered,
   * and nothing is logged on that path because the ROOT is an array so
   * the guard above passes. The object form `[{"path":…}]` is how this
   * is written by mistake; an intentional clear is `[]`, which is empty
   * to begin with and not reported. */
  const { usable } = filterGroups(groups);
  if (groups.length && !usable.length) {
    report({ control: 'BINDING_CALL', member: 'filter', value: String(args[3].value).slice(0, 40), offset: args[3].offset });
  }
}

export default defineRule({
  id: 'filter-groups-not-arrays',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `BINDING_CALL` filter payload whose groups are objects — it clears the binding instead of filtering it',
  detail: 'The compound filter form is an array of GROUPS, each an array of `[path, operator, value1, value2?]` ROWS. `buildFilterGroups` keeps only elements that pass `Array.isArray`, so an array of OBJECTS — `[{"path":…,"operator":…,"value1":…}]` — is dropped whole, the group list empties, and control falls into `binding.filter([])`: the filter is **cleared**, never applied. Nothing is logged on that path, because the root *is* an array so the malformed-JSON guard passes and the per-group drop is silent by construction. An intentional clear is `[]`, which is empty to begin with and is not reported.',
  example: `view->tag( \`List\` )->a( n = \`id\` v = \`list\` ).
client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`list\` ) ( \`items\` ) ( \`filter\` )
                                           ( \`[{"path":"NAME","operator":"Contains","value1":"x"}]\` ) ) )   " cleared`,
  remedy: `view->tag( \`List\` )->a( n = \`id\` v = \`list\` ).
client->follow_up_action( val   = client->cs_event-binding_call
                          t_arg = VALUE #( ( \`list\` ) ( \`items\` ) ( \`filter\` )
                                           ( \`NAME\` ) ( \`Contains\` ) ( term ) ) )   " positional`,
  message: (f) => `${f.control} ${f.member}: every group in the payload (…${short(f.value, 40)}…) is dropped by buildFilterGroups, so the binding is CLEARED, not filtered — a group must be an array of [path, operator, value1] ARRAYS, not an object`,
  check,
});
