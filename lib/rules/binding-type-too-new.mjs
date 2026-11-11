import { defineRule } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

function check({ control, data, floor, member, minUi5, name, offset, report }) {
  const entry = (data.__modelTypes || {})[name];
  if (entry?.since && !withinFloor(entry.since, floor)) {
    report({ control, member, value: name, since: entry.since, minUi5, offset });
  }
}

export default defineRule({
  id: 'binding-type-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'a model type introduced after your target version',
  detail: 'The model types are modules, and a release older than the type does not have the module: named globally in a binding info the binding then runs without its type (the raw value is shown, input is never parsed), named in a `core:require` the module 404s and the view fails to load. `sap.ui.model.odata.type.DateTimeWithTimezone` (@since 1.99) is the case inside the 1.71 floor; the release is read from the class\'s own JSDoc in the snapshot. `DateTimeOffset` is the 1.71 type for a timestamp with an offset.',
  example: `DATA ts TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = ts path = abap_true ) }', type: 'sap.ui.model.odata.type.DateTimeWithTimezone' \\}| )`,
  remedy: `DATA ts TYPE string.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = ts path = abap_true ) }', type: 'sap.ui.model.odata.type.DateTimeOffset' \\}| )`,
  message: (f) => `${f.value} is @since ${f.since} — newer than the ${f.minUi5} floor: an older system has no such module, so the binding runs without its type (by global name) or the view fails to load (through core:require)`,
  check,
});
