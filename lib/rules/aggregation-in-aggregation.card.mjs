import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'aggregation-in-aggregation',
  summary: 'an aggregation directly inside another one',
  detail: 'Invalid XML, and the signature of a missing `end( )`: UI5 goes looking for a control class by that aggregation name and fails.',
  example: 'view->ele( `Table` )->ele( `columns` )->ele( `items` )   " a missing end( ) between them',
  remedy: `view->ele( \`Table\`
    )->ele( \`columns\`
        )->tag( \`Column\`
    )->end(
    )->ele( \`items\`
        )->tag( \`ColumnListItem\` )`,
});
