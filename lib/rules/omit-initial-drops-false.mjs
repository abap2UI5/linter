import { defineRule } from '../rule.mjs';
import { clientCalls, namedArgMarks, parenRegion } from '../abap.mjs';
import { BOOLEAN_TYPES } from '../guide-rules.mjs';

function check({ src, code, d, boolFields = null, report }) {

  /* `omit_initial = abap_true` over a row that carries a boolean the view
   * binds to a property defaulting to TRUE. The interface on
   * omit_initial_paths: "an abap_false that MUST reach the client is itself
   * initial, so omit_initial would drop it and the control would fall back to
   * its own default - list the numeric/enum columns instead and leave the
   * booleans." The blanket flag is right for the numeric and enum columns it
   * was written for; the boolean is the one field whose INITIAL value is a
   * value. Two signals, both from what the entry point already derived: the
   * field is bound to a default-true boolean property (`boolFields`, the map
   * absent-boolean-overrides-default reads), and the class declares it with a
   * boolean type - a component of a DDIC type the class does not spell out
   * is not judged. No fix: which columns to list in omit_initial_paths is
   * the author's decision. */
  if (boolFields?.size) {
    /* the names the class declares with a boolean type, read once - the
     * per-field RegExp this replaced rescanned the class for every field of
     * every omit_initial bind */
    let boolDeclared = null;
    const declaredBoolean = (field) => {
      boolDeclared ??= new Set([...src.matchAll(new RegExp(`\\b(\\w+)\\s+TYPE\\s+(?:${BOOLEAN_TYPES})\\b`, 'gi'))].map((d) => d[1].toUpperCase()));
      return boolDeclared.has(String(field).toUpperCase());
    };
    for (const m of clientCalls(code, (method) => method === '_bind' || method === '_bind_edit')) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      if (body === undefined) continue;
      const marks = namedArgMarks(body);
      if (!marks.some((a) => a.name === 'omit_initial' && /^abap_true$/i.test(a.value))) continue;
      const table = marks.find((a) => a.name === 'val')?.value.match(/(\w+)$/)?.[1];
      const fields = table ? boolFields.get(table.toUpperCase()) : null;
      if (!fields?.size) continue;
      for (const field of [...fields].sort()) {
        if (!declaredBoolean(field)) continue;
        report({ member: field, value: table, offset: m.index });
      }
    }
  }
}

export default defineRule({
  id: 'omit-initial-drops-false',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: '`omit_initial = abap_true` on a table whose boolean the control defaults to `true`',
  detail: 'An ABAP field is never absent — it is initial — so by default every field reaches the browser as an explicit `""`/`0`/`false` and overrides the control\'s own default; `omit_initial = abap_true` is the blanket answer, keeping initial fields out of the model so each control keeps its UI5 default. A boolean the view binds to a property that defaults to `true` is the one field that turns that around: `abap_false` is itself initial, so the flag drops exactly the value that had to arrive, and the control shows `true`. The interface\'s ABAP Doc on `omit_initial_paths`: "an abap_false that MUST reach the client is itself initial, so omit_initial would drop it and the control would fall back to its own default — list the numeric/enum columns instead and leave the booleans". Judged from what the entry point already knows — the row field is bound to a boolean property whose snapshot `defaultValue` is `true` (the same read `absent-boolean-overrides-default` makes), and the class declares that component with a boolean type. No fix: which columns to list in `omit_initial_paths` is the author\'s call.',
  example: `TYPES: BEGIN OF ty_row, title TYPE string, enabled TYPE abap_bool, END OF ty_row.
DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial = abap_true )
    )->tag( \`StandardListItem\`
        )->a( n = \`title\`   v = \`{TITLE}\`
        )->a( n = \`visible\` v = \`{ENABLED}\` )   " an abap_false row is dropped and shows`,
  remedy: `TYPES: BEGIN OF ty_row, title TYPE string, enabled TYPE abap_bool, END OF ty_row.
DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial_paths = VALUE #( ( \`TITLE\` ) ) )
    )->tag( \`StandardListItem\`
        )->a( n = \`title\`   v = \`{TITLE}\`
        )->a( n = \`visible\` v = \`{ENABLED}\` )`,
  message: (f) => `_bind( val = ${f.value} omit_initial = abap_true ) drops ${f.member} whenever it is abap_false — an initial boolean is a value that must reach the client, and the control falls back to its own default of true instead; list the numeric/enum columns in omit_initial_paths and leave the booleans`,
  check,
});
