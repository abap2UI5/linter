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
  summary: 'a UTF-8 BOM at the start of a .abap file',
  detail: 'abapGit writes the BOM on `.xml` sidecars and NEVER on `.abap` source, so a source file carrying one diffs against what the system serializes back — permanently, on every pull, for everyone (the classic "fix abapgit diffs" commit). The sidecar half of the same rule is abaplint\'s `xml_bom`; the `.abap` half had no rule anywhere. A warning, not an error: the import works, the tree just never stops diffing.',
  example: '﻿CLASS zcl_my_app DEFINITION PUBLIC.   " the invisible EF BB BF in front of CLASS',
  remedy: 'CLASS zcl_my_app DEFINITION PUBLIC.   " plain UTF-8; abap2ui5lint --fix strips the BOM',
  fixNote: 'The BOM character is deleted — a pure one-character deletion at offset 0.',
  message: (f) => 'the file starts with a UTF-8 byte-order mark — abapGit never writes one on a .abap file, so the file diffs against what the system serializes back on every pull',
  check,
});
