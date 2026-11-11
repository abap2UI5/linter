import { defineRule } from '../rule.mjs';
import { memberOf, withinFloor } from '../ui5-meta.mjs';

/* Called per event parameter the handler reads back (`p`: member = the
 * event, name = the parameter). Returns whether it reported - an unknown
 * parameter is judged only when it did not. */
function check({ data, floor, full, minUi5, p, report }) {
  // per EVENT, never against the flat member map: two events of one
  // control may declare the same parameter name with different
  // histories, and the flat map keeps only one of them
  const eventDecl = memberOf(data, full, p.member, ['events'])?.decl;
  const since = eventDecl?.params?.[p.name]?.since;
  if (!since || withinFloor(since, floor)) return false;
  report({
    control: full,
    member: p.name,
    event: p.member,
    since,
    minUi5,
    offset: p.offset,
  });
  return true;
}

export default defineRule({
  id: 'event-parameter-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'a `${$parameters>/name}` the event only gained later',
  detail: 'An event parameter read back in a `t_arg` that the event did not carry yet at your floor. Resolved per event, not per parameter name, so an identically named parameter on another event does not mask it.',
  example: `view->tag( \`SearchField\` )->a( n = \`search\` v = client->_event( val   = \`SEARCH\`
    t_arg = VALUE #( ( \`\${$parameters>/searchButtonPressed}\` ) ) ) )   " @since 1.114`,
  remedy: `view->tag( \`SearchField\` )->a( n = \`search\` v = client->_event( val   = \`SEARCH\`
    t_arg = VALUE #( ( \`\${$parameters>/query}\` ) ) ) )`,
  message: (f) => `${f.control} ${f.event}: the event parameter $parameters>/${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`,
  check,
});
