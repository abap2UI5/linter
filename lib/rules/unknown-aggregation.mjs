import { defineRule } from '../rule.mjs';
import { chainComplete, memberNames, snapshotHint } from '../ui5-meta.mjs';
import { caseMatch } from '../suggest.mjs';

function check({ node, parent, member, data, resolve, nsOf, prefixOf, report }) {
  if (!member) {
    if (chainComplete(data, parent)) {
      /* …or the one CONTROL of the tag's own library it is up to case:
       * `page` under a View is not an aggregation, it is `Page` with the
       * wrong first letter. Aggregations only on the member side: a tag
       * that is an association up to case would be "fixed" into the
       * association-as-tag shape reported below, which loads no better. */
      const own = resolve(node) || '';
      const ownLib = own.slice(0, own.lastIndexOf('.'));
      const libControls = ownLib ? Object.keys(data)
        .filter((k) => k.startsWith(`${ownLib}.`) && !k.slice(ownLib.length + 1).includes('.'))
        .map((k) => k.slice(ownLib.length + 1)) : [];
      const suggestion = caseMatch(node.name, [...memberNames(data, parent, ['aggregations']), ...libControls]);
      report({
        control: parent, member: node.name, snapshot: data.__ui5Version, offset: node.offset,
        ...(suggestion ? { written: node.name, suggestion } : {}),
      });
    }
    return;
  }
  if (member.set === 'associations') {
    /* An ASSOCIATION written as a child tag. UI5 knows only aggregations
     * there: `<ariaLabelledBy>lbl</ariaLabelledBy>` under a Button is a
     * child node whose name no aggregation has, so XMLTemplateProcessor
     * resolves it as the control sap.m.ariaLabelledBy and the view fails
     * to load; the text inside is discarded either way. An association
     * takes its ids as an ATTRIBUTE (ariaLabelledBy="lbl"). No did-you-mean
     * and no fix - the name is right, the syntax is not. */
    report({ control: parent, member: node.name, association: true, offset: node.offset });
    return;
  }
  /* The tag has to be in its PARENT's namespace. XMLTemplateProcessor
   * recognizes an aggregation only where `childNode.namespaceURI === ns`,
   * the namespace of the control tag it sits in; any other prefix makes
   * it a CONTROL to be loaded - `<f:content>` under a sap.m.Page is
   * sap/f/content.js, a 404 that takes the whole view down, and the
   * linter said nothing. The comparison is against the parent TAG's
   * library, not the library that declares the aggregation: `items` on
   * a sap.f.GridList is inherited from sap.m.ListBase and is still
   * written `<f:items>`. */
  const tagPrefix = prefixOf(node);
  const tagLib = nsOf(node)[tagPrefix || ''] || null;
  const parentLib = parent.slice(0, parent.lastIndexOf('.'));
  if (tagLib && tagLib !== parentLib) {
    report({
      control: parent, member: node.name,
      namespace: tagLib, expected: parentLib, prefix: tagPrefix || '', offset: node.offset,
    });
  }
}

export default defineRule({
  id: 'unknown-aggregation',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  fixable: true,
  message: (f) => {
    /* the two readings that are not a typo: the right name in the wrong
     * NAMESPACE, and an association written as a child tag - UI5 resolves
     * both as a control class and the view fails to load */
    if (f.namespace) {
      return `${f.control} ${f.member}: <${f.prefix ? `${f.prefix}:` : ''}${f.member}> is written in the ${f.namespace} namespace${f.prefix ? '' : ' (the default xmlns)'}, but an aggregation tag has to be in the namespace of its parent tag, ${f.expected} — UI5 resolves it as the control ${f.namespace}.${f.member} and the view fails to load`;
    }
    if (f.association) {
      return `${f.control} ${f.member} is an association, not an aggregation — as a child tag it is resolved as the control ${f.control.slice(0, f.control.lastIndexOf('.'))}.${f.member} and the view fails to load; write it as an attribute (${f.member}="…")`;
    }
    return `${f.control} has no aggregation ${f.member} — typo?${snapshotHint(f)}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
