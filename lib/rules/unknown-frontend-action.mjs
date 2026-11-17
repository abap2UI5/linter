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
  fixable: true,
  message: (f) => `'${f.value}' is not a frontend action the dispatch table knows (case-sensitive) — the frontend swallows it without even a console line` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
