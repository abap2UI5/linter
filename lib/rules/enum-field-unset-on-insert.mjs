import { defineRule } from '../rule.mjs';
import { rowLiteralFacts } from '../abap-helpers.mjs';
import { topAssigned } from '../abap.mjs';

function check({ enumFields, src, report }) {
  if (!enumFields?.size) return;
  const facts = rowLiteralFacts(src);
  if (facts.omitInitial) return;
  const { omitted, filledAfter } = facts;
  for (const { table, body, offset, carried = null } of facts.rows) {
    const key = String(table).toUpperCase();
    const fields = enumFields.get(key);
    if (!fields) continue;
    const set = topAssigned(body);
    const later = filledAfter.get(key);
    for (const field of fields) {
      if (set.has(field) || omitted.has(field)) continue;
      if (carried?.has(field) || later?.has(field)) continue;
      report({ member: field, offset });
    }
  }
}

export default defineRule({
  id: 'enum-field-unset-on-insert',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  message: (f) => `the row is built without ${f.member}, which the view binds to an ENUM-typed property — an ABAP field is never absent, so it ships as "" and validateProperty throws, taking the binding update and the view down. Seed the default or name it in omit_initial_paths`,
  check,
});
