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
  fixable: true,
  message: (f) => `_bind( val = ${f.member} path = abap_true ) is _bind_path( ${f.member} ) spelled through a flag — the same call byte for byte; write _bind_path( ), which says what it returns`,
  check,
});
