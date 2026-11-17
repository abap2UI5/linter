import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-to-static',
  summary: 'a `CONSTANTS` or `CLASS-DATA` bound — the model carries instance attributes only',
  detail: 'The framework derives a binding from the app INSTANCE: `attri_search` in `z2ui5_cl_ui5_srv_model` walks the object\'s attributes with `is_class = abap_false AND is_constant = abap_false`, so a `_bind( )` (or `_bind_path( )`) on a constant or a static attribute finds nothing at all and raises **`BINDING_ERROR`** on the first roundtrip — whatever section declares it, which is what separates it from `binding-to-nonpublic`: moving a constant to `PUBLIC` changes nothing. The class compiles and the view reconstructs fine, so no other gate sees it. Judged on the root of the bound name (a component of a structured constant is the constant), and over the whole source: a local `CONSTANTS` inside a method is the same call with the same exception. The way out is an instance attribute in the `PUBLIC SECTION`, seeded from the constant if the value is fixed — or, for a constant that never changes, a literal written straight into the attribute, which needs no binding at all.',
  example: `PUBLIC SECTION.
  CONSTANTS c_title TYPE string VALUE \`Products\`.   " BINDING_ERROR on the first roundtrip
" … )->a( n = \`title\` v = client->_bind( c_title ) )`,
  remedy: `PUBLIC SECTION.
  DATA mv_title TYPE string VALUE \`Products\`.
" … )->a( n = \`title\` v = client->_bind( mv_title ) )`,
});
