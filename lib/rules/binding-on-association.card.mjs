import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-on-association',
  summary: 'a binding written into an association attribute',
  detail: 'Only properties and aggregations can be data-bound. `XMLTemplateProcessor` handles an association attribute by taking its value **verbatim as a control ID** (`createId(sValue)`, or a comma/space split for a 0..n association) — `BindingInfo.parse` is never called on it. So the braces travel into an id nothing answers to, the association stays empty, and neither the parser, the render gate nor the console says a word. Drive an association imperatively instead, with a `CONTROL_BY_ID` setter — which is also why `settable-property-via-action` deliberately never pushes an association towards a binding.',
  example: 'a( n = `selectedSection` v = client->_bind( section ) )   " association -> the id "{/SECTION}"',
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`opl\` ) ( \`setSelectedSection\` ) ( section ) ) )`,
});
