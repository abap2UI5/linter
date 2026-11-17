import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-to-nonpublic',
  summary: 'a PROTECTED/PRIVATE attribute bound',
  detail: 'Only PUBLIC attributes are serialized into the model (`z2ui5_cl_ui5_srv_model` filters on visibility), so binding one from another section fails the **first roundtrip** with `BINDING_ERROR — No class attribute for binding found`. Move the attribute to the `PUBLIC SECTION`. Judged by the root of the bound name (a structure component travels with its root), and only when the class declares a `PUBLIC SECTION` to compare against. Found live: an samples-controls port bound `expanded` from its PROTECTED section and had never worked in a running system — its `LIVE_TEST` deviation was telling the truth the whole time.',
  example: `PROTECTED SECTION.
  DATA expanded TYPE abap_bool.   " BINDING_ERROR on the first roundtrip
" … )->a( n = \`expanded\` v = client->_bind( expanded ) )`,
  remedy: `PUBLIC SECTION.
  DATA expanded TYPE abap_bool.
" … )->a( n = \`expanded\` v = client->_bind( expanded ) )`,
  fixNote: 'The single-line `DATA … TYPE ….` declaration is moved into the PUBLIC SECTION (deleted where it stands, written as the section\'s last line). An element of a chained `DATA:` is reported without a fix.',
});
