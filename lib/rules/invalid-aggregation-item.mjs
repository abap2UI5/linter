import { defineRule } from '../rule.mjs';
import { memberSection } from '../ui5-meta.mjs';

const AGG_ITEM = /^([^/]+)\/([A-Za-z_]\w*)\/(\d+)$/;

/* Called for every id-bearing argument a wire carries (`who` names the
 * action), wherever one is read. */
function check({ arg, who, controlIds, data, report }) {
  /* The aggregation-item form `<id>/<aggregation>/<index>`, 0-based, which
   * resolveControl accepts wherever an argument takes a control id. It exists
   * because a cloned aggregation item has no id the BACKEND can know — the
   * rendered one carries the view prefix the framework assigns at runtime —
   * so the item is addressed positionally and resolved in the browser.
   *
   * Two ways to get it wrong, and the id checks around this one see neither,
   * because they judge the HEAD segment alone (`staticIdOf` splits on `/`):
   *
   *   - a slashed value that does not MATCH the shape (a non-numeric index, a
   *     fourth segment) never enters the aggregation path at all. It falls
   *     through to a plain `byId` of the whole string, which resolves nothing
   *     and misses exactly as silently as any other unknown id.
   *   - a shape that matches but names an aggregation the control does not
   *     declare: `getAggregation` returns nothing and the frontend logs
   *     "no items" — the wire is dead and the ABAP is unchanged.
   *
   * The aggregation half is judged only when the head id resolves to a control
   * the snapshot knows, the same trust condition every other id rule takes. */
  const s = String(arg?.value ?? '');
  if (!s.includes('/') || s.startsWith('$') || s.includes('{')) return;
  const m = AGG_ITEM.exec(s);
  if (!m) {
    report({ control: who, member: 'id', value: s.slice(0, 40), offset: arg.offset });
    return;
  }
  const cls = controlIds ? controlIds[m[1]] : null;
  if (!cls || !data?.[cls]) return;
  if (memberSection(data, cls, m[2]) !== 'aggregations') {
    report({ control: cls, member: m[2], value: s.slice(0, 40), offset: arg.offset });
  }
}

export default defineRule({
  id: 'invalid-aggregation-item',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a slashed control id that addresses no aggregation item',
  detail: 'A cloned aggregation item has no id the backend can know — the rendered one carries the view prefix the framework assigns at runtime — so it is addressed positionally as `<id>/<aggregation>/<index>` (0-based) and resolved in the browser. Two ways to get that wrong, and the id rules around this one see neither, because they judge the head segment alone: a slashed value that does not MATCH the shape (a non-numeric index, a fourth segment) never enters the aggregation path at all and is looked up as one plain id, which resolves to nothing; and a shape that matches but names an aggregation the control does not declare makes `getAggregation` return nothing, so the wire is dropped with a log. The aggregation half is judged only when the head id resolves to a control the snapshot knows.',
  example: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/first\` ) ( \`setActivePage\` ) ) )`,
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`carousel/pages/0\` ) ( \`setActivePage\` ) ) )`,
  message: (f) => {
    return f.member === 'id'
      ? `'${f.value}' is not the aggregation-item form — a slashed id has to read <id>/<aggregation>/<index> with a NUMERIC 0-based index, and anything else is looked up as one plain id, which resolves to nothing`
      : `${f.control} has no aggregation ${f.member}, so '${f.value}' addresses no item — getAggregation returns nothing and the wire is dropped with a log`;
  },
  check,
});
