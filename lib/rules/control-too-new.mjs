import { defineRule } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

function check({ floor, full, meta, minUi5, node, report }) {
  if (meta.since && !withinFloor(meta.since, floor)) {
    report({ control: full, since: meta.since, minUi5, offset: node.offset });
  }
}

export default defineRule({
  id: 'control-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  message: (f) => `control ${f.control} is @since ${f.since} — newer than the ${f.minUi5} floor`,
  check,
});
