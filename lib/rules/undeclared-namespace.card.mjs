import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'undeclared-namespace',
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
});
