import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'date-type-without-source',
  summary: '`sap.ui.model.type.Date` / `DateTime` / `Time` without `formatOptions.source`',
  detail: 'Without a `source` format option these types expect a **JS `Date` instance** in the model. An abap2UI5 model is JSON serialized from ABAP, so the value is always a string (or a timestamp number) and a `Date` can never reach it — the type raises a `FormatException` on the first `format()` and the field stays empty, with nothing in the console for a `Text`. Add the source format the ABAP field actually carries, e.g. `formatOptions: { source: { pattern: \'yyyy-MM-dd\' } }`. Note the alias form is resolved through the view\'s `core:require`, so `type: \'DateType\'` is judged like the full module name.',
  example: `DATA date TYPE d.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'sap.ui.model.type.Date' \\}| )`,
  remedy: `DATA date TYPE d.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'sap.ui.model.type.Date', formatOptions: \\{ source: \\{ pattern: 'yyyyMMdd' \\} \\} \\}| )`,
});
