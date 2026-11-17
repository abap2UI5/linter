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
  message: (f) => `${f.member} is ${f.value === 'CLASS-DATA' ? 'a CLASS-DATA attribute' : 'a CONSTANTS'} — the model carries INSTANCE attributes only, the framework's attribute search skips statics and constants, so the bind finds nothing and raises BINDING_ERROR on the first roundtrip; bind an instance attribute of the PUBLIC SECTION`,
  check,
});
