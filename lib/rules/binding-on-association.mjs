import { defineRule, short } from '../rule.mjs';
import { isBinding } from '../ui5-meta.mjs';

function check({ attr, full, member, offset, value, report }) {
  /* An ASSOCIATION given a binding. XMLTemplateProcessor never parses
   * an association attribute as a binding info: SINGLE_ASSOCIATION
   * takes the value verbatim as an ID (`createId(sValue)`) and
   * MULTIPLE_ASSOCIATION splits it on commas/spaces into IDs. So the
   * braces reach the control as part of an id nothing answers to, the
   * association stays empty, and nothing anywhere reports it - the
   * exact shape this linter exists for. Associations are also the one
   * member kind `settable-property-via-action` deliberately does NOT
   * push towards a binding, for this reason: drive them through a
   * CONTROL_BY_ID setter instead. */
  if (member.set === 'associations' && isBinding(value)) {
    report({ control: full, member: attr, value: String(value).slice(0, 60), offset });
  }
}

export default defineRule({
  id: 'binding-on-association',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  summary: 'a binding written into an association attribute',
  detail: 'Only properties and aggregations can be data-bound. `XMLTemplateProcessor` handles an association attribute by taking its value **verbatim as a control ID** (`createId(sValue)`, or a comma/space split for a 0..n association) — `BindingInfo.parse` is never called on it. So the braces travel into an id nothing answers to, the association stays empty, and neither the parser, the render gate nor the console says a word. Drive an association imperatively instead, with a `CONTROL_BY_ID` setter — which is also why `settable-property-via-action` deliberately never pushes an association towards a binding.',
  example: 'a( n = `selectedSection` v = client->_bind( section ) )   " association -> the id "{/SECTION}"',
  remedy: `follow_up_action( val   = client->cs_event-control_by_id
                  t_arg = VALUE #( ( \`opl\` ) ( \`setSelectedSection\` ) ( section ) ) )`,
  message: (f) => `${f.control} ${f.member} is an ASSOCIATION — the XML parser takes its value as a control ID, never as a binding, so '${short(f.value, 40)}' becomes an id nothing answers to and the association stays empty`,
  check,
});
