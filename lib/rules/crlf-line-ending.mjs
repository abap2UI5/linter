import { defineRule } from '../rule.mjs';

/* CRLF line endings: abapGit writes LF only (abap-check §1). ONE finding
 * carrying every \r as a fix span: a file is CRLF or it is not, and a
 * finding per line would drown everything else it has to say. */
function check({ source, report }) {
  const crlf = [...source.matchAll(/\r\n/g)];
  if (!crlf.length) return;
  report({
    value: crlf.length, offset: crlf[0].index,
    fixes: crlf.map((m) => ({ start: m.index, end: m.index + 1, text: '' })),
  });
}

export default defineRule({
  id: 'crlf-line-ending',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  fixable: true,
  message: (f) => `${f.value} CRLF line ending(s) — abapGit writes LF only, so the file comes back different on the next pull, for everyone`,
  check,
});
