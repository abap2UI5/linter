import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'column-cell-count-mismatch',
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
});
