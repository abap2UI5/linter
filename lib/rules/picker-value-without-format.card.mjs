import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'picker-value-without-format',
  summary: 'a date/time picker binding `value` with neither a binding type nor a `valueFormat`',
  detail: 'A picker parses and formats its `value` with `valueFormat`, and when neither that nor a binding **type** says otherwise it falls back to the browser LOCALE for the string it writes BACK. `client->_bind( )` is two-way and the write-back is a bare ABAP assignment, so the locale string lands in the field. Measured on OpenUI5 (en-US, seeded `"2018-07-09T09:00:00"`): a `sap.m.DateTimePicker` still READS the ISO string — `DateFormat` falls back to ISO — but writes back `"Jul 12, 2018, 2:30:00 PM"`; a `sap.m.DatePicker` does not read it at all (`dateValue` stays null, the raw text is shown) and writes back `"7/12/18"`. Nothing raises, and en-US hides most of it — in de-DE the field comes back as `"04.03.2025, 10:15:00"`, which `new Date( )` parses month-first, so an appointment picked for 4 March is drawn on 3 April. Declare `valueFormat` with the pattern the ABAP field carries (`yyyy-MM-dd\'T\'HH:mm:ss`), or bind with a `sap.ui.model.type.Date`/`DateTime` and its `formatOptions.source` — a typed binding owns the pattern and is never reported. The picker family is read off the metadata (a control declaring both `value` and `valueFormat`), and the rule needs the ABAP class: it only fires where the CLASS also writes the field, because a field only the picker ever writes is self-consistent whatever the locale does, and one the class writes as digit-free text (`N/A`) is not a date at all.',
  example: `DATA start_at TYPE d.
start_at = sy-datum.
view->tag( \`DatePicker\` )->a( n = \`value\` v = client->_bind( start_at ) )   " no valueFormat: the picker cannot parse it`,
  remedy: `DATA start_at TYPE d.
start_at = sy-datum.
view->tag( \`DatePicker\` )->a( n = \`valueFormat\` v = \`yyyyMMdd\`
    )->a( n = \`value\`       v = client->_bind( start_at ) )`,
});
