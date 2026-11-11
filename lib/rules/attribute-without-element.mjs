import { defineRule } from '../rule.mjs';

/* Called by the reconstructor for an attribute call whose target is the
 * bare factory root: there is no element to carry it, and both builders
 * assert on exactly that. */
function check({ target, member, offset, report }) {
  // …but an element whose NAME did not resolve is an element all the same
  if (target.unresolvedName) return;
  report({ member, offset });
}

export default defineRule({
  id: 'attribute-without-element',
  severity: 'error',
  category: 'structure',
  scope: 'tree',
  summary: '`a( )` on the bare factory root — nothing to attach it to',
  detail: 'An attribute call before any element was opened. There is no element to carry it, and the builder asserts.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->a( n = \`title\` v = \`Hi\` )   " no element open yet`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->a( n = \`title\` v = \`Hi\` )`,
  message: (f) => `an attribute (${f.member}) without an element to attach it to — the view builder asserts on that`,
  check,
});
