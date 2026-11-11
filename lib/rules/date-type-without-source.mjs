import { defineRule } from '../rule.mjs';

/* sap.ui.model.type.Date / DateTime / Time read a JS Date OUT of the model
 * unless formatOptions.source says otherwise. An abap2UI5 model is JSON
 * built from ABAP, so the value is always a string (or a timestamp number)
 * and there is no way to put a Date instance in it - the type then raises a
 * FormatException on the first format() and the field stays empty. Returns
 * the offending type name (the alias as written) or null.
 * -> the binding-info value, e.g. { path: '/DATE', type: 'DateType',
 *    formatOptions: { style: 'short', source: { pattern: 'yyyy-MM-dd' } } } */
const DATE_TYPES = /^sap\.ui\.model\.type\.(Date|DateTime|Time)$/;
function typeWithoutSource(value, requireMap) {
  const v = String(value);
  /* Both keys may be QUOTED - `{ 'type': 'sap.ui.model.type.Date' }` is as
   * valid a binding-info as the bare-key form, and apps 017/018 write every
   * one of their 8 date bindings that way. The two patterns have to move
   * TOGETHER: teaching `type` the quoted spelling while `source` still only
   * knows the bare one would turn those 8 correct bindings into findings,
   * because their `'source'` is quoted too. Value quotes may be single or
   * double for the same reason. */
  const m = v.match(/(?:^|[\s{,])['"]?type['"]?\s*:\s*['"]([^'"]+)['"]/);
  if (!m) return null;
  // a core:require alias resolves to its module path (sap/ui/model/type/Date)
  const module = (requireMap[m[1]] || m[1]).replace(/\//g, '.');
  if (!DATE_TYPES.test(module)) return null;
  return /(?:^|[\s{,])['"]?source['"]?\s*:/.test(v) ? null : m[1];
}

function check({ attr, full, offset, requireMap, value, report }) {
  const dateType = typeWithoutSource(value, requireMap);
  if (dateType) {
    report({ control: full, member: attr, value: dateType, offset });
  }
}

export default defineRule({
  id: 'date-type-without-source',
  severity: 'error',
  category: 'data',
  scope: 'node',
  summary: '`sap.ui.model.type.Date` / `DateTime` / `Time` without `formatOptions.source`',
  detail: 'Without a `source` format option these types expect a **JS `Date` instance** in the model. An abap2UI5 model is JSON serialized from ABAP, so the value is always a string (or a timestamp number) and a `Date` can never reach it — the type raises a `FormatException` on the first `format()` and the field stays empty, with nothing in the console for a `Text`. Add the source format the ABAP field actually carries, e.g. `formatOptions: { source: { pattern: \'yyyy-MM-dd\' } }`. Note the alias form is resolved through the view\'s `core:require`, so `type: \'DateType\'` is judged like the full module name.',
  example: `DATA date TYPE d.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'sap.ui.model.type.Date' \\}| )`,
  remedy: `DATA date TYPE d.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = date path = abap_true ) }', type: 'sap.ui.model.type.Date', formatOptions: \\{ source: \\{ pattern: 'yyyyMMdd' \\} \\} \\}| )`,
  message: (f) => `${f.control} ${f.member} binds ${f.value} without formatOptions.source — the JSON model carries a string, the type wants a Date object, and every format() raises a FormatException`,
  check,
});
