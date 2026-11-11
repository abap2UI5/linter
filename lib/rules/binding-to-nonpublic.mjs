import { defineRule } from '../rule.mjs';
import { moveDeclarationFix, publicAttributes } from '../abap-helpers.mjs';

function check({ attrs, code, locals, source, src, statics, report }) {
  if (/\bPUBLIC\s+SECTION\b/i.test(src)) {
    const publicNames = new Set(publicAttributes(src).map((a) => a.name.toUpperCase()));
    for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/gi)) {
      const root = m[1].replace(/^me->/i, '').split('-')[0];
      const up = root.toUpperCase();
      // a static root is binding-to-static's, whatever section it sits in
      if (attrs.has(up) && !publicNames.has(up) && !locals.has(up) && !statics.has(up)) {
        // the fix MOVES the declaration into the PUBLIC SECTION - see moveDeclarationFix
        const fixes = moveDeclarationFix(source, src, root, 'PUBLIC');
        report({ member: root, offset: m.index, ...(fixes ? { fixes } : {}) });
      }
    }
  }
}

export default defineRule({
  id: 'binding-to-nonpublic',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'a PROTECTED/PRIVATE attribute bound',
  detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so binding one from another section fails the **first roundtrip** with `BINDING_ERROR — No class attribute for binding found`. Move the attribute to the `PUBLIC SECTION`. Judged by the root of the bound name (a structure component travels with its root), and only when the class declares a `PUBLIC SECTION` to compare against. Found live: an samples-controls port bound `expanded` from its PROTECTED section and had never worked in a running system — its `LIVE_TEST` deviation was telling the truth the whole time.',
  example: `PROTECTED SECTION.
  DATA expanded TYPE abap_bool.   " BINDING_ERROR on the first roundtrip
" … )->a( n = \`expanded\` v = client->_bind( expanded ) )`,
  remedy: `PUBLIC SECTION.
  DATA expanded TYPE abap_bool.
" … )->a( n = \`expanded\` v = client->_bind( expanded ) )`,
  fixNote: 'The single-line `DATA … TYPE ….` declaration is moved into the PUBLIC SECTION (deleted where it stands, written as the section\'s last line). An element of a chained `DATA:` is reported without a fix.',
  message: (f) => `${f.member} is bound but not PUBLIC — only public attributes are serialized into the model, so the first roundtrip fails with BINDING_ERROR; move it to the PUBLIC SECTION`,
  check,
});
