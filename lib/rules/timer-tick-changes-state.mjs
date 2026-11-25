import { defineRule } from '../rule.mjs';
import { parenRegion } from '../abap.mjs';
import { branchArms } from '../lifecycle-rules.mjs';

/* A timer handler that changes an attribute on every tick.
 *
 * Since abap2UI5 cdd2fb25 a START_TIMER tick whose main( ) left the app
 * serializing byte for byte to the draft it continued writes no draft row
 * (z2ui5_cl_ui5_handler=>main_end_reuse). A handler that stamps the time or
 * counts the ticks makes every tick different, and the page writes one draft
 * per tick for as long as it is open. Often the value is wanted - so a hint,
 * and opt-in: the author decides whether the stamp is worth a row a tick.
 *
 * Read conservatively:
 *   - the timer's event is the literal first t_arg of a START_TIMER follow-up
 *     action (handed over by checkFrontendWires( ), `timerEvents`) or the
 *     literal `event =` of client->timer_set( ); one the source does not
 *     spell as a literal is not followed;
 *   - its handler is an arm that names that event: a WHEN of the event CASE,
 *     check_on_event( ), get_event( ) = (branchArms( ) in lifecycle-rules.mjs),
 *     plus the methods of the class such an arm calls, a few levels deep;
 *   - only an assignment that runs on EVERY tick is reported: one at the
 *     arm's own level (a TRY body counts), not one under a further IF, CASE
 *     or LOOP - a guard comparing with the previous value is exactly the
 *     remedy, and this reader does not tell it from any other guard;
 *   - the target is an instance attribute (DATA of the class, `me->x`, or a
 *     component of one), never a local, a CLASS-DATA or a parameter;
 *   - the source differs on every call: sy-uzeit, sy-datum, sy-timlo,
 *     sy-datlo, utclong_current( ), cl_abap_context_info=>get_system_time/
 *     date( ), GET TIME STAMP FIELD / GET TIME FIELD, and the counter
 *     `x = x + n` / `x += n`. An assignment from the polled data itself is
 *     none of these and stays silent. */
const VOLATILE = /\b(?:sy-(?:uzeit|datum|timlo|datlo)\b|utclong_current\s*\(|cl_abap_context_info\s*=>\s*get_system_(?:time|date)\b)/i;
const CONSTANT_TEXT = /`(?:[^`]|``)*`|'(?:[^']|'')*'/g;

function timerSetEvents(src, code) {
  const out = [];
  for (const m of code.matchAll(/->\s*timer_set\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const ev = body?.match(/\bevent\s*=\s*[`'|]([A-Za-z0-9_]+)[`'|]/i);
    if (ev) out.push(ev[1].toUpperCase());
  }
  return out;
}

/* The instance attribute a statement assigns from a value that differs on
 * every call, or null. */
function volatileTarget(model, src, s) {
  const t = s.tokens.filter((x) => x.kind !== 'pragma');
  let target;
  let rhsFrom;
  if (s.keyword === 'GET' && t[1]?.upper === 'TIME') {
    const field = t.findIndex((x) => x.upper === 'FIELD');
    if (field === -1 || !t[field + 1]) return null;
    target = { tok: t[field + 1], viaMe: false };
    rhsFrom = -1;
  } else {
    const viaMe = t[0]?.upper === 'ME' && t[1]?.text === '->';
    const head = viaMe ? 2 : 0;
    const op = t[head + 1];
    if (t[head]?.kind !== 'word' || !op || op.kind !== 'op' || (op.text !== '=' && op.text !== '+=')) return null;
    target = { tok: t[head], viaMe };
    rhsFrom = head + 2;
    const rhs = t.slice(rhsFrom);
    const same = (x) => x?.kind === 'word' && x.upper === target.tok.upper;
    const num = (x) => x?.kind === 'word' && /^\d+$/.test(x.text);
    const counter = op.text === '+='
      ? rhs.length === 1 && num(rhs[0])
      : rhs.length === 3 && rhs[1].text === '+' && ((same(rhs[0]) && num(rhs[2])) || (num(rhs[0]) && same(rhs[2])));
    if (!counter) {
      const text = src.slice(rhs[0]?.start ?? s.end, s.end).replace(CONSTANT_TEXT, '``');
      if (!VOLATILE.test(text)) return null;
    }
  }
  const root = target.tok.text.split('-')[0].toLowerCase();
  const decl = target.viaMe ? model.attribute(root) : model.resolve(root, target.tok.start);
  if (!decl || (!target.viaMe && decl.origin !== 'attribute') || decl.kind !== 'data') return null;
  return root;
}

function check({ model, src, code, timerEvents = [], report }) {
  const events = new Set([
    ...timerEvents.map((e) => String(e.name).toUpperCase()),
    ...timerSetEvents(src, code),
  ]);
  if (!events.size) return;
  const byName = new Map(model.methods.map((m) => [m.name.toLowerCase(), m]));
  const seenAt = new Set();
  const judge = (s, event) => {
    if (seenAt.has(s.start)) return;
    const member = volatileTarget(model, src, s);
    if (!member) return;
    seenAt.add(s.start);
    report({ member, value: event, offset: s.start, dedupe: String(s.start) });
  };
  /* the statements of an own method the handler calls, at its top level */
  const follow = (s, event, seen, depth) => {
    if (depth > 3) return;
    const t = s.tokens;
    for (let i = 0; i < t.length - 1; i++) {
      if (t[i].kind !== 'word' || t[i + 1].text !== '(') continue;
      const prev = t[i - 1];
      if (prev && (prev.text === '=>' || (prev.text === '->' && t[i - 2]?.upper !== 'ME'))) continue;
      const callee = byName.get(t[i].text.toLowerCase());
      if (!callee || seen.has(callee)) continue;
      const next = new Set(seen).add(callee);
      for (const { statement, arms } of branchArms(callee, src)) {
        if (arms.some((a) => a.kind !== 'try')) continue;
        judge(statement, event);
        follow(statement, event, next, depth + 1);
      }
    }
  };
  for (const method of model.methods) {
    for (const { statement, arms } of branchArms(method, src)) {
      let at = -1;
      for (let i = arms.length - 1; i >= 0; i--) if (arms[i].kind === 'event') { at = i; break; }
      if (at === -1 || !arms[at].names) continue;
      const event = arms[at].names.find((n) => events.has(n));
      if (!event) continue;
      if (arms.slice(at + 1).some((a) => a.kind !== 'try')) continue;
      judge(statement, event);
      follow(statement, event, new Set([method]), 1);
    }
  }
}

export default defineRule({
  id: 'timer-tick-changes-state',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  optIn: true,
  message: (f) => `${f.member} is set on every ${f.value} tick from a value that differs on every call — the tick always changes the app, so abap2UI5 writes a draft per tick instead of answering with the unchanged one; if the value is only shown, consider an expression binding, or leave it unchanged when the polled data did not change`,
  check,
});
