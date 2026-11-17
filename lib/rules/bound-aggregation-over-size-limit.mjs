import { defineRule } from '../rule.mjs';
import { isA, isBinding, rootBindingPath } from '../ui5-meta.mjs';

function check({ data, full, node, seededRows, sizeLimitRaised, report }) {
  const growing = node.attrs.find(([a]) => a === 'growing');
  /* The opt-in bound-aggregation-over-size-limit: a bound list whose
   * table the class is SEEN to seed past the JSONModel's 100 entries -
   * the one literal seed's rows, or the APPENDs of literal DO loops
   * (`seededRows`, a lower bound read by check.mjs off the source, and
   * only when the rule is asked for and the class raises no size limit
   * anywhere). The list stops at 100 without a word. Judged where the
   * 100 applies, as for rows-hidden-by-visible above: the `items` of a
   * non-growing sap.m.ListBase bound without a `length` - and the
   * `items` of a Select or a ComboBoxBase, which bind their whole value
   * list the same way and have no growing to page with. Opt-in because
   * the corpus that measured it is ports: 101 findings on 637 files in
   * 0.3, almost all a 123-row mock whose ORIGINAL caps at 100 too - a
   * faithful port the rule cannot tell from a broken one. In an app's
   * own code 123 rows showing 100 is the defect itself. */
  if (seededRows?.size && sizeLimitRaised === false
    && (isA(data, full, 'sap.m.Select') || isA(data, full, 'sap.m.ComboBoxBase')
      || (isA(data, full, 'sap.m.ListBase') && (growing ? growing[1] === 'false' : !node.unresolvedAttrs?.has('growing'))))) {
    for (const [agg, value, aggOffset] of node.attrs) {
      if (agg !== 'items' || !isBinding(value) || /\blength\s*:/.test(value)) continue;
      const table = rootBindingPath(value);
      const rows = table ? seededRows.get(table) : undefined;
      if (rows > 100) {
        report({ control: full, member: agg, value: String(value), count: rows, offset: aggOffset ?? node.offset });
      }
    }
  }

}

export default defineRule({
  id: 'bound-aggregation-over-size-limit',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  optIn: true,
  message: (f) => `${f.control} ${f.member} is bound to ${f.value}, which the class seeds with at least ${f.count} rows — a JSONModel hands a bound aggregation at most 100 entries, so the list stops at 100 without a word. Raise the limit after the display (client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( |{ lines( t ) }| ) ( client->cs_view-main ) ) )), or let the list page (growing="true")`,
  check,
});
