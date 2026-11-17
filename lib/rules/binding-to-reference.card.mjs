import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-to-reference',
  summary: 'an object reference (`TYPE REF TO` a class or an interface) handed to `_bind( )`',
  detail: 'The model carries data. Since abap2UI5/abap2UI5#2986 a DATA reference is a valid argument to `_bind( )`, `_bind_path( )` and `_bind_tab( )` - `_bind( mr_rows )` with `mr_rows TYPE REF TO data` binds what it points to, which is how a table typed at runtime is bound. A reference to a class or an interface is no data at all, and the bind raises at runtime. Judged on the class\'s own declarations, and only where the target is certainly an object type: `object`, or a name in the class and interface namespaces (`zcl_`, `cl_`, `z2ui5_if_`, …). A reference to a type the class cannot see is left alone rather than guessed at.',
  example: `DATA mo_detail TYPE REF TO zcl_detail_app.
" …
)->a( n = \`title\` v = client->_bind( mo_detail ) )   " an object, no data`,
  remedy: `DATA mv_title TYPE string.
" …
)->a( n = \`title\` v = client->_bind( mv_title ) )`,
});
