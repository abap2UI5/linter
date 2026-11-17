import { defineRule } from '../rule.mjs';
import { CS_VIEW_CONSTANT } from '../frontend-actions.mjs';

/* Called with a slot value spelled RIGHT and the span of its literal: the
 * view parameter, SET_SIZE_LIMIT's key, KEYBOARD_SHORTCUT's scope. */
function check({ value, start, end, report }) {
  /* A view slot RETYPED as a literal where the constant exists.
   *
   * `unknown-view-slot` next door catches the spelling that misses. This is
   * the same mistake one keystroke earlier: `view = \`MAIN\`` is correct today
   * and is one rename away from being the finding above, because nothing
   * compile-checks it. `client->cs_view-main` does not have that failure mode
   * at all — the name is resolved by the ABAP compiler, so `cs_view-mian` is
   * a syntax error rather than a wire that dispatches to no view — and it is
   * the only spelling that survives the pairing nobody remembers
   * (`cs_view-nested` is `NEST`, not `NESTED`).
   *
   * A hint, not a warning: the literal WORKS. It is offered with a fix,
   * which is the whole point — the correction is one exact substitution with
   * nothing to guess. Only an exact slot value is judged; a value that merely
   * upper-cases to one is a different rule's business. */
  const constant = CS_VIEW_CONSTANT[String(value)];
  if (!constant || start == null || end == null) return;
  report({ member: 'view', value: String(value), offset: start, fixes: [{ start, end, text: `client->cs_view-${constant}` }] });
}

export default defineRule({
  id: 'literal-view-slot',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => `the view slot is written as the literal '${f.value}' — use client->cs_view-${CS_VIEW_CONSTANT[f.value]}: the constant is compile-checked, this string is not, and the two do not spell each other (cs_view-nested is NEST); \`--fix\` rewrites it`,
  check,
});
