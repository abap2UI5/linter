import { defineRule } from '../rule.mjs';
import { chain, chainComplete, isA, knownControl, memberOf, widensAggregation } from '../ui5-meta.mjs';

function check({ data, full, node, ownerControl, report }) {
  // is this control allowed where it sits? (parent = an aggregation tag,
  // or a control whose default aggregation takes it)
  if (ownerControl && knownControl(data, ownerControl.control)) {
    const agg = ownerControl.aggregation
      ? memberOf(data, ownerControl.control, ownerControl.aggregation, ['aggregations'])
      : (() => {
        const def = [...chain(data, ownerControl.control)]
          .map(([, m]) => m.defaultAggregation).find(Boolean);
        return def ? memberOf(data, ownerControl.control, def, ['aggregations']) : null;
      })();
    // only for aggregation types that are known CLASSES: an interface
    // type (sap.m.IBar) can be implemented in ways the snapshot does
    // not capture, and a false "not allowed here" is worse than a miss
    /* …and only where the owner takes what its metadata declares. A
     * control that overrides addAggregation( ) decides for itself:
     * sap.uxap.ObjectPageSubSection declares `blocks` as
     * sap.ui.core.Control and then opens with `if (oObject instanceof
     * ObjectPageLazyLoader)` - an Element - and stashes or unwraps it,
     * so the sample that is ABOUT lazy loading is invalid by the
     * declaration and fine in the browser. The harvest records that
     * override as `widensAggregation`, on the class that writes it (a
     * subclass inherits the method, so the whole chain is asked); it was
     * written for this check and never read by it. */
    if (agg?.decl.type && knownControl(data, agg.decl.type)
        && !widensAggregation(data, ownerControl.control)
        && chainComplete(data, full) && !isA(data, full, agg.decl.type)) {
      report({
        control: full,
        parentControl: ownerControl.control,
        member: ownerControl.aggregation ?? '(default aggregation)',
        expected: agg.decl.type,
        offset: node.offset,
      });
    }
  }

}

export default defineRule({
  id: 'invalid-aggregation-child',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  summary: `a control the aggregation's type does not accept`,
  detail: 'The aggregation declares a type, and the control put inside it does not inherit from it. UI5 refuses to add the child, so the part of the view below it silently disappears. An owner that overrides `addAggregation( )` (the snapshot\'s `widensAggregation`, e.g. `sap.uxap.ObjectPageSubSection`) decides for itself what it accepts and is not judged by its declared type.',
  example: 'view->ele( `Table` )->ele( `columns` )->tag( `Button` )',
  remedy: 'view->ele( `Table` )->ele( `columns` )->tag( `Column` )',
  message: (f) => `${f.control} is not allowed in ${f.parentControl} ${f.member} (expects ${f.expected})`,
  check,
});
