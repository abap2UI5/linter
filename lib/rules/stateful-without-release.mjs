import { defineRule } from '../rule.mjs';
import { dispatchFacts } from '../lifecycle-rules.mjs';
import { methodSpans } from '../abap-source.mjs';
import { FROZEN_OBJECTS } from '../released-api.mjs';

/* An app that turns its session stateful - nearly always to hold an ENQUEUE
 * lock - binds the browser to one work process until it turns it off again.
 * Every way out of the app has to release it: a nav_app_leave( ) or a
 * nav_app_call( ) to an app that does not return, while the session is still
 * stateful, leaves lock and work process to the ICF timeout, and no test
 * shows it (abap2UI5-addons/table-maintenance z2ui5_cl_tm_001, 2026-11-25).
 *
 * Judged in a class that declares z2ui5_if_app and calls
 * `client->set_session_stateful( )` with abap_true or no argument (the
 * default is abap_true). Reported: each navigation of the class that is not
 * preceded, in its own method, by `set_session_stateful( abap_false )` -
 * written out, or in a method of this class called before it (followed a few
 * levels deep, the on_leave / release_lock helper). A release AFTER the
 * navigation does not count. And, once per class, an ENQUEUE_* function the
 * class calls while it names no DEQUEUE_* anywhere (by name or in a literal).
 *
 * Not reported: a class that passes set_session_stateful( ) a variable (when
 * it releases is the author's decision, not readable here); a nav_app_call( )
 * to a popup - a target whose class name contains `pop` (abap2UI5's own
 * z2ui5_cl_pop_* among them) - or in a class that takes the called app's
 * result back (it reads id_prev_app or calls get_app( )): the session stays
 * stateful on purpose while the called app is open. A navigation reached
 * only through another object, `_event_nav_app_leave( )` (a frontend
 * leave) and a navigation the client handle of an earlier roundtrip makes
 * are not seen. */
/* the argument list taken whole and trimmed in code: `\s*([^)]*?)\s*\)`
 * overlaps three quantifiers (polynomial backtracking, CodeQL) */
const STATEFUL = /\bset_session_stateful\s*\(([^)]*)\)/gi;
const CLIENT_CALL_BEFORE = /\b(?:me->)?\w*client\s*->\s*$/i;
const NAV = /\b(?:me->)?\w*client\s*->\s*(nav_app_leave|nav_app_call)\s*\(\s*(?:app\s*=\s*)?(?:NEW\s+([\w/]+)\s*\(|([\w/]+)\s*=>)?/gi;
const RELEASE = /\bset_session_stateful\s*\(\s*(?:val\s*=\s*)?abap_false\s*\)/i;
/* every INTERFACES statement, its list judged in code - the one regex
 * `^\s*INTERFACES\b[^.]*\bz2ui5_if_app\b` retried `[^.]*` at every line */
const DECLARES_APP = {
  test(code) {
    for (const m of code.matchAll(/\bINTERFACES\b([^.]*)/gi)) if (/\bz2ui5_if_app\b/i.test(m[1])) return true;
    return false;
  },
};
const OWN_CALL = /(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g;
const RETURNS = /\bid_prev_app(?:_stack)?\b|->\s*get_app\s*\(/i;

function check({ src, code, report }) {
  if (!DECLARES_APP.test(code)) return;
  let on = false;
  for (const m of code.matchAll(STATEFUL)) {
    if (!CLIENT_CALL_BEFORE.test(code.slice(Math.max(0, m.index - 80), m.index))) continue;
    const arg = m[1].trim().replace(/^val\s*=\s*/i, '').trim().toLowerCase();
    if (arg === '' || arg === 'abap_true') on = true;
    else if (arg !== 'abap_false') return;
  }
  if (!on) return;
  const { bodies } = dispatchFacts(code);
  /* does `text` release, itself or through a method of this class it calls */
  const releases = (text, seen = new Set()) => {
    if (RELEASE.test(text)) return true;
    for (const call of text.matchAll(OWN_CALL)) {
      const name = call[1].toLowerCase();
      if (seen.has(name) || seen.size > 8 || !bodies.has(name)) continue;
      seen.add(name);
      if (releases(bodies.get(name).text, seen)) return true;
    }
    return false;
  };
  const spans = methodSpans(code);
  const returns = RETURNS.test(code);
  for (const m of code.matchAll(NAV)) {
    const method = m[1].toLowerCase();
    if (method === 'nav_app_call') {
      if (returns) continue;
      const target = (m[2] || m[3] || '').toLowerCase();
      if (/pop/.test(target) || FROZEN_OBJECTS[target]?.area === 'src/99/02') continue;
    }
    const span = spans.find((s) => s.from < m.index && m.index < s.to);
    const before = code.slice(span ? span.from : 0, m.index).replace(/^\s*METHOD\s+[\w~]+\s*\./i, '');
    if (releases(before)) continue;
    report({ member: method, value: 'navigation', offset: m.index, dedupe: String(m.index) });
  }
  /* the lock: an ENQUEUE function called, no DEQUEUE named anywhere - read on
   * `src`, where a function name in a literal keeps its text */
  const enqueue = /\bCALL\s+FUNCTION\s+[`']?(ENQUEUE_\w+)/i.exec(src);
  if (enqueue && !/\bDEQUEUE_\w*/i.test(src)) {
    report({ member: enqueue[1].toUpperCase(), value: 'lock', offset: enqueue.index });
  }
}

export default defineRule({
  id: 'stateful-without-release',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => (f.value === 'lock'
    ? `${f.member} locks in a stateful app that names no DEQUEUE function anywhere — the lock and the stateful work process stay until the session times out; release the lock (DEQUEUE_*) and call client->set_session_stateful( abap_false ) on every way out of the app`
    : `${f.member}( ) leaves an app that turned its session stateful (set_session_stateful( abap_true )), and nothing before it in this method calls set_session_stateful( abap_false ) — the stateful work process and any ENQUEUE lock stay until the session times out; release both before navigating`),
  check,
});
