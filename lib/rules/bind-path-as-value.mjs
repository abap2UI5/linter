import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';
import { bindingOf } from '../reconstruct.mjs';

function check({ src, source, d, report }) {
  /* A bare model PATH written as an attribute's value. `_bind_path( x )` and
   * `_bind( val = x path = abap_true )` return `/X` - the path without its
   * braces, for a binding the app assembles itself (a complex binding info, an
   * expression binding, a sorter). Handed to `v =` as the whole value it is no
   * binding at all: UI5 reads the attribute as the TEXT "/X", so a Text shows
   * the path, an Input starts with it, and a typed property (a boolean, an
   * enum, a number) refuses it and takes the view down. The reconstructor
   * rebuilds exactly that text, which no view-side rule can tell from a
   * literal - so this is read off the call. `t =` (text, escaped) is the way to
   * SHOW a path and is never judged, and neither is the one attribute that
   * takes a bare path, XML templating's `template:with path="…"`. The fix
   * makes it the binding it was meant to be: `_bind_path` becomes `_bind`, a
   * `path = abap_true` argument is deleted. */
  for (const m of src.matchAll(new RegExp(`->\\s*(${d.att})\\s*\\(`, 'gi'))) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const marks = namedArgMarks(body);
    const vArg = marks.find((a) => a.name === 'v');
    const attr = marks.find((a) => a.name === 'n')?.value.match(/^[`'|]([\w:]+)[`'|]$/)?.[1];
    if (!vArg || !attr || attr.toLowerCase() === 'path') continue;
    const bind = bindingOf(vArg.value);
    if (!bind?.bare) continue;
    const at = open + 1 + vArg.vstart; // the call's first character in the source
    const call = vArg.value.match(/^client->(_bind(?:_path)?)\s*\(/i);
    let fixes = null;
    if (/^_bind_path$/i.test(call[1])) {
      const nameAt = at + 'client->'.length;
      fixes = [{ start: nameAt, end: nameAt + call[1].length, text: '_bind' }];
    } else {
      // the `path = abap_true` argument of the bind, with the blanks before it
      const inner = at + call[0].length - 1;
      const pathArg = namedArgMarks(parenRegion(src, inner).body).find((a) => a.name === 'path');
      if (pathArg) {
        let start = inner + 1 + pathArg.nameStart;
        while (start > inner + 1 && /[ \t]/.test(source[start - 1])) start--;
        fixes = [{ start, end: inner + 1 + pathArg.vend, text: '' }];
      }
    }
    report({ member: attr, value: bind.path, offset: at, ...(fixes ? { fixes } : {}) });
  }
}

export default defineRule({
  id: 'bind-path-as-value',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  fixable: true,
  message: (f) => {
    return `${f.member} gets the bare path ${f.value} — _bind_path( ) and _bind( path = abap_true ) return the path WITHOUT its braces, for a binding info the app assembles; written as the whole value it is no binding, the attribute is the text "${f.value}". Bind it: v = client->_bind( … )`;
  },
  check,
});
