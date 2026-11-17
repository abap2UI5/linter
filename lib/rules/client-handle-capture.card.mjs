import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'client-handle-capture',
  summary: 'a `client->_bind( )` / `_event( )` handle captured into a variable',
  detail: 'The string a client handle returns is written at the control, not stored. The runtime does not mind either way; this linter does: the reconstructor resolves an attribute value that is a literal, a `&&` chain of literals or one of those calls IN PLACE, and a variable holding one is a runtime value to it — the attribute written from the variable is DROPPED from the reconstructed view, so every property, binding and version rule is blind to it, with no finding to say so (measured: `DATA(lv_b) = client->_bind( mv_text )` then `v = lv_b` reconstructs the Input without its `value`). Judged on statements — an inline `DATA( )` declaration or an assignment to a declared variable or field whose right-hand side is `_bind( )`, `_bind_edit( )`, `_event( )` or `_event_client( )`; a `v = client->_bind( … )` continuation line inside a builder call is the inline form and is not one. A warning, one notch above `unresolved-attribute-value`: there the check goes, here the attribute goes with it.',
  example: `DATA mv_text TYPE string.
DATA(lv_value) = client->_bind( mv_text ).
view->tag( \`Input\` )->a( n = \`value\` v = lv_value )   " reconstructed without its value`,
  remedy: `DATA mv_text TYPE string.
view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( mv_text ) )`,
  fixNote: 'Where the captured name is read exactly once, as the `v =` of an attribute call, that read becomes the call\'s own text and the capturing statement is deleted (its whole line, when it has one to itself). A name read twice, read anywhere but as an attribute value, or a call spanning lines keeps the finding.',
});
