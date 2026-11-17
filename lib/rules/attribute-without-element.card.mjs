import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'attribute-without-element',
  summary: '`a( )` on the bare factory root — nothing to attach it to',
  detail: 'An attribute call before any element was opened. There is no element to carry it, and the builder asserts.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->a( n = \`title\` v = \`Hi\` )   " no element open yet`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->a( n = \`title\` v = \`Hi\` )`,
});
