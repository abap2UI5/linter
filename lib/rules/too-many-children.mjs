import { defineRule } from '../rule.mjs';
import { isAggregationTag } from '../ui5-meta.mjs';

/* Two places a 0..1 aggregation is filled twice, and the walk calls this
 * rule at both: controls written straight under a control land in its
 * DEFAULT aggregation (`defAgg`/`defDecl` given), and controls inside an
 * explicit aggregation tag (`parent`/`member` given - the tag is `node`). */
function check({ defAgg, defDecl, full, node, nsOf, prefixOf, parent, member, report }) {
  if (member) {
    /* Cardinality. `multiple` ABSENT is not 0..1: ManagedObjectMetadata
     * defaults it to TRUE (`typeof info.multiple === 'boolean' ?
     * info.multiple : true`), and the UI5 sources omit the flag on 0..n
     * aggregations often enough - sap.m.table.columnmenu.Menu.items,
     * .quickActions and their containers - that reading absence as single
     * reported a Menu with two actions, and a samples-controls port was
     * rebuilt around the false finding. Only an explicit `false` is 0..1,
     * here and in the default-aggregation check in the control branch. */
    const controlChildren = node.children.filter(
      (c) => c.name !== null && !isAggregationTag(c.name)
    ).length;
    if (member.decl.multiple === false && controlChildren > 1) {
      report({ control: parent, member: node.name, count: controlChildren, offset: node.offset });
    }
    return;
  }
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
