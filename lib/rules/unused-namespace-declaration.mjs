import { defineRule } from '../rule.mjs';
import { documentFacts } from '../view-document.mjs';

function check({ root, prefixOf, localName, report }) {
  const { declared, used } = documentFacts(root, prefixOf);
  /* A prefix declared on a root and used by nothing in the document. Not a
   * defect - the parser ignores it - but every declaration is a claim about
   * the view's contents, and a stale one is the trace of a control that was
   * removed, or of a scaffold's root copied whole. The reverse of
   * undeclared-namespace, and judged on the same two spellings (`ns = ` and
   * an in-name `core:Icon`) plus attribute prefixes (`core:require`,
   * `app:type`, `template:require`), which the forward rule has no reason to
   * read. A prefix declared TWICE in one document (a fragment root repeating
   * the view's) is reported once per declaration - each one is unused. */
  for (const d of declared) {
    if (used.has(d.prefix)) continue;
    report({ control: localName(d.node), member: d.prefix, value: d.uri, offset: d.offset });
  }
}

export default defineRule({
  id: 'unused-namespace-declaration',
  severity: 'hint',
  category: 'structure',
  scope: 'document',
  fixable: true,
  message: (f) => `xmlns:${f.member} is declared on the ${f.control} root but no element or attribute in the document uses the prefix — a stale declaration, usually the trace of a removed control or a copied root`,
  check,
});
