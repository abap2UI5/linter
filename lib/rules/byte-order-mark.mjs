import { defineRule } from '../rule.mjs';

/* A UTF-8 BOM on a .abap file: abapGit never writes one, so the file diffs
 * against what the system serializes back on every pull (abap-check §1). */
function check({ source, report }) {
  if (source.charCodeAt(0) === 0xFEFF) report({ offset: 0, fixes: [{ start: 0, end: 1, text: '' }] });
}

export default defineRule({
  id: 'byte-order-mark',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  fixable: true,
  message: (f) => 'the file starts with a UTF-8 byte-order mark — abapGit never writes one on a .abap file, so the file diffs against what the system serializes back on every pull',
  check,
});
