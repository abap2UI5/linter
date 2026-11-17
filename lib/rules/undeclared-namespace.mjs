import { defineRule } from '../rule.mjs';

/* Called for a control tag (`control` its local name) and for an
 * aggregation tag (`control` the tag name as written) alike. */
function check({ node, control, prefixOf, nsOf, report }) {
  /* A prefix used but never declared: the control ends up in the wrong
   * namespace and does not load. The prefix travels in EITHER form - in
   * `ns`, or inside the name the way the builder writes `core:Icon` - and
   * resolve( ) reads both; this check read only `ns`, so the name form
   * resolved to nothing and the node was silently unjudged, while the same
   * view written with `ns = \`core\`` was reported. */
  const prefix = prefixOf(node);
  if (prefix && !(prefix in nsOf(node))) {
    report({ control, member: prefix, offset: node.offset });
  }
}

export default defineRule({
  id: 'undeclared-namespace',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  fixable: true,
  message: (f) => `namespace prefix '${f.member}' is used but never declared (xmlns:${f.member})`,
  check,
});
