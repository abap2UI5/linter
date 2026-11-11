import { defineRule, short } from '../rule.mjs';
import { isAggregationTag, isBinding, chain } from '../ui5-meta.mjs';

/* Aggregations UI5 binds WITHOUT a template or factory: the control creates
 * the children itself, and says so by setting `_doesNotRequireFactory` on
 * the aggregation's metadata - which is exactly the flag
 * ManagedObject.bindAggregation hands to BindingInfo.createAggregation to
 * skip the "Missing template or factory function" check. The snapshot does
 * not carry the flag (it is set in code after the class is defined, not in
 * the metadata literal the harvest reads), so the places that set it are
 * listed here, from the 1.151 sources (grep `_doesNotRequireFactory =`).
 * A subclass inherits the aggregation object, so sap.ui.table.TreeTable and
 * AnalyticalTable are covered through their parent. sap.ui.table.Table.rows
 * is the one a view writes daily: its rows come from the columns'
 * templates, and the docs call the aggregation "managed by the table
 * itself ... does not support templates or factories". */
const TEMPLATE_FREE_AGGREGATIONS = {
  'sap.ui.table.Table': ['rows'],
  'sap.ui.core.util.Export': ['rows'],
  'sap.gantt.GanttChartBase': ['rows', 'relationships'],
  'sap.suite.ui.microchart.LineMicroChartLine': ['points'],
  'sap.viz.ui5.data.FlattenedDataset': ['data'],
};

function bindsWithoutTemplate(data, control, aggregation) {
  for (const [c] of chain(data, control)) {
    if (TEMPLATE_FREE_AGGREGATIONS[c]?.includes(aggregation)) return true;
  }
  return false;
}

function check({ attr, data, full, member, node, offset, value, report }) {
  /* A bound AGGREGATION with nothing to clone. `items="{/T}"` tells
   * UI5 to create one child per row from a template - and the
   * template is the aggregation's child element. Without one,
   * ManagedObject.bindAggregation throws "Missing template or factory
   * function" and XMLView.create rejects: the whole view is gone, not
   * one list. The commonest way a reconstructed helper call loses a
   * view's list. The template may sit under an explicit aggregation
   * tag or, for the control's default aggregation, directly under
   * the control. */
  if (member.set === 'aggregations' && member.decl?.multiple !== false && isBinding(value) && !node.unresolvedAttrs?.has(attr)
      && !bindsWithoutTemplate(data, full, attr)) {
    // a 0..1 aggregation (`tooltip`, `label`) bound through its altType is a
    // property binding and clones nothing - only a 0..n one needs a template
    const defAgg = [...chain(data, full)].map(([, m]) => m.defaultAggregation).find(Boolean);
    const control = (c) => c.name !== null && !isAggregationTag(c.name);
    const tagged = node.children.find((c) => c.name === attr);
    const hasTemplate = tagged ? tagged.children.some(control)
      : (defAgg === attr && node.children.some(control));
    if (!hasTemplate) {
      report({ control: full, member: attr, value: String(value).slice(0, 60), offset });
    }
  }
}

export default defineRule({
  id: 'bound-aggregation-without-template',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  summary: 'a bound aggregation with nothing to clone — the view does not load',
  detail: '`items="{/T}"` tells UI5 to create one child per row from a template, and the template is the aggregation\'s child element. Without one, `ManagedObject.bindAggregation` throws *"Missing template or factory function"* and `XMLView.create` rejects: not one empty list, the whole view is gone. The template may sit under an explicit aggregation tag (`ele( `items` )`) or, for the control\'s default aggregation, directly under the control. A bound aggregation the reconstructor could not follow is not judged, and neither is one UI5 binds WITHOUT a template — the aggregations that set `_doesNotRequireFactory`, of which `sap.ui.table.Table`\'s `rows` is the one a view writes (its cells come from each column\'s `template`; a row template is not even supported).',
  example: 'view->ele( `List` )->a( n = `items` v = client->_bind( mt_rows ) )',
  remedy: `view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_rows )
    )->tag( \`StandardListItem\` )->a( n = \`title\` v = \`{NAME}\` )`,
  message: (f) => `${f.control} ${f.member} is bound (${short(f.value, 40)}) but carries no template — UI5's bindAggregation throws "Missing template or factory function" and the whole view fails to load; put the row control under the aggregation`,
  check,
});
