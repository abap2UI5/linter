import { defineRule } from '../rule.mjs';
import { boundType, isDateValueControl, rootBindingPath } from '../ui5-meta.mjs';

function check({ data, full, node, rootWrites, report }) {
  /* A date/time picker whose `value` is bound with neither a binding
   * TYPE nor a `valueFormat` - so the control alone decides the format
   * of the string it writes back through the two-way binding, and it
   * decides it from the browser's LOCALE.
   *
   * Measured on OpenUI5 (en-US, seed "2018-07-09T09:00:00", no
   * valueFormat): a sap.m.DateTimePicker still READS the ISO string
   * (DateFormat falls back to ISO) but writes back
   * "Jul 12, 2018, 2:30:00 PM"; a sap.m.DatePicker does not even read it
   * - dateValue stays null and the raw text is shown - and writes back
   * "7/12/18". `_bind` is two-way and the write-back is a bare ABAP
   * assignment, so whatever the control put in the input is what lands
   * in the field. In de-DE the round trip reads
   * "04.03.2025, 10:15:00", which `new Date( )` then parses MONTH
   * first: an appointment picked for 4 March is drawn on 3 April, with
   * no error anywhere.
   *
   * The picker family is taken from the METADATA, not from a list of
   * control names: a control that declares both `value` and
   * `valueFormat` is by construction one whose value is a date/time
   * string with a declarable pattern (the ten are DateTimeField and its
   * subclasses plus the TimePicker internals). A subclass added later is
   * covered without touching this file.
   *
   * Three gates keep it off code that is correct:
   *
   * 1. a TYPED binding is exempt - the binding type owns the pattern
   *    (`_getBoundValueTypePattern`), which is what makes `valueFormat`
   *    moot rather than missing. 20 of the corpus's 42 value-bound
   *    pickers are typed.
   * 2. a declared `valueFormat` is exempt, obviously - including one
   *    the reconstructor could not resolve (a COND #( )): the author
   *    named the property, and reporting it absent would report this
   *    gate's own blind spot.
   * 3. the class itself must be an AUTHOR of the string. The corruption
   *    needs TWO authors writing one field in two formats; a field only
   *    ever written by the picker is self-consistent whatever the locale
   *    does, and a field the class writes as plain digit-free text
   *    ("N/A") is not a date at all. Both shapes are real corpus ports
   *    faithfully mirroring an original that declares no format either,
   *    and both are silent here. This is the gate that needs the ABAP
   *    class, so a raw XML view - which has no such class to read - is
   *    not judged.
   *
   * A warning, not an error. The MECHANISM is certain, but gate 3 is
   * evidence about the field rather than proof: a value the backend
   * authors, in a picker, is a date in every case that has been looked
   * at, and could in principle be some other digit-bearing string. */
  if (rootWrites && isDateValueControl(data, full)) {
    const valueAttr = node.attrs.find(([a]) => a === 'value');
    const hasFormat = node.attrs.some(([a]) => a === 'valueFormat')
      || node.unresolvedAttrs?.has('valueFormat');
    const path = valueAttr && !boundType(valueAttr[1]) ? rootBindingPath(valueAttr[1]) : null;
    const written = path ? rootWrites.get(path) : null;
    if (path && !hasFormat && written?.any && !written.allPlainText) {
      report({
        control: full, member: 'value', value: path,
        offset: valueAttr[2] ?? node.offset,
      });
    }
  }

}

export default defineRule({
  id: 'picker-value-without-format',
  severity: 'warning',
  category: 'data',
  scope: 'node',
  summary: 'a date/time picker binding `value` with neither a binding type nor a `valueFormat`',
  detail: 'A picker parses and formats its `value` with `valueFormat`, and when neither that nor a binding **type** says otherwise it falls back to the browser LOCALE for the string it writes BACK. `client->_bind( )` is two-way and the write-back is a bare ABAP assignment, so the locale string lands in the field. Measured on OpenUI5 (en-US, seeded `"2018-07-09T09:00:00"`): a `sap.m.DateTimePicker` still READS the ISO string — `DateFormat` falls back to ISO — but writes back `"Jul 12, 2018, 2:30:00 PM"`; a `sap.m.DatePicker` does not read it at all (`dateValue` stays null, the raw text is shown) and writes back `"7/12/18"`. Nothing raises, and en-US hides most of it — in de-DE the field comes back as `"04.03.2025, 10:15:00"`, which `new Date( )` parses month-first, so an appointment picked for 4 March is drawn on 3 April. Declare `valueFormat` with the pattern the ABAP field carries (`yyyy-MM-dd\'T\'HH:mm:ss`), or bind with a `sap.ui.model.type.Date`/`DateTime` and its `formatOptions.source` — a typed binding owns the pattern and is never reported. The picker family is read off the metadata (a control declaring both `value` and `valueFormat`), and the rule needs the ABAP class: it only fires where the CLASS also writes the field, because a field only the picker ever writes is self-consistent whatever the locale does, and one the class writes as digit-free text (`N/A`) is not a date at all.',
  example: `DATA start_at TYPE d.
start_at = sy-datum.
view->tag( \`DatePicker\` )->a( n = \`value\` v = client->_bind( start_at ) )   " no valueFormat: the picker cannot parse it`,
  remedy: `DATA start_at TYPE d.
start_at = sy-datum.
view->tag( \`DatePicker\` )->a( n = \`valueFormat\` v = \`yyyyMMdd\`
    )->a( n = \`value\`       v = client->_bind( start_at ) )`,
  message: (f) => `${f.control} binds ${f.member} to {/${f.value}} with no binding type and no valueFormat — the picker formats the string it writes BACK from the browser locale ("7/12/18", "Jul 12, 2018, 2:30:00 PM"), so the two-way binding overwrites the ABAP field with a value nothing on the backend can read; add valueFormat, or a binding type with formatOptions.source`,
  check,
});
