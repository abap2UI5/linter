import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-binding-path',
  summary: 'a hand-written `{/TYPO}` the derived model has no path for',
  detail: 'The field just stays empty — no error, anywhere. Inside a bound aggregation a relative `{TYPO}` is resolved against the row, so a misspelled column field is caught too, but only where the row shape is known from the class\'s `TYPES`. The same row is followed into the column templates of a `sap.ui.table` table (`Column.template`, `rowActionTemplate`, `rowSettingsTemplate`), which UI5 clones per row of the table\'s `rows` binding, and under an element binding on a row of a declared table (`binding="{/T_ROWS/3}"`). A tree bound to a structure (`arrayNames`) is not followed: its rows are nodes, not the structure. Never guessed. A field read straight off a table (`{/T/FIELD}`) is reported as a missing row index: the JSONModel reads `FIELD` off the array itself. Write `{/T/0/FIELD}`, or bind the table.',
  example: `DATA name TYPE string.
…
view->tag( \`Text\` )->a( n = \`text\` v = \`{/NAEM}\` )   " the model has NAME`,
  remedy: `DATA name TYPE string.
…
view->tag( \`Text\` )->a( n = \`text\` v = client->_bind( name ) )`,
  fixNote: 'Only where the missing segment is a field of that level up to letter case (`{/mv_text}` for `MV_TEXT`): the segment is rewritten. A path the model really lacks keeps the finding.',
});
