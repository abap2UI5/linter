import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-aggregation-item',
  summary: 'a slashed control id that addresses no aggregation item',
  detail: 'A cloned aggregation item has no id the backend can know — the rendered one carries the view prefix the framework assigns at runtime — so it is addressed positionally as `<id>/<aggregation>/<index>` (0-based) and resolved in the browser. Two ways to get that wrong, and the id rules around this one see neither, because they judge the head segment alone: a slashed value that does not MATCH the shape (a non-numeric index, a fourth segment) never enters the aggregation path at all and is looked up as one plain id, which resolves to nothing; and a shape that matches but names an aggregation the control does not declare makes `getAggregation` return nothing, so the wire is dropped with a log. The aggregation half is judged only when the head id resolves to a control the snapshot knows.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/first\` ) ( \`setActivePage\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/0\` ) ( \`setActivePage\` ) ) )`,
});
