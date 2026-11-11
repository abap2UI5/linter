import { defineRule } from '../rule.mjs';
import { isAggregationTag } from '../ui5-meta.mjs';

function check({ defAgg, defDecl, full, node, nsOf, prefixOf, report }) {
  if (defDecl?.multiple === false) {
    const direct = node.children.filter((c) => c.name !== null && !isAggregationTag(c.name)
      && /^[\w.]+$/.test(String(nsOf(c)[prefixOf(c) || ''] || '')));
    if (direct.length > 1) {
      report({
        control: full, member: defAgg, count: direct.length,
        offset: direct[1].offset ?? node.offset,
      });
    }
  }
}

export default defineRule({
  id: 'too-many-children',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  summary: 'two controls in a 0..1 aggregation',
  detail: 'A single-cardinality aggregation was filled more than once. Only one child survives — which one is not something to rely on. Only an aggregation the metadata declares `multiple: false` is 0..1 — UI5 defaults an undeclared flag to 0..n, and so does this rule. The children written straight under a control fill its default aggregation and are held to the same cardinality.',
  example: `view->ele( \`Page\`
    )->ele( \`customHeader\`
        )->tag( \`Bar\`
        )->tag( \`Bar\` )   " customHeader is 0..1 - one of the two is gone`,
  remedy: `view->ele( \`Page\`
    )->ele( \`customHeader\`
        )->tag( \`Bar\` )`,
  message: (f) => `${f.control} ${f.member} takes one child, ${f.count} given`,
  check,
});
