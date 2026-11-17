import { defineRule } from '../rule.mjs';
import { CODE, LIT, STEP, classify, lineStartOf, segmentStarts } from '../chain-layout.mjs';
import { scrub, splitStatements } from '../abap.mjs';

/**
 * The canonical layout of every builder chain in one source, as fixes.
 *
 * `d` is the builder dialect, so the verbs are read the same way the rest of
 * the linter reads them.
 */
export
function check({ d, source, report }) {
  const src = source;
  const mask = classify(src);
  const scrubbed = scrub(source);
  const kindRe = new RegExp(`^\\)->\\s*${d.verbs}\\s*\\(`, 'i');
  const anyVerbRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`, 'i');

  for (const stmt of splitStatements(scrubbed)) {
    const lo0 = stmt.offset;
    const hi = stmt.offset + stmt.text.length;
    if (!anyVerbRe.test(stmt.text)) continue;

    let lo = lo0;
    while (lo < hi && ' \t\r\n'.includes(src[lo])) lo++;
    const pts = segmentStarts(src, mask, lo, hi);
    if (!pts.length) continue;

    // the statement has to start its own line, or there is no base column
    const anchorLine = lineStartOf(src, lo);
    if (src.slice(anchorLine, lo).trim()) continue;
    if (src.slice(anchorLine, lo).includes('\t')) continue;
    const base = src.slice(anchorLine, lo).length;

    // a chain written entirely on one line is a deliberate compact form
    if (lineStartOf(src, pts[pts.length - 1]) === anchorLine) continue;

    const roleAt = (at, end) => {
      const m = kindRe.exec(src.slice(at, end));
      return m ? d.kindOf(m[1]) : 'other';
    };
    const headRole = (() => {
      const ms = [...src.slice(lo, pts[0]).matchAll(new RegExp(`(?:->|=>)\\s*${d.verbs}\\s*\\(`, 'gi'))];
      return ms.length ? d.kindOf(ms[ms.length - 1][1]) : 'other';
    })();

    const open = headRole === 'open' ? [base] : [];
    let attrCol = base + STEP;
    const fixes = [];

    for (const [k, p] of pts.entries()) {
      const role = roleAt(p, k + 1 < pts.length ? pts[k + 1] : hi);
      const childCol = open.length ? open[open.length - 1] + STEP : base + STEP;
      let col;
      if (role === 'att') col = attrCol;
      else if (role === 'open') { col = childCol; open.push(col); attrCol = col + STEP; }
      else if (role === 'leaf') { col = childCol; attrCol = col + STEP; }
      else if (role === 'shut') {
        col = open.length ? open.pop() : Math.max(base, childCol - STEP);
        attrCol = open.length ? open[open.length - 1] + STEP : base + STEP;
      } else col = childCol;

      // the whitespace run in front of the segment: blank lines are kept, the
      // indent is restated. A comment in front of it is not whitespace and so
      // is never swallowed.
      let gs = p;
      while (gs > 0 && ' \t\r\n'.includes(src[gs - 1]) && mask[gs - 1] === CODE) gs--;
      const gap = src.slice(gs, p);
      if (gap.includes('\t')) continue;
      // a CRLF gap keeps its CRLF: compared as LF it never matched, so a
      // CRLF chain in the house layout was reported (and rewritten) forever
      const eol = gap.includes('\r\n') ? '\r\n' : '\n';
      const want = eol.repeat(Math.max(1, (gap.match(/\n/g) || []).length)) + ' '.repeat(col);
      if (gap !== want) fixes.push({ start: gs, end: p, text: want });

      // the segment's own continuation lines move with it
      const segEnd = k + 1 < pts.length ? pts[k + 1] : hi;
      const delta = col - (p - lineStartOf(src, p));
      if (delta !== 0) {
        for (let i = src.indexOf('\n', p); i !== -1 && i < segEnd; i = src.indexOf('\n', i + 1)) {
          const from = i + 1;
          const lead = /^[ \t]*/.exec(src.slice(from, segEnd))[0].length;
          if (from + lead >= segEnd) continue;                      // blank line
          if (src[from + lead] === '\n' || src[from + lead] === '\r') continue;
          if (src.slice(from, from + lead).includes('\t')) continue;
          if (mask[from + lead] === LIT) continue;                  // indent is content
          /* a comment line keeps its column: a `*` is a comment only in
           * column 1, so indenting it turned the comment into a syntax
           * error the class no longer activates with - and a `"` comment's
           * indent is the author's, not the chain's */
          if (mask[from + lead] !== CODE || src[from] === '*') continue;
          let movable = true;
          for (let j = 0; j < lead; j++) if (mask[from + j] !== CODE) movable = false;
          if (!movable) continue;
          fixes.push({ start: from, end: from + lead, text: ' '.repeat(Math.max(0, lead + delta)) });
        }
      }
    }

    if (fixes.length) {
      report({
        count: fixes.length,
        offset: pts.find((p) => fixes.some((f) => f.start <= p && p <= f.end + 1)) ?? pts[0],
        fixes,
      });
    }
  }
}

export default defineRule({
  id: 'chain-house-layout',
  severity: 'hint',
  category: 'layout',
  scope: 'app',
  optIn: true,
  fixable: true,
  message: (f) => `this chain is not in the house layout — ${f.count} line(s) differ (one call per line including attributes, 4 spaces per level of the tree, the closing call in the column of the element it closes); \`--fix\` rewrites it`,
  check,
});
