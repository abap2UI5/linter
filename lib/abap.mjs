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

/* Where a literal that opens at `text[i]` (a backtick, a quote or a `|`)
 * ends: the index of its closing delimiter, or - when it is not closed - of
 * the line end it runs into (`\r`, `\n` or the end of the text). ABAP
 * literals cannot span lines, so a literal the readers below open by mistake
 * (a `'` in comment text they were handed, a delimiter inside a template's
 * embedded expression) costs one line, never the rest of the file. A
 * template's literal TEXT ends at the line end too; its embedded expressions
 * (`{ … }`) are ABAP code and may run over several lines, and they are read
 * as code: a literal or a nested template in one is skipped whole, a `"`
 * starts a comment to the end of its line. `literalClosed( )` says which of
 * the two an end is. Shared by every reader here, so they agree on where a
 * literal ends. */
const LINE_END = /[\r\n]/g;
const QUOTE_STOP = { '`': /[`\r\n]/g, "'": /['\r\n]/g };
const TEMPLATE_STOP = /[|\\{\r\n]/g;
const EMBED_STOP = /[`'|}"\r\n]/g;
function stopAt(re, text, from) {
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index : text.length;
}
export function literalEnd(text, i) {
  const c = text[i];
  if (c !== '|') return stopAt(QUOTE_STOP[c], text, i + 1);
  /* frames: '|' = a template's text, '{' = an embedded expression */
  const frames = ['|'];
  let j = i + 1;
  while (j < text.length) {
    if (frames[frames.length - 1] === '|') {
      j = stopAt(TEMPLATE_STOP, text, j);
      if (j >= text.length) return j;
      const t = text[j];
      if (t === '\\') { j += text[j + 1] === '\n' || text[j + 1] === '\r' ? 1 : 2; continue; }
      if (t === '{') { frames.push('{'); j++; continue; }
      frames.pop(); // the closing `|`, or the line end the text cannot cross
      if (!frames.length) return j;
      j++;
      continue;
    }
    j = stopAt(EMBED_STOP, text, j);
    if (j >= text.length) return j;
    const t = text[j];
    if (t === '`' || t === "'") { const e = stopAt(QUOTE_STOP[t], text, j + 1); j = text[e] === t ? e + 1 : e; continue; }
    if (t === '|') { frames.push('|'); j++; continue; }
    if (t === '}') { frames.pop(); j++; continue; }
    if (t === '"') { j = stopAt(LINE_END, text, j); continue; }
    j++; // a line break inside the expression
  }
  return text.length;
}
/** Whether the literal opening at `text[i]` ends at `end` (from literalEnd) with its closing delimiter. */
export const literalClosed = (text, i, end) => end < text.length && text[end] === text[i];
/** The offset just after the literal opening at `text[i]`: past its closing delimiter, or at the line end it stopped at. */
export function skipLiteral(text, i) {
  const end = literalEnd(text, i);
  return literalClosed(text, i, end) ? end + 1 : end;
}

/* Remove comments so tokens in comments are never parsed. Comment text is
 * replaced by BLANKS, not dropped: every character keeps its position, so a
 * match index in the scrubbed source is a valid offset into the original
 * file — that is what lets findings carry a line and column.
 *
 * Read line by line, with ONE piece of state carried over a line break: the
 * |…| templates whose embedded expression (`{ … }`) is still open, which is
 * the one construct ABAP lets run over several lines. Inside such an
 * expression a `"` starts a comment like anywhere else in code, and a `|`
 * in a backtick literal there is text - read as a template delimiter, it
 * left the scanner inside a "template" for the rest of the line, a comment
 * behind it was kept, and a `'` in that comment's text (`" don't care`)
 * opened a literal the next readers ran to the end of the file. A UTF-8 BOM
 * in front of the first line is blanked like a comment: it is not a column,
 * so a `*` behind it still starts a comment line. */
const scrubMemo = new Map();
export function scrub(abap) {
  return memoized(scrubMemo, abap, scrubUncached);
}
function scrubUncached(abap) {
  const lines = abap.split('\n');
  const frames = []; // the open templates ('|') and embedded expressions ('{') at the line start
  for (let n = 0; n < lines.length; n++) {
    let line = lines[n];
    let lead = 0;
    if (n === 0 && line.charCodeAt(0) === 0xFEFF) { line = ' ' + line.slice(1); lead = 1; lines[0] = line; }
    if (line[lead] === '*') { lines[n] = ' '.repeat(line.length); continue; }
    /* Every character before the comment is kept as it is, so the line is
     * only SCANNED for where a comment starts and then sliced - and a line
     * outside any template with no `"` and no `|` (most of a class) can
     * neither hold a comment nor open a template. */
    if (!frames.length && !line.includes('"') && !line.includes('|')) continue;
    let i = 0;
    while (i < line.length) {
      const top = frames[frames.length - 1];
      const c = line[i];
      if (top === '|') {
        if (c === '\\') { i += 2; continue; }
        if (c === '|') frames.pop();
        else if (c === '{') frames.push('{');
        i++;
        continue;
      }
      if (c === '`' || c === "'") { i = skipLiteral(line, i); continue; }
      if (c === '|') { frames.push('|'); i++; continue; }
      if (c === '}' && top === '{') { frames.pop(); i++; continue; }
      if (c === '"') { lines[n] = line.slice(0, i) + ' '.repeat(line.length - i); break; } // comment till end of line
      i++;
    }
    // a template's text cannot cross the line break; an open expression can
    while (frames[frames.length - 1] === '|') frames.pop();
  }
  return lines.join('\n');
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
 * literals is copied whole, and a literal's content is blanked as a block -
 * a template's embedded expressions with it, as they always were. Where a
 * literal ends is `literalEnd( )`'s decision: an unclosed one stops at its
 * line end, which is copied like any code. */
const blankText = (s) => (s.includes('\n') ? s.split('\n').map((l) => ' '.repeat(l.length)).join('\n') : ' '.repeat(s.length));
const OPENER = /[`|']/g;
function blankLiteralsUncached(src) {
  const parts = [];
  let from = 0; // start of the run not yet copied
  OPENER.lastIndex = 0;
  for (let m = OPENER.exec(src); m; m = OPENER.exec(src)) {
    const i = m.index;
    const end = literalEnd(src, i);
    parts.push(src.slice(from, i + 1), blankText(src.slice(i + 1, end)));
    // the closing delimiter or the line end starts the next copied run
    from = end;
    OPENER.lastIndex = literalClosed(src, i, end) ? end + 1 : end;
  }
  parts.push(src.slice(from));
  return parts.join('');
}

// balanced-paren region starting at content[open] === '(' — string-aware
export function parenRegion(content, open) {
  let depth = 0;
  for (let i = open; i < content.length; i++) {
    const c = content[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(content, i) - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return { body: content.slice(open + 1, i), end: i };
  }
  return { body: content.slice(open + 1), end: content.length };
}

// split a region on a top-level separator (paren- and string-aware)
export function topSplit(region, sep) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < region.length; i++) {
    const c = region[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(region, i) - 1; continue; }
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
    if (c === '`' || c === "'" || c === '|') STATEMENT_STOP.lastIndex = skipLiteral(src, i);
    else if (c === '(') depth++;
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
  let depth = 0, i = 0;
  while (i < argBody.length) {
    const c = argBody[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(argBody, i); continue; }
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
    const raw = blankPragmas(argBody.slice(marks[k].vstart, end));
    marks[k].value = raw.trim();
    marks[k].vend = marks[k].vstart + raw.trimEnd().length;
    Object.freeze(marks[k]);
  }
  return Object.freeze(marks);
}

/** `text` with every pragma (`##NO_TEXT`, `##NEEDED`) outside a literal
 *  replaced by blanks, offsets kept. A pragma is no part of the value it
 *  follows - `v = \`Bogus\` ##NO_TEXT` passes \`Bogus\` - but read as part of
 *  it, the value was no literal any more and the attribute was dropped from
 *  the reconstructed view, taking every check of it along. */
export function blankPragmas(text) {
  if (!text.includes('##')) return text;
  let out = '';
  let from = 0;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(text, i); continue; }
    if (c === '#' && text[i + 1] === '#') {
      const end = wordEnd(text, i + 2);
      if (end > i + 2) {
        out += text.slice(from, i) + ' '.repeat(end - i);
        from = i = end;
        continue;
      }
    }
    i++;
  }
  return out + text.slice(from);
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
