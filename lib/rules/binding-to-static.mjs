import { defineRule } from '../rule.mjs';

function check({ code, statics, report }) {
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/gi)) {
    const root = m[1].replace(/^me->/i, '').split('-')[0];
    const kind = statics.get(root.toUpperCase());
    if (kind) report({ member: root, value: kind, offset: m.index });
  }
}

export default defineRule({
  id: 'binding-to-static',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'a `CONSTANTS` or `CLASS-DATA` bound — the model carries instance attributes only',
  detail: 'The framework derives a binding from the app INSTANCE: `attri_search` in `z2ui5_cl_ui5_srv_model` walks the object\'s attributes with `is_class = abap_false AND is_constant = abap_false`, so a `_bind( )` (or `_bind_path( )`) on a constant or a static attribute finds nothing at all and raises **`BINDING_ERROR`** on the first roundtrip — whatever section declares it, which is what separates it from `binding-to-nonpublic`: moving a constant to `PUBLIC` changes nothing. The class compiles and the view reconstructs fine, so no other gate sees it. Judged on the root of the bound name (a component of a structured constant is the constant), and over the whole source: a local `CONSTANTS` inside a method is the same call with the same exception. The way out is an instance attribute in the `PUBLIC SECTION`, seeded from the constant if the value is fixed — or, for a constant that never changes, a literal written straight into the attribute, which needs no binding at all.',
  example: `PUBLIC SECTION.
  CONSTANTS c_title TYPE string VALUE \`Products\`.   " BINDING_ERROR on the first roundtrip
" … )->a( n = \`title\` v = client->_bind( c_title ) )`,
  remedy: `PUBLIC SECTION.
  DATA mv_title TYPE string VALUE \`Products\`.
" … )->a( n = \`title\` v = client->_bind( mv_title ) )`,
  message: (f) => `${f.member} is ${f.value === 'CLASS-DATA' ? 'a CLASS-DATA attribute' : 'a CONSTANTS'} — the model carries INSTANCE attributes only, the framework's attribute search skips statics and constants, so the bind finds nothing and raises BINDING_ERROR on the first roundtrip; bind an instance attribute of the PUBLIC SECTION`,
  check,
});
