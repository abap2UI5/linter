import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'missing-required-aggregation',
  summary: 'a `Table` bound to rows but given no `columns` — renders empty',
  detail: 'The control has data but not the aggregation it needs to show any of it. Nothing fails: the table renders, and it renders empty, which is the hardest kind of bug to see in a screenshot.',
  example: 'view->ele( `Table` )->a( n = `items` v = client->_bind( t_rows ) )   " no columns: renders empty',
  remedy: `view->ele( \`Table\`
    )->a( n = \`items\` v = client->_bind( t_rows )

    )->ele( \`columns\`
        )->tag( \`Column\`
    )->end( )`,
});
