import { defineRule } from '../rule.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ attrs, code, locals, src, report }) {
  /* The ROOT of the bound name is judged, as binding-to-static and
   * binding-to-nonpublic below judge it: a component travels with its
   * structure, so `_bind( ls_local-field )` is lost with `ls_local` - and the
   * `\w+` that had to end at a blank or `)` never saw that shape. A `me->`
   * root is an attribute by construction and not a local; a root followed
   * by `->` is a REFERENCE into data that lives elsewhere (`LOOP … REFERENCE
   * INTO DATA(row)` then `_bind( row->flag … )`), which the old scan never
   * judged either; and a call carrying `tab =` is the framework's cell
   * binding, whose path is derived from the TABLE and not from the row
   * variable in `val` (abap2UI5's own node/srv test classes carry both). */
  // the name may not shrink in front of a `->`: the lookahead refuses a word
  // or `-` character too, so `layout->x` is no match rather than `layou`
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)(?![\w-]|\s*->)/gi)) {
    if (/^me->/i.test(m[1])) continue;
    const root = m[1].split('-')[0];
    const name = root.toUpperCase();
    if (!locals.has(name) || attrs.has(name)) continue;
    const { body } = parenRegion(src, m.index + m[0].indexOf('(', 'client->_bind'.length));
    if (body !== undefined && namedArgMarks(body).some((a) => a.name === 'tab')) continue;
    report({ member: root, offset: m.index });
  }
}

export default defineRule({
  id: 'binding-to-local',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: 'a local variable bound',
  detail: 'The instance is serialized across the roundtrip, the method stack is not — so the value is gone when the answer comes back. Bind an instance attribute.',
  example: `METHOD z2ui5_if_app~main.
  DATA lv_title TYPE string.
  view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( lv_title ) ).   " gone after the roundtrip
ENDMETHOD.`,
  remedy: `PUBLIC SECTION.
  DATA title TYPE string.
" …
  view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( title ) ).`,
  message: (f) => `${f.member} is a local variable — its value is lost after the roundtrip, bind an instance attribute`,
  check,
});
