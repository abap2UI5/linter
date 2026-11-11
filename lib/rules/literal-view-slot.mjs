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
  summary: 'a view slot retyped as a string where `cs_view` has a constant for it',
  detail: 'The mirror image of `unknown-view-slot`, and the reason that rule keeps finding work to do. `view = `MAIN`` is correct — and nothing checks it: the value travels to the browser as an object key, so a rename, a typo or the wrong half of the pairing dispatches to no view at all, silently. `client->cs_view-main` cannot fail that way, because the ABAP compiler resolves the name: `cs_view-mian` does not activate. It also spells the one pairing nobody remembers — the constant is `cs_view-nested` and its VALUE is `NEST`, `cs_view-nested2` is `NEST2` — which is exactly the mistake `unknown-view-slot` reports once the literal is written out. A hint, because the wire works today; `--fix` writes the constant in place.',
  example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`NEST\`   " works, but nothing checks it
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-nested
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  fixNote: 'replaces the literal with the `client->cs_view-…` constant carrying that value — an exact one-token substitution, nothing to guess.',
  message: (f) => `the view slot is written as the literal '${f.value}' — use client->cs_view-${CS_VIEW_CONSTANT[f.value]}: the constant is compile-checked, this string is not, and the two do not spell each other (cs_view-nested is NEST); \`--fix\` rewrites it`,
  check,
});
