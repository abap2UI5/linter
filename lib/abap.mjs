/*
 * abap — shared ABAP source parsing primitives.
 *
 * Extracted from abap2UI5/samples-controls scripts/render-smoke.mjs (the corpus
 * render gate), unchanged in behaviour: comment scrubbing and string-aware
 * region/statement splitting for backtick literals and |...| templates.
 */

/* Bounded memo shared by the two source views below. Both are called with the
 * SAME handful of strings many times per file (every rule module derives its
 * view from the same source), so a last-few-entries cache hits
 * deterministically — including when two views interleave, which a size-1
 * memo thrashes on — without pinning whole source copies for the run. */
const MEMO_LIMIT = 4;
function memoized(cache, key, compute, limit = MEMO_LIMIT) {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // refresh recency so an interleaving caller cannot evict the hot entry
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = compute(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}

/* Remove comments so tokens in comments are never parsed. Comment text is
 * replaced by BLANKS, not dropped: every character keeps its position, so a
 * match index in the scrubbed source is a valid offset into the original
 * file — that is what lets findings carry a line and column. */
const scrubMemo = new Map();
export function scrub(abap) {
  return memoized(scrubMemo, abap, scrubUncached);
}
function scrubUncached(abap) {
  return abap.split('\n').map((line) => {
    if (line[0] === '*') return ' '.repeat(line.length);
    /* Every character before the comment is kept as it is, so the line is
     * only SCANNED for where a comment starts and then sliced - and a line
     * with no `"` at all (most of a class) cannot hold one. */
    if (!line.includes('"')) return line;
    let str = null; // '`' | '|' | "'" when inside a literal/template
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (str === '`' || str === "'") {
        if (c === str) str = null; // a doubled delimiter re-enters immediately — harmless
        continue;
      }
      if (str === '|') {
        if (c === '\\') { i++; continue; }
        if (c === '|') str = null;
        continue;
      }
      if (c === '`' || c === '|' || c === "'") { str = c; continue; }
      if (c === '"') return line.slice(0, i) + ' '.repeat(line.length - i); // comment till end of line
    }
    return line;
  }).join('\n');
}

/* The same source with every literal's CONTENT blanked out, delimiters and
 * length kept. `scrub( )` deliberately keeps literals - the value resolver
 * reads them - but a rule looking for STRUCTURE must not: an English sentence
 * in a MessageStrip contains `else`, `if`, `case` and `when` sooner or later,
 * and one of them ended an IF branch four statements early, which reported a
 * correct view as never displayed. Offsets are preserved, so a caller can mix
 * this view with the scrubbed one freely.
 *
 * Memoized on the last few inputs: every rule that needs it calls it with the
 * same scrubbed source, once per file. */
const blankMemo = new Map();
export function blankLiterals(src) {
  return memoized(blankMemo, src, blankLiteralsUncached);
}
/* Built from slices rather than one character at a time: the text between
 * literals is copied whole, and a literal's content is blanked as a block (a
 * template's `\x` escape pair blanks the escaped character whatever it is - a
 * newline included, as the escape consumes it). */
const blankText = (s) => (s.includes('\n') ? s.split('\n').map((l) => ' '.repeat(l.length)).join('\n') : ' '.repeat(s.length));
const blankTemplate = (s) => (s.includes('\\') ? blankText(s.replace(/\\[\s\S]?/g, (e) => ' '.repeat(e.length))) : blankText(s));
const OPENER = /[`|']/g;
const TEMPLATE_STOP = /[|\\]/g;
function blankLiteralsUncached(src) {
  const parts = [];
  let from = 0; // start of the run not yet copied
  OPENER.lastIndex = 0;
  for (let m = OPENER.exec(src); m; m = OPENER.exec(src)) {
    const i = m.index;
    const str = src[i];
    let end;
    if (str === '|') {
      TEMPLATE_STOP.lastIndex = i + 1;
      for (let t = TEMPLATE_STOP.exec(src); ; t = TEMPLATE_STOP.exec(src)) {
        if (!t) { end = src.length; break; }
        if (t[0] === '|') { end = t.index; break; }
        TEMPLATE_STOP.lastIndex = t.index + 2; // an escape pair
      }
    } else {
      end = src.indexOf(str, i + 1);
      if (end < 0) end = src.length;
    }
    const body = src.slice(i + 1, end);
    parts.push(src.slice(from, i + 1), str === '|' ? blankTemplate(body) : blankText(body));
    // the closing delimiter, when there is one, starts the next copied run
    from = end;
    OPENER.lastIndex = end + 1;
  }
  parts.push(src.slice(from));
  return parts.join('');
}

// balanced-paren region starting at content[open] === '(' — string-aware
export function parenRegion(content, open) {
  let depth = 0;
  let str = null;
  for (let i = open; i < content.length; i++) {
    const c = content[i];
    if (str === '`' || str === "'") { if (c === str) str = null; continue; }
    if (str === '|') {
      if (c === '\\') { i++; continue; }
      if (c === '|') str = null;
      continue;
    }
    if (c === '`' || c === '|' || c === "'") { str = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return { body: content.slice(open + 1, i), end: i };
  }
  return { body: content.slice(open + 1), end: content.length };
}

// split a region on a top-level separator (paren- and string-aware)
export function topSplit(region, sep) {
  const parts = [];
  let depth = 0;
  let str = null;
  let start = 0;
  for (let i = 0; i < region.length; i++) {
    const c = region[i];
    if (str === '`' || str === "'") { if (c === str) str = null; continue; }
    if (str === '|') {
      if (c === '\\') { i++; continue; }
      if (c === '|') str = null;
      continue;
    }
    if (c === '`' || c === '|' || c === "'") { str = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && region.startsWith(sep, i)) {
      parts.push(region.slice(start, i));
      start = i + sep.length;
      i += sep.length - 1;
    }
  }
  parts.push(region.slice(start));
  return parts;
}

/* Split an ABAP method body into statements, string- and paren-aware (the
 * terminator '.' inside `…`/|…| strings or ( ) is not a split point). Each
 * statement carries its offset in `src` so findings can be traced back to a
 * line in the file.
 *
 * Memoized like the two views above, and for the same reason at a larger
 * scale: a class is split a dozen times over - by the reconstructor, by
 * every DATA/TYPES/CONSTANTS reader (declarationElements, three parseData
 * calls, two staticAttributes calls of two keywords each) and by the rules -
 * mostly the SAME scrubbed source, which on the samples-controls corpus was
 * 121 MB of splitting for 12 MB of classes, a quarter of a --no-render run.
 * The cache holds sixteen sources, since the per-METHOD bodies the local
 * readers split pass through it between two whole-class calls. The result
 * is shared, so it is frozen: a caller that tried to change it would throw
 * instead of corrupting the next caller's statements. */
const splitMemo = new Map();
export function splitStatements(src) {
  return memoized(splitMemo, src, splitStatementsUncached, 16);
}
const STATEMENT_STOP = /[`|'().]/g;
function splitStatementsUncached(src) {
  /* Jumps from one character that matters to the next (a delimiter, a
   * paren, a dot) instead of visiting all of them: the splitter reads every
   * class several times over, and most of a class is neither. */
  const out = [];
  let depth = 0, start = 0;
  STATEMENT_STOP.lastIndex = 0;
  for (let m = STATEMENT_STOP.exec(src); m; m = STATEMENT_STOP.exec(src)) {
    const i = m.index;
    const c = src[i];
    if (c === '`' || c === "'") {
      const close = src.indexOf(c, i + 1);
      if (close < 0) break;
      STATEMENT_STOP.lastIndex = close + 1;
    } else if (c === '|') {
      TEMPLATE_STOP.lastIndex = i + 1;
      let close = -1;
      for (let t = TEMPLATE_STOP.exec(src); t; t = TEMPLATE_STOP.exec(src)) {
        if (t[0] === '|') { close = t.index; break; }
        TEMPLATE_STOP.lastIndex = t.index + 2; // an escape pair
      }
      if (close < 0) break;
      STATEMENT_STOP.lastIndex = close + 1;
    } else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0) { out.push(Object.freeze({ text: src.slice(start, i), offset: start })); start = i + 1; }
  }
  if (src.slice(start).trim()) out.push(Object.freeze({ text: src.slice(start), offset: start }));
  return Object.freeze(out);
}

/* parse `name = value  name2 = value2` into { name: value }, string- and
 * paren-aware so a `=` inside a `…` value is not a boundary.
 *
 * Two facts about the keys. They are returned LOWER-CASED: ABAP parameter
 * names are case-insensitive, so `VAL = mv_x` names the same parameter as
 * `val = mv_x`, and every consumer reads `args.val`. And a `=` that is the
 * first character of `=>` is not an assignment - `v = zcl_const=>c_true`
 * used to be read as the two arguments `v` (empty) and `zcl_const`, which
 * emptied the value in front of every static attribute access. */
export function parseNamedArgs(argBody) {
  const args = {};
  for (const m of namedArgMarks(argBody)) args[m.name] = m.value;
  return args;
}

/** The same read, with POSITIONS: every top-level `name = value` of an
 *  argument list as { name (lower-cased), nameStart, vstart, vend, value }
 *  with offsets into `argBody`. For a rule that has to rewrite one argument
 *  (unconverted-abap-boolean turns `v =` into `b =`) the name's span is the
 *  fix, and the order the arguments were written in stops mattering. */
const WS = /\s/;
/* Memoized: the same argument list is read by the reconstructor and then by
 * every rule that looks at that call again - on the samples-controls corpus
 * 233,000 reads of 19,000 distinct bodies. Shared, so frozen like the
 * statements above. */
const argMemo = new Map();
export function namedArgMarks(argBody) {
  return memoized(argMemo, argBody, namedArgMarksUncached, 1024);
}
function namedArgMarksUncached(argBody) {
  const marks = [];
  let depth = 0, str = null, i = 0;
  while (i < argBody.length) {
    const c = argBody[i];
    if (str) {
      if ((str === '`' || str === "'") && c === str) str = null;
      else if (str === '|') { if (c === '\\') { i += 2; continue; } if (c === '|') str = null; }
      i++; continue;
    }
    if (c === '`' || c === '|' || c === "'") { str = c; i++; continue; }
    if (c === '(') { depth++; i++; continue; }
    if (c === ')') { depth--; i++; continue; }
    /* `^(\w+)\s*=(?![>=])\s*` at a word that opens the body or follows a
     * blank, read in place: the regex on `argBody.slice(i)` copied the rest
     * of the body at every such position. */
    if (depth === 0 && (i === 0 || WS.test(argBody[i - 1]))) {
      const nameEnd = wordEnd(argBody, i);
      if (nameEnd > i) {
        const eq = skipWs(argBody, nameEnd);
        if (argBody[eq] === '=' && argBody[eq + 1] !== '>' && argBody[eq + 1] !== '=') {
          const vstart = skipWs(argBody, eq + 1);
          marks.push({ name: argBody.slice(i, nameEnd).toLowerCase(), nameStart: i, vstart });
          i = vstart;
          continue;
        }
      }
    }
    i++;
  }
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].nameStart : argBody.length;
    const raw = argBody.slice(marks[k].vstart, end);
    marks[k].value = raw.trim();
    marks[k].vend = marks[k].vstart + raw.trimEnd().length;
    Object.freeze(marks[k]);
  }
  return Object.freeze(marks);
}

/* Linear scanning primitives, for the reads a regex would do polynomially.
 * `\w*client\s*->` and `(\w+)\s+TYPE` restart inside every long word that is
 * not followed by the rest, and a lazy `KEYWORD[\s\S]*?END` rescans the whole
 * rest from each keyword that has no END after it (CodeQL
 * js/polynomial-redos). These visit each character a bounded number of
 * times. Blanks are skipped by hand on purpose: CodeQL does not read the
 * sticky flag, so a `/\s*…/y` probe counts as an unanchored regex and is
 * flagged all the same. */

/** The first offset at or after `i` that is not whitespace (`\s`). */
export function skipWs(text, i) {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/** The end of the word (`\w` run) starting at `i` - `i` itself when there is none. */
export function wordEnd(text, i) {
  while (i < text.length && /\w/.test(text[i])) i++;
  return i;
}

/** The first `major.minor` in `text` as two numbers, or null - what
 *  `/(\d+)\.(\d+)/` matches, read digit run by digit run: that regex starts
 *  again inside every run of digits no `.digit` follows. */
export function majorMinor(text) {
  for (const run of text.matchAll(/\d+/g)) {
    const dot = run.index + run[0].length;
    if (text[dot] !== '.') continue;
    let end = dot + 1;
    while (end < text.length && /\d/.test(text[end])) end++;
    if (end > dot + 1) return [+run[0], +text.slice(dot + 1, end)];
  }
  return null;
}

/** Whether `word` (lower case) stands at `i`, ignoring ASCII case - exactly
 *  what a regex literal under the `i` flag accepts, which folds no non-ASCII
 *  letter onto an ASCII one (the long s, U+017F, is no `s` there). */
export function ciAt(text, i, word) {
  if (i < 0 || i + word.length > text.length) return false;
  for (let k = 0; k < word.length; k++) {
    const c = text.charCodeAt(i + k);
    const w = word.charCodeAt(k);
    if (c !== w && !(w >= 97 && w <= 122 && c === w - 32)) return false;
  }
  return true;
}

/** Every word ending in `client` (any case) followed by `->`, blanks allowed
 *  around the arrow: `{ index, handle, next }` - the word's offset, the handle
 *  as `((?:me->)?\w*client)\s*->` captures it (the word, with a `me->` right
 *  in front of it, even one that ends a longer name) and the first offset
 *  after the arrow's blanks. */
export function* clientArrows(text) {
  for (const w of text.matchAll(/\w+/g)) {
    const word = w[0];
    if (!ciAt(word, word.length - 6, 'client')) continue;
    const arrow = skipWs(text, w.index + word.length);
    if (text[arrow] !== '-' || text[arrow + 1] !== '>') continue;
    const me = ciAt(text, w.index - 4, 'me->') ? text.slice(w.index - 4, w.index) : '';
    yield { index: w.index, handle: me + word, next: skipWs(text, arrow + 2) };
  }
}

/** Every `…client->method( ` call whose method (lower case) `isMethod`
 *  accepts, as the match `/\w*client\s*->\s*(method)\s*\(/gi` returns: `index`
 *  at the word, `[0]` up to and including the paren, `[1]` the method as
 *  written - plus the `handle` clientArrows reads. Calls inside an earlier
 *  match are skipped, as the regex skips them. */
export function* clientCalls(text, isMethod) {
  let last = 0;
  for (const a of clientArrows(text)) {
    if (a.index < last) continue;
    const end = wordEnd(text, a.next);
    if (end === a.next || !isMethod(text.slice(a.next, end).toLowerCase())) continue;
    const paren = skipWs(text, end);
    if (text[paren] !== '(') continue;
    last = paren + 1;
    yield { index: a.index, 0: text.slice(a.index, paren + 1), 1: text.slice(a.next, end), handle: a.handle };
  }
}
