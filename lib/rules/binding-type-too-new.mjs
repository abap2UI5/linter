import { defineRule } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

function check({ control, data, floor, member, minUi5, name, offset, report }) {
  const entry = (data.__modelTypes || {})[name];
  if (entry?.since && !withinFloor(entry.since, floor)) {
    report({ control, member, value: name, since: entry.since, minUi5, offset });
  }
}

export default defineRule({
  id: 'binding-type-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  message: (f) => `${f.value} is @since ${f.since} — newer than the ${f.minUi5} floor: an older system has no such module, so the binding runs without its type (by global name) or the view fails to load (through core:require)`,
  check,
});
