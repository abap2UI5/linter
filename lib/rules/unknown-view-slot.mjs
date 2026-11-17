import { defineRule } from '../rule.mjs';
import { VIEW_SLOTS } from '../frontend-actions.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called with the view parameter of a wire and with SET_SIZE_LIMIT's view
 * key. Returns whether it reported; a slot spelled right goes on to
 * literal-view-slot. */
function check({ value, offset, at, report }) {
  /* The view PARAMETER names a slot, and the slot keys are case-sensitive
   * on the wire (an ABAP string compare on the server, an object key in the
   * browser). `NESTED` — the natural guess for cs_view-nested, whose VALUE
   * is `NEST` — misses, and for CONTROL_BY_ID a wrong slot is worse than
   * none: it SUPPRESSES the global id fallback, so the wire dies although
   * the id exists. */
  if (VIEW_SLOTS.includes(value)) return false;
  // `main` for MAIN is a case miss, not a wrong slot: the fix rewrites it -
  // offered where the literal's content position is known (`at`)
  const suggestion = at != null ? caseMatch(value, VIEW_SLOTS) : null;
  report({
    member: 'view', value, offset,
    ...(suggestion ? { written: value, suggestion, fixes: [{ start: at, end: at + value.length, text: suggestion }] } : {}),
  });
  return true;
}

export default defineRule({
  id: 'unknown-view-slot',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  fixable: true,
  message: (f) => `'${f.value}' is not a view slot (MAIN, NEST, NEST2, POPUP, POPOVER — case-sensitive, and cs_view-nested is NEST) — the wire addresses no view, and for CONTROL_BY_ID a wrong slot even suppresses the global id fallback` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
