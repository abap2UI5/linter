import { defineRule } from '../rule.mjs';
import { REQUIRED_WITH, isA } from '../ui5-meta.mjs';

function check({ data, full, node, report }) {
  /* A control given its data but not the structure to show it: the
   * table renders empty, with nothing to point at. */
  for (const rule of REQUIRED_WITH) {
    if (!isA(data, full, rule.control)) continue;
    const bound = node.attrs.some(([a]) => a === rule.when)
      || node.children.some((c) => c.name === rule.when);
    const has = node.attrs.some(([a]) => a === rule.needs)
      || node.children.some((c) => c.name === rule.needs);
    if (bound && !has) {
      report({ control: full, member: rule.needs, offset: node.offset });
    }
  }

}

export default defineRule({
  id: 'missing-required-aggregation',
  severity: 'warning',
  category: 'data',
  scope: 'node',
  message: (f) => `${f.control} has data but no ${f.member} — it renders empty`,
  check,
});
