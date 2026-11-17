import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'byte-order-mark',
  summary: 'a UTF-8 BOM at the start of a .abap file',
  detail: 'abapGit writes the BOM on `.xml` sidecars and NEVER on `.abap` source, so a source file carrying one diffs against what the system serializes back — permanently, on every pull, for everyone (the classic "fix abapgit diffs" commit). The sidecar half of the same rule is abaplint\'s `xml_bom`; the `.abap` half had no rule anywhere. A warning, not an error: the import works, the tree just never stops diffing.',
  example: '﻿CLASS zcl_my_app DEFINITION PUBLIC.   " the invisible EF BB BF in front of CLASS',
  remedy: 'CLASS zcl_my_app DEFINITION PUBLIC.   " plain UTF-8; abap2ui5lint --fix strips the BOM',
  fixNote: 'The BOM character is deleted — a pure one-character deletion at offset 0.',
});
