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
  message: (f) => `${f.control} ${f.member}: every group in the payload (…${short(f.value, 40)}…) is dropped by buildFilterGroups, so the binding is CLEARED, not filtered — a group must be an array of [path, operator, value1] ARRAYS, not an object`,
  check,
});
