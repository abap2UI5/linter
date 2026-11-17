import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-aggregation-child',
  summary: `a control the aggregation's type does not accept`,
  detail: 'The aggregation declares a type, and the control put inside it does not inherit from it. UI5 refuses to add the child, so the part of the view below it silently disappears. An owner that overrides `addAggregation( )` (the snapshot\'s `widensAggregation`, e.g. `sap.uxap.ObjectPageSubSection`) decides for itself what it accepts and is not judged by its declared type.',
  example: 'view->ele( `Table` )->ele( `columns` )->tag( `Button` )',
  remedy: 'view->ele( `Table` )->ele( `columns` )->tag( `Column` )',
});
