import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unused-namespace-declaration',
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
});
