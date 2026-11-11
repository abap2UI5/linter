/*
 * abap-rules — checks that need the ABAP class, not just the view tree.
 *
 * These are the abap2UI5-specific defects: the ones that stay silent at
 * runtime because nothing throws. A button whose event nobody handles does
 * nothing; a value bound to a local variable is gone after the roundtrip.
 * No UI5 tooling can see them - they only exist in the relationship
 * between the class and the view it builds.
 *
 * `checkAbapRules( )` is the entry point and the order the rules run in. A
 * group that neither reads nor writes anything the rules around it use gets
 * its own name and its own stated inputs; the rest sit in the entry point,
 * where they are a few lines each. In this file:
 *
 *   checkEventArgs       what a backend _event( ) sends in t_arg, and what
 *                        get_event_arg( ) reads back out
 *   checkAbapBooleans    an ABAP flag written into an attribute value
 *   checkAttributeText   a value carrying data written through v instead of t
 *   (non-released-api is lib/rules/non-released-api.mjs, scope 'class')
 *   obsoleteCcHelpers    the frozen builder's helpers for the companion
 *                        controls abap2UI5 marks OBSOLETE (_z2ui5( )->timer( ))
 *   checkEnumRowLiterals a row built at runtime without an enum-fed field
 *
 * and two subjects large enough to be modules of their own:
 *
 *   lib/frontend-wires.mjs    every _event_client / follow_up_action wire: the
 *                             actions, their arguments, the control ids they
 *                             name. ~480 lines, one closed set after another
 *   lib/lifecycle-rules.mjs   what the class does ACROSS a roundtrip: the
 *                             dispatcher, the init flag, the view that is
 *                             never handed over
 *
 * plus lib/abap-source.mjs, the small readers all three share.
 *
 * Every one of them takes `report` rather than returning findings, because the
 * entry point's `report( )` collapses repeats and the FIRST finding of a shape
 * wins - so the order of the calls below is part of the output, not a detail.
 * That is also why the split moved code without moving a single call site.
 */
import { isCall, raisedEventLiterals, codeWithEmbeds, BINDING_VOCAB, DATA_NAME, NON_TEXT_TYPE, VERBATIM_ATTRIBUTE, staticAttributes, insideSegments, literalSegments } from './abap-helpers.mjs';
import { scrub, parenRegion, blankLiterals, namedArgMarks, splitStatements, topSplit, skipWs, clientCalls, literalEnd, statementSpan, topAssigned, topRows } from './abap.mjs';
import { caseMatch } from './suggest.mjs';
import { abapModel } from './abap-model.mjs';
import { runRules, runRule } from './rule.mjs';
import { timed } from './timing.mjs';
import { UNIT_RULES } from './rules/index.mjs';
/* The rules of scope 'app' (lib/rule.mjs) are run at their own place below. */
import bindPathAsValue from './rules/bind-path-as-value.mjs';
import bindPathFlag from './rules/bind-path-flag.mjs';
import unconvertedAbapBoolean from './rules/unconverted-abap-boolean.mjs';
import unescapedTextInAttribute from './rules/unescaped-text-in-attribute.mjs';
import manualInitFlag from './rules/manual-init-flag.mjs';
import lifecycleIsInitial from './rules/lifecycle-is-initial.mjs';
import viewNeverDisplayed from './rules/view-never-displayed.mjs';
import eventArgJsCallback from './rules/event-arg-js-callback.mjs';
import abapDateFormatterMismatch from './rules/abap-date-formatter-mismatch.mjs';
import escapeSequenceInBacktick from './rules/escape-sequence-in-backtick.mjs';
import closeOnlyRoundtrip from './rules/close-only-roundtrip.mjs';
import { checkFrontendWires } from './frontend-wires.mjs';
import { checkLifecycleDispatch } from './lifecycle-rules.mjs';
import { literalElements, methodSpans } from './abap-source.mjs';
/* Re-exported so a consumer that assembles the pipeline itself can reach it:
 * it lives in abap-source.mjs, which no exports-map subpath names, and the
 * entry point that used to be its only route pulls the renderer - and with it
 * http/os/module - into any bundle that imports it. */
export { elementBoundSlots } from './abap-source.mjs';
import { checkIcons } from './icons.mjs';
import { LINE_LIMIT } from './findings.mjs';
import { apiVerdict } from './released-api.mjs';
import { CC_NAMESPACE, OBSOLETE_CC_CONTROLS, OBSOLETE_CC_HELPERS } from './cc-controls.mjs';
import { dialectOf, builderOfVerb } from './builders.mjs';
import { declarationElements, bindingOf } from './reconstruct.mjs';
import { propertyDecl } from './properties.mjs';
import { checkChainLayout, checkChainHouseLayout } from './chain-layout.mjs';
import { isOptInEnabled } from './findings.mjs';
import { checkGuideRules, BOOLEAN_TYPES } from './guide-rules.mjs';
import { MESSAGE_BOX_TYPES, MESSAGE_TYPE_LETTERS } from './frontend-actions.mjs';
/* The class index checkFiles( ) builds, for a caller judging one source at a
 * time (`classIndex`, below). */
export { classIndexOf } from './guide-rules.mjs';


/** Top-level `( … )` elements of a VALUE #( ) region - string-aware, so a
 *  bracket inside a literal never opens an element. */
/** The span of the FIRST `( … )` element of a VALUE body — `open` is the
 *  row's own paren, `end` its closing one, both indices into `body`. Skips
 *  literals exactly as countElements does, so the two agree on what a row is
 *  and a rule can count rows and then address the one it found. */
function firstElement(body) {
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '`' || c === '|' || c === "'") {
      for (i++; i < body.length; i++) {
        if (body[i] === '\\' && c === '|') i++;
        else if (body[i] === c) break;
      }
      continue;
    }
    if (c === '(') return { open: i, end: parenRegion(body, i).end };
  }
  return null;
}

function countElements(body) {
  let count = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '`' || c === '|') {
      for (i++; i < body.length; i++) {
        if (body[i] === '\\' && c === '|') i++;
        else if (body[i] === c) break;
      }
      continue;
    }
    if (c === '(') { count++; i = parenRegion(body, i).end; }
  }
  return count;
}







/* Where a handler for a named event begins: the three literal forms a class
 * dispatches with. A `get_event_arg( )` after one of them is read in that
 * event's handler - the nearest preceding marker wins.
 *
 * ENDMETHOD is a marker too, with no event: dispatch does not survive a
 * method boundary, and without that barrier a `get_event_arg( )` in some
 * later view-building method inherits the last WHEN of the handler method.
 * (Both of those were real false positives on the samples-controls corpus.) */
function eventScopes(src) {
  const scopes = [];
  const add = (re, event = (m) => m[1].toUpperCase()) => {
    for (const m of src.matchAll(re)) scopes.push({ at: m.index, event: event(m) });
  };
  add(/check_on_event\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi);
  add(/get_event\s*\(\s*\)\s*=\s*[`'|]([A-Z0-9_]+)[`'|]/gi);
  /* A WHEN literal names an event only inside a CASE over the EVENT - and
   * only at that CASE's own level. Read from any CASE it made `WHEN \`A\``
   * in a `CASE mv_status` the handler scope of event A, and a
   * get_event_arg( 2 ) three lines later was judged against A's arity - a
   * false error on a status switch inside B's handler; a status switch
   * NESTED in the event CASE is the same switch. The CASE's own ENDCASE
   * closes the scope again. */
  const cases = eventCaseRegions(src);
  for (const m of src.matchAll(/\bWHEN\s+[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (cases.some((c) => c.owns(m.index))) scopes.push({ at: m.index, event: m[1].toUpperCase() });
  }
  for (const c of cases) scopes.push({ at: c.to, event: null });
  add(/\bENDMETHOD\b/gi, () => null);
  return scopes.sort((a, b) => a.at - b.at);
}

/** A CASE whose subject is the event - `CASE client->get_event( ).` or the
 *  struct read `CASE client->get( )-event.` - up to its first ENDCASE. */
/** Every CASE whose subject is the event - `CASE client->get_event( ).` or
 *  the struct read `CASE client->get( )-event.` - as a region from its header
 *  to ITS OWN ENDCASE, nested CASE … ENDCASE blocks counted through. `owns(i)`
 *  says whether offset i is at the event CASE's own level, i.e. not inside a
 *  CASE nested in it (a status switch in one handler is not the dispatcher).
 *  `body` is the text at that level, nested blocks blanked. */
const EVENT_READ = /get_event\s*\(\s*\)|get\s*\(\s*\)-event/i;
function eventCaseRegions(src) {
  return caseRegions(src, (code) => keywordStatements(code, /\bCASE\b/gi), (header) => EVENT_READ.test(header));
}

/** Each `keyword` match with the statement text up to the next period, as a
 *  match-shaped object (`index`, `[0]` keyword to period, `[1]` after the
 *  keyword). Found with indexOf and the period cached across keywords: a
 *  `KEYWORD[^.]*\.` regex rescans the whole rest from every keyword when no
 *  period follows, and a lazy run before a test and a greedy one after it
 *  backtrack polynomially over a long header (CodeQL js/polynomial-redos). */
function* keywordStatements(text, keyword) {
  let dot = -1;
  for (const k of text.matchAll(keyword)) {
    const from = k.index + k[0].length;
    if (dot < from) {
      dot = text.indexOf('.', from);
      if (dot < 0) return;
    }
    yield { index: k.index, 0: text.slice(k.index, dot + 1), 1: text.slice(from, dot) };
  }
}

/** The same regions for every CASE header `head` matches - a global regex,
 *  or a function from the literal-blanked text to match-shaped headers - and
 *  `accept`, when given, keeps.
 *  Headers and CASE/ENDCASE tokens are read with the literals blanked: the
 *  word in a text (`\`… PLEASE REPLACE ACCORDING TO YOUR USE CASE\``) opened
 *  a block no ENDCASE closed, so the event CASE ran on into the next method
 *  and a CASE there was read at its level (samples-controls demo 001). */
function caseRegions(src, head, accept) {
  const regions = [];
  const code = blankLiterals(src);
  for (const h of typeof head === 'function' ? head(code) : code.matchAll(head)) {
    if (accept && !accept(h[0])) continue;
    const bodyAt = h.index + h[0].length;
    const inner = [];
    let depth = 1;
    let open = null;
    let to = src.length;
    for (const t of code.slice(bodyAt).matchAll(/\b(CASE|ENDCASE)\b/gi)) {
      const at = bodyAt + t.index;
      if (t[1].toUpperCase() === 'CASE') {
        depth++;
        if (depth === 2) open = at;
      } else {
        depth--;
        if (depth === 1 && open !== null) { inner.push({ from: open, to: at + t[0].length }); open = null; }
        if (depth === 0) { to = at + t[0].length; break; }
      }
    }
    let body = src.slice(bodyAt, to);
    for (const i of inner) {
      const a = i.from - bodyAt;
      const b = i.to - bodyAt;
      body = body.slice(0, a) + ' '.repeat(b - a) + body.slice(b);
    }
    regions.push({
      from: h.index, to, body,
      owns: (i) => i > h.index && i < to && !inner.some((n) => i >= n.from && i < n.to),
    });
  }
  return regions;
}



/* The CASEs whose WHEN literals are event handlers to handler-without-event:
 * every CASE whose subject IS the event. The read itself (eventCaseRegions),
 * a name the class assigns from the read (`DATA(lv_event) =
 * client->get( )-event.`, the popup classes of abap2UI5), and an IMPORTING
 * parameter of a method the class calls with either (`on_event_box( event )`
 * after `DATA(event) = client->get_event( )`, then `CASE event.` inside it -
 * samples app 502). Any other CASE is a switch over something else - an
 * operator (`CASE to_upper( s-operation ). WHEN \`EQ\`.`, samples-stack app
 * 319) or an escape character (`CASE escaped. WHEN \`n\`.`, app 489) - and
 * reading its WHENs as handlers reported each one as a handler for an event
 * nothing raises. Only the event CASE's own level counts (`owns( )`), as for
 * eventScopes: a status switch nested in a handler is not the dispatcher. */
function eventDispatchRegions(src) {
  const READ = '(?:get_event\\s*\\(\\s*\\)|get\\s*\\(\\s*\\)-event)';
  const names = new Set();
  const assigned = new RegExp(`^[^\\S\\r\\n]*(?:DATA\\(\\s*(\\w+)\\s*\\)|(?:me->)?(\\w+))\\s*=\\s*(?:\\w+->)*${READ}\\s*\\.`, 'gim');
  for (const m of src.matchAll(assigned)) names.add((m[1] ?? m[2]).toLowerCase());
  const carriesEvent = (text) => new RegExp(READ, 'i').test(text)
    || [...names].some((n) => new RegExp(`(?:^|[^\\w>-])${n}(?![\\w-])`, 'i').test(text));
  // the class's own methods with their IMPORTING parameters, chains included
  const importing = new Map();
  for (const st of keywordStatements(src, /\bMETHODS\b:?/gi)) {
    for (const decl of st[1].split(',')) {
      const m = decl.trim().match(/^(\w+)\b([\s\S]*)$/);
      if (!m) continue;
      // `name TYPE …` / `name LIKE …` read token by token - a `(\w+)\s+TYPE`
      // regex rescans every long word from each of its characters
      const words = m[2].split(/\b(?:EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS)\b/i)[0].split(/\s+/);
      const names_ = [];
      for (let i = 0; i + 1 < words.length; i++) {
        const w = words[i].match(/^!?(\w+)$/);
        if (w && /^(?:TYPE|LIKE)$/i.test(words[i + 1])) names_.push(w[1].toLowerCase());
      }
      importing.set(m[1].toLowerCase(), names_);
    }
  }
  // the methods the class hands the event to, each with the parameters it lands in
  const params = new Map();
  // every word once (a word regex never restarts inside the word it matched),
  // then the call shape checked around it: `meth(` or `me->meth(`, not
  // `other->meth(`, `cl=>meth(` or `a-meth(`
  for (const word of src.matchAll(/\w+/g)) {
    const method = word[0].toLowerCase();
    if (!importing.has(method)) continue;
    let paren = word.index + word[0].length;
    while (/\s/.test(src[paren] ?? '')) paren++;
    if (src[paren] !== '(') continue;
    const lead = src.slice(Math.max(0, word.index - 4), word.index).toLowerCase() === 'me->' ? word.index - 4 : word.index;
    if (lead > 0 && /[\w>~-]/.test(src[lead - 1])) continue;
    const { body } = parenRegion(src, paren);
    if (!body || !carriesEvent(body)) continue;
    const marks = namedArgMarks(body);
    const into = marks.length ? marks.filter((a) => carriesEvent(a.value)).map((a) => a.name) : importing.get(method);
    if (!params.has(method)) params.set(method, new Set());
    for (const p of into) params.get(method).add(p);
  }
  const regions = eventCaseRegions(src);
  const spans = methodSpans(src);
  const subject = /\bCASE\s+(?:me->)?(\w+)\s*\./gi;
  for (const r of caseRegions(src, subject)) {
    const name = src.slice(r.from).match(/^CASE\s+(?:me->)?(\w+)/i)[1].toLowerCase();
    const method = spans.find((sp) => r.from >= sp.from && r.from < sp.to)?.name;
    if (names.has(name) || params.get(method)?.has(name)) regions.push(r);
  }
  return regions;
}

/* The span a whole statement occupies when it has its line to itself —
 * leading indentation and the closing newline included, so deleting a no-op
 * call leaves neither a blank line nor stray indentation behind. Anything
 * else on the line (another statement, a trailing comment) and only the
 * statement itself is returned: removing a comment nobody asked about is a
 * guess, and a fix that guesses is worse than a finding that stays.
 * Measured on the ORIGINAL source, where a comment is still visible. */
/* The fix that MOVES a declaration between the sections of the class
 * definition: the single-line `DATA name TYPE ….` is deleted where it stands
 * (the whole line, so nothing blank is left behind) and written again as the
 * last line of the target section, its own text — a trailing comment
 * included, since it belongs to the declaration. Only the single-line,
 * unchained form: an element of a `DATA:` chain cannot be cut out without
 * rewriting the chain, and a declaration whose type spans lines is left to
 * the author. Null where the fix would have to guess. `src` is the scrubbed
 * copy the anchors are found in; `source` is what the moved text is read
 * from. */
function moveDeclarationFix(source, src, name, target) {
  const defEnd = src.search(/\bENDCLASS\b/i);
  if (defEnd === -1) return null;
  const def = src.slice(0, defEnd);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const decl = new RegExp(`^[ \\t]*DATA\\s+${escaped}\\s+(?:TYPE|LIKE)\\b[^\\n]*?\\.[ \\t]*$`, 'im').exec(def);
  if (!decl) return null;
  const sections = [...def.matchAll(/\b(PUBLIC|PROTECTED|PRIVATE)\s+SECTION\s*\./gi)];
  const owner = sections.filter((s) => s.index < decl.index).pop();
  const to = sections.find((s) => s[1].toUpperCase() === target);
  if (!owner || !to || owner[1].toUpperCase() === target) return null;
  const nl = src.indexOf('\n', decl.index + decl[0].length);
  const lineEnd = nl === -1 ? defEnd : nl + 1;
  let line = source.slice(decl.index, lineEnd);
  if (!line.endsWith('\n')) line += '\n';
  // the target section ends where the next section (or ENDCLASS) begins
  const next = sections.find((s) => s.index > to.index);
  let insertAt = source.lastIndexOf('\n', (next ? next.index : defEnd) - 1) + 1;
  /* … and the blank lines closing the section belong to the gap in front of
   * the next header, not to the section: inserted at the header's line, the
   * moved declaration stood alone below that gap, detached from its
   * siblings. Walk back over them, so it is appended directly under the
   * section's last declaration (or its header, when it is empty). */
  for (;;) {
    const prev = source.lastIndexOf('\n', insertAt - 2) + 1;
    if (prev >= insertAt || prev <= to.index || source.slice(prev, insertAt).trim() !== '') break;
    insertAt = prev;
  }
  return [
    { start: decl.index, end: lineEnd, text: '' },
    { start: insertAt, end: insertAt, text: line },
  ];
}

/* A stylesheet's opening tag, attributes and case included (`<style
 * type="text/css">`), and where its closing tag begins from an offset on -
 * the two brace rules bound a sheet with these, as css-classes.mjs does. */
const STYLE_OPEN = /<style\b[^>]*>/gi;
const styleCloseAt = (text, from) => {
  const at = text.slice(from).search(/<\/style>/i);
  return at === -1 ? -1 : from + at;
};

/* The parameters abap2UI5#2748 took off the two message methods - pure UI5
 * options, which travel as the CONTROL_GLOBAL option object now. Lower-case,
 * as namedArgMarks( ) yields them. */
const MESSAGE_BOX_REMOVED = ['textdirection', 'icon', 'closeonnavigation', 'dependenton', 'contentwidth'];
const MESSAGE_TOAST_REMOVED = ['width', 'my', 'at', 'of', 'offset', 'collision', 'autoclose', 'animationtimingfunction', 'animationduration', 'closeonbrowsernavigation', 'class'];


/** Instance data survives the roundtrip; a local does not. */
/* An INLINE structure declares the attribute and its structure in one go:
 * `DATA: BEGIN OF email, text TYPE string, END OF email.` The attribute is
 * `email` — but a comma split sees `BEGIN OF email`, `text TYPE string` and
 * `END OF email`, so the attribute itself was never registered and its
 * FIELDS were registered in its place. binding-to-nonpublic then reported
 * every binding through a public inline structure as non-public (samples 316
 * carried two).
 *
 * Each region collapses to `<name>.` — the declaration it is, written flat.
 * Deleting it outright is what does NOT work: an emptied `DATA:` leaves the
 * block regexes below with a `DATA:` whose `\s+` then swallows the newline
 * into the NEXT declaration, and that one is read as an attribute called
 * `DATA`.
 *
 * The rest of the region is BLANKED, not cut: spaces for its text, its line
 * breaks kept, so the collapsed text is offset-for-offset the input.
 * sectionDataNames measures its positions on this text, and a shortened copy
 * moved every attribute after a `TYPES: BEGIN OF … END OF` block that many
 * characters up - the finding landed in the comment above its declaration,
 * and the `TYPE REF TO` check read the wrong declaration's text, so a
 * reference after the block was reported (abap2UI5 node/srv, rap-ext). */
const collapseInlineStructures = (text) => {
  /* What `/BEGIN OF\s+(\w+)…,[\s\S]*?END OF\s+\1\s*([,.])/gi` matched -
   * each BEGIN OF up to the first END OF of the same name that is followed by
   * a comma or period, left to right, regions never overlapping - found with
   * one pass over the markers instead: the lazy run with a backreference is
   * rescanned from every BEGIN OF that has no matching END OF. */
  // the name read after each marker, not by it: `END OF BEGIN OF x` holds two
  const marks = [];
  for (const k of text.matchAll(/(BEGIN|END) OF\s+/gi)) {
    const w = /\w+/y;
    w.lastIndex = k.index + k[0].length;
    const n = w.exec(text);
    if (n) marks.push({ 0: k[0] + n[0], 1: k[1], 2: n[0], index: k.index });
  }
  // whitespace skipped by hand (skipWs): CodeQL reads a sticky `\s*` as unanchored
  const ends = new Map();
  for (const m of marks) {
    if (m[1].toUpperCase() !== 'END') continue;
    const at = skipWs(text, m.index + m[0].length);
    if (text[at] !== ',' && text[at] !== '.') continue;
    const key = m[2].toLowerCase();
    if (!ends.has(key)) ends.set(key, { list: [], next: 0 });
    ends.get(key).list.push({ at: m.index, to: at + 1, end: text[at] });
  }
  let out = '';
  let done = 0;
  for (const m of marks) {
    if (m[1].toUpperCase() !== 'BEGIN' || m.index < done) continue;
    const nameEnd = m.index + m[0].length;
    let at = skipWs(text, nameEnd);
    if (at > nameEnd && text.slice(at, at + 9).toUpperCase() === 'READ-ONLY') at = skipWs(text, at + 9);
    if (text[at] !== ',') continue;
    const bodyAt = at + 1;
    const e = ends.get(m[2].toLowerCase());
    if (!e) continue;
    while (e.next < e.list.length && e.list[e.next].at < bodyAt) e.next++;
    if (e.next === e.list.length) continue;
    const close = e.list[e.next];
    const region = text.slice(m.index, close.to);
    out += text.slice(done, m.index) + m[2] + region.slice(m[2].length, -1).replace(/[^\n]/g, ' ') + close.end;
    done = close.to;
  }
  return out + text.slice(done);
};

/* The declaration blocks of a class definition: every line that opens with
 * `DATA`, `DATA:` or `CLASS-DATA` (after blanks - blank lines included),
 * with the text after the keyword's blanks up to the next line that opens
 * with DATA, CLASS-DATA or a section keyword. What
 *   /^\s*(?:CLASS-)?DATA:?\s+([\s\S]*?)(?=^\s*(?:CLASS-)?DATA\b|^\s*(?:METHODS|…|ENDCLASS)\b)/gim
 * captured, read line start by line start: that regex walked a run of blank
 * lines again from each of its line starts, and its lazy body retried the
 * lookahead, itself such a walk, at every character. `head` ends on a line
 * of its own reading ENDCLASS, so every block finds its end. */
const OPENS_DATA = /^(?:CLASS-)?DATA:?\s/i;
const ENDS_DATA = /^(?:(?:CLASS-)?DATA|METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|PUBLIC SECTION|PROTECTED SECTION|PRIVATE SECTION|ENDCLASS)\b/i;
function dataBlocks(head) {
  const blocks = [];
  const n = head.length;
  // `^` under the m flag: the start, and after each of the four line terminators
  const eol = (c) => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
  const lineStart = (i) => {
    if (i === 0 || eol(head[i - 1])) return i;
    while (i < n && !eol(head[i])) i++;
    return i + 1;
  };
  // the first non-blank at or after a line start, cached: every line start in
  // a run of blank lines leads to the same one
  let runFrom = -1;
  let runTo = -1;
  const firstNonWs = (i) => {
    if (i < runFrom || i > runTo) { runFrom = i; runTo = skipWs(head, i); }
    return runTo;
  };
  for (let s = 0; s <= n;) {
    const t = firstNonWs(s);
    const open = OPENS_DATA.exec(head.slice(t, t + 12));
    if (!open) { s = lineStart(t + 1); continue; }
    const body = skipWs(head, t + open[0].length - 1);
    let p = lineStart(body);
    while (p <= n && !ENDS_DATA.test(head.slice(firstNonWs(p), firstNonWs(p) + 18))) p = lineStart(firstNonWs(p) + 1);
    if (p > n) break;
    blocks.push(head.slice(body, p));
    s = p;
  }
  return blocks;
}

function instanceAttributes(src) {
  const names = new Set();
  // DATA name TYPE ... / DATA: a TYPE x, b TYPE y - in the class definition.
  // ENDCLASS is re-appended on its own line: the block scan below finds a
  // declaration only up to a TERMINATOR line, and slicing the head right
  // before ENDCLASS used to cut that terminator off — silently dropping the
  // LAST declaration of the definition (latent until binding-to-nonpublic
  // started comparing against this set).
  const defEnd = src.search(/\bENDCLASS\b/i);
  const head = `${defEnd > 0 ? src.slice(0, defEnd) : src}\nENDCLASS`;
  for (const block of dataBlocks(head)) {
    for (const d of collapseInlineStructures(block).split(',')) {
      const n = d.trim().match(/^(\w+)/);
      if (n) names.add(n[1].toUpperCase());
    }
  }
  return names;
}


/* A `WHEN OTHERS.` inside a CASE over the event handles every event there is,
 * including the ones no WHEN names - the dispatcher that ends in
 *
 *     WHEN OTHERS.
 *       client->message_box_display( type = client->get_event( ) ... )
 *
 * handles five message types without naming one of them (abap2UI5/samples app
 * 382). Reading only the WHEN literals reported all five as dead, which is the
 * expensive kind of finding: the reader has to prove the tool wrong.
 *
 * Deliberately conservative in one direction: only a WHEN OTHERS at the event
 * CASE's own level counts - one inside a CASE nested in a handler is that
 * switch's catch-all, not the dispatcher's. Missing a catch-all costs a false
 * hint; inventing one would hide a genuinely dead event, which is worse. */
function hasEventCatchAll(src) {
  return eventCaseRegions(src).some((c) => /\bWHEN\s+OTHERS\b/i.test(c.body));
}

/* The names a section's DATA declarations introduce, with where each one sits.
 *
 * Shared by publicAttributes and privateInstanceAttributes because they got the
 * same thing wrong in the same way. Their block regex ended on
 * `…|^\s*(?:METHODS|…)\b|$)` under /m, and under /m `$` matches at the end of
 * every LINE — so the lazy body could always stop at the first newline, and it
 * did. A CHAIN
 *
 *     DATA: mv_alpha TYPE string,
 *           mv_beta  TYPE abap_bool,
 *           mv_gamma TYPE i.
 *
 * yielded `mv_alpha` and nothing else: `unused-public-attribute` never looked
 * past the first name of a public chain, and `private-app-attribute` — whose
 * whole point is that the missed attribute answers ASSERTION_FAILED with
 * nothing naming it — never looked past the first name of a private one. Both
 * were silent, which is the expensive direction. `instanceAttributes` above
 * has no `$` alternative and was never affected; that asymmetry is what
 * isolated this.
 *
 * `(?![\s\S])` is end of INPUT, which is what the terminator meant. `^` in the
 * other alternatives still needs /m, so the flag stays.
 *
 * The comma split then stops at the fragment carrying the statement's `.`: a
 * chain ends there, and without the stop the last block of a section would
 * swallow whatever follows it (a comment, an EVENTS declaration) and read a
 * name out of it. */
function sectionDataNames(section, chainOnly) {
  const bodyAt = section.index + section[0].length - section[1].length;
  const names = [];
  /* Collapsed on the whole section, not per declaration block: an inline
   * structure spans several lines and a comma split would read its FIELDS as
   * the attributes. */
  const body = collapseInlineStructures(section[1]);
  const head = chainOnly ? 'DATA' : '(?:CLASS-)?DATA';
  // `^[^\S\r\n]*`, not `^\s*`: under /m that scanned every run of blank
  // lines once per line in it, at every position of the lazy body
  const BLOCK = new RegExp(
    `^[^\\S\\r\\n]*${head}:?\\s+([\\s\\S]*?)(?=^[^\\S\\r\\n]*(?:CLASS-)?DATA\\b`
    + '|^[^\\S\\r\\n]*(?:METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|ALIASES)\\b'
    + '|(?![\\s\\S]))',
    'gim',
  );
  for (const m of body.matchAll(BLOCK)) {
    // walked rather than searched for: `indexOf(name, m.index)` finds the first
    // text that LOOKS like the name, so a later `mv_a` resolved to an earlier
    // `mv_alpha` and the finding pointed at the wrong line.
    let at = m.index + m[0].length - m[1].length;
    for (const declaration of m[1].split(',')) {
      const name = declaration.trim().match(/^(\w+)/);
      if (name) names.push({ name: name[1], offset: bodyAt + at + declaration.indexOf(name[1]) });
      at += declaration.length + 1; // + the comma the split consumed
      if (declaration.includes('.')) break; // the statement ended here
    }
  }
  return names;
}

/** The PUBLIC SECTION's own DATA names. Only these are serialized into the
 *  model and shipped to the browser (z2ui5_cl_ui5_srv_model filters on
 *  visibility = public), which is what makes them the transport surface. */
function publicAttributes(src) {
  // `section.index` points at the `PUBLIC SECTION.` keyword and the body is a
  // suffix of the match, so sectionDataNames measures the offset from the body
  // exactly rather than searching for it — without that, every
  // unused-public-attribute finding landed one line early.
  const section = src.match(/\bPUBLIC\s+SECTION\s*\.([\s\S]*?)(?=\b(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS)\b)/i);
  if (!section) return [];
  return sectionDataNames(section, false);
}

/** The names (lower case) the class's binding vocabulary reaches - what
 *  unbound-public-attribute asks of each PUBLIC attribute, read in ONE pass
 *  each instead of three regex scans of the class per attribute (quadratic
 *  in a class with thousands of them):
 *   - a word at the top level of a `_bind*( … )` argument list in `impl`
 *     (a nested call whose own parens nest again ends the read, as
 *     `_bind(?:_\w+)?\s*\(([^()]|\([^()]*\))*\bNAME\b` did),
 *   - the operand of a boolean `b = [me->]name` in `impl`,
 *   - a model path segment `{NAME` / `/NAME` before `}`, `/`, a blank, a
 *     quote, a `|` or the line end, anywhere in `src`. */
function boundVocabulary(src, impl) {
  const names = new Set();
  const words = (text) => { for (const w of text.matchAll(/\w+/g)) names.add(w[0].toLowerCase()); };
  for (const m of impl.matchAll(/_bind(?:_\w+)?\s*\(/gi)) {
    let i = m.index + m[0].length;
    let from = i;
    while (i < impl.length) {
      const c = impl[i];
      if (c === ')') break;
      if (c === '(') {
        words(impl.slice(from, i));
        let j = i + 1;
        while (j < impl.length && impl[j] !== '(' && impl[j] !== ')') j++;
        if (impl[j] !== ')') { from = i; break; }
        i = from = j + 1;
        continue;
      }
      i++;
    }
    words(impl.slice(from, i));
  }
  for (const m of impl.matchAll(/\bb\s*=\s*(?:me->)?(\w+)\b/gi)) names.add(m[1].toLowerCase());
  for (const m of src.matchAll(/[{/](\w+)(?=[}/\s'`|]|$)/gm)) names.add(m[1].toLowerCase());
  return names;
}

/** What the other classes of the run read of this class as `->name`
 *  (`outsideReads` in the class index, lower case), or null without one. */
function outsideReadsOf(src, classIndex) {
  const own = src.match(/\bCLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD)\b)/i)?.[1].toLowerCase();
  return classIndex?.get(own)?.outsideReads ?? null;
}

/** Whether another class of the run reads one of this class's PUBLIC
 *  attributes - the reads that stand `unused-public-attribute` and
 *  `unbound-public-attribute` down. Such a stand-down depends on what the RUN
 *  holds, not on the source: the same class named alone (an editor, a
 *  pre-commit hook) is judged and reported. So a waiver of either rule in such
 *  a class is unjudged rather than `unused-directive`, whose deleting fix
 *  would otherwise take out the waiver the single-file run still needs. */
export function publicReadFromOutside(source, classIndex) {
  const src = scrub(source);
  const reads = outsideReadsOf(src, classIndex);
  return Boolean(reads?.size) && publicAttributes(src).some((a) => reads.has(a.name.toLowerCase()));
}

/** The PUBLIC SECTION's INSTANCE data — `DATA` only, `CLASS-DATA` is not
 *  serialized with the object — each with whether it is a `TYPE REF TO`.
 *  Read off the same block walk as publicAttributes( ); the reference flag
 *  comes from the declaration's own text. */
function publicInstanceAttributes(src) {
  const section = src.match(/\bPUBLIC\s+SECTION\s*\.([\s\S]*?)(?=\b(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS)\b)/i);
  if (!section) return [];
  /* `BEGIN`/`END` are what the reader yields for an inline structure it could
   * not collapse (the same name nested at two levels - structshapes fixture);
   * neither is ever an attribute, so both are dropped here rather than judged. */
  /* A declaration ends at its `,` or `.` - and at the latest where the next
   * name starts, which bounds the read: searched to the next `.` of the
   * file, a section of declarations with none behind them was read once per
   * declaration, to the end. */
  const end = section.index + section[0].length;
  const names = sectionDataNames(section, true);
  return names.map((a, i) => ({ a, to: names[i + 1]?.offset ?? end }))
    .filter(({ a }) => !/^(?:BEGIN|END)$/i.test(a.name)).map(({ a, to }) => {
      const decl = src.slice(a.offset, Math.max(a.offset, to));
      return { ...a, reference: /\bTYPE\s+REF\s+TO\b/i.test(decl.split(/[.,]/)[0]) };
    });
}

/** The PRIVATE SECTION's own INSTANCE data names — the attributes that are
 *  part of the app's persisted state and cannot be reached to persist it.
 *
 *  `CLASS-DATA` is deliberately not collected: a static attribute is not
 *  instance state, is not serialized with the app, and is not what breaks. */
function privateInstanceAttributes(src) {
  const section = src.match(/\bPRIVATE\s+SECTION\s*\.([\s\S]*?)(?=\bENDCLASS\b)/i);
  if (!section) return [];
  // chainOnly: CLASS-DATA is excluded here (see the doc block above), so the
  // block head is the bare DATA rather than the optional-CLASS- one
  return sectionDataNames(section, true);
}

/** Variables declared inline or with DATA inside a method body. */
function localVariables(src) {
  const names = new Set();
  for (const m of src.matchAll(/\bDATA\(\s*(\w+)\s*\)/gi)) names.add(m[1].toUpperCase());
  for (const m of src.matchAll(/\bFIELD-SYMBOLS?\s*<\s*(\w+)\s*>/gi)) names.add(m[1].toUpperCase());
  // DATA lv_x TYPE ... written inside a METHOD ... ENDMETHOD block, in the
  // single form and in the chained `DATA: lv_a TYPE i, lv_b TYPE string.`
  // form - the usual way to declare more than one local, and the one that
  // used to slip past this reader entirely
  for (const body of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    for (const el of declarationElements(body[0], /^DATA$/i)) {
      const m = el.match(/^(\w+)\s+(?:TYPE|LIKE)\b/i);
      if (m) names.add(m[1].toUpperCase());
    }
  }
  return names;
}

/** Literal event names in client->_event( `X` ) / ( 'X' ) / ( |X| ),
 *  mapped to where they are raised. */
function eventNames(src) {
  const names = new Map();
  for (const { name, offset } of raisedEventLiterals(src)) {
    const key = name.toUpperCase();
    if (!names.has(key)) names.set(key, offset);
  }
  return names;
}

/** Is the match at `index` CODE, or text inside a string literal? Both of the
 *  event scans below read a literal (the event name) and so have to run over
 *  the source with its literals intact — which also finds the calls a class
 *  QUOTES: a MessageStrip explaining that "a press is wired with
 *  client->_event( 'GHOST' )" raised no event and handled none. The blanked
 *  copy is offset-for-offset, so the head of a real call is still there and
 *  the head of a quoted one is blanks. */
// case-free like the language: `CLIENT->_EVENT( )` is the same call


/** Event names the class reacts to: check_on_event( `X` ), and constants
 *  compared against get_event( ). A constant reference on either side means
 *  we cannot resolve the name statically - handled by the caller. */
function handledEvents(src) {
  return new Set(handledEventLiterals(src).map((n) => n.toUpperCase()));
}

/** Every handler site, AS WRITTEN and with where it stands: the spellings a
 *  raised literal is held against, letter for letter, because the runtime
 *  compares them so — and the offsets the inverse rule reports at. */
function handledEventSites(src) {
  const sites = [];
  const code = blankLiterals(src);
  const LIT = '[`\'|]([A-Z0-9_]+)[`\'|]';
  for (const m of src.matchAll(/check_on_event\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (!isCall(code, m.index, 'check_on_event')) continue;
    sites.push({ name: m[1], offset: m.index });
  }
  /* The two spellings of the same read: `get_event( )` and the struct field
   * `get( )-event` it is a shorthand for. Both appear across the corpora -
   * and an IF on the second one used to count as no handler at all, so a
   * handled event was reported as dead (samples-stack app 487).
   *
   * This is also where the IF-shaped dispatcher is read. abaplint's
   * `short_case` refuses a one-branch CASE, so a class with one event writes
   * `IF client->get_event( ) = \`X\`.`, grows it with `ELSEIF … = \`Y\`.` and
   * folds alternatives with `OR client->get_event( ) = \`Z\``; every one of
   * those is a comparison of the read against a literal, which is what this
   * scan finds wherever it stands. Two spellings of the SAME comparison were
   * missing: the operator written `EQ`, and the literal on the LEFT
   * (`IF \`X\` = client->get_event( ).`) - both legal, both a handler. */
  const EVENT_READ = '(?:get_event\\s*\\(\\s*\\)|get\\s*\\(\\s*\\)-event)';
  const CMP = '(?:=|\\bEQ\\b)';
  for (const m of src.matchAll(new RegExp(`${EVENT_READ}\\s*${CMP}\\s*${LIT}`, 'gi'))) {
    sites.push({ name: m[1], offset: m.index });
  }
  for (const m of src.matchAll(new RegExp(`${LIT}\\s*${CMP}\\s*(?:\\w+->)?${EVENT_READ}`, 'gi'))) {
    sites.push({ name: m[1], offset: m.index });
  }
  /* WHEN `X`. inside a CASE over the event - including a WHEN that lists
   * ALTERNATIVES. `WHEN `A` OR `B`.` handles both, and reading only the
   * first literal reported the second as unhandled (samples-stack app 319). */
  for (const m of src.matchAll(new RegExp(`\\bWHEN\\s+${LIT}((?:\\s+OR\\s+${LIT})*)`, 'gi'))) {
    // a `WHEN` inside a literal is a sentence about a CASE, not one
    if (!isCall(code, m.index, src.slice(m.index, m.index + 4))) continue;
    // `WHEN x THEN` is a SWITCH/COND arm, not a CASE branch
    const then = /^\s*THEN\b/i.test(src.slice(m.index + m[0].length));
    sites.push({ name: m[1], offset: m.index, when: true, then });
    for (const alt of m[2].matchAll(new RegExp(LIT, 'gi'))) sites.push({ name: alt[1], offset: m.index + m[0].indexOf(m[2]) + alt.index, when: true, then });
  }
  return sites;
}

/** The handled names as written, de-duplicated — what the spelling rule
 *  compares against; `handledEventSites( )` is the same read with offsets. */
function handledEventLiterals(src) {
  return [...new Set(handledEventSites(src).map((s) => s.name))];
}




/** The inside of every `omit_initial_paths = VALUE #( … ) )`: from the
 *  paren after VALUE up to the first `)` that another `)` follows, blanks
 *  between them allowed - what
 *  `/omit_initial_paths\s*=\s*VALUE\s+#?\s*\(([^)]*(?:\)[^)]*)*?)\)\s*\)/gi`
 *  captured. Each search starts where the last match ended, and a call with
 *  no closing pair after it ends the scan - no later call has one either;
 *  the regex searched the whole rest of the source again from every such
 *  call. */
function omitInitialPathLists(src) {
  const lists = [];
  let done = 0;
  for (const m of src.matchAll(/omit_initial_paths\s*=\s*VALUE\s+(?:#\s*)?\(/gi)) {
    if (m.index < done) continue;
    const from = m.index + m[0].length;
    let close = src.indexOf(')', from);
    let next = -1;
    while (close >= 0) {
      next = skipWs(src, close + 1);
      if (src[next] === ')') break;
      close = src.indexOf(')', next);
    }
    if (close < 0) break;
    lists.push(src.slice(from, close));
    done = next + 1;
  }
  return lists;
}

function checkEnumRowLiterals({ src, enumFields, boolFields, report }) {
  if (!enumFields?.size && !boolFields?.size) return;
  const omitted = new Set();
  for (const list of omitInitialPathLists(src)) {
    for (const f of list.matchAll(/[`'|]\s*([A-Za-z_][\w/]*)\s*[`'|]/g)) {
      omitted.add(f[1].split('/').pop().toUpperCase());
    }
  }
  if (/omit_initial\s*=\s*abap_true/i.test(src)) return;

  /* Structure over text: a `=` or a `(` inside a message string is not
   * syntax. Offsets are preserved, so a match here is a position in the file. */
  const s = blankLiterals(src);

  /* Fields the class fills AFTER the constructor, per table.
   *
   * A seed completed by a LOOP is not a row built without the field: half this
   * corpus computes an ObjectNumber `state` in the backend, because the
   * original computes it in a frontend Formatter the port has to move
   * server-side, and the seed deliberately carries no such column. Read
   * through the cursor the write goes through - a field filled on some other
   * table says nothing about this one. */
  const cursorTable = new Map();
  for (const m of s.matchAll(/\b(?:LOOP\s+AT|READ\s+TABLE)\s+(?:<\w+>-|\w+-)*(\w+)([^.]*)/gi)) {
    const table = m[1].toUpperCase();
    for (const c of m[2].matchAll(/(?:REFERENCE\s+INTO|ASSIGNING|INTO)\s+(?:DATA\(\s*(\w+)\s*\)|FIELD-SYMBOL\(\s*<(\w+)>\s*\)|<(\w+)>|(\w+))/gi)) {
      const name = c[1] || c[2] || c[3] || c[4];
      if (name) cursorTable.set(name.toUpperCase(), table);
    }
  }
  const filledAfter = new Map();
  const fill = (table, field) => {
    if (!table) return;
    const prev = filledAfter.get(table) ?? new Set();
    prev.add(field);
    filledAfter.set(table, prev);
  };
  // `t_appointments[ i ]-type = …` — the table names itself
  for (const m of s.matchAll(/\b(\w+)\s*\[[^\]]*\]\s*-(\w+)\s*=(?!=)/g)) {
    fill(m[1].toUpperCase(), m[2].toUpperCase());
  }
  // `lr_row->weight_state = …` / `<row>-weight_state = …` — through a cursor
  for (const m of s.matchAll(/(?:^|[^\w>])<?(\w+)>?\s*(?:->|-)(\w+)\s*=(?!=)/gm)) {
    fill(cursorTable.get(m[1].toUpperCase()), m[2].toUpperCase());
  }

  const judge = (table, body, offset, carried = null) => {
    const key = String(table).toUpperCase();
    const fields = enumFields.get(key);
    if (!fields) return;
    const set = topAssigned(body);
    const later = filledAfter.get(key);
    for (const field of fields) {
      if (set.has(field) || omitted.has(field)) continue;
      if (carried?.has(field) || later?.has(field)) continue;
      report({ type: 'enum-field-unset-on-insert', member: field, offset });
    }
  };

  /* Every `… = VALUE …( … )` in the class, read as what its left-hand side
   * names. A TABLE constructor (its body opens with row parens) is judged row
   * by row against that name; a STRUCTURE constructor is a work area, kept
   * until an INSERT names the table it goes into. */
  const workAreas = new Map();
  for (const m of s.matchAll(/\bVALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/gi)) {
    const open = s.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(s, open);
    if (body === undefined) continue;
    const before = s.slice(Math.max(0, m.index - 200), m.index);
    const lhs = before.match(/DATA\(\s*(\w+)\s*\)\s*=\s*$/i)
      || before.match(/([A-Za-z_<][\w<>-]*)\s*=\s*$/);
    const rows = topRows(body);
    if (rows.length) {
      /* A table constructor. Its name is the field it is assigned to - which
       * is exactly the path a nested aggregation binds (`elements`, `groups`,
       * `t_appointments`), so the nested seeds inside a model_init literal
       * come out of this same pass. */
      if (!lhs) continue;
      const key = (lhs[1].match(/(\w+)$/) || [])[1];
      if (!key) continue;
      /* ABAP lets a table constructor set a component ONCE, before the rows,
       * and every row after it inherits the value:
       *   VALUE #( design = `Default` ( title = … ) ( title = … ) )
       * App 407 seeds seven such defaults that way on purpose. A row is
       * judged against its own fields PLUS those. */
      const carried = topAssigned(body);
      /* A row that assigns no component is not a row literal: it is a whole
       * structure handed over as one expression, which is what a table
       * comprehension writes (`VALUE #( FOR row IN t_all WHERE ( … ) ( row ) )`,
       * app 505) and what a scalar table row looks like. A row copied from
       * somewhere else has no single place to read, and never had. */
      const usable = rows.filter((r) => topAssigned(r.body).size);

      /* The BOOLEAN counterpart of the enum rule, and it needs a second signal
       * the enum one does not.
       *
       * `abap_bool` has no absent state, so a field a row leaves out still
       * ships as a real JSON `false` — which is correct almost everywhere, and
       * wrong exactly where the UI5 property's own default is `true`: the row
       * then renders the OPPOSITE of what it meant, with nothing failing. On
       * its own that would report every boolean seed there is, so the rule asks
       * for both signals the probe measured: the property defaults to true AND
       * the seed is INCONSISTENT — some rows of this very table set the field
       * and others do not. A table that never sets it is ordinary data (`unread`,
       * `active` are false for every row on purpose); a table that always sets
       * it has nothing missing. The gap between two rows of one literal is what
       * is almost never deliberate — app 291's notification items lost both
       * close buttons that way, and with them the port's only backend wire. */
      const boolNames = boolFields?.get(key.toUpperCase());
      if (boolNames?.size && usable.length > 1) {
        const later = filledAfter.get(key.toUpperCase());
        for (const field of boolNames) {
          if (carried.has(field) || omitted.has(field) || later?.has(field)) continue;
          const sets = usable.filter((r) => topAssigned(r.body).has(field));
          if (!sets.length || sets.length === usable.length) continue;
          for (const r of usable) {
            if (topAssigned(r.body).has(field)) continue;
            report({
              type: 'absent-boolean-overrides-default',
              member: field, offset: open + 1 + r.offset,
            });
          }
        }
      }

      for (const r of usable) judge(key, r.body, open + 1 + r.offset, carried);
      continue;
    }
    if (!lhs || !lhs[1]) continue;
    const name = (lhs[1].match(/^(\w+)$/) || [])[1];
    if (!name) continue; // <fs>-comp or deep component: not a plain work area
    const key = name.toUpperCase();
    /* Two constructors for one name, or a wholesale copy into it, and there is
     * no single row to read any more. */
    if (workAreas.has(key)) { workAreas.set(key, null); continue; }
    workAreas.set(key, { body, offset: m.index });
  }
  for (const m of s.matchAll(/\b(?:MOVE-CORRESPONDING\s+\S+\s+TO|CLEAR)\s+(\w+)\b/gi)) {
    if (workAreas.has(m[1].toUpperCase())) workAreas.set(m[1].toUpperCase(), null);
  }

  /* INSERT/APPEND of an INLINE row literal - the construction site the port
   * writes at the event, and the one that omits a key. */
  for (const m of s.matchAll(/\b(?:INSERT|APPEND)\s+VALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/gi)) {
    const open = s.indexOf('(', m.index + m[0].length - 1);
    const { body, end } = parenRegion(s, open);
    if (body === undefined) continue;
    /* Which table this row is built for. Without it the rule judges an INSERT
     * against the fields of a template it has nothing to do with - app 547
     * builds an interval header and an appointment two lines apart, and only
     * the second one binds the enum. */
    const tail = s.slice(end ?? open, (end ?? open) + 160);
    const target = tail.match(/\b(?:INTO\s+TABLE|TO)\s+(?:<\w+>-|\w+-)*(\w+)/i);
    if (!target) continue;
    judge(target[1], body, m.index);
  }

  /* INSERT/APPEND of a WORK AREA built by a VALUE constructor above it. The
   * row is the same row; only the statement it is written in differs. A field
   * filled afterwards (`appointment-aria = …`) counts as set. */
  for (const m of s.matchAll(/\b(?:INSERT|APPEND)\s+(\w+)\s+(?:INTO\s+TABLE|TO)\s+(?:<\w+>-|\w+-)*(\w+)/gi)) {
    const wa = workAreas.get(m[1].toUpperCase());
    if (!wa) continue;
    const filled = [...s.matchAll(new RegExp(`\\b${m[1]}-(\\w+)\\s*=(?!=)`, 'gi'))]
      .map((f) => f[1].toUpperCase());
    judge(m[2], `${wa.body} ${filled.map((f) => `${f} =`).join(' ')}`, wa.offset);
  }
}


function checkEventArgs({ src, source, report }) {
  /* A t_arg value the app expects the CLIENT to resolve must be $-prefixed:
   * the runtime (z2ui5_cl_ui5_srv_event=>get_t_arg) sends `$...` and `{...}`
   * entries to the frontend verbatim, but only a $-prefixed expression is
   * resolved by UI5 before the roundtrip - a bare-brace `{COL}` is neither
   * resolved nor quoted, so get_event_arg( ) receives an EMPTY value with no
   * error anywhere. The one legitimate bare-brace form is a client-composed
   * template that STARTS with a {N} placeholder ({0}, {1?...}), which the
   * runtime quotes as a plain string. */
  // ONLY client->_event( ) - a BACKEND event, whose t_arg values travel back
  // and are read with get_event_arg( ). client->_event_client( ) and
  // follow_up_action( ) are FRONTEND actions: their t_arg is the argument list
  // of the action itself, and a brace object there is the documented way to
  // hand a parameter set to the frontend (cs_event-urlhelper takes
  // |\{ URL: '…', NEW_WINDOW: true \}|). Flagging those would be wrong.
  /* How many t_arg values each event actually sends, by name - the arity
   * get_event_arg( ) is read against below. The maximum wins when one name is
   * raised from several places: the reader is right as long as ANY raise site
   * sends that many. */
  const arity = new Map();
  const code = blankLiterals(src);
  for (const ev of src.matchAll(/client->_event\s*\(/gi)) {
    if (!isCall(code, ev.index, 'client->')) continue;
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    const nameMatch = evBody.match(/^\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/i);
    const tm = evBody.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
    /* `arg` is the ONE-VALUE spelling of t_arg: the client folds `arg = x`
     * into the same string_table as `t_arg = VALUE #( ( x ) )` - appending it
     * BEHIND any t_arg rows when both are given - so it counts as exactly one
     * more argument, and get_event_arg( ) reads it like any other.
     * `\barg` cannot hit the `arg` inside `t_arg`: `_` and `a` are both word
     * characters, so there is no boundary between them.
     * Presence and literal are matched separately on purpose - `arg = lv_key`
     * is still one argument, of a value this pass cannot know, and counting
     * only the literal form would under-count the arity and resurrect exactly
     * the false positive this handles. */
    const argSupplied = /\barg\s*=/i.test(evBody);
    const argLit = evBody.match(/\barg\s*=\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)/i);
    if (nameMatch) {
      let count = 0;
      if (tm) {
        const argOpen = evBody.indexOf('(', tm.index + tm[0].length - 1);
        count = countElements(parenRegion(evBody, argOpen).body);
      }
      if (argSupplied) count += 1;
      const name = nameMatch[1].toUpperCase();
      arity.set(name, Math.max(arity.get(name) ?? 0, count));
    }

    /* The unresolved-brace check owes the shorthand the same coverage: a bare
     * `{COL}` reaches the frontend unresolved and unquoted whichever spelling
     * carried it, and reading it back gives an empty value with no error. Run
     * before the t_arg branch below, which a call spelling its one argument
     * as `arg` never enters. */
    if (argLit) {
      const isTemplate = argLit[3] !== undefined;
      const raw = isTemplate ? argLit[3] : argLit[2];
      const lit = String(raw).trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      const shown = lit.replace(/\\/g, '');
      if (bad && !/^\{\d+[?}]/.test(shown)) {
        let fixes;
        if (!isTemplate) {
          const brace = evOpen + 1 + argLit.index + argLit[0].indexOf(argLit[1]) + 1 + raw.indexOf('{');
          fixes = [{ start: brace, end: brace, text: '$' }];
        }
        report({
          type: 'event-arg-unresolved', value: shown.slice(0, 40),
          offset: evOpen + 1 + argLit.index, ...(fixes ? { fixes } : {}),
        });
      }
    }

    if (!tm) continue;
    const open = evBody.indexOf('(', tm.index + tm[0].length - 1);
    const { body } = parenRegion(evBody, open);

    /* ONE row written as a table. `arg` is the one-value spelling of `t_arg`:
     * the client folds `arg = x` into the same string_table as
     * `t_arg = VALUE #( ( x ) )` - literally the same wire, read back with
     * the same `get_event_arg( )` - and the single argument is what most
     * wires carry (a row key, a `${$source>/...}`, one event parameter),
     * where the table constructor is longer than the value inside it. From
     * two values on `t_arg` is the right parameter and this stays silent.
     *
     * Only `client->_event( )`: `_event_client( )` and `follow_up_action( )`
     * have no `arg` parameter, and the surrounding loop already excludes
     * them.
     *
     * Silent, not merely unfixable, when both spellings are present (the
     * documented composition appends `arg` BEHIND the rows, so the call
     * sends two arguments and neither collapses) and when the row contains a
     * `#`: `arg` is generic (`TYPE clike`), so a `CONV #( )` / `VALUE #( )`
     * inside it has no type to derive `#` from and the remedy would not
     * compile. A finding whose remedy does not compile is worse than none. */
    const region = parenRegion(evBody, open);
    /* An UNCLOSED VALUE - a truncated source, a class the fuzzer cut mid-call
     * - gets end === evBody.length back, which is one past the last character
     * rather than a closing paren. Rewriting that span addresses text this
     * source does not have, and the fixer throws on it under strict fixes. */
    const closed = region.end < evBody.length;
    const row = closed && countElements(body) === 1 ? firstElement(body) : null;
    const rowText = row ? body.slice(row.open + 1, row.end).trim() : '';
    if (row && rowText && !argSupplied && !rowText.includes('#')) {
      report({
        type: 'event-arg-single-row-table',
        // shown whole up to ~40 characters, then cut between tokens (a backtick literal is one token) with an ellipsis, never mid-literal
        value: (rowText.match(/`[^`]*`?|[^\s`]+/g) ?? [rowText]).reduce((s, t) => (!s ? t : s.endsWith('…') ? s : `${s} ${t}`.length <= 40 ? `${s} ${t}` : `${s}…`), ''),
        offset: evOpen + 1 + tm.index,
        fixes: [{
          start: evOpen + 1 + tm.index,
          end: evOpen + 1 + region.end + 1,
          text: `arg = ${rowText}`,
        }],
      });
    }
    // body[i] is src[argBase + i]: the one base every offset and fix below
    // is computed from. A finding used to take the t_arg TOKEN's position
    // plus an index into the VALUE body - two coordinate systems, ~16
    // columns apart, which put the finding on the previous line and out of
    // reach of a disable-next-line directive.
    const argBase = evOpen + open + 2;
    // Only a `backtick` / 'quoted' literal hands its braces to the frontend
    // verbatim. A |…| STRING TEMPLATE is ABAP: |{ badgemin }| interpolates the
    // variable server-side and sends its value - perfectly correct, and not
    // this rule's business. A template only reaches the frontend with braces
    // when they are escaped (|\{COL\}|), which is the bad form again.
    for (const el of body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)) {
      const isTemplate = el[3] !== undefined;
      const raw = isTemplate ? el[3] : el[2];
      const lit = raw.trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      if (!bad) continue;
      const shown = lit.replace(/\\/g, '');
      if (/^\{\d+[?}]/.test(shown)) continue; // {N} template placeholder - quoted, fine
      /* Autofixable in the literal form: the missing `$` is a pure insertion
       * in front of the brace. body[i] is src[evOpen + open + 2 + i], and the
       * literal starts one character past its own quote. A |…| template is
       * left alone - there the braces are escaped ABAP, not a UI5 expression. */
      let fixes;
      if (!isTemplate) {
        const brace = evOpen + open + 2 + el.index + el[0].indexOf(el[1]) + 1 + raw.indexOf('{');
        fixes = [{ start: brace, end: brace, text: '$' }];
      }
      report({ type: 'event-arg-unresolved', value: shown.slice(0, 40), offset: argBase + el.index, ...(fixes ? { fixes } : {}) });
    }

    /* A TRAILING empty argument never arrives. get_t_arg buffers an empty
     * entry and only flushes it when a later non-empty one follows - the
     * comment in z2ui5_cl_ui5_srv_event says so - so an empty entry between
     * filled ones keeps its slot and a trailing one simply disappears. The
     * handler's `get_event_arg( <n> )` for that position then reads initial
     * and the author never learns why.
     *
     * The framework pads a missing trailing argument only for a NULLABLE
     * declared kind on a control method (control-method-null-arg), which is a
     * CONTROL_BY_ID concern - a backend `_event` has no declared kinds, so
     * nothing pads it here. Only the LAST entry is judged; an empty one in
     * the middle is correct and deliberate. */
    const argEls = [...body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)];
    const last = argEls[argEls.length - 1];
    if (argEls.length > 1 && last) {
      const raw = last[3] !== undefined ? last[3] : last[2];
      if (String(raw).trim() === '') {
        /* Mechanically fixable: the row never arrives, so deleting it changes
         * nothing the handler can observe. The span is measured on the
         * ORIGINAL source (the same statementSpan doctrine): a row with its
         * line to itself takes the whole line, an inline row also eats the
         * spaces in front of it, and the walk back stops at anything that is
         * not plain whitespace THERE - so a comment scrub( ) blanked to
         * spaces is never deleted along with the row. */
        const rowStart = argBase + last.index;
        const rowEnd = rowStart + last[0].length;
        let span;
        if (source) {
          const lineStart = source.lastIndexOf('\n', rowStart - 1) + 1;
          const nl = source.indexOf('\n', rowEnd);
          const lineEnd = nl === -1 ? source.length : nl + 1;
          if (!source.slice(lineStart, rowStart).trim() && !source.slice(rowEnd, nl === -1 ? source.length : nl).trim()) {
            span = { start: lineStart, end: lineEnd };
          } else {
            /* An inline row eats the spaces in front of it - unless those
             * spaces are the line's indentation (the row opens the line and
             * something follows it): eating them would pull `) )` to column
             * one. */
            let s = rowStart;
            while (s > lineStart && (source[s - 1] === ' ' || source[s - 1] === '\t')) s--;
            if (s === lineStart) s = rowStart;
            span = { start: s, end: rowEnd };
          }
        }
        report({
          type: 'trailing-empty-event-arg',
          value: String(argEls.length),
          offset: argBase + last.index,
          ...(span ? { fixes: [{ ...span, text: '' }] } : {}),
        });
      }
    }
  }

  /* Reading past the t_arg the event declares. The args are static - they are
   * written at the raise site - so `get_event_arg( 3 )` in the handler of an
   * event that sends two is never anything but a mistake: it returns initial
   * in ABAP and 500s in the transpiled runtime, and either way the value the
   * handler works with is not the one the author meant. Only a literal index
   * is judged (a variable one is not statically knowable), and only inside
   * the handler of an event this class raises itself. */
  if (arity.size) {
    const scopes = eventScopes(src);
    for (const m of src.matchAll(/get_event_arg\s*\(\s*(?:v\s*=\s*)?(?:(\d+)\s*)?\)/gi)) {
      const read = m[1] ? Number(m[1]) : 1; // the interface default is 1
      let scope = null;
      for (const s of scopes) {
        if (s.at < m.index) scope = s; else break;
      }
      /* The NEAREST preceding marker decides, whatever event it names - and
       * if that is a method boundary, or an event this class does not raise
       * with client->_event( ), the call is not judged at all. An event can
       * also arrive from a message_box_display( onclose = ) callback or a
       * frontend action, and those carry args from a source this pass cannot
       * see; skipping there is the difference between a rule and a guess. */
      if (!scope?.event || !arity.has(scope.event)) continue;
      const sent = arity.get(scope.event);
      if (read > sent) {
        report({ type: 'event-arg-out-of-range', value: scope.event, member: String(read), count: sent, offset: m.index });
      }
    }
  }
}






/* ABAP the SYSTEM refuses, and one thing SLIN reports.
 *
 * The precedent for these living here is `source-line-too-long`, which made
 * exactly this trip: for a consumer whose only gate is `npx abap2ui5lint`, a
 * class that does not activate is the most severe thing this tool can find,
 * and none of them is a view rule. Each one below reached a user through a
 * green CI — abaplint models none of them (measured on 2.120.24 with a control
 * probe in every case), and a systemless pipeline sees an activation error
 * only when somebody imports the transport. */
function checkAbapHygiene({ src, source, report, timings = null, ownObjects = null }) {
  /* The rules of this family that are written as one unit each (lib/rule.mjs,
   * lib/rules/) - they read the shared model of the class, not `src`. */
  /* The model is read lazily, so the first rule to touch it would pay for
   * reading it; under --timing that cost gets its own entry instead. */
  const model = timed(timings, 'abap-model', () => {
    const m = abapModel(source ?? src);
    if (timings) { m.statements; m.methods; } // eslint-disable-line no-unused-expressions
    return m;
  });
  runRules(UNIT_RULES, 'class', { model, src, source: source ?? src, report, ownObjects }, { timings });
}

/* A bare model PATH written as an attribute's value. `_bind_path( x )` and
 * `_bind( val = x path = abap_true )` return `/X` - the path without its
 * braces, for a binding the app assembles itself (a complex binding info, an
 * expression binding, a sorter). Handed to `v =` as the whole value it is no
 * binding at all: UI5 reads the attribute as the TEXT "/X", so a Text shows
 * the path, an Input starts with it, and a typed property (a boolean, an
 * enum, a number) refuses it and takes the view down. The reconstructor
 * rebuilds exactly that text, which no view-side rule can tell from a
 * literal - so this is read off the call. `t =` (text, escaped) is the way to
 * SHOW a path and is never judged, and neither is the one attribute that
 * takes a bare path, XML templating's `template:with path="…"`. The fix
 * makes it the binding it was meant to be: `_bind_path` becomes `_bind`, a
 * `path = abap_true` argument is deleted. */
/* The private FIELDS of a UI5 object read in a client expression - the
 * second half of ui5-internal-access, beside the member tables below. An
 * event argument, a frontend-action argument or an expression binding that
 * walks `$event.oSource.sId`, `$event.mParameters` or `….oParent` reads
 * state UI5 keeps in fields named the Hungarian way - a lower-case type
 * letter, then the name - and none of them is API: the expression works
 * because the field happens to be there in this release, and a release that
 * renames or drops it breaks the wire with nothing raised (the argument
 * arrives as `undefined`, or the whole event is lost when the read throws).
 * Every one the corpora read has a public getter, which is what the fix
 * writes: `$event.getSource().getId()`.
 *
 * Read inside literals only, and only inside a literal that IS a client
 * expression - one that names `$event`, `$source`, `$parameters`,
 * `$controller` or opens a `${` binding - so a sentence about `oSource` in a
 * MessageStrip is not a finding. A member followed by `(` is a METHOD call
 * and public by definition (`.getBindingContext( )`); only a property read
 * is judged. The four member tables are left to the scan below, which reads
 * them anywhere. */
const PRIVATE_MEMBER_GETTER = Object.freeze({
  oSource: 'getSource()', oParent: 'getParent()', sId: 'getId()', mParameters: 'getParameters()',
});
const MEMBER_TABLES = /^m(?:Properties|Aggregations|BindingInfos|EventRegistry)$/;
const CLIENT_EXPRESSION = /\$(?:event|source|parameters|controller)\b|\$\{/;
function checkPrivateUi5Fields({ src, report }) {
  const opener = /[`|']/g;
  for (let m = opener.exec(src); m; m = opener.exec(src)) {
    const start = m.index;
    const end = literalEnd(src, start);
    opener.lastIndex = end + 1;
    const text = src.slice(start + 1, end);
    if (!CLIENT_EXPRESSION.test(text)) continue;
    for (const r of text.matchAll(/\.([a-z][A-Z][A-Za-z0-9_]*)\b(?!\s*\()/g)) {
      if (MEMBER_TABLES.test(r[1])) continue;
      const at = start + 1 + r.index;
      const getter = PRIVATE_MEMBER_GETTER[r[1]];
      report({
        type: 'ui5-internal-access', value: r[1], dedupe: String(at), offset: at + 1,
        ...(getter ? { member: getter, fixes: [{ start: at + 1, end: at + 1 + r[1].length, text: getter }] } : {}),
      });
    }
  }
}









// the XML view attributes the template processor never parses for a binding




/*
 * The obsolete companion controls, in the spelling the view walk never sees:
 * the frozen builder's per-control helpers on `z2ui5_cl_xml_view_cc`, reached
 * through `z2ui5_cl_xml_view->_z2ui5( )`. The builder tag (`tag( n = \`Timer\`
 * ns = \`z2ui5\` )`) and the XML form (`<z2ui5:Timer>`) are judged on the
 * reconstructed document in properties.mjs; a class on z2ui5_cl_xml_view
 * reconstructs NO document, so this text scan is the only thing that can see
 * its Timer.
 *
 * Reading the old API at all is the exception frozen-view-builder's header
 * warns about ("confident noise"), and it is made on purpose: the question is
 * not what the view looks like but whether one of eight method NAMES is
 * called on the one receiver that has them - `_z2ui5( )`, or a handle
 * assigned from it. `->title( )` on the view itself is sap.m.Title and is not
 * touched. Over the scrubbed source with literal content blanked, so a name
 * in a comment or a string is prose, not a call.
 *
 * Returns the findings instead of taking `report`: the collector folds
 * identical findings into one, and every call site here is a rewrite of its
 * own - the same granularity the view half has, where each tag is a finding.
 */
function obsoleteCcHelpers(src) {
  const out = [];
  const code = blankLiterals(src);
  if (!/\b_z2ui5\s*\(/i.test(code)) return out;
  /* `DATA(cc) = view->_z2ui5( ).` / `cc = view->_z2ui5( ).` then
   * `cc->timer( … )` - the handle form, one statement away */
  const handles = new Set();
  for (const m of code.matchAll(/(?:\bDATA\s*\(\s*(\w+)\s*\)|\b(\w+))\s*=\s*[\w>~-]*?\b_z2ui5\s*\(\s*\)\s*\./gi)) {
    handles.add((m[1] || m[2]).toLowerCase());
  }
  const receivers = ['\\b_z2ui5\\s*\\(\\s*\\)', ...[...handles].map((h) => `\\b${h}`)].join('|');
  const helpers = Object.keys(OBSOLETE_CC_HELPERS).join('|');
  const re = new RegExp(`(?:${receivers})\\s*->\\s*(${helpers})\\s*\\(`, 'gid');
  for (const m of code.matchAll(re)) {
    const helper = m[1].toLowerCase();
    const name = OBSOLETE_CC_HELPERS[helper];
    out.push({
      type: 'obsolete-custom-control', control: `${CC_NAMESPACE}.${name}`, value: name, member: helper,
      replacement: OBSOLETE_CC_CONTROLS[name].replacement, offset: m.indices[1][0],
    });
  }
  return out;
}

/** The legacy-helper half of `obsolete-custom-control` on its own - what a
 *  class on the frozen builder is judged by beside `frozen-view-builder`
 *  (lib/index.mjs), since it reconstructs no document for the view walk. */
export function obsoleteCcHelperFindings(source) {
  return obsoleteCcHelpers(scrub(source));
}

/** The models a view of this class can actually resolve a `name>` binding
 *  against: the three the framework attaches to every view slot, plus every
 *  model a `SET_ODATA_MODEL` wire registers under a name of its own
 *  (t_arg = service url, model name, annotation url).
 *
 *  Returns null when the class registers a model under a name that is not a
 *  literal — then the set is not the full truth and no prefix may be called
 *  unknown, the same caution `viewIds` takes. */
export function namedModels(source) {
  const src = scrub(source);
  // device> and message> are set on every view slot (ViewSlots.js), http> on
  // the main view when the app runs over a switched path (View1.controller.js)
  const models = new Set(['device', 'message', 'http']);
  const code = blankLiterals(src);
  for (const call of src.matchAll(/client->(?:_event_client|follow_up_action)\s*\(/gi)) {
    if (!isCall(code, call.index, 'client->')) continue;
    const open = src.indexOf('(', call.index + call[0].length - 1);
    const { body } = parenRegion(src, open);
    // the constant, or the name-shaped literal the dispatcher accepts the
    // same way (case-sensitive, exactly like the runtime)
    if (!/cs_event-set_odata_model\b/i.test(body)
      && !/[`']SET_ODATA_MODEL[`']/.test(body)) continue;
    const tm = body.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
    if (!tm) return null; // a wire whose args this pass cannot read at all
    const argOpen = body.indexOf('(', tm.index + tm[0].length - 1);
    const args = literalElements(parenRegion(body, argOpen).body, 0);
    // no second element at all = the default (unnamed) model, which is fine;
    // a non-literal one is a name this pass cannot know
    if (args.length < 2) continue;
    if (args[1].value === null) return null;
    if (args[1].value) models.add(args[1].value);
  }
  return models;
}

/* The findings of one class and the `report( )` that collects them. Repeated
 * identical findings collapse into one (a row template reports the same
 * defect once), but their FIXES do not: every occurrence carries its own
 * span, or `--fix` would need one run per call site.
 *
 * A rule whose every occurrence is a finding of its own - two keyless tables
 * in one class are two declarations to fix - says so with `dedupe` (its
 * offset, as a string). It joins the collapse key and is then dropped: it
 * used to be written into `value`, which is part of the BASELINE key too, so
 * a baselined finding went stale the moment a line was inserted above it. */
function collector() {
  const findings = [];
  const seen = new Map();
  const report = (f) => {
    const key = `${f.type}|${f.control || ''}|${f.member || ''}|${f.value || ''}|${f.dedupe ?? ''}`;
    delete f.dedupe;
    const prev = seen.get(key);
    if (prev) {
      if (f.fixes) (prev.fixes ??= []).push(...f.fixes);
      return;
    }
    seen.set(key, f);
    findings.push(f);
  };
  return { findings, report };
}

/** The source-side rules alone - what a class that builds no view can be
 *  judged by, and all it is judged by under `allClasses`: the round-trip
 *  family (a 256-column line does not import, a BOM or CRLF never stops
 *  diffing), the activation and hygiene rules of checkAbapHygiene( ), and
 *  the released-API check. No view, no wire, no lifecycle: those rules read
 *  an app class, and a helper class has nothing for them to read. */
/** The rule ids checkSourceRules( ) can emit - everything a class that
 *  builds no view is judged by under `allClasses`, and the base of what a
 *  view-less APP class is judged by. A directive in such a class naming any
 *  other rule is unjudged, not unused (index.mjs). `npm test` keeps the set
 *  equal to the ids the four functions below emit. */
export const SOURCE_RULES = Object.freeze(new Set([
  'source-line-too-long', 'trailing-whitespace', 'byte-order-mark', 'crlf-line-ending', 'missing-final-newline',
  'obsolete-custom-control',
  // every class-scoped rule written as a unit reads a class with or without a view
  ...UNIT_RULES.filter((r) => r.scope === 'class').map((r) => r.id),
]));

export function checkSourceRules(source, { ownObjects = null, timings = null } = {}) {
  const src = scrub(source);
  const { findings, report } = collector();
  checkAbapHygiene({ src, source, report, timings, ownObjects });
  timed(timings, 'pass:round-trip', () => checkRoundTrip({ source, report }));
  findings.push(...obsoleteCcHelpers(src));
  return findings;
}

/* The abapGit round-trip family, over the RAW source: the 255-column line
 * that fails to import, and the four shapes that never stop diffing (a
 * trailing blank, a BOM, CRLF, a missing final newline). Its own function
 * because it is also what a class that builds no view is judged by under
 * `allClasses` - see checkSourceRules( ). */
function checkRoundTrip({ source, report }) {
  /* A source line ABAP cannot hold. 255 characters is the limit, and over it
   * the class does not fail to lint — it fails to IMPORT: abapGit reports
   * "Literals across more than one line are not allowed" for the object and
   * CARRIES ON, so what stays behind in the system is an empty class stub.
   * The tree looks imported and the app is gone (abap2UI5/samples#669 left
   * two demo classes as stubs exactly this way, and it reached main because
   * every check runs on the files, where the line is merely long).
   *
   * Over the RAW source, not the scrubbed copy: a comment is part of the line
   * the system has to hold. Generated code is where this comes from, so the
   * fix usually belongs in the generator — split the literal into && chunks. */
  let lineStart = 0;
  source.split('\n').forEach((line, i) => {
    // \r is the line separator's other half, not content the system stores
    const content = line.replace(/\r$/, '');
    const length = content.length;
    if (length > LINE_LIMIT) {
      /* Kept apart by line number rather than by length, so twenty over-long
       * lines are twenty findings: each one needs its own split, and the
       * collapse key would otherwise merge two lines that happen to be
       * equally long. */
      report({ type: 'source-line-too-long', dedupe: String(i + 1), value: length, offset: lineStart + LINE_LIMIT });
    }
    /* The rest of the abapGit round-trip family rides the same walk (abap-check
     * §1): the ABAP editor strips a trailing blank when it saves, so a line
     * ending in one comes back DIFFERENT on the next pull — permanently, for
     * everyone. A warning, not an error: unlike the 255-character line above,
     * nothing fails to import; the file merely never stops diffing. Judged on
     * the RAW line — whitespace is exactly what scrubbing normalizes away —
     * and kept apart by line number like its neighbour. */
    /* A backwards character scan instead of /[ \t]+$/: the regex is quadratic
     * on a line of many blanks (every start position re-walks the run before
     * failing the anchor - CodeQL js/polynomial-redos), and library input is
     * exactly where such a line comes from. */
    let wsStart = content.length;
    while (wsStart > 0 && (content[wsStart - 1] === ' ' || content[wsStart - 1] === '\t')) wsStart--;
    if (wsStart < content.length) {
      report({
        type: 'trailing-whitespace', dedupe: String(i + 1), value: content.length - wsStart,
        offset: lineStart + wsStart,
        fixes: [{ start: lineStart + wsStart, end: lineStart + content.length, text: '' }],
      });
    }
    lineStart += line.length + 1;
  });

  /* Three more of the round-trip family, judged over the whole file (all
   * abap-check §1, all warnings for the trailing-whitespace reason above, all
   * with a mechanical fix):
   *   - a UTF-8 BOM on a .abap file — abapGit never writes one, so the file
   *     diffs against what the system serializes back on every pull,
   *   - CRLF line endings — abapGit writes LF only,
   *   - a missing terminating newline — abapGit ends every file with
   *     exactly one. */
  if (source.charCodeAt(0) === 0xFEFF) {
    report({ type: 'byte-order-mark', offset: 0, fixes: [{ start: 0, end: 1, text: '' }] });
  }
  {
    const crlf = [...source.matchAll(/\r\n/g)];
    if (crlf.length) {
      // ONE finding carrying every \r as a fix span: a file is CRLF or it is
      // not, and a finding per line would drown everything else it has to say
      report({
        type: 'crlf-line-ending', value: crlf.length, offset: crlf[0].index,
        fixes: crlf.map((m) => ({ start: m.index, end: m.index + 1, text: '' })),
      });
    }
  }
  // only a source that HAS lines is judged: a one-line string is a snippet
  // handed to the library, not a file abapGit will ever serialize
  if (source.includes('\n') && !source.endsWith('\n')) {
    report({
      type: 'missing-final-newline', offset: source.length - 1,
      fixes: [{ start: source.length, end: source.length, text: '\n' }],
    });
  }

}

export function checkAbapRules(source, { data = null, controlIds = null, containerPages = null, enumFields = null, boolFields = null, minUi5 = '1.71', rules = null, classIndex = null, ownObjects = null, timings = null } = {}) {
  const src = scrub(source);
  /* The same source with literal CONTENT blanked as well. `scrub( )` blanks
   * comments and KEEPS literals, which is what the rules reading an event
   * name or a bound path out of a call need — but a `client->` written inside
   * a string is prose ABOUT the API, not a call to it, and a sample that
   * documents itself in a MessageStrip is full of those. Every scan below
   * that asks WHERE A CALL IS reads this; the arguments are then read out of
   * `src`, where they still have their text. `blankLiterals( )` is
   * offset-for-offset, so a span computed here addresses `source` unchanged —
   * which matters most for the three of these that carry a `--fix`: read
   * raw, `--fix` rewrote the prose inside the string. */
  const code = blankLiterals(src);
  // which builder's vocabulary this class is written in (lib/builders.mjs) —
  // every rule that reads a builder call out of the source text is built from
  // it, so both dialects are judged by the same rules
  const d = dialectOf(src);
  const { findings, report } = collector();

  /* The ids this class hands out in its views: `)->a( n = `id` v = `x` )`.
   * -> a Set of literal ids, or null when ANY id attribute is built at
   * runtime (a template, a variable, a concatenation) — then the set is not
   * the full truth and no id may be called unknown. */
  const viewIds = (() => {
    /* Either quote spells the same attribute (`id` and 'id'), and the value
     * may be quoted either way too - a `'…'` id used to be invisible here, so
     * once any other id stood in backticks the set was trusted without it and
     * every wire naming it was an error on correct code. The ids the
     * reconstructed tree resolved (controlIds, handed in by the caller) join
     * the set: they include what a helper chain contributed. */
    const ids = new Set();
    // `t =` carries an id like `v =` does - an id written as text is still
    // this class's id, and a text id built at runtime still voids the set
    for (const m of src.matchAll(new RegExp(`\\b(?:${d.att})\\(\\s*n\\s*=\\s*[\`']id[\`']\\s+[vt]\\s*=\\s*([^\\n]*)`, 'gi'))) {
      const literal = m[1].match(/^\s*([`'])([^`']*)\1/);
      if (!literal) return null;
      ids.add(literal[2]);
    }
    for (const id of Object.keys(controlIds ?? {})) if (!/[{}]/.test(id)) ids.add(id);
    return ids.size ? ids : null;
  })();

  /* _bind_edit is obsolete - _bind is two-way as well, and _bind_edit is a
   * pure alias for it now. The one exception this rule used to make is gone
   * with the parameters it was made for: custom_mapper_back /
   * custom_filter_back are still ACCEPTED for source compatibility but no
   * longer evaluated ("per-direction mapping is gone"), so a call passing one
   * is no longer the only way to say what it says - it says nothing. It is
   * reported like every other, but without the fix: dropping an argument is
   * not a rename, and _bind has no parameter to rename it to. */
  for (const m of code.matchAll(/client->(_bind_edit)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    const back = body.match(/\bcustom_(?:mapper|filter)_back\b/i);
    // autofixable where the call is identical apart from the method name
    const token = m.index + m[0].indexOf(m[1]);
    report({
      type: 'obsolete-binder', member: m[1], value: back?.[0], offset: m.index,
      ...(back ? {} : { fixes: [{ start: token, end: token + m[1].length, text: '_bind' }] }),
    });
  }

  /* Two OBSOLETE ARGUMENTS on the binder itself, which the rule above cannot
   * see: it judges the METHOD, and these are wrong on the current one.
   *
   *   view                 "obsolete - inactive, not passed on internally".
   *                        A call scoping a binding to cs_view-popup reads as
   *                        if the binding belonged to that slot; nothing
   *                        reads the value at all. Deleting it is the whole
   *                        correction and cannot change behaviour — which is
   *                        what makes it a mechanical fix rather than a guess.
   *   custom_mapper /      "obsolete - still evaluated, but do not use in new
   *   custom_filter        code". Both hand the app a reference to the BUNDLED
   *                        AJSON copy in src/00 — a mirror of an external
   *                        project, not a contract this framework owns — so an
   *                        app implementing the interface binds itself to
   *                        whatever that mirror looks like today. It is the
   *                        `non-released-api` argument one level down, at a
   *                        parameter instead of a class name. No fix: they are
   *                        still evaluated, so dropping one changes what the
   *                        model carries. The declarative replacements are
   *                        omit_initial / omit_initial_paths / json.
   *
   * Only `_bind` is scanned for the mapper pair: on `_bind_edit` the whole
   * call is already reported by `obsolete-binder` above, and two findings for
   * one line is one too many. */
  for (const m of code.matchAll(/client->(_bind(?:_edit)?)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const base = open + 1;

    const vm = body.match(/\bview\s*=\s*(\S+)/i);
    if (vm) {
      const start = base + vm.index;
      let end = start + vm[0].length;
      /* Take the run of spaces behind it too, so the deletion closes up
       * instead of leaving a double gap — but never a newline, which would
       * pull the next argument onto this line. */
      while (src[end] === ' ' || src[end] === '\t') end++;
      /* A value carrying parentheses is an expression this pass does not
       * measure the end of; it is still reported, just without the fix. */
      const simple = !/[()]/.test(vm[1]);
      report({
        type: 'obsolete-bind-argument', member: 'view', value: vm[1], offset: start,
        ...(simple ? { fixes: [{ start, end, text: '' }] } : {}),
      });
    }

    if (m[1].toLowerCase() === '_bind') {
      const cm = body.match(/\bcustom_(?:mapper|filter)\b/i);
      if (cm) {
        report({ type: 'obsolete-bind-argument', member: cm[0], offset: base + cm.index });
      }
    }
  }

  /* The manual model pushes do NOTHING. The framework compares the model
   * state before main( ) with the state after it returned and, when they
   * differ, sends it to every open view slot by itself - so view_model_update
   * and its four siblings are deliberately EMPTY methods in
   * z2ui5_cl_ui5_client, kept in the interface only so existing apps keep
   * compiling. A leftover call is not just dead weight, it is misleading: it
   * reads as "the model is pushed here" at a place where nothing happens.
   * Deleting it is the whole correction, so it carries the fix. */
  for (const m of code.matchAll(/client->((?:nest2?_)?view_model_update|popup_model_update|popover_model_update)\s*\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { end } = parenRegion(src, open);
    /* Only a statement of its own is deleted - these methods return nothing,
     * so that is the only shape they legally have, and a call this pass
     * cannot see the end of is reported without a fix rather than cut. */
    const dot = src.slice(end + 1).match(/^\s*\./);
    /* The statement starts at the HANDLE, not at `client`: `li_client->…( ).`
     * and `me->client->…( ).` are the same call, and a span measured from
     * `client` cut the statement out from the middle and left `li_` and
     * `me->` behind - invalid ABAP the second pass called clean. */
    let head = m.index;
    while (head > 0 && /[\w>-]/.test(code[head - 1])) head--;
    report({
      type: 'obsolete-model-update', member: m[1], offset: head,
      ...(dot ? { fixes: [{ ...statementSpan(source, head, end + 1 + dot[0].length), text: '' }] } : {}),
    });
  }

  /* _event_client is obsolete - follow_up_action is the same call, and since
   * it gained a RETURNING parameter it is the same call in the same POSITION
   * too. Both delegate to mo_srv_event->get_event_client( val view t_arg )
   * with the identical arguments; follow_up_action reaches it through
   * `IF result IS SUPPLIED`, which is exactly the view-attribute form
   * `v = client->_event_client( … )` is written in. One method for scheduling
   * a frontend action and wiring one, so the rename is a pure one.
   *
   * The one non-equivalence is in follow_up_action's CASE, which intercepts
   * cs_event-set_nav_routing / set_push_state / set_app_state_active before
   * the expression path: those three are backend-side nav options, not
   * frontend handlers, so a view attribute wired to one of them never worked
   * (the dispatch table has no such name) - the fix does not preserve a
   * behaviour, it removes a wire that was already silent. */
  for (const m of code.matchAll(/client->(_event_client)\s*\(/gi)) {
    const token = m.index + m[0].indexOf(m[1]);
    report({
      type: 'obsolete-frontend-event', member: m[1], offset: m.index,
      fixes: [{ start: token, end: token + m[1].length, text: 'follow_up_action' }],
    });
  }

  // a value bound to a local variable is lost after the roundtrip: the
  // instance is serialized, the method stack is not
  const locals = localVariables(src);
  const attrs = instanceAttributes(src);
  /* The ROOT of the bound name is judged, as binding-to-static and
   * binding-to-nonpublic below judge it: a component travels with its
   * structure, so `_bind( ls_local-field )` is lost with `ls_local` - and the
   * `\w+` that had to end at a blank or `)` never saw that shape. A `me->`
   * root is an attribute by construction and not a local; a root followed
   * by `->` is a REFERENCE into data that lives elsewhere (`LOOP … REFERENCE
   * INTO DATA(row)` then `_bind( row->flag … )`), which the old scan never
   * judged either; and a call carrying `tab =` is the framework's cell
   * binding, whose path is derived from the TABLE and not from the row
   * variable in `val` (abap2UI5's own node/srv test classes carry both). */
  // the name may not shrink in front of a `->`: the lookahead refuses a word
  // or `-` character too, so `layout->x` is no match rather than `layou`
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)(?![\w-]|\s*->)/gi)) {
    if (/^me->/i.test(m[1])) continue;
    const root = m[1].split('-')[0];
    const name = root.toUpperCase();
    if (!locals.has(name) || attrs.has(name)) continue;
    const { body } = parenRegion(src, m.index + m[0].indexOf('(', 'client->_bind'.length));
    if (body !== undefined && namedArgMarks(body).some((a) => a.name === 'tab')) continue;
    report({ type: 'binding-to-local', member: root, offset: m.index });
  }

  /* A `_bind( )` on something that is no attribute at all - a literal, a
   * method call, a constructor expression, a concatenation. The framework
   * takes `val` by reference and looks the reference up among the app's
   * attributes to derive the model path; a temporary is found nowhere, and
   * the bind raises at runtime. The neighbours above judge a variable that
   * IS one (a local, a non-public attribute); this one judges a value that
   * never was. A table expression (`t[ 1 ]-x`) and a dereference (`r->*`)
   * are left alone: those address data the serializer can walk. */
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(/gi)) {
    const { body } = parenRegion(src, m.index + m[0].length - 1);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    const val = marks.length ? marks.find((a) => a.name === 'val')?.value : body.trim();
    if (!val) continue;
    const kind = /^(?:[`'|]|\d)/.test(val) ? 'literal'
      : /^(?:VALUE|CONV|NEW|CAST|REF|COND|SWITCH|CORRESPONDING|EXACT|REDUCE|FILTER)\s+[#\w]*\s*\(/i.test(val) ? 'constructor'
        : /^[\w=>-]+\s*\(/.test(val) && !/^[\w=>-]+\s*\[/.test(val) ? 'call'
          : /&&/.test(val) ? 'expression' : null;
    if (!kind) continue;
    report({ type: 'binding-to-expression', member: kind, value: val.replace(/\s+/g, ' ').slice(0, 40), offset: m.index });
  }

  /* A `_bind( )` on the WORK AREA of a LOOP - the row a view is built per
   * row of. Three shapes, none of them a row binding: a work area that is an
   * attribute (`LOOP AT mt INTO ms_row`) binds ONE path, `/MS_ROW/FIELD`, so
   * every row's control shows the last row's value; a local (`INTO
   * DATA(row)`) or a field symbol (`ASSIGNING <row>`) binds a path the
   * model never carries, and the first roundtrip answers BINDING_ERROR. The
   * framework's own answer is the cell binding: `_bind( val = <row>-field
   * tab = mt tab_index = sy-tabix )`, which is a `/MT/<n>/FIELD` path — and
   * val has to BE the row component (a reference into the table), which is
   * what ASSIGNING gives and INTO does not. So the fix exists for the
   * ASSIGNING shape only, and only while nothing between the loop header
   * and the bind has moved sy-tabix (a READ TABLE, an inner LOOP, a DO). A
   * call that already carries `tab =` is the remedy and is not reported. */
  for (const lp of code.matchAll(/\bLOOP\s+AT\s+((?:me->)?[\w]+(?:-\w+)*)\s+(?:(?:REFERENCE\s+)?INTO|ASSIGNING)\s+(?:DATA\(\s*(\w+)\s*\)|FIELD-SYMBOL\(\s*(<\w+>)\s*\)|(<\w+>|\w+))/gi)) {
    if (/\bREFERENCE\s+INTO\b/i.test(lp[0])) continue;
    const wa = lp[2] || lp[3] || lp[4];
    const kind = lp[2] ? 'local' : wa.startsWith('<') ? 'field symbol' : attrs.has(wa.toUpperCase()) ? 'attribute' : 'local';
    // the block: to the ENDLOOP at this loop's own level
    const tokenRe = /\b(LOOP|ENDLOOP|ENDMETHOD)\b/gi;
    tokenRe.lastIndex = lp.index + lp[0].length;
    let depth = 0;
    let blockEnd = code.length;
    let t;
    while ((t = tokenRe.exec(code)) !== null) {
      const k = t[1].toUpperCase();
      if (k === 'LOOP') depth++;
      else if (k === 'ENDLOOP') { if (depth === 0) { blockEnd = t.index; break; } depth--; }
      else { blockEnd = t.index; break; }
    }
    const block = code.slice(lp.index + lp[0].length, blockEnd);
    const escaped = wa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isWa = new RegExp(`^(?:me->)?${escaped}(?:-\\w+)*$`, 'i');
    for (const m of block.matchAll(/client->_bind(?:_edit|_path)?\s*\(/gi)) {
      const open = lp.index + lp[0].length + m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      if (body === undefined || /\btab\s*=/i.test(body)) continue;
      const marks = namedArgMarks(body);
      const val = marks.length ? marks.find((a) => a.name === 'val')?.value : body.trim();
      if (!val || !isWa.test(val)) continue;
      const clobbered = /\b(?:READ\s+TABLE|LOOP\s+AT|DO|WHILE)\b/i.test(block.slice(0, m.index));
      const onlyVal = marks.length === 0 || (marks.length === 1 && marks[0].name === 'val');
      const fixes = kind === 'field symbol' && onlyVal && !clobbered
        ? [{ start: open + 1, end: open + 1 + body.length, text: ` val = ${val} tab = ${lp[1]} tab_index = sy-tabix ` }]
        : null;
      report({
        type: 'loop-work-area-bound', control: lp[1], member: kind, value: val, offset: open - m[0].length + 1,
        ...(fixes ? { fixes } : {}),
      });
    }
  }

  /* A bound attribute that is not PUBLIC. Only public attributes are
   * serialized into the model (z2ui5_cl_ui5_srv_model filters on
   * visibility), so binding a PROTECTED/PRIVATE attribute fails the FIRST
   * roundtrip with "BINDING_ERROR - No class attribute for binding found".
   * Found live: samples-controls app 043 bound `expanded` from its PROTECTED
   * SECTION and had never worked in a running system — the e2e interaction
   * that closed its LIVE_TEST deviation was what surfaced it. Judged by the
   * ROOT of the bound name (a structure component travels with its root),
   * and only when the class declares a PUBLIC SECTION to compare against. */
  /* A bound CONSTANT or CLASS-DATA. The model is built from the app's
   * INSTANCE attributes: `attri_search` skips every static and every constant
   * (`is_class = abap_false AND is_constant = abap_false`), so the bind finds
   * no attribute at all and the first roundtrip raises BINDING_ERROR — in
   * any section, which is why this is not a case of the rule below: moving a
   * constant to PUBLIC changes nothing. Judged before it, and the root of the
   * bound name decides (a component of a structured constant is the
   * constant). A local CONSTANTS in a method is the same call with the same
   * exception, so the whole source is read, not only the definition. */
  const statics = staticAttributes(src);
  for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/gi)) {
    const root = m[1].replace(/^me->/i, '').split('-')[0];
    const kind = statics.get(root.toUpperCase());
    if (kind) report({ type: 'binding-to-static', member: root, value: kind, offset: m.index });
  }

  if (/\bPUBLIC\s+SECTION\b/i.test(src)) {
    const publicNames = new Set(publicAttributes(src).map((a) => a.name.toUpperCase()));
    for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/gi)) {
      const root = m[1].replace(/^me->/i, '').split('-')[0];
      const up = root.toUpperCase();
      // a static root is binding-to-static's, whatever section it sits in
      if (attrs.has(up) && !publicNames.has(up) && !locals.has(up) && !statics.has(up)) {
        // the fix MOVES the declaration into the PUBLIC SECTION - see moveDeclarationFix
        const fixes = moveDeclarationFix(source, src, root, 'PUBLIC');
        report({ type: 'binding-to-nonpublic', member: root, offset: m.index, ...(fixes ? { fixes } : {}) });
      }
    }
  }

  /* Private UI5 internals reached from ABAP-built wires or bindings.
   * mProperties & friends are UI5's internal member tables — no API
   * contract, renamed or restructured across patches without notice. A wire
   * that reads them works on the UI5 version it was written against and
   * breaks silently on the next one. Restructure to a two-way binding or a
   * public parameter. */
  for (const m of src.matchAll(/\bm(?:Properties|Aggregations|BindingInfos|EventRegistry)\b/g)) {
    report({ type: 'ui5-internal-access', value: m[0], offset: m.index });
  }

  /* A URL pointing at the commercial SAPUI5 host. The same portability
   * family as sapui5-only-control: sdk.openui5.org serves the open
   * distribution, ui5.sap.com / *.hana.ondemand.com serve SAPUI5 — an app
   * pinned to the commercial host breaks the moment it runs against an
   * OpenUI5-only landscape (and its assets differ). */
  /* Scoped to a URL that loads the RUNTIME, which is what the paragraph above
   * is actually about. The bare host is not evidence: a class header linking
   * the control's demo-kit page is on ui5.sap.com because SAPUI5 has no other
   * home, and a demo image under `/test-resources/` is an asset, not a
   * distribution. Reporting those made every SAPUI5-facing consumer switch the
   * rule off wholesale, which cost them the one case it exists for.
   *
   * The runtime is served from `/resources/` (note that `/test-resources/`
   * does not contain that path) or names the bootstrap script outright. */
  const RUNTIME_PATH = /\/resources\//;
  /* `sap-ui-core…` / `sap-ui-custom…` up to `.js`, i.e. what
   * `/sap-ui-(?:core|custom)[\w-]*\.js/` found: a run of name characters that
   * contains either and is followed by `.js`. Judged per run, which that
   * regex rescanned from each occurrence of the prefix in it. */
  const bootstrap = (text) => [...text.matchAll(/[\w-]+/g)]
    .some((r) => text.startsWith('.js', r.index + r[0].length) && /sap-ui-(?:core|custom)/.test(r[0]));
  /* The subdomain branch starts only where a run of name characters starts
   * (`(?<![\w-])`): `\b(?:[\w-]+\.)?hana…` was tried at every word boundary
   * inside such a run - after every `-` - and each try read to the run's
   * end, quadratic on one long hyphenated token. The matches are the same:
   * a subdomain match from inside a run is also one from its start. */
  for (const m of src.matchAll(/\b(?:ui5\.sap\.com|hana\.ondemand\.com|(?<![\w-])[\w-]+\.hana\.ondemand\.com)\b([^\s`'"|)]*)/g)) {
    const urlPath = m[1] || '';
    if (!RUNTIME_PATH.test(urlPath) && !bootstrap(urlPath)) continue;
    report({ type: 'commercial-ui5-host', value: m[0].slice(0, 60), offset: m.index });
  }

  timed(timings, 'pass:round-trip', () => checkRoundTrip({ source, report }));

  /* Icon names, over the whole class rather than over the view tree: an icon
   * travels as data at least as often as it travels as an attribute — a
   * column of a bound table, a constant, a status-to-icon mapping — and none
   * of those reach the reconstructed view the property gate walks. Comments
   * are already blanked, so a name in prose is not a use. */
  for (const f of timed(timings, 'pass:icons', () => checkIcons(src, { minUi5 }))) report(f);

  findings.push(...obsoleteCcHelpers(src));

  runRule(bindPathAsValue, { src, source, d, report }, { timings });
  checkPrivateUi5Fields({ src, report });
  runRule(bindPathFlag, { src, report }, { timings });
  const boolVars = runRule(unconvertedAbapBoolean, { src, d, report }, { timings });
  runRule(unescapedTextInAttribute, { src, d, boolVars, report, data }, { timings });

  /* An event raised in the view that nothing handles is usually a dead
   * control - but not always: in abap2UI5 an event also forces a roundtrip,
   * which alone synchronises the model back into ABAP. That makes this a
   * hint, never an error, and it is skipped entirely when handler names
   * are not literals (a constant or variable is not statically knowable). */
  const raised = eventNames(src);
  const handled = handledEvents(src);
  const dynamicHandling = /check_on_event\s*\(\s*(?:val\s*=\s*)?[a-z_]\w*[-\s)]/i.test(src)
    || hasEventCatchAll(src);
  if (!dynamicHandling) {
    for (const [name, offset] of raised) {
      if (!handled.has(name)) {
        report({ type: 'event-without-handler', value: name, offset });
      }
    }

    /* The two sets above are compared case-blind, which is exactly how the
     * runtime does NOT compare them: `get_event( ) = val` is a string
     * comparison, so `_event( \`save\` )` never reaches `WHEN \`SAVE\``. A
     * raised spelling that no handler carries, where exactly one handled
     * spelling is the same name up to case, is that defect — and the fix
     * writes the handler's spelling into the raise, because the handler is
     * the one place the name is compared. Two handled spellings of one name
     * are left alone: which of them to follow would be a guess. */
    const handledRaw = handledEventLiterals(src);
    for (const r of raisedEventLiterals(src)) {
      if (handledRaw.includes(r.name)) continue;
      const spelt = [...new Set(handledRaw.filter((h) => h.toUpperCase() === r.name.toUpperCase()))];
      if (spelt.length !== 1) continue;
      report({
        type: 'event-name-case-mismatch', value: r.name, member: spelt[0], offset: r.offset,
        fixes: [{ start: r.at, end: r.at + r.name.length, text: spelt[0] }],
      });
    }
  }

  /* The lifecycle module reads STATEMENTS and nothing else - no rule in it
   * looks at literal content - so it is handed the blanked copy whole. A
   * class that quotes its own dispatcher in a MessageStrip (`IF
   * client->check_on_init( ). … ENDIF.`) used to be judged on the sentence:
   * missing-on-navigated-branch, separate-lifecycle-ifs, lifecycle-is-initial,
   * redundant-init-display and duplicate-for-iterator all fired on prose. */
  runRule(manualInitFlag, { src: code, report, boolVars, attrs, locals }, { timings });
  runRule(lifecycleIsInitial, { src: code, source, report, boolVars }, { timings });

  /* client->_bind( ) on an OBJECT reference. Since abap2UI5#2986 a DATA
   * reference is a valid argument - `_bind( mr_rows )` with `mr_rows TYPE REF
   * TO data` binds what it points to, the shape a table typed at runtime
   * needs (samples app 061) - so only a reference to a class or an interface
   * is still wrong: the model holds data, and an object has none to send.
   * Judged on the class's own declarations, and only where the target is
   * certainly an object type (`object`, or a name in the class/interface
   * namespaces); a reference to a type this class cannot see is left alone
   * rather than guessed at. No fix: what to bind instead is the author's. */
  {
    const objectType = (t) => /^object$/i.test(t) || /^[zy]?(?:cl|if|cx)_/i.test(t) || /^\w*?_(?:cl|if|cx)_/i.test(t);
    const refVars = new Set();
    // every element of a declaration, chained or not: `DATA: mr_a TYPE REF TO
    // x, mr_b TYPE REF TO y.` declares two references
    for (const el of declarationElements(src, /^(?:CLASS-)?DATA$/i)) {
      const d = el.match(/^(\w+)\s+TYPE\s+REF\s+TO\s+(\w+)/i);
      if (d && objectType(d[2])) refVars.add(d[1].toUpperCase());
    }
    if (refVars.size) {
      for (const m of code.matchAll(/client->_bind(?:_edit|_path)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?(\w+))\s*(?![-\w>])/gi)) {
        if (refVars.has(m[2].toUpperCase())) {
          report({ type: 'binding-to-reference', member: m[2], offset: m.index });
        }
      }
    }
  }

  /* A per-keystroke event wired to a BACKEND round-trip. abap2UI5 serializes
   * round-trips: an event fired while one is in flight is DROPPED, not
   * queued, so a liveChange wire that round-trips sees the value of the last
   * COMPLETED trip and skips the ones typed in between — it converges only
   * when the input pauses. (Measured on a real port: typing `abc` with no
   * delay left the bound field at `a` while the control held `abc`.) That
   * convergence is why this is a hint, not an error: the wire is lossy, not
   * dead. Prefer a two-way binding — the model updates without any event —
   * or the control's final-value event (change/search/submit); keep the live
   * wire only when every intermediate value genuinely must reach ABAP. Only
   * the plain client->_event( ) round-trips; _event_client and
   * follow_up_action are frontend-only and are not judged. */
  /* Since the framework gained `s_ctrl-check_queue_last` (the LAST firing
   * while a roundtrip is in flight is kept and dispatched once the response
   * has landed - one roundtrip at a time, order preserved, the backend ends
   * on the control's current value) the wire has a remedy of its own, and
   * the rule reads it: a live wire carrying the flag is not lossy and is not
   * reported. The fix writes that flag - with `check_no_busy`, its documented
   * other half: the overlay a per-keystroke wire would flash over the field.
   * Every `live*` event is judged (liveChange, liveSearch, …), not one name. */
  for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
    // the arguments by name, in either order; the handle may be `me->client`
    const attrOpen = m.index + m[0].length - 1;
    const marks = namedArgMarks(parenRegion(src, attrOpen).body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg || !/^[`'|]live\w*[`'|]$/.test(nArg.value)) continue;
    const ev = vArg.value.match(/^(?:me->)?\w*client->_event\s*\(/i);
    if (!ev) continue;
    const evOpen = attrOpen + 1 + vArg.vstart + ev[0].length - 1;
    const { body } = parenRegion(src, evOpen);
    if (body === undefined || /\bcheck_queue_last\s*=\s*abap_true\b/i.test(body)) continue;
    const evMarks = namedArgMarks(body);
    const flag = 's_ctrl = VALUE #( check_queue_last = abap_true check_no_busy = abap_true )';
    let fixes = null;
    if (evMarks.some((a) => a.name === 's_ctrl')) fixes = null;   // a flag set some other way: the author's call
    else if (!evMarks.length && body.trim()) fixes = [{ start: evOpen + 1, end: evOpen + 1 + body.length, text: ` val = ${body.trim()} ${flag} ` }];
    else if (evMarks.length) { const at = evOpen + 1 + body.trimEnd().length; fixes = [{ start: at, end: at, text: ` ${flag}` }]; }
    report({ type: 'live-event-roundtrip', member: nArg.value.slice(1, -1), offset: m.index, ...(fixes ? { fixes } : {}) });
  }

  /* A parameter `message_box_display( )` / `message_toast_display( )` no
   * longer has. abap2UI5#2748 (2026-09-13) took the pure UI5 options off both
   * signatures - they travel as the option object of the CONTROL_GLOBAL wire
   * now (`MESSAGE_BOX` / `MESSAGE_TOAST`, last t_arg) - so a call naming one
   * does not compile on a current pin, and a systemless pipeline sees that
   * only when somebody imports the transport: the same silence
   * get-viewname-removed covers, one method over. No fix: the value has to
   * move into a different call. */
  for (const m of code.matchAll(/client->(message_(box|toast)_display)\s*\(/gi)) {
    const { body } = parenRegion(src, m.index + m[0].length - 1);
    if (body === undefined) continue;
    const gone = m[2].toLowerCase() === 'box' ? MESSAGE_BOX_REMOVED : MESSAGE_TOAST_REMOVED;
    for (const arg of namedArgMarks(body)) {
      if (!gone.includes(arg.name)) continue;
      report({ type: 'message-box-removed-parameter', member: arg.name, value: m[1].toLowerCase(), offset: m.index + m[0].length + arg.nameStart });
    }
  }

  /* A box TYPE the server does not know. `box_resolve` lower-cases the type
   * and looks it up among the sap.m.MessageBox display methods (the type IS
   * the method of the MESSAGE_BOX global call); a miss is no error - the box
   * falls back to a plain show( ): no icon, and no title of its kind. So an
   * error box written `type = \`E\`` - the ABAP message-type letter, the
   * natural slip - opens as a neutral box the user reads as information.
   * Letter case is free (the server folds it). Only a literal is judged; the
   * four letters with a box of their own (E/W/S/I) carry the fix. */
  for (const m of code.matchAll(/client->message_box_display\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const arg = namedArgMarks(body).find((a) => a.name === 'type');
    const lit = arg?.value.match(/^([`'])([^`']*)\1$/);
    if (!lit || MESSAGE_BOX_TYPES.includes(lit[2].trim().toLowerCase())) continue;
    const written = lit[2];
    const suggestion = MESSAGE_TYPE_LETTERS[written.trim().toUpperCase()];
    const at = open + 1 + arg.vstart + 1;
    const fixable = suggestion && source.slice(at, at + written.length) === written;
    report({
      type: 'unknown-message-box-type', value: written, offset: open + 1 + arg.nameStart,
      ...(suggestion ? { suggestion } : {}),
      ...(fixable ? { fixes: [{ start: at, end: at + written.length, text: suggestion }] } : {}),
    });
  }

  /* A sap.ui.comp SmartVariantManagement in the view with no
   * `cs_event-smart_variant_init` wire in the class. A controller would call
   * initialise( ) on it; without the handshake the control keeps no
   * personalizable control, saving a view fails inside sap.ui.fl and stored
   * variants are never loaded - nothing red, the variant just does not come
   * back. Read off the class's own id map (the control needs an id for the
   * wire anyway), so a class that builds ids at runtime is not judged.
   * `filter_bar_variant_init` is the same handshake for a classic FilterBar:
   * the frontend action (z2ui5_cl_ui5f_variants_js) registers the bar with
   * the variant management and then calls its initialise( ) - so a class
   * wiring that one was reported for a handshake it makes (samples-stack
   * app 493). */
  {
    const smart = Object.entries(controlIds ?? {}).filter(([, c]) => /\.SmartVariantManagement$/.test(c));
    if (smart.length && !/cs_event-(?:smart|filter_bar)_variant_init\b|[`'](?:SMART|FILTER_BAR)_VARIANT_INIT[`']/i.test(src)) {
      const at = src.search(/SmartVariantManagement/);
      report({ type: 'smart-variant-without-init', member: smart[0][0], control: smart[0][1], offset: at === -1 ? 0 : at });
    }
  }

  runRule(viewNeverDisplayed, { src: code, d, report }, { timings });

  checkEventArgs({ src, source, report });
  runRule(eventArgJsCallback, { src, report }, { timings });
  runRule(abapDateFormatterMismatch, { src, code, report }, { timings });
  runRule(escapeSequenceInBacktick, { src, source, report }, { timings });
  checkAbapHygiene({ src, source, report, timings, ownObjects });

  /* A PRIVATE instance attribute on an app class. The app's state is persisted
   * with `CALL TRANSFORMATION id`, and the transpiled runtime re-implements
   * that walk with a dynamic `ASSIGN obj->(name)` — which reaches a PROTECTED
   * attribute and NOT a private one. `sy-subrc` is then 4, the serializer
   * asserts, and EVERY roundtrip answers `ASSERTION_FAILED` out of
   * `lcl_heap.add_object`, with nothing in the message naming the attribute
   * that caused it.
   *
   * A warning rather than an error, and the line is the one this file's
   * severity comment draws: a real SAP kernel serializes a private attribute
   * fine, so such a class works on the system it was written for. It breaks on
   * the transpiled runtime — abap2UI5's own Node backend and every e2e smoke —
   * which is exactly the "not necessarily on the target system" bucket. Six
   * ports carried it while the 53 with a PROTECTED attribute were fine, which
   * is what isolated it; app state belongs in PUBLIC (that is also what makes
   * it reach the model at all) and helpers in PROTECTED. */
  /* `INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`.
   *
   * z2ui5_if_app INCLUDES if_serializable_object - it has since the interface
   * existed, because the framework persists the app instance with
   * CALL TRANSFORMATION id between roundtrips and an app that cannot be
   * serialized is not an app. Declaring it a second time compiles and changes
   * nothing; what it costs is the reading. An app class is the most copied
   * piece of ABAP in this ecosystem, and the extra line says that
   * serialization is something an app has to ask for - so the next class is
   * written with it too, and a reader who removes it wonders what broke.
   *
   * A hint, like redundant-conv-i: the code is correct, it just says
   * something that is not true any more.
   *
   * Only the DEFINITION is read, and only the statement's own line is
   * offered as a fix: a chained `INTERFACES: if_serializable_object,
   * z2ui5_if_app.` names both in one statement, and deleting a line out of it
   * would leave a dangling comma. That one is reported without a fix. */
  {
    const defEnd0 = src.search(/\bENDCLASS\b/i);
    const definition = defEnd0 === -1 ? src : src.slice(0, defEnd0);
    /* Both names are read out of INTERFACES STATEMENTS rather than out of the
     * source at large: the guard every other rule here uses
     * (`INTERFACES z2ui5_if_app`) does not see the chained `INTERFACES:
     * if_serializable_object, z2ui5_if_app.`, which is exactly the shape that
     * carries the redundancy most often. */
    const statements = [...definition.matchAll(/\bINTERFACES\b:?[^.]*\./gi)];
    const isApp = statements.some((m) => /\bz2ui5_if_app\b/i.test(m[0]));
    const carries = statements.find((m) => /\bif_serializable_object\b/i.test(m[0]));
    if (isApp && carries) {
      const own = /^([ \t]*)INTERFACES[ \t]+if_serializable_object[ \t]*\.[ \t]*\r?\n/im.exec(definition);
      /* The scan runs over the SCRUBBED copy, where a trailing comment is
       * blanked to spaces and matched by the `[ \t]*` before the line break -
       * so `INTERFACES if_serializable_object. " keep: …` was deleted with
       * its comment. Only a line the original spells the same is fixed; one
       * carrying a comment is reported without a fix. */
      const same = own && source.slice(own.index, own.index + own[0].length) === own[0];
      report({
        type: 'redundant-serializable',
        offset: own ? own.index + own[1].length : carries.index,
        ...(same ? { fixes: [{ start: own.index, end: own.index + own[0].length, text: '' }] } : {}),
      });
    }
  }

  if (/\bINTERFACES\s+z2ui5_if_app\b/i.test(src)) {
    /* The fix: with no PROTECTED SECTION in the definition, the PRIVATE
     * one is renamed - everything in it widens to PROTECTED, which is what
     * the remedy says for a helper (bound state then gets its own finding
     * and its own move to PUBLIC on the next pass). With a PROTECTED
     * SECTION present the declaration is moved into it, one line at a time
     * (moveDeclarationFix); a chained `DATA:` element is reported without
     * a fix. The rename rides on the FIRST finding only - one span, not one
     * per attribute. */
    const defEnd = src.search(/\bENDCLASS\b/i);
    const definition = defEnd === -1 ? '' : src.slice(0, defEnd);
    const hasProtected = /\bPROTECTED\s+SECTION\s*\./i.test(definition);
    const priv = /\bPRIVATE(?=\s+SECTION\s*\.)/i.exec(definition);
    privateInstanceAttributes(src).forEach((attr, i) => {
      const fixes = hasProtected
        ? moveDeclarationFix(source, src, attr.name, 'PROTECTED')
        : (i === 0 && priv ? [{ start: priv.index, end: priv.index + 'PRIVATE'.length, text: 'PROTECTED' }] : null);
      report({ type: 'private-app-attribute', member: attr.name, offset: attr.offset, ...(fixes ? { fixes } : {}) });
    });
  }
  checkEnumRowLiterals({ src, enumFields, boolFields, report });

  const frontendRaised = timed(timings, 'pass:frontend-wires', () => checkFrontendWires({ src, code, report, viewIds, data, controlIds, containerPages, minUi5 }));
  runRule(closeOnlyRoundtrip, { src, source, frontendRaised, report }, { timings });

  /* The backend events the loop above collected from KEYBOARD_SHORTCUT and
   * START_TIMER wires, judged like any raised event: no branch handles the
   * name, the shortcut/timer fires a roundtrip that falls through every
   * CASE. Skipped under the same dynamic-handling caution as above. */
  if (!dynamicHandling) {
    for (const { name, offset } of frontendRaised) {
      if (!handled.has(name)) {
        report({ type: 'event-without-handler', value: name, offset });
      }
    }
  }

  /* The inverse: a handler for an event NOTHING raises - a `WHEN \`SAVE_\``
   * against a view that raises `SAVE`, or a branch left behind when the
   * control went. Dead code at best, a typo that ate a feature at worst; a
   * hint like its twin, because it never breaks a view. Judged only when the
   * two sets are both KNOWABLE: every handled name is a literal (the caution
   * above), every raise is a literal (a `_event( lv_name )` can raise
   * anything), the class raises at least one event itself (a class whose
   * whole view lives in a helper has nothing to compare against), and the
   * client handle is not handed to another object (`factory( client )` -
   * that object raises on this class's behalf). A raise the class spells in
   * another case is the case-mismatch rule's business, not this one's.
   *
   * A closing box raises too: `message_box_display( )` and
   * `message_toast_display( )` take `onclose`, "a BACKEND event name raised
   * when the box closes" (z2ui5_if_client), and the CONTROL_GLOBAL option
   * object of the same two carries it as `"onClose":"NAME"` - a literal in
   * either spelling is a raise, and its handler was reported as dead
   * (samples apps 381, 502, 512). */
  {
    const literalRaise = /^\s*(?:val\s*=\s*)?(?:`[A-Z0-9_]+`|'[A-Z0-9_]+'|\|[A-Z0-9_]+\|)/i;
    const dynamicRaise = [...code.matchAll(/client->_event\s*\(/gi)].some((m) => {
      const { body } = parenRegion(src, m.index + m[0].length - 1);
      return body === undefined || !literalRaise.test(body);
    });
    const handsOver = /[(=]\s*(?:me->)?client\s*(?=\)|\s|$)/m.test(code);
    if (!dynamicHandling && !dynamicRaise && !handsOver && raised.size) {
      const raisedNames = new Set([...raised.keys(), ...frontendRaised.map((r) => String(r.name).toUpperCase())]);
      for (const m of code.matchAll(/client->message_(?:box|toast)_display\s*\(/gi)) {
        const { body } = parenRegion(src, m.index + m[0].length - 1);
        const onclose = namedArgMarks(body ?? '').find((a) => a.name === 'onclose')?.value.match(/^[`'|]([A-Z0-9_]+)[`'|]$/i);
        if (onclose) raisedNames.add(onclose[1].toUpperCase());
      }
      for (const m of src.matchAll(/"onClose"\s*:\s*"(\w+)"/g)) raisedNames.add(m[1].toUpperCase());
      const done = new Set();
      const dispatch = eventDispatchRegions(src);
      for (const h of handledEventSites(src)) {
        /* a WHEN names an event only in a CASE over the event - and only a
         * CASE's WHEN: `SWITCH #( range WHEN \`Phone\` THEN … )` inside a
         * handler is an expression over something else */
        if (h.when && (!dispatch.some((c) => c.owns(h.offset)) || h.then)) continue;
        const key = h.name.toUpperCase();
        if (raisedNames.has(key) || done.has(key)) continue;
        done.add(key);
        report({ type: 'handler-without-event', value: h.name, offset: h.offset });
      }
    }
  }

  /* Literal CSS braces in a view. UI5's XMLView parser reads an unescaped
   * `{` in an attribute value as the start of a binding, so a stylesheet
   * injected through a core:HTML content attribute takes the whole view down
   * with a binding parse error. Every brace has to be written `\{` / `\}`.
   * Caught the hard way in samples-controls (apps 026, 028 and 031, all by the
   * render gate).
   *
   * The unit is the span between <style> and </style>, not the literal and
   * not the statement. A stylesheet is written as a `&&` chain whose first
   * literal alone carries the opening tag, so checking literal by literal
   * sees that line and misses every rule below it - and a whole builder chain
   * is ONE ABAP statement, so widening to the statement swallows the entire
   * view (on the samples-controls corpus that produced ten false positives at once:
   * `{0}` toast templates and `${$parameters>/…}` wires that merely shared a
   * statement with a stylesheet). Between the two tags there is only CSS.
   *
   * The opening tag is read with its attributes and in any case - `<style
   * type="text/css">` is the same stylesheet, and a bare `<style>` match left
   * every sheet written that way unjudged (the same shape css-classes.mjs
   * reads). */
  for (const open of src.matchAll(STYLE_OPEN)) {
    const from = open.index + open[0].length;
    const to = styleCloseAt(src, from);
    if (to === -1) continue; // no closing tag in sight - not a stylesheet we can bound
    // one finding per stylesheet, at its first unescaped brace: a sheet with
    // twenty rules has forty braces and exactly one thing to do about them
    const css = src.slice(from, to);
    const first = css.search(/(?<!\\)[{}]/);
    if (first === -1) continue;
    const braces = [...css.matchAll(/(?<!\\)[{}]/g)];
    /* The fix writes the backslash in front of every brace — but only where
     * ALL of them sit inside `backtick` literals, which take the backslash
     * verbatim. A brace inside a |…| template is either an embedded
     * expression or already a syntax error, and a brace outside any literal
     * is code; neither is CSS to escape, so a sheet mixing them gets no fix. */
    const inBacktick = insideSegments(literalSegments(src).filter((s) => s.kind === '`'));
    const fixable = braces.every((b) => inBacktick(from + b.index));
    report({
      type: 'unescaped-brace-in-style',
      count: braces.length,
      value: css.slice(Math.max(0, first - 15), first + 25).replace(/\s+/g, ' ').trim(),
      offset: from + first,
      ...(fixable ? { fixes: braces.map((b) => ({ start: from + b.index, end: from + b.index, text: '\\' })) } : {}),
    });
  }

  /* A PUBLIC attribute nothing in the class ever touches. Every one of them
   * is serialized into the model and shipped to the browser on every
   * roundtrip, so one that is never bound, never read and never written is
   * pure transport weight.
   *
   * Deliberately NARROWER than "not bound in any view": a PUBLIC attribute
   * used only in ABAP code is not dead, it is state - PUBLIC is precisely how
   * a value survives the roundtrip, so demanding a binding for it would
   * report the correct way to keep state. Only a name that appears exactly
   * once in the whole class, its own declaration, is judged. A hint, because
   * an attribute can still be read from outside the class (a called app
   * reaching into the caller's instance), which no single source can see. */
  /* How often each PUBLIC attribute's name occurs as a whole word, counted in
   * ONE scan for all of them: `\bname\b` over the source for every
   * attribute was a scan of the whole class per declaration. Names are
   * `\w` runs (anything else keeps its own regex), so the alternation finds
   * exactly the matches the per-name regex found. */
  const publicAttrs = publicAttributes(src);
  const declaredNames = new Set(publicAttrs.map((a) => a.name.toLowerCase()).filter((n) => /^\w+$/.test(n)));
  const wordCounts = new Map();
  if (declaredNames.size) {
    for (const w of src.matchAll(new RegExp(`\\b(?:${[...declaredNames].join('|')})\\b`, 'gi'))) {
      const k = w[0].toLowerCase();
      wordCounts.set(k, (wordCounts.get(k) || 0) + 1);
    }
  }
  const wordUses = (name) => (declaredNames.has(name.toLowerCase())
    ? wordCounts.get(name.toLowerCase()) || 0
    : (src.match(new RegExp(`\\b${name}\\b`, 'gi')) || []).length);
  /* What the other classes of the run read of this one as `->name`
   * (`outsideReads` in the class index): a caller taking a popup's result
   * back reads it from OUTSIDE, which is the case both rules here say no
   * single source can see. Where the run holds that caller, it is seen. */
  const readOutside = outsideReadsOf(src, classIndex);
  const readFromOutside = (name) => Boolean(readOutside?.has(name.toLowerCase()));
  for (const attribute of publicAttrs) {
    if (wordUses(attribute.name) === 1 && !readFromOutside(attribute.name)) {
      report({ type: 'unused-public-attribute', member: attribute.name, offset: attribute.offset });
    }
  }

  /* The other half of the same surface: a PUBLIC INSTANCE attribute the
   * class uses in ABAP but never BINDS. It is shipped to the browser on every
   * roundtrip like the one above, and unlike the one above it is not dead —
   * it is state, and state survives the roundtrip at PROTECTED just the same
   * (the draft serializes the whole object; only the MODEL filters on
   * visibility). So the remedy differs, and that is why this is a separate
   * rule rather than a widening of unused-public-attribute: an unused name is
   * deleted, an unbound one moves to PROTECTED. Judged on the class's own
   * binding vocabulary — an argument of a `_bind*( )` call, a boolean
   * `b = name`, or the name as a model path (`{/NAME}`, `/NAME/`,
   * `omit_initial_paths`). App classes only, since only the app's own
   * attributes are the model; `TYPE REF TO` attributes stay out (a reference
   * can never be bound — see binding-to-reference — and `client` is one).
   * A warning, not an error: a called app may read the attribute from
   * OUTSIDE (a value help handing its result back is written exactly so),
   * which no single source can see. */
  if (/\bINTERFACES\s+z2ui5_if_app\b/i.test(src)) {
    const impl = src.slice(src.search(/\bCLASS\s+\w+\s+IMPLEMENTATION\b/i));
    const bound = boundVocabulary(src, impl);
    for (const attribute of publicInstanceAttributes(src)) {
      const n = attribute.name;
      if (attribute.reference) continue;
      if (wordUses(n) <= 1) continue; // unused-public-attribute's case
      if (readFromOutside(n)) continue;
      if (bound.has(n.toLowerCase())) continue;
      report({ type: 'unbound-public-attribute', member: n, offset: attribute.offset });
    }
  }

  /* A Dialog nothing can close. `popup_display( )` opens a sap.m.Dialog that
   * has no close affordance of its own: no button, no `afterClose`/
   * `escapeHandler` wire — only Escape, which the app never hears about. A
   * method that builds a `Dialog` root and wires NO event at all (no
   * `_event( )`, no `_event_client( )`, no `follow_up_action( )`, no
   * `_event_nav_app_leave( )` - the wire that leaves the app on press, which
   * closes the dialog with it - anywhere
   * in it) has left the dialog without a way back to the app. Judged per
   * METHOD rather than per statement, because a dialog's buttons are often
   * chained in a second statement on the same handle; a method that hands
   * the buttons to a helper is the shape this cannot see, which is why it is
   * a hint. */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    // the VERBS are case-free, the control name in the literal is not: only a
    // literal spelled exactly `Dialog` names sap.m.Dialog
    const dlg = [...mm[0].matchAll(new RegExp(`->\\s*(?:${d.open}|${d.leaf})\\(\\s*(?:n\\s*=\\s*)?\`(\\w+)\``, 'gi'))]
      .find((c) => c[1] === 'Dialog');
    if (!dlg) continue;
    if (/\b_event\s*\(|\b_event_client\s*\(|\b_event_nav_app_leave\s*\(|\bfollow_up_action\s*\(/i.test(mm[0])) continue;
    report({ type: 'popup-without-close-wire', control: 'Dialog', offset: mm.index + dlg.index });
  }

  /* popover_display anchors its fragment to a control id (by_id) — and a
   * literal id no view of this class declares is the quietest failure in the
   * display family: the fragment LOADS, then displayPopover logs "openBy
   * control not found" and DESTROYS it again. Nothing opens, nothing
   * renders red, and the property gate saw a perfectly valid fragment.
   * Judged under the same viewIds trust condition as the wire rules. */
  if (viewIds) {
    for (const m of clientCalls(code, (method) => method === 'popover_display')) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      const idm = body.match(/\bby_id\s*=\s*`([^`]*)`/i);
      if (idm && !viewIds.has(idm[1])) {
        const suggestion = caseMatch(idm[1], viewIds);
        const at = open + 1 + idm.index + idm[0].length - 1 - idm[1].length;
        report({
          ...(suggestion ? { written: idm[1], suggestion, fixes: [{ start: at, end: at + idm[1].length, text: suggestion }] } : {}),
          type: 'popover-anchor-unknown-id', member: 'by_id', value: idm[1],
          allowed: [...viewIds].sort(), offset: open + 1 + idm.index,
        });
      }
    }
  }

  /* client->get( )-viewname was REMOVED from ty_s_get (it always carried an
   * empty string). The read no longer compiles — but nothing in a systemless
   * pipeline says so before activation, the same blindness popover-display-val
   * covers. */
  for (const m of code.matchAll(/->get\s*\(\s*\)-viewname\b/gi)) {
    report({ type: 'get-viewname-removed', member: 'viewname', offset: m.index });
  }

  /* popover_display imports XML, not VAL — the one asymmetry in the display
   * family (popup_display takes val). A `val =` guessed by analogy does not
   * compile, but nothing in a systemless pipeline says so before activation:
   * abaplint has no signature knowledge of z2ui5_if_client, and the render
   * gate never sees the class fail. One of the most common first-try
   * mistakes in generated code (samples-controls hold-out probes 607/613/617). */
  /* The client's popover_display( ) only (an app's own `my_popover_display(
   * val = … )` is no such call), and `val` wherever it stands among the
   * named arguments - the same reading as popup-display-xml. */
  for (const m of clientCalls(code, (method) => method === 'popover_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const val = body === undefined ? null : namedArgMarks(body).find((a) => a.name === 'val');
    if (!val) continue;
    const start = open + 1 + val.nameStart;
    report({
      type: 'popover-display-val', member: 'val', offset: m.index,
      fixes: [{ start, end: start + 3, text: 'xml' }],
    });
  }

  timed(timings, 'pass:lifecycle', () => checkLifecycleDispatch({ src: code, source, report }));

  /* An absolute binding path written as TEXT — `{/PATH}` in a literal, or
   * `path: '/PATH'` in a binding-info string. The runtime only registers what
   * client->_bind( ) was given, so a textual path either addresses nothing
   * (caught as unknown-binding-path) or duplicates a bind that exists — and
   * then silently breaks the moment the attribute is renamed, because no
   * compiler follows a string. Derive it instead: client->_bind( var ), or
   * the bare-path form `_bind( val = var path = abap_true )` interpolated
   * into the binding-info template.
   *
   * Two shapes stay out: an OData ENTITY path with a key predicate
   * (`{/Products('4711')}`) in a class that switches its default model to an
   * OData service — that path addresses the service, not an ABAP variable,
   * so there is nothing to derive it from. And anything between <style> and
   * </style>, where `{/` is a CSS brace meeting a CSS comment, not a path. */
  {
    const odata = /switch_default_model_path/i.test(src);
    const PATH = /\{\/[^}\n]{0,60}\}?|\bpath\s*:\s*'(\/[^'\n]{0,60})'?/g;
    const seen = new Set();
    /* Only a literal that IS a value is judged: the `v = …` of an attribute
     * call (a `&&` chain of literals included) and the rows of a `t_arg =
     * VALUE …( ( … ) )` event argument. Read over the whole source, the rule
     * fired on prose - every one of the 18 corpus findings was a sentence in
     * a documentation class explaining a two-way binding - and the class that
     * paid for it switched the rule off. A path in a comment or a message
     * text binds nothing. */
    /* The fix, for the one shape that is mechanical: a value that IS the
     * literal `{/NAME}` and nothing else, where NAME is a PUBLIC attribute
     * of this class - rewritten to `client->_bind( name )`, which derives
     * the same path. A path with segments, a binding-info string, a
     * literal sharing its value with other text: reported without a fix. */
    const publicNames = new Set(publicAttributes(src).map((a) => a.name.toUpperCase()));
    // the handle of the first `…client->_bind( ` call, `me->` included
    const handle = clientCalls(src, (method) => method === '_bind').next().value?.handle ?? 'client';
    const bindFixFor = (lit) => {
      const whole = lit.text.match(/^([`'])\{\/(\w+)\}\1$/);
      if (!whole || !publicNames.has(whole[2].toUpperCase())) return null;
      return [{ start: lit.at, end: lit.at + lit.text.length, text: `${handle}->_bind( ${whole[2].toLowerCase()} )` }];
    };
    const judge = (literal, at, member, fixes = null) => {
      /* The <style> exemption, kept where the literals are judged: a sheet
       * written as a value (`core:HTML`'s `content`) is CSS, and `\{/* brand
       * *\/` in it is an escaped brace meeting a CSS comment. The same holds
       * for an escaped brace anywhere - `\{/` is never a binding. */
      if (/<style\b/i.test(literal)) return;
      for (const m of literal.matchAll(PATH)) {
        const text = m[0];
        if (text.startsWith('{') && m.index > 0 && literal[m.index - 1] === '\\') continue;
        if (odata && /^(?:\{|path\s*:\s*')\/\w+\([^)]*\)/.test(text)) continue;
        const offset = at + m.index;
        if (seen.has(offset)) continue;
        seen.add(offset);
        report({ type: 'hardcoded-binding-path', member, value: text.slice(0, 40), offset, ...(fixes ? { fixes } : {}) });
      }
    };
    // the literals of a value expression: LIT, or LIT && LIT && …
    const literalsIn = (text, base) => {
      const out = [];
      for (const m of text.matchAll(/`([^`]*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|/g)) {
        out.push({ text: m[0], at: base + m.index });
      }
      return out;
    };
    for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      const marks = namedArgMarks(body);
      const vArg = marks.find((a) => a.name === 'v');
      if (!vArg) continue;
      const nArg = marks.find((a) => a.name === 'n');
      const member = nArg?.value.match(/^[`'|]([\w:]+)[`'|]$/)?.[1];
      // a value that is not a literal chain is derived from something - a
      // variable, a _bind( ) - and nothing textual is hard-coded in it
      if (!/^(?:`[^`]*`|'(?:[^']|'')*'|\|(?:[^|\\]|\\.)*\|)(?:\s*&&\s*(?:`[^`]*`|'(?:[^']|'')*'|\|(?:[^|\\]|\\.)*\|))*$/.test(vArg.value)) continue;
      const lits = literalsIn(vArg.value, open + 1 + vArg.vstart);
      for (const lit of lits) judge(lit.text, lit.at, member, lits.length === 1 ? bindFixFor(lit) : null);
    }
    for (const m of src.matchAll(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/gi)) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      for (const lit of literalsIn(body, open + 1)) judge(lit.text, lit.at, 't_arg');
    }
  }

  /* The other half of the same defect. An escape only survives to the
   * serialized attribute when the backslash is taken verbatim - which is what
   * a `backtick` literal does. Inside a |…| template the backslash is ABAP's
   * own escape: `\{` collapses to a bare `{` before the builder ever sees it,
   * and the view crashes exactly as if nothing had been escaped. Written in a
   * template the form has to be `\\\{`.
   *
   * Invisible to the rule above, which reads the SOURCE and sees a backslash
   * in front of every brace. Only the literal's kind tells the two apart. */
  const templates = literalSegments(src).filter((s) => s.kind === '|');
  for (const open of src.matchAll(STYLE_OPEN)) {
    const from = open.index + open[0].length;
    const to = styleCloseAt(src, from);
    if (to === -1) continue;
    /* One finding per stylesheet, as above — but the fix covers every
     * template segment of the sheet, so one `--fix` pass settles it: each
     * `\{` gains a `\\` in front, the form a template needs to deliver `\{`. */
    let first = null;
    const fixes = [];
    for (const segment of templates) {
      if (segment.end <= from || segment.start >= to) continue;
      const base = Math.max(segment.start, from);
      const text = src.slice(base, Math.min(segment.end, to));
      for (const b of text.matchAll(/(?<!\\)\\[{}]/g)) {
        fixes.push({ start: base + b.index, end: base + b.index, text: '\\\\' });
        first ??= { text, at: b.index, base };
      }
    }
    if (!first) continue;
    report({
      type: 'collapsed-brace-in-style',
      count: fixes.length,
      value: first.text.slice(Math.max(0, first.at - 15), first.at + 25).replace(/\s+/g, ' ').trim(),
      offset: first.base + first.at,
      fixes,
    });
  }

  /* The mirror image of collapsed-brace-in-style, and the one that bit
   * samples-controls app 166. Brace escaping is a |…| TEMPLATE rule: the backslash
   * is ABAP's escape there, so `\{` reaches the builder as a bare `{`. Inside a
   * `backtick` literal there is no escape processing at all - the backslash is
   * taken verbatim and lands in the serialized attribute, where UI5 sees
   * `\{ path: … \}` instead of a binding and either renders the text raw or
   * fails to parse it. A binding written in a backtick literal needs plain
   * braces; only the |…| form needs the escapes.
   *
   * Scoped to attribute VALUES (`v = ` … `n = `), because a backslash-brace in
   * ordinary text (a core:HTML stylesheet built from backticks) is legitimate. */
  for (const m of src.matchAll(/\bv\s*=\s*`([^`]*)`/gi)) {
    const value = m[1];
    const at = value.search(/\\[{}]/);
    if (at === -1) continue;
    /* A stylesheet injected through a core:HTML content attribute escapes its
     * braces for the same parser and is CORRECT in a backtick literal - the
     * backslash has to survive there. Only a value that is itself a BINDING is
     * the defect: it starts with the escaped brace and carries binding syntax
     * (a binding-info object, a model prefix or an expression). */
    if (!/^\s*\\\{/.test(value)) continue;
    if (!/path\s*:|>\/|\{=|\bmodel\s*:/.test(value)) continue;
    /* Mechanically fixable: the correct form is the same literal with plain
     * braces (see the rule doc), so every backslash in front of a brace is
     * simply deleted. A backtick literal has no escape processing, so the
     * deletion cannot change anything else the literal says. */
    const valueStart = m.index + m[0].indexOf('`') + 1;
    const fixes = [...value.matchAll(/\\(?=[{}])/g)]
      .map((b) => ({ start: valueStart + b.index, end: valueStart + b.index + 1, text: '' }));
    report({
      type: 'escaped-brace-in-backtick',
      value: value.slice(Math.max(0, at - 12), at + 28).replace(/\s+/g, ' ').trim(),
      offset: m.index + m[0].indexOf('`') + 1 + at,
      fixes,
    });
  }

  timed(timings, 'pass:guide-rules', () => checkGuideRules(src, source, { code, report, d, boolFields, classIndex }));

  /* How the chain is WRITTEN (lib/chain-layout.mjs). Pushed directly rather
   * than through report( ): those findings are one-per-chain already, and
   * collapsing two chains with the same deviation would drop the second
   * chain's line — the only thing a layout finding has to offer. */
  findings.push(...timed(timings, 'pass:chain-layout', () => checkChainLayout(source, d)));
  /* Opt-in (findings.mjs OPT_IN): not produced at all unless a config asks
   * for it, rather than produced and filtered later. Its fixes span a whole
   * chain, so they would collide with the mechanical fixes of any other rule
   * inside the same chain and defer them to a second --fix run. */
  if (isOptInEnabled(rules, 'chain-house-layout')) findings.push(...timed(timings, 'pass:chain-layout', () => checkChainHouseLayout(source, d)));

  return findings;
}
