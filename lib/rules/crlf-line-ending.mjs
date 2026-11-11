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
  summary: 'CRLF line endings — abapGit writes LF only',
  detail: 'abapGit serializes every file with LF endings; a file committed with CRLF comes back different on the next pull, for everyone. This is exactly what a `.gitattributes` used to normalize in abap2UI5 until it was deleted and a gate took over — and a consumer repository has neither. One finding per file, however many lines carry it: a file is CRLF or it is not, and a finding per line would drown everything else the report has to say.',
  example: 'CLASS zcl_my_app DEFINITION PUBLIC.\\r\\n   " every line ends CR LF',
  remedy: 'CLASS zcl_my_app DEFINITION PUBLIC.\\n   " LF only; abap2ui5lint --fix rewrites them',
  fixNote: 'Every carriage return in front of a line feed is deleted, converting the whole file to LF in one pass.',
  message: (f) => `${f.value} CRLF line ending(s) — abapGit writes LF only, so the file comes back different on the next pull, for everyone`,
  check,
});
