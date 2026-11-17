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
  fixable: true,
  message: (f) => `${f.member} is bound but not PUBLIC — only public attributes are serialized into the model, so the first roundtrip fails with BINDING_ERROR; move it to the PUBLIC SECTION`,
  check,
});
