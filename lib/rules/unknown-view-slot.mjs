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
  summary: 'a literal view slot outside MAIN / NEST / NEST2 / POPUP / POPOVER',
  detail: 'The `view` parameter (and `SET_SIZE_LIMIT`\'s view key) names one of the five slots, case-sensitively: the server compares it as an ABAP string and the browser uses it as an object key. The natural guesses all miss — `main` (lower case), and `NESTED` for `cs_view-nested`, whose VALUE is `NEST`. For `CONTROL_BY_ID` a wrong slot is worse than none: a named slot **suppresses the global id fallback**, so the wire dies although the id exists in an open view. A slot that is a real one up to letter case (`main` for `MAIN`) carries a did-you-mean and a `--fix`; `NESTED` is not one and keeps the finding.',
  example: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = \`main\`   " the slot is MAIN - and \`NESTED\` would be NEST
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  remedy: `client->_event_client( val   = client->cs_event-control_by_id
                       view  = client->cs_view-main
                       t_arg = VALUE #( ( \`table1\` ) ( \`focus\` ) ) ).`,
  fixNote: 'Only where the written slot is one of the five up to letter case (`main` for `MAIN`): the literal is rewritten in place, inside its own quotes. `NESTED` matches nothing that way and keeps the finding — the constant `cs_view-nested` spells `NEST`, which is the author\'s to write.',
  message: (f) => `'${f.value}' is not a view slot (MAIN, NEST, NEST2, POPUP, POPOVER — case-sensitive, and cs_view-nested is NEST) — the wire addresses no view, and for CONTROL_BY_ID a wrong slot even suppresses the global id fallback` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
