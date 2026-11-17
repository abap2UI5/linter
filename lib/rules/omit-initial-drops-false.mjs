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
  message: (f) => `_bind( val = ${f.value} omit_initial = abap_true ) drops ${f.member} whenever it is abap_false — an initial boolean is a value that must reach the client, and the control falls back to its own default of true instead; list the numeric/enum columns in omit_initial_paths and leave the booleans`,
  check,
});
