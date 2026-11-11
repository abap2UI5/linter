import { defineRule } from '../rule.mjs';
import { codeWithEmbeds } from '../abap-helpers.mjs';
import { namedArgMarks, parenRegion } from '../abap.mjs';

function check({ src, report }) {
  const code = codeWithEmbeds(src);
  for (const m of code.matchAll(/client->_bind\s*\(/gi)) {
    if (/\bv\s*=\s*$/i.test(code.slice(Math.max(0, m.index - 12), m.index))) continue;
    const open = m.index + m[0].length - 1;
    const { body, end } = parenRegion(src, open);
    if (body === undefined || end >= src.length) continue;
    const marks = namedArgMarks(body);
    if (marks.length !== 2) continue;
    const val = marks.find((a) => a.name === 'val');
    const path = marks.find((a) => a.name === 'path');
    if (!val || !path || !/^abap_true$/i.test(path.value)) continue;
    const nameAt = m.index + 'client->'.length;
    report({
      member: val.value, dedupe: String(m.index), offset: m.index,
      fixes: [{ start: nameAt, end: end + 1, text: `_bind_path( ${val.value} )` }],
    });
  }
}

export default defineRule({
  id: 'bind-path-flag',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: '`_bind( val = x path = abap_true )` where `_bind_path( x )` says the same',
  detail: '`_bind_path( )` is the path form of `_bind( )` under a name of its own and delegates to it, so the two calls return the same text byte for byte. It exists because the flag reads like nothing: a named `val` and a boolean whose meaning the reader has to know already. One spelling for one thing also keeps the corpora searchable. Judged only where the call passes exactly `val` and `path = abap_true`: with a third argument (`json`, `tab`, `switch_default_model`, …) `_bind( )` is the right call and the flag stays. A call that is the whole `v =` value of an attribute is `bind-path-as-value`\'s, which reports the bare path itself.',
  example: `|\\{ path: '{ client->_bind( val = mt_rows path = abap_true ) }', templateShareable: false \\}|`,
  remedy: `|\\{ path: '{ client->_bind_path( mt_rows ) }', templateShareable: false \\}|`,
  fixNote: 'The call is rewritten to `_bind_path( <val> )`, keeping the value expression as written. Only for the two-argument shape the rule reports.',
  message: (f) => `_bind( val = ${f.member} path = abap_true ) is _bind_path( ${f.member} ) spelled through a flag — the same call byte for byte; write _bind_path( ), which says what it returns`,
  check,
});
