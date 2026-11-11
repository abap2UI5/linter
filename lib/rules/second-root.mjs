import { defineRule } from '../rule.mjs';

function check({ root, localName, report }) {
  /* A SECOND element at the document's top level. The builder's chain is one
   * statement; a chain split into several statements keeps its cursor at
   * runtime only when the variable holds the node the next statement adds
   * to - `DATA(view) = factory( )->ele( \`View\` … )`. A standalone
   * `factory( ).` leaves the variable holding the ROOT, and the next
   * `view->tag( )` adds a sibling of the mvc:View instead of a child inside
   * it. The render gate rejects that document as native HTML content; the
   * property gate used to say nothing. Reported on the second root, naming
   * the first, at the document's own level so a fragment with a single
   * FragmentDefinition root is fine and a bare fragment of two controls is
   * not. */
  {
    const roots = root.children.filter((c) => c.name !== null);
    if (roots.length > 1) {
      report({ control: localName(roots[1]), value: localName(roots[0]), count: roots.length, offset: roots[1].offset ?? roots[0].offset });
    }
  }
}

export default defineRule({
  id: 'second-root',
  severity: 'error',
  category: 'structure',
  scope: 'document',
  summary: 'a second element beside the document root — the split chain after a standalone `factory( )`',
  detail: 'The builder\'s chain is one statement. A view written as a statement per subtree keeps its cursor only when the variable holds the node the next statement builds into — `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` … )`. A standalone `factory( ).` leaves the variable holding the ROOT, so the next `view->tag( )` adds a sibling of the `mvc:View` instead of a child inside it, and the document ends up with two top-level elements. The render gate rejects that as native HTML content; the property gate now says why. Reported on the second root, naming the first. A bare fragment of two controls is the same document and is reported too — a fragment with several roots needs a `core:FragmentDefinition`.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->ele( \`Page\` ).
view->tag( \`Button\` )->a( n = \`text\` v = \`Go\` ).   " a sibling of the View, not a child of the Page`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->ele( \`Page\` ).
view->tag( \`Button\` )->a( n = \`text\` v = \`Go\` ).`,
  message: (f) => `the document has a second root <${f.control}> beside <${f.value}> — a chain split across statements after a standalone factory( ). adds siblings of the root instead of children: hang the chain off the factory( ) in one statement (DATA(view) = …=>factory( )->ele( \`View\` … )) so the variable holds the node the next statement builds into`,
  check,
});
