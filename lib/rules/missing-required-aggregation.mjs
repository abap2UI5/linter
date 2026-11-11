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
  summary: 'a `Table` bound to rows but given no `columns` — renders empty',
  detail: 'The control has data but not the aggregation it needs to show any of it. Nothing fails: the table renders, and it renders empty, which is the hardest kind of bug to see in a screenshot.',
  example: 'view->ele( `Table` )->a( n = `items` v = client->_bind( t_rows ) )   " no columns: renders empty',
  remedy: `view->ele( \`Table\`
    )->a( n = \`items\` v = client->_bind( t_rows )

    )->ele( \`columns\`
        )->tag( \`Column\`
    )->end( )`,
  message: (f) => `${f.control} has data but no ${f.member} — it renders empty`,
  check,
});
