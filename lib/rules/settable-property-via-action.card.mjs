import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'settable-property-via-action',
  summary: 'a `CONTROL_BY_ID` `set…( )` where the control has a bindable property of that name',
  detail: 'The project rule is *prefer a bindable property over a frontend action*: a two-way bound property keeps the state in the model, where it survives a view rebuild, a draft restore and the browser Back button — a frontend action does not, and it also needs a round-trip to be re-applied. Only **properties** are reported: an association (`sap.uxap.ObjectPageLayout.selectedSection`) and an aggregation cannot be data-bound at all, so driving those imperatively is the only way and is never flagged. A hint, not an error — an imperative call can still be the right answer when the sample\'s point is the imperative API itself.',
  example: `view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`id\` v = \`sideContent\` ).
client->follow_up_action( val   = client->cs_event-control_by_id
                          t_arg = VALUE #( ( \`sideContent\` ) ( \`setShowSideContent\` ) ( \`true\` ) ) )`,
  remedy: `DATA show_side TYPE abap_bool.
view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`showSideContent\` v = client->_bind( show_side ) )`,
});
