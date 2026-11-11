import { defineRule } from '../rule.mjs';
import { memberSection, propertyDecl } from '../ui5-meta.mjs';

function check({ action, args, controlIds, data, report }) {
  /* An imperative setter where the control has a bindable PROPERTY of that
   * name. Binding it two-way keeps the state in the model, where it survives
   * a view rebuild and a draft restore — an action does not — and it is the
   * project rule ("prefer a bindable property over a frontend action").
   * Only PROPERTIES qualify: an association (ObjectPageLayout.selectedSection)
   * and an aggregation cannot be data-bound, so driving those imperatively is
   * the only way and is never reported. */
  if (action !== 'control_by_id' || !data || !controlIds) return;
  const setter = String(args[1]?.value ?? '').match(/^set([A-Z]\w*)$/);
  const control = args[0]?.value ? controlIds[args[0].value] : null;
  if (!setter || !control) return;
  const prop = setter[1][0].toLowerCase() + setter[1].slice(1);
    /* A property whose type is a live JS value (a callback, a DOM node)
     * cannot travel in a JSON model — sap.m.MessagePopover.asyncURLHandler
     * is exactly that, which is why the framework names a built-in policy
     * instead. Those stay imperative by nature, not by choice. */
  const decl = propertyDecl(data, control, prop);
  const bindable = decl && !['function', 'object', 'any'].includes(decl.type);
  if (bindable && memberSection(data, control, prop) === 'properties') {
    report({ control, member: prop, value: args[1].value, offset: args[1].offset });
  }
}

export default defineRule({
  id: 'settable-property-via-action',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a `CONTROL_BY_ID` `set…( )` where the control has a bindable property of that name',
  detail: 'The project rule is *prefer a bindable property over a frontend action*: a two-way bound property keeps the state in the model, where it survives a view rebuild, a draft restore and the browser Back button — a frontend action does not, and it also needs a round-trip to be re-applied. Only **properties** are reported: an association (`sap.uxap.ObjectPageLayout.selectedSection`) and an aggregation cannot be data-bound at all, so driving those imperatively is the only way and is never flagged. A hint, not an error — an imperative call can still be the right answer when the sample\'s point is the imperative API itself.',
  example: `view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`id\` v = \`sideContent\` ).
client->follow_up_action( val   = client->cs_event-control_by_id
                          t_arg = VALUE #( ( \`sideContent\` ) ( \`setShowSideContent\` ) ( \`true\` ) ) )`,
  remedy: `DATA show_side TYPE abap_bool.
view->tag( n = \`DynamicSideContent\` ns = \`l\` )->a( n = \`showSideContent\` v = client->_bind( show_side ) )`,
  message: (f) => `${f.value}( ) drives ${f.control} ${f.member}, which is a bindable property — bind it two-way instead, so the state lives in the model and survives a view rebuild`,
  check,
});
