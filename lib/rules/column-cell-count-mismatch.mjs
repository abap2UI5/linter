import { defineRule } from '../rule.mjs';
import { isA, isAggregationTag } from '../ui5-meta.mjs';

function check({ data, full, node, report }) {
  /* A responsive table whose row template carries a different number
   * of cells than the table has columns. sap.m.Table maps cells to
   * columns BY INDEX: a cell past the last column is never rendered,
   * a column past the last cell stays empty - and UI5 logs nothing
   * either way, the table just renders shifted or short. The commonest
   * way a ported sample loses a column. Judged only when both
   * aggregations are written out (a bound `columns` or `cells` is a
   * runtime shape); an item without a `cells` aggregation - a
   * GroupHeaderListItem - is not a row template and is skipped. */
  if (isA(data, full, 'sap.m.Table') && !node.attrs.some(([a]) => a === 'columns') && !node.unresolvedAttrs?.has('columns')) {
    const controls = (n) => n.children.filter((c) => c.name !== null && !isAggregationTag(c.name));
    const columns = node.children.find((c) => c.name === 'columns');
    const items = node.children.find((c) => c.name === 'items');
    if (columns && items && controls(columns).length) {
      for (const template of controls(items)) {
        const cells = template.children.find((c) => c.name === 'cells');
        if (!cells || template.attrs.some(([a]) => a === 'cells') || template.unresolvedAttrs?.has('cells')) continue;
        // filled from exclusive IF/CASE branches: the count is their sum, not a row
        if (cells.branched) continue;
        const cellCount = controls(cells).length;
        const columnCount = controls(columns).length;
        if (cellCount && cellCount !== columnCount) {
          report({
            control: full, member: 'cells',
            count: cellCount, expected: columnCount, offset: cells.offset ?? template.offset,
          });
        }
      }
    }
  }

}

export default defineRule({
  id: 'column-cell-count-mismatch',
  severity: 'warning',
  category: 'data',
  scope: 'node',
  summary: 'a row template with a different number of cells than the table has columns',
  detail: '`sap.m.Table` maps the cells of a `ColumnListItem` to its columns BY INDEX. A cell past the last column is never rendered; a column past the last cell stays empty — and UI5 logs nothing either way, the table just renders shifted or short. The commonest way a ported sample loses a column: one `Column` dropped, the cells left as they were. Judged only when both aggregations are written out (a bound `columns` or `cells` is a runtime shape); an item with no `cells` aggregation — a `GroupHeaderListItem` — is not a row template and is skipped. A template whose cells are filled in exclusive `IF` / `CASE` branches — an edit and a display row — is not judged: the static replay runs every branch, so the count would be their sum.',
  example: `view->ele( \`Table\`
    )->ele( \`columns\`
        )->tag( \`Column\` )->tag( \`Column\`
    )->end(
    )->ele( \`items\`
        )->ele( \`ColumnListItem\`
            )->ele( \`cells\`
                )->tag( \`Text\` )->a( n = \`text\` v = \`one cell for two columns\`
            )->end(
        )->end(
    )->end(
)->end( )`,
  remedy: `view->ele( \`Table\`
    )->ele( \`columns\`
        )->tag( \`Column\` )->tag( \`Column\`
    )->end(
    )->ele( \`items\`
        )->ele( \`ColumnListItem\`
            )->ele( \`cells\`
                )->tag( \`Text\` )->a( n = \`text\` v = \`first\`
                )->tag( \`Text\` )->a( n = \`text\` v = \`second\`
            )->end(
        )->end(
    )->end(
)->end( )`,
  message: (f) => `the row template carries ${f.count} cell${f.count === 1 ? '' : 's'} for ${f.expected} column${f.expected === 1 ? '' : 's'} — sap.m.Table maps cells to columns by index, so the table renders ${f.count > f.expected ? 'with a cell that no column shows' : 'with an empty column'}, and UI5 logs nothing`,
  check,
});
