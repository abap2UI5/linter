import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'second-root',
  summary: 'a second element beside the document root — the split chain after a standalone `factory( )`',
  detail: 'The builder\'s chain is one statement. A view written as a statement per subtree keeps its cursor only when the variable holds the node the next statement builds into — `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` … )`. A standalone `factory( ).` leaves the variable holding the ROOT, so the next `view->tag( )` adds a sibling of the `mvc:View` instead of a child inside it, and the document ends up with two top-level elements. The render gate rejects that as native HTML content; the property gate now says why. Reported on the second root, naming the first. A bare fragment of two controls is the same document and is reported too — a fragment with several roots needs a `core:FragmentDefinition`.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->ele( \`Page\` ).
view->tag( \`Button\` )->a( n = \`text\` v = \`Go\` ).   " a sibling of the View, not a child of the Page`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->ele( \`Page\` ).
view->tag( \`Button\` )->a( n = \`text\` v = \`Go\` ).`,
});
