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
  summary: '`xmlns:form` declared on the root, and nothing in the view uses `form:`',
  detail: 'The mirror of `undeclared-namespace`: a prefix the root declares that no element and no attribute in the reconstructed document carries — neither as `ns = `form``, nor inside a name (`core:Icon`), nor on an attribute (`core:require`, `app:type`). The parser does not mind, so this is a hint; what it flags is a stale claim about the view\'s contents, usually the trace of a control that was removed or of a scaffold\'s root copied whole. The default `xmlns` is never reported. Judged per document, so a fragment root repeating the view\'s declarations is judged on its own subtree.',
  example: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\`      v = \`sap.m\`
    )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
    )->a( n = \`xmlns:form\` v = \`sap.ui.layout.form\`
    )->tag( \`Button\` )   " nothing below the root uses form:`,
  remedy: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\`      v = \`sap.m\`
    )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
    )->tag( \`Button\` )`,
  fixNote: 'The declaring `a( )` call is deleted with its line — only when the call has that line to itself (the house layout, `)->a( n = `xmlns:form` v = `…`` with the closing paren opening the next line, or a complete `->a( … )` alone on its line). The LAST call of a chain, `)->a( n = `xmlns:form` v = `…` ).`, is cut out from the end of the line before instead, so the statement ends there (`… v = `sap.ui.core.mvc` ).`); two stale ones in a row at the end take a second pass, which one `--fix` makes by itself. A declaration sharing its line with another call or a comment, or following a line that ends in a comment, is reported without a fix. ABAP sources only.',
  message: (f) => `xmlns:${f.member} is declared on the ${f.control} root but no element or attribute in the document uses the prefix — a stale declaration, usually the trace of a removed control or a copied root`,
  check,
});
