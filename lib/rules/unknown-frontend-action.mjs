import { defineRule } from '../rule.mjs';
import { FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES, SERVER_EVENTS } from '../frontend-actions.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called with a wire's val literal when it names no cs_event constant;
 * `at` is where the literal's content starts. Returns whether it reported -
 * the wire is then not judged further. */
function check({ text, offset, at, report }) {
  /* A val that is not NAME-SHAPED and does not travel as custom_js (see the
   * dispatcher in checkFrontendWires( )) can never dispatch: an unknown
   * action, not code in flight. */
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    report({ value: text.replace(/\s+/g, ' ').slice(0, 40), allowed: [...FRONTEND_EVENTS].sort(), offset });
    return true;
  }
  if (FRONTEND_EVENTS.includes(text) || FRONTEND_EVENT_ALIASES.includes(text) || SERVER_EVENTS.includes(text)) return false;
    /* The dispatch table is case-sensitive, so `set_title` is not
     * `SET_TITLE` — and that is the one miss a did-you-mean can name
     * without guessing (lib/suggest.mjs): the fix rewrites the literal. */
  const suggestion = caseMatch(text, [...FRONTEND_EVENTS, ...FRONTEND_EVENT_ALIASES, ...SERVER_EVENTS]);
  report({
    value: text, allowed: [...FRONTEND_EVENTS].sort(), offset,
    ...(suggestion ? { written: text, suggestion, fixes: [{ start: at, end: at + text.length, text: suggestion }] } : {}),
  });
  return true;
}

export default defineRule({
  id: 'unknown-frontend-action',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a literal action name outside the frontend dispatch table',
  detail: 'A `client->_event_client( )` / `client->follow_up_action( )` naming its action as a string literal is dispatched exactly like the `cs_event-` constant — but the constant is compile-checked and the literal is not, and `FrontendAction.execute` looks the name up in its handler table and does **nothing at all** on a miss: no exception, not even a console line. Case matters — the runtime never upper-cases, so `set_title` misses where `SET_TITLE` works. Anything not name-shaped is `follow_up_action`\'s raw-JavaScript escape hatch and is not judged.',
  example: 'client->follow_up_action( val = `set_title` t_arg = VALUE #( ( `Hi` ) ) ).   " the table is case-sensitive: swallowed silently',
  remedy: 'client->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( `Hi` ) ) ).',
  fixNote: 'Only when the written name is a dispatch-table name up to letter case (`set_title` for `SET_TITLE`): the literal is rewritten. Any other name keeps the finding.',
  message: (f) => `'${f.value}' is not a frontend action the dispatch table knows (case-sensitive) — the frontend swallows it without even a console line` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
