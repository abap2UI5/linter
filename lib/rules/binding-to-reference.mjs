import { defineRule } from '../rule.mjs';
import { declarationElements } from '../reconstruct.mjs';

function check({ code, src, report }) {
  /* client->_bind( ) on an OBJECT reference. Since abap2UI5#2986 a DATA
   * reference is a valid argument - `_bind( mr_rows )` with `mr_rows TYPE REF
   * TO data` binds what it points to, the shape a table typed at runtime
   * needs (samples app 061) - so only a reference to a class or an interface
   * is still wrong: the model holds data, and an object has none to send.
   * Judged on the class's own declarations, and only where the target is
   * certainly an object type (`object`, or a name in the class/interface
   * namespaces); a reference to a type this class cannot see is left alone
   * rather than guessed at. No fix: what to bind instead is the author's. */
  const objectType = (t) => /^object$/i.test(t) || /^[zy]?(?:cl|if|cx)_/i.test(t) || /^\w*?_(?:cl|if|cx)_/i.test(t);
  const refVars = new Set();
  // every element of a declaration, chained or not: `DATA: mr_a TYPE REF TO
  // x, mr_b TYPE REF TO y.` declares two references
  for (const el of declarationElements(src, /^(?:CLASS-)?DATA$/i)) {
    const d = el.match(/^(\w+)\s+TYPE\s+REF\s+TO\s+(\w+)/i);
    if (d && objectType(d[2])) refVars.add(d[1].toUpperCase());
  }
  if (refVars.size) {
    for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?(\w+))\s*(?![-\w>])/gi)) {
      if (refVars.has(m[2].toUpperCase())) {
        report({ member: m[2], offset: m.index });
      }
    }
  }
}

export default defineRule({
  id: 'binding-to-reference',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  message: (f) => `${f.member} is an OBJECT reference — the model carries data, and an object has none to send, so the bind raises at runtime; bind a public data attribute of the app instead (a DATA reference, TYPE REF TO data, is fine since abap2UI5#2986)`,
  check,
});
