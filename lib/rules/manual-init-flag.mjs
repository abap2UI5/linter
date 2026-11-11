import { defineRule } from '../rule.mjs';
import { ifBranchEnd } from '../abap-source.mjs';

/* `boolVars`, `attrs` and `locals` come from the caller, which derived them
 * for its own rules; deriving them a second time here would read the class
 * twice to reach the same answer. */
function check({ src, report, boolVars, attrs, locals }) {
  /* A hand-rolled init flag where client->check_on_init( ) is the contract.
   * The framework already knows whether this is the first run of the app
   * instance — a boolean attribute that gates the first render duplicates
   * that knowledge as serialized state: it travels to the browser on every
   * roundtrip for nothing, and subtle ordering bugs grow around it (a popup
   * or JS loader initialized before the flag flips sees the wrong phase).
   * One mass migration replaced this pattern in 111 sample classes at once.
   * Only the unambiguous shape is judged: an IF on the attribute being
   * initial/false whose branch BOTH sets it true AND hands a view over — a
   * lazy-load guard that displays nothing is left alone. */
  // the `<name> = abap_true` pattern per flag, built once however many IFs ask
  const setsTrue = new Map();
  const setsTrueOf = (name) => {
    if (!setsTrue.has(name)) setsTrue.set(name, new RegExp(`\\b(?:me->)?${name}\\s*=\\s*abap_true\\b`, 'i'));
    return setsTrue.get(name);
  };
  for (const m of src.matchAll(/\bIF\s+(?:me->)?(\w+)\s*(?:=\s*abap_false|IS\s+INITIAL)\b/gi)) {
    const name = m[1].toUpperCase();
    if (!boolVars.has(name) && !attrs.has(name)) continue;
    if (locals.has(name)) continue;
    const end = ifBranchEnd(src, m.index + m[0].length);
    const branch = src.slice(m.index, end);
    if (!setsTrueOf(name).test(branch)) continue;
    if (!/\b(?:view_display|nest2?_view_display|popup_display|popover_display)\s*\(/i.test(branch)) continue;
    report({ member: m[1], offset: m.index });
  }
}

export default defineRule({
  id: 'manual-init-flag',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a hand-rolled init flag instead of `client->check_on_init( )`',
  detail: 'The framework already knows whether this is the first run of the app instance — `client->check_on_init( )` is the lifecycle contract. A boolean attribute that gates the first render duplicates that knowledge as serialized state: it ships to the browser on every roundtrip for nothing, and subtle ordering bugs grow around the moment it flips. One mass migration replaced this pattern in 111 sample classes at once. Only the unambiguous shape is reported: an `IF` on the attribute being initial/false whose branch both sets it true and hands a view over — a lazy-load guard that displays nothing is left alone.',
  example: `DATA check_initialized TYPE abap_bool.
IF check_initialized = abap_false.
  check_initialized = abap_true.
  client->view_display( render( ) ).
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  client->view_display( render( ) ).
ENDIF.`,
  message: (f) => `${f.member} is a hand-rolled init flag — client->check_on_init( ) already says whether this is the first run, without shipping a flag to the browser on every roundtrip`,
  check,
});
