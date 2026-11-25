import { defineRule } from '../rule.mjs';
import { parenRegion } from '../abap.mjs';
import { dialectOf } from '../builders.mjs';

/* A link or bookmark built from the draft id: `client->get( )-s_draft-id`
 * (or `-id_prev`) flowing into a URL, a follow-up action that opens or
 * copies a link, an `href`/`src` attribute, or a database write.
 *
 * The draft behind that id does not live: abap2UI5 keeps two drafts per
 * chain (04ead8ec, draft_keep_per_chain - every save deletes the one at
 * depth three), and an unchanged timer tick writes none and answers with the
 * id it continued (cdd2fb25). The drafts the framework keeps are the ones it
 * handed out itself - `client->app_state_get_href( )` returns the absolute,
 * FLP-safe link and marks its draft as kept.
 *
 * The data flow followed is deliberately short, within ONE method:
 *
 *   a read      `<x>->get( )-s_draft-id`, `ls_get-s_draft-id` where ls_get
 *               holds `<x>->get( )`, `ls_draft-id` where ls_draft holds
 *               `<x>->get( )-s_draft` - in code or inside a string
 *               template's `{ }`, never in a plain literal
 *   one level   a statement assigning an expression with a read to a
 *               variable (`DATA( v ) =`, `v =`, `v-comp =`) taints v for
 *               the statements after it - not when the read sits inside the
 *               arguments of a method call (`get_app( id )`, `hash( id )`):
 *               what that returns is not the id
 *   a sink      a string template whose text has `#`, `?`, `sap-` or `http`
 *               or that embeds a name with url/href/link in it; a `&&` or
 *               CONCATENATE with such a literal or name; `follow_up_action( )`
 *               with OPEN_NEW_TAB, CLIPBOARD_COPY or URLHELPER; the value of
 *               an `href` or `src` attribute (the builder's attribute verb);
 *               INSERT/MODIFY/UPDATE of a table the class does not declare
 *
 * Not followed: a second assignment, a field written in one statement and
 * the structure stored in another through a third name, a value passed to a
 * method that builds the link. A MESSAGE, a log or trace call and a message
 * toast or box are never sinks, nor is a comparison: those read the id, they
 * do not hand it out. One finding per read, at the read. */
const GET = String.raw`(?:\w+\s*->\s*)+get\s*\(\s*\)`;
const READ_VIA_GET = new RegExp(String.raw`${GET}\s*-\s*s_draft-(id(?:_prev)?)(?![\w-])`, 'gi');
const URLISH = /#|\?|sap-|http/i;
const URL_NAME = /url|href|link/i;
const NOT_A_SINK = /^(?:MESSAGE)$/;
const NOT_A_SINK_CALL = /(?:->|=>)\s*(?:message_toast_display|message_box_display|(?:\w*_)?(?:log|trace)(?:_\w*)?)\s*\(|\b(?:\w*_)?(?:log|logger|trace)(?:_\w*)?\s*(?:->|=>)/i;
const LINK_ACTION = /\b(?:open_new_tab|clipboard_copy|urlhelper)\b/i;
const NOT_A_DB_TARGET = new Set(['TABLE', 'VALUE', 'INITIAL', 'LINES', 'CORRESPONDING', 'INTO']);
const CALL_LIKE = new Set(['VALUE', 'CONV', 'COND', 'SWITCH', 'REDUCE', 'CORRESPONDING', 'EXACT', 'REF', 'NEW', 'CAST']);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/* The embedded `{ }` regions of a string template token, as [start, end)
 * offsets into the token text. */
function embeddedRegions(text) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') { if (depth++ === 0) from = i; } else if (c === '}' && depth > 0 && --depth === 0) out.push([from, i + 1]);
  }
  return out;
}

function check({ model, report }) {
  const { src, code } = model;
  if (!/s_draft/i.test(code) && !/s_draft/i.test(src)) return;
  const tokens = model.tokens;
  const tokenAt = (at) => {
    let lo = 0;
    let hi = tokens.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tokens[mid].end <= at) lo = mid + 1;
      else if (tokens[mid].start > at) hi = mid - 1;
      else return tokens[mid];
    }
    return null;
  };
  /* Where a name read at `at` stands: in code, inside a template's `{ }`, or
   * in a plain literal (prose, never a read). */
  const placeOf = (at) => {
    const t = tokenAt(at);
    if (!t || t.kind !== 'literal') return { live: true, template: null };
    if (!t.text.startsWith('|')) return { live: false };
    const rel = at - t.start;
    const live = embeddedRegions(t.text).some(([a, b]) => rel > a && rel < b);
    return { live, template: live ? t : null };
  };
  const att = dialectOf(src).att;
  const reported = new Set();
  const emit = (origin, field, sink) => {
    if (reported.has(origin)) return;
    reported.add(origin);
    report({ value: `s_draft-${field.toLowerCase()}`, member: sink, offset: origin, dedupe: String(origin) });
  };

  for (const method of model.methods) {
    const statements = method.statements;
    if (!statements.length) continue;
    const body = src.slice(method.bodyStart, method.end);
    if (!/s_draft/i.test(body)) continue;
    /* who holds get( ) or get( )-s_draft */
    const getVars = new Set();
    const draftVars = new Set();
    for (const st of statements) {
      const text = src.slice(st.start, st.end);
      const m = new RegExp(String.raw`^(?:(?:DATA|FINAL)\(\s*(\w+)\s*\)|(\w+))\s*=\s*${GET}\s*(-\s*s_draft\s*)?\.?\s*$`, 'i').exec(text);
      if (!m) continue;
      (m[3] ? draftVars : getVars).add((m[1] ?? m[2]).toLowerCase());
    }
    const holderReads = [];
    for (const v of getVars) holderReads.push(new RegExp(String.raw`(?<![\w>-])${escape(v)}-s_draft-(id(?:_prev)?)(?![\w-])`, 'gi'));
    for (const v of draftVars) holderReads.push(new RegExp(String.raw`(?<![\w>-])${escape(v)}-(id(?:_prev)?)(?![\w-])`, 'gi'));

    /* the tainted names: name (lower case) -> { origin, field, from } */
    const tainted = new Map();
    for (const st of statements) {
      const text = src.slice(st.start, st.end);
      const uses = [];
      for (const re of [READ_VIA_GET, ...holderReads]) {
        re.lastIndex = 0;
        for (const m of text.matchAll(re)) {
          const at = st.start + m.index;
          const place = placeOf(at);
          if (place.live) uses.push({ at, end: at + m[0].length, origin: at, field: m[1], place });
        }
      }
      for (const [name, t] of tainted) {
        if (st.start < t.from) continue;
        const re = new RegExp(String.raw`(?<![\w>-])${escape(name)}(?![\w(]|-\w)`, 'gi');
        for (const m of text.matchAll(re)) {
          const at = st.start + m.index;
          const place = placeOf(at);
          if (place.live) uses.push({ at, end: at + m[0].length, origin: t.origin, field: t.field, place });
        }
      }
      if (!uses.length) continue;
      const target = /^(?:(?:DATA|FINAL)\(\s*(\w+)\s*\)|(?:me->)?(\w+(?:-\w+)*))\s*=(?![=>])/i.exec(text);
      const targetName = target ? (target[1] ?? target[2]).toLowerCase() : null;
      for (const use of uses) {
        const sink = sinkOf(st, text, use, targetName);
        if (sink) { emit(use.origin, use.field, sink); continue; }
        if (!target || use.at < st.start + target[0].length || insideCall(st, use.at)) continue;
        // one level: a name the read is assigned to, not a name assigned from a tainted one
        if (use.origin !== use.at) continue;
        const root = targetName.split('-')[0];
        for (const name of new Set([targetName, root])) {
          if (!tainted.has(name)) tainted.set(name, { origin: use.origin, field: use.field, from: st.end });
        }
      }
    }
  }

  /* Whether offset `at` sits inside the argument list of a method call
   * (a `(` right behind a name that is not a constructor operator's type). */
  function insideCall(st, at) {
    const stack = [];
    for (let k = 0; k < st.tokens.length && st.tokens[k].start < at; k++) {
      const t = st.tokens[k];
      if (t.kind !== 'op') continue;
      if (t.text === '(') {
        const prev = st.tokens[k - 1];
        const before = st.tokens[k - 2];
        const call = prev?.kind === 'word' && prev.end === t.start
          && !CALL_LIKE.has(prev.upper) && !(before?.kind === 'word' && CALL_LIKE.has(before.upper))
          && !(prev.upper === 'DATA' || prev.upper === 'FINAL');
        stack.push(call);
      } else if (t.text === ')') stack.pop();
    }
    return stack.some(Boolean);
  }

  function sinkOf(st, text, use, targetName) {
    if (NOT_A_SINK.test(st.keyword)) return null;
    const stCode = code.slice(st.start, st.end);
    if (NOT_A_SINK_CALL.test(stCode)) return null;
    // a string template that makes a URL
    if (use.place.template) {
      const t = use.place.template;
      const regions = embeddedRegions(t.text);
      let fixed = '';
      let last = 1;
      for (const [a, b] of regions) { fixed += t.text.slice(last, a); last = b; }
      fixed += t.text.slice(last, -1);
      if (URLISH.test(fixed)) return 'link';
      const rel = use.at - t.start;
      for (const [a, b] of regions) {
        if (rel > a && rel < b) continue;
        if (URL_NAME.test(t.text.slice(a, b))) return 'link';
      }
    }
    // a concatenation with a URL part
    if (/&&/.test(stCode) || st.keyword === 'CONCATENATE') {
      for (const t of st.tokens) {
        if (t.start >= use.at && t.start < use.end) continue;
        if (t.kind === 'literal' && t !== use.place.template && URLISH.test(t.text.slice(1, -1))) return 'link';
        if (t.kind === 'word' && t.text.toLowerCase() !== targetName && URL_NAME.test(t.text)) return 'link';
      }
    }
    // a follow-up action that opens or copies a link
    if (/\bfollow_up_action\s*\(/i.test(stCode) && LINK_ACTION.test(text)) return 'action';
    // the value of an href or src attribute
    const attRe = new RegExp(String.raw`(?:->|^|\s)(?:${att})\s*\(\s*n\s*=\s*[\`'](?:href|src)[\`']`, 'gi');
    for (const m of text.matchAll(attRe)) {
      const open = st.start + m.index + m[0].indexOf('(');
      const region = parenRegion(src, open);
      if (use.at > open && use.at < region.end) return 'attribute';
    }
    // a database write: INSERT/MODIFY/UPDATE of a table the class does not declare
    if (st.keyword === 'INSERT' || st.keyword === 'MODIFY' || st.keyword === 'UPDATE') {
      const words = st.tokens.filter((t) => t.kind !== 'pragma');
      let k = 1;
      if (words[k]?.upper === 'INTO') k++;
      const tbl = words[k];
      const upper = words.map((t) => t.upper);
      const itab = upper.some((u, i) => u === 'INTO' && upper[i + 1] === 'TABLE')
        || upper.some((u) => u === 'INDEX' || u === 'TRANSPORTING' || u === 'ASSIGNING' || u === 'REFERENCE');
      if (tbl?.kind === 'word' && !tbl.text.startsWith('<') && !NOT_A_DB_TARGET.has(tbl.upper) && !itab
          && !model.resolve(tbl.text.split('-')[0], st.start)) return 'database';
    }
    return null;
  }
}

export default defineRule({
  id: 'draft-id-as-link',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'class',
  message: (f) => `get( )-${f.value} ${f.member === 'database' ? 'is stored' : f.member === 'action' ? 'is handed to a follow-up action that opens or copies a link' : f.member === 'attribute' ? 'is written into an href or src attribute' : 'is built into a link'} - the draft behind it is pruned after two roundtrips (an unchanged timer tick writes none at all), so the link or bookmark points at nothing; use client->app_state_get_href( ), which keeps the draft behind the link`,
  check,
});
