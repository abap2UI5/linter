/*
 * abap-helpers — readers of ABAP text that several rules share.
 *
 * Moved out of abap-rules.mjs so that a rule written as one unit
 * (lib/rules/) can use them: abap-rules.mjs imports the rule registry, so a
 * rule importing it would be a cycle. Nothing here reports a finding, and
 * nothing here imports a registry (findings, rule-docs, fix, abap-rules) -
 * test/review/rule-units.mjs holds that line.
 */
import { blankLiterals, literalEnd, parenRegion, namedArgMarks, skipWs, topRows, topAssigned } from './abap.mjs';
import { declarationElements } from './reconstruct.mjs';
import { methodSpans } from './abap-source.mjs';

/** Every string literal in the source with its kind: a backtick literal takes
 *  a backslash verbatim, a |…| template reads it as an escape. That is the
 *  whole difference between CSS that renders and CSS that kills the view. */
let segmentsMemo = { src: null, segments: null };

export function literalSegments(abap) {
  // three rules ask for the segments of the same source, once per file
  if (segmentsMemo.src !== abap) segmentsMemo = { src: abap, segments: Object.freeze(literalSegmentsUncached(abap)) };
  return segmentsMemo.segments;
}

/** A membership test over segments in source order (literalSegments( ) yields
 *  them sorted and disjoint): whether offset `at` lies inside one, by binary
 *  search - a rule asking it for every match of a whole class used to scan
 *  every literal each time. */
export function insideSegments(segments) {
  return (at) => {
    let lo = 0, hi = segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = segments[mid];
      if (at < s.start) hi = mid - 1;
      else if (at >= s.end) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

function literalSegmentsUncached(abap) {
  const segments = [];
  let kind = null;
  let start = 0;
  for (let i = 0; i < abap.length; i++) {
    const c = abap[i];
    if (kind === '`' || kind === "'") {
      // a text field literal ('…') is a literal like the backtick one: text,
      // not code - it used to be invisible here, so a name written in one was
      // judged as a call while the same name in backticks was prose
      if (c === kind) { segments.push({ kind, start, end: i }); kind = null; }
    } else if (kind === '|') {
      if (c === '\\') i++;
      else if (c === '|') { segments.push({ kind, start, end: i }); kind = null; }
    } else if (c === '`' || c === '|' || c === "'") {
      kind = c;
      start = i + 1;
    }
  }
  return segments;
}

/** The names the class declares as CONSTANTS or CLASS-DATA, anywhere in the
 *  source, each mapped to the keyword that declared it. Neither is instance
 *  state: the framework's attribute search (`attri_search` in
 *  z2ui5_cl_ui5_srv_model) filters on `is_class = abap_false AND is_constant
 *  = abap_false`, so a bind on one of these finds no attribute and raises
 *  BINDING_ERROR — and a constant is a literal to every rule that asks where
 *  a value comes from. A structured constant registers under the name after
 *  `BEGIN OF`, since a component travels with its root. */
export function staticAttributes(src) {
  const kinds = new Map();
  for (const keyword of ['CONSTANTS', 'CLASS-DATA']) {
    for (const el of declarationElements(src, new RegExp(`^${keyword}$`, 'i'))) {
      const n = el.match(/^(?:BEGIN\s+OF\s+)?(\w+)/i);
      if (n) kinds.set(n[1].toUpperCase(), keyword);
    }
  }
  return kinds;
}

export const isCall = (code, index, head) => code.slice(index, index + head.length).toLowerCase() === head.toLowerCase();

/** Every raised event literal AS WRITTEN, with the span of the name inside
 *  its quotes — what a spelling rule compares and what a fix rewrites. */
export function raisedEventLiterals(src) {
  const code = blankLiterals(src);
  const out = [];
  for (const m of src.matchAll(/client->_event(?:_client)?\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (!isCall(code, m.index, 'client->')) continue;
    out.push({ name: m[1], offset: m.index, at: m.index + m[0].length - 1 - m[1].length });
  }
  return out;
}

/* `_bind( val = x path = abap_true )` - the PATH form spelled through the
 * flag. `_bind_path( x )` is the same call byte for byte (z2ui5_if_client:
 * "it delegates rather than repeat the call, so the two can never drift
 * apart") and exists because the flag reads like nothing: a named val and a
 * boolean whose meaning a reader has to know. Judged only where the call
 * passes exactly those two arguments - with a third one (json, tab,
 * switch_default_model, ...) `_bind( )` is the right call and the flag stays.
 * A call that is the whole `v =` value of an attribute is bind-path-as-value's
 * (a bare path there is no binding at all), and is left to that rule. */
/* The source with every literal blanked EXCEPT the embedded expressions of a
 * string template: `|{ client->_bind( … ) }|` is a call, and blankLiterals( )
 * blanks a template whole, embeds included. Offsets are kept. */
export function codeWithEmbeds(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const quoted = (i) => { const e = literalEnd(src, i); blank(i + 1, e); return e + 1; };
  const embed = (j) => {
    while (j < src.length) {
      const t = src[j];
      if (t === '`' || t === "'") { j = quoted(j); continue; }
      if (t === '|') { j = template(j); continue; }
      if (t === '}') return j + 1;
      j++;
    }
    return j;
  };
  const template = (i) => {
    let j = i + 1;
    let from = j;
    while (j < src.length) {
      const t = src[j];
      if (t === '\\') { j += 2; continue; }
      if (t === '{') { blank(from, j); j = embed(j + 1); from = j; continue; }
      if (t === '|' || t === '\n') { blank(from, j); return t === '|' ? j + 1 : j; }
      j++;
    }
    blank(from, j);
    return j;
  };
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '`' || c === "'") { i = quoted(i); continue; }
    if (c === '|') { i = template(i); continue; }
    i++;
  }
  return out.join('');
}

/* The marks of BINDING VOCABULARY in a value or in the statement that
 * assigns it: an escaped brace (a binding or an expression written as text
 * for the view), a `${…}` expression-binding reference, a bind or event call,
 * a wire, an already-escaped literal, or a backslash of any kind (an escape
 * the author placed on purpose). A value that shows one of these is what `v`
 * is FOR and never a finding. */
export const BINDING_VOCAB = /\\|\$\{|\{=|_bind\w*\s*\(|_event\w*\s*\(|follow_up_action\s*\(|escape_literal\s*\(/i;

/* a name a value can be: `mv_x`, `me->mv_x`, `ls_row-field`, `lr_row->field`,
 * `<fs>-field` - one token, no call, no operator */
export const DATA_NAME = /^(?:me->)?(?:<\w+>|\w+)(?:(?:-|->)\w+)*$/;

/* The property types text can never be SHOWN in: a number, a boolean, a CSS
 * size or colour, an id, an enum. A brace in such a value is not a binding
 * mistaken for text, it is a value the property refuses on its own terms,
 * and `t =` would not make it valid either - so the rule stands down where
 * the metadata says the attribute is one of these. A URI is one of them: it
 * is loaded or navigated, never shown, and a brace in it is not text that
 * went missing but a target that was never a URL. */
export const NON_TEXT_TYPE = /^(?:int|float|boolean|sap\.ui\.core\.(?:CSSSize|CSSSizeShortHand|CSSColor|ID|Percentage|URI))(?:\[\])?$/;

export const VERBATIM_ATTRIBUTE = /^(?:id|class)$/;

/** A CASE whose subject is the event - `CASE client->get_event( ).` or the
 *  struct read `CASE client->get( )-event.` - up to its first ENDCASE. */
/** Every CASE whose subject is the event - `CASE client->get_event( ).` or
 *  the struct read `CASE client->get( )-event.` - as a region from its header
 *  to ITS OWN ENDCASE, nested CASE … ENDCASE blocks counted through. `owns(i)`
 *  says whether offset i is at the event CASE's own level, i.e. not inside a
 *  CASE nested in it (a status switch in one handler is not the dispatcher).
 *  `body` is the text at that level, nested blocks blanked. */
export const EVENT_READ = /get_event\s*\(\s*\)|get\s*\(\s*\)-event/i;

export function eventCaseRegions(src) {
  return caseRegions(src, (code) => keywordStatements(code, /\bCASE\b/gi), (header) => EVENT_READ.test(header));
}

/** Each `keyword` match with the statement text up to the next period, as a
 *  match-shaped object (`index`, `[0]` keyword to period, `[1]` after the
 *  keyword). Found with indexOf and the period cached across keywords: a
 *  `KEYWORD[^.]*\.` regex rescans the whole rest from every keyword when no
 *  period follows, and a lazy run before a test and a greedy one after it
 *  backtrack polynomially over a long header (CodeQL js/polynomial-redos). */
export function* keywordStatements(text, keyword) {
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
export function caseRegions(src, head, accept) {
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
export function eventDispatchRegions(src) {
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
export function moveDeclarationFix(source, src, name, target) {
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
export const STYLE_OPEN = /<style\b[^>]*>/gi;

export const styleCloseAt = (text, from) => {
  const at = text.slice(from).search(/<\/style>/i);
  return at === -1 ? -1 : from + at;
};

/* The parameters abap2UI5#2748 took off the two message methods - pure UI5
 * options, which travel as the CONTROL_GLOBAL option object now. Lower-case,
 * as namedArgMarks( ) yields them. */
export const MESSAGE_BOX_REMOVED = ['textdirection', 'icon', 'closeonnavigation', 'dependenton', 'contentwidth'];

export const MESSAGE_TOAST_REMOVED = ['width', 'my', 'at', 'of', 'offset', 'collision', 'autoclose', 'animationtimingfunction', 'animationduration', 'closeonbrowsernavigation', 'class'];

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
export const collapseInlineStructures = (text) => {
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
export function sectionDataNames(section, chainOnly) {
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
export function publicAttributes(src) {
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
export function boundVocabulary(src, impl) {
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

/** The PUBLIC SECTION's INSTANCE data — `DATA` only, `CLASS-DATA` is not
 *  serialized with the object — each with whether it is a `TYPE REF TO`.
 *  Read off the same block walk as publicAttributes( ); the reference flag
 *  comes from the declaration's own text. */
export function publicInstanceAttributes(src) {
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
export function privateInstanceAttributes(src) {
  const section = src.match(/\bPRIVATE\s+SECTION\s*\.([\s\S]*?)(?=\bENDCLASS\b)/i);
  if (!section) return [];
  // chainOnly: CLASS-DATA is excluded here (see the doc block above), so the
  // block head is the bare DATA rather than the optional-CLASS- one
  return sectionDataNames(section, true);
}

/** Every handler site, AS WRITTEN and with where it stands: the spellings a
 *  raised literal is held against, letter for letter, because the runtime
 *  compares them so — and the offsets the inverse rule reports at. */
export function handledEventSites(src) {
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
export function handledEventLiterals(src) {
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
export function omitInitialPathLists(src) {
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

/* What the row literals of a class say, read once per source for the two
 * rules that judge them (enum-field-unset-on-insert,
 * absent-boolean-overrides-default): the fields omit_initial_paths leaves
 * out, the fields filled AFTER a constructor (per table), every table
 * constructor with its usable rows, and every row a table receives - a row
 * of a table constructor, an INSERT/APPEND of an inline row, an INSERT of a
 * work area built above it. `omitInitial` is a class that serializes with
 * omit_initial = abap_true, where neither rule has anything to say. */
export const ROW_FACTS = { src: null, facts: null };

export function rowLiteralFacts(src) {
  if (ROW_FACTS.src === src) return ROW_FACTS.facts;
  const facts = readRowLiterals(src);
  ROW_FACTS.src = src; ROW_FACTS.facts = facts;
  return facts;
}

export function readRowLiterals(src) {
  const omitted = new Set();
  const tables = []; // every table constructor: its name, where it opens, its rows
  const rowSites = []; // every row this pass judges: { table, body, offset, carried }
  for (const list of omitInitialPathLists(src)) {
    for (const f of list.matchAll(/[`'|]\s*([A-Za-z_][\w/]*)\s*[`'|]/g)) {
      omitted.add(f[1].split('/').pop().toUpperCase());
    }
  }
  if (/omit_initial\s*=\s*abap_true/i.test(src)) return { omitInitial: true };

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

      tables.push({ key, open, usable, carried });
      for (const r of usable) rowSites.push({ table: key, body: r.body, offset: open + 1 + r.offset, carried });
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
    rowSites.push({ table: target[1], body, offset: m.index });
  }

  /* INSERT/APPEND of a WORK AREA built by a VALUE constructor above it. The
   * row is the same row; only the statement it is written in differs. A field
   * filled afterwards (`appointment-aria = …`) counts as set. */
  for (const m of s.matchAll(/\b(?:INSERT|APPEND)\s+(\w+)\s+(?:INTO\s+TABLE|TO)\s+(?:<\w+>-|\w+-)*(\w+)/gi)) {
    const wa = workAreas.get(m[1].toUpperCase());
    if (!wa) continue;
    const filled = [...s.matchAll(new RegExp(`\\b${m[1]}-(\\w+)\\s*=(?!=)`, 'gi'))]
      .map((f) => f[1].toUpperCase());
    rowSites.push({ table: m[2], body: `${wa.body} ${filled.map((f) => `${f} =`).join(' ')}`, offset: wa.offset });
  }
  return { omitInitial: false, omitted, filledAfter, tables, rows: rowSites };
}

export function countElements(body) {
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

/* What every backend `client->_event( )` of a class sends, read once per
 * source for the four rules that judge it (event-arg-unresolved,
 * event-arg-single-row-table, trailing-empty-event-arg,
 * event-arg-out-of-range): per call its argument list as written - the
 * `arg =` shorthand and the `t_arg = VALUE #( … )` table, with their
 * positions - and per event name how many arguments it sends. */
export const EVENT_CALLS = { src: null, facts: null };

export function backendEventCalls(src) {
  if (EVENT_CALLS.src === src) return EVENT_CALLS.facts;
  /* How many t_arg values each event actually sends, by name - the arity
   * get_event_arg( ) is read against below. The maximum wins when one name is
   * raised from several places: the reader is right as long as ANY raise site
   * sends that many. */
  const arity = new Map();
  const calls = [];
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

    const call = { evOpen, evBody, argSupplied, argLit, tm };
    if (tm) {
      call.open = evBody.indexOf('(', tm.index + tm[0].length - 1);
      call.region = parenRegion(evBody, call.open);
      call.body = call.region.body;
      // body[i] is src[argBase + i]: the one base every offset and fix of the
      // rules is computed from
      call.argBase = evOpen + call.open + 2;
    }
    calls.push(call);
  }
  EVENT_CALLS.src = src; EVENT_CALLS.facts = { calls, arity };
  return EVENT_CALLS.facts;
}

/** Top-level `( … )` elements of a VALUE #( ) region - string-aware, so a
 *  bracket inside a literal never opens an element. */
/** The span of the FIRST `( … )` element of a VALUE body — `open` is the
 *  row's own paren, `end` its closing one, both indices into `body`. Skips
 *  literals exactly as countElements does, so the two agree on what a row is
 *  and a rule can count rows and then address the one it found. */
export function firstElement(body) {
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

/* Where a handler for a named event begins: the three literal forms a class
 * dispatches with. A `get_event_arg( )` after one of them is read in that
 * event's handler - the nearest preceding marker wins.
 *
 * ENDMETHOD is a marker too, with no event: dispatch does not survive a
 * method boundary, and without that barrier a `get_event_arg( )` in some
 * later view-building method inherits the last WHEN of the handler method.
 * (Both of those were real false positives on the samples-controls corpus.) */
export function eventScopes(src) {
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
