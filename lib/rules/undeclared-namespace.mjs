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
  summary: '`ns = \'form\'` without an `xmlns:form`',
  detail: 'The prefix is used but never declared on the view root, so the parser cannot resolve the control at all.',
  example: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\`     v = \`sap.m\`
    )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
    )->ele( n = \`SimpleForm\` ns = \`form\` )   " no xmlns:form on the root`,
  remedy: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\`      v = \`sap.m\`
    )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
    )->a( n = \`xmlns:form\` v = \`sap.ui.layout.form\`
    )->ele( n = \`SimpleForm\` ns = \`form\` )`,
  fixNote: 'For the conventional prefixes (`core`, `mvc`, `l`/`layout`, `form`, `f`, `table`, `u`/`unified`, `uxap`, `tnt`, `html`, `cc`) the missing declaration is inserted next to the root\'s first `xmlns` write; an unconventional prefix could mean any library and is left alone.',
  message: (f) => `namespace prefix '${f.member}' is used but never declared (xmlns:${f.member})`,
  check,
});
