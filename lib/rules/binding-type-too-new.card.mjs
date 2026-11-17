import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'binding-type-too-new',
  summary: 'a model type introduced after your target version',
  detail: 'The model types are modules, and a release older than the type does not have the module: named globally in a binding info the binding then runs without its type (the raw value is shown, input is never parsed), named in a `core:require` the module 404s and the view fails to load. `sap.ui.model.odata.type.DateTimeWithTimezone` (@since 1.99) is the case inside the 1.71 floor; the release is read from the class\'s own JSDoc in the snapshot. `DateTimeOffset` is the 1.71 type for a timestamp with an offset.',
  example: `DATA ts TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = ts path = abap_true ) }', type: 'sap.ui.model.odata.type.DateTimeWithTimezone' \\}| )`,
  remedy: `DATA ts TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = ts path = abap_true ) }', type: 'sap.ui.model.odata.type.DateTimeOffset' \\}| )`,
});
