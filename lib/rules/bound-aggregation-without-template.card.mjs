import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'bound-aggregation-without-template',
  summary: 'a bound aggregation with nothing to clone — the view does not load',
  detail: '`items="{/T}"` tells UI5 to create one child per row from a template, and the template is the aggregation\'s child element. Without one, `ManagedObject.bindAggregation` throws *"Missing template or factory function"* and `XMLView.create` rejects: not one empty list, the whole view is gone. The template may sit under an explicit aggregation tag (`ele( `items` )`) or, for the control\'s default aggregation, directly under the control. A bound aggregation the reconstructor could not follow is not judged, and neither is one UI5 binds WITHOUT a template — the aggregations that set `_doesNotRequireFactory`, of which `sap.ui.table.Table`\'s `rows` is the one a view writes (its cells come from each column\'s `template`; a row template is not even supported).',
  example: 'view->ele( `List` )->a( n = `items` v = client->_bind( mt_rows ) )',
  remedy: `view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_rows )
    )->tag( \`StandardListItem\` )->a( n = \`title\` v = \`{NAME}\` )`,
});
