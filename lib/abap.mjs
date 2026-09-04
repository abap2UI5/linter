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
function memoized(cache, key, compute) {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // refresh recency so an interleaving caller cannot evict the hot entry
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const value = compute(key);
  cache.set(key, value);
  if (cache.size > MEMO_LIMIT) cache.delete(cache.keys().next().value);
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
    if (/^\*/.test(line)) return ' '.repeat(line.length);
    let out = '';
    let str = null; // '`' | '|' | "'" when inside a literal/template
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (str === '`' || str === "'") {
        out += c;
        if (c === str) str = null; // a doubled delimiter re-enters immediately — harmless
        continue;
      }
      if (str === '|') {
        out += c;
        if (c === '\\') { out += line[++i] ?? ''; continue; }
        if (c === '|') str = null;
        continue;
      }
      if (c === '`' || c === '|' || c === "'") { str = c; out += c; continue; }
      if (c === '"') { out += ' '.repeat(line.length - i); break; } // comment till end of line
      out += c;
    }
    return out;
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
function blankLiteralsUncached(src) {
  let out = '';
  let str = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (str === '|' && c === '\\') { out += '  '; i++; continue; }
      if (c === str) { out += c; str = null; continue; }
      out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === '`' || c === '|' || c === "'") { str = c; out += c; continue; }
    out += c;
  }
  return out;
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
 * line in the file. */
export function splitStatements(src) {
  const out = [];
  let depth = 0, str = null, start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (str === '`' || str === "'") { if (c === str) str = null; continue; }
    if (str === '|') { if (c === '\\') { i++; continue; } if (c === '|') str = null; continue; }
    if (c === '`' || c === '|' || c === "'") { str = c; continue; }
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '.' && depth === 0) { out.push({ text: src.slice(start, i), offset: start }); start = i + 1; }
  }
  if (src.slice(start).trim()) out.push({ text: src.slice(start), offset: start });
  return out;
}

// parse `name = value  name2 = value2` into { name: value }, string- and
// paren-aware so a `=` inside a `…` value is not a boundary
export function parseNamedArgs(argBody) {
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
    if (depth === 0 && (i === 0 || /\s/.test(argBody[i - 1]))) {
      const mm = argBody.slice(i).match(/^(\w+)\s*=\s*/);
      if (mm) { marks.push({ name: mm[1], nameStart: i, vstart: i + mm[0].length }); i += mm[0].length; continue; }
    }
    i++;
  }
  const args = {};
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].nameStart : argBody.length;
    args[marks[k].name] = argBody.slice(marks[k].vstart, end).trim();
  }
  return args;
}
