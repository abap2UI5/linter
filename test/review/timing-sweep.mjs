/*
 * Every rule, grown three ways, has to stay linear. See test/review/README.md
 * for the harness and test/timing.mjs for how a speed question is asked.
 *
 * The earlier rounds found their quadratic readers one at a time, each from a
 * corpus file or a fuzz script that happened to have the shape: a long token,
 * a block of commented-out lines, thousands of attributes. This sweep asks
 * the question of EVERY rule at once. Its base is the rule's own card - the
 * example the rules page wraps into a class and verifies fires the rule
 * (playgroundSource( ) in scripts/generate-rules-page.mjs) - grown around the
 * line the rule reports, in nine shapes of three kinds:
 *
 *   long line   blanks in the code, a long literal, a long trailing comment
 *   line block  comment and blank lines, distinct declarations, the
 *               reported statement repeated, the rule's method copied (n
 *               documents)
 *   nesting     the method body in nested IFs, the view in nested VBoxes
 *
 * Every case is screened with one run at n and 4n; a case the screen does
 * not pass is asked again with scalesLinearly( )'s best of three before it
 * fails the section. The sizes are what a suite run can afford, on one
 * worker per core; at four times them the same sweep found a class of many
 * views quadratic in the unused-namespace stand-down and a class of many
 * unclosed calls quadratic in every rule that reads an argument list, which
 * at these sizes are still mostly linear work - round-2026-10-09b.mjs asks
 * those two with shapes of their own. At these sizes it found the third:
 * a write reader's `\s*\)?\s*` splitting a long blank run every way.
 */
import os from 'node:os';
import { Worker, isMainThread, workerData, parentPort } from 'node:worker_threads';
import { screenedLinearly } from '../timing.mjs';
import { RULES, OPT_IN } from '../../lib/findings.mjs';
import { playgroundSource } from '../../scripts/generate-rules-page.mjs';

/* where blanks can be added to a line without touching a literal or a comment */
function codeBlank(line) {
  let quote = null;
  for (let i = line.search(/\S/); i >= 0 && i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '`' || c === "'" || c === '|') { quote = c; continue; }
    if (c === '"') return -1;
    if (c === ' ') return i;
  }
  return -1;
}
const methodAround = (lines, at) => {
  let start = -1;
  let end = -1;
  for (let i = at; i >= 0; i--) if (/^\s*METHOD\b/i.test(lines[i])) { start = i; break; }
  for (let i = at; i < lines.length; i++) if (/^\s*ENDMETHOD\b/i.test(lines[i])) { end = i; break; }
  return start < 0 || end < 0 ? null : { start, end };
};

/* the code of a line, without a trailing comment */
function codeOf(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '`' || c === "'" || c === '|') { quote = c; continue; }
    if (c === '"') return line.slice(0, i);
  }
  return /^\*/.test(line) ? '' : line;
}
const ends = (line) => /\.\s*$/.test(codeOf(line));

/* name -> { n, grow }: `grow(lines, at, n)` puts n units of the shape around
 * line `at` (null where the shape does not fit the card), and `n` is the
 * small size - chosen per shape so the linear big run (4n) costs tens of
 * milliseconds, which leaves a quadratic one seconds */
export const SHAPES = {
  'long line: blanks in the code': { n: 8000, grow: (lines, at, n) => {
    const i = codeBlank(lines[at]);
    if (i < 0) return null;
    const c = lines.slice();
    c[at] = c[at].slice(0, i) + ' '.repeat(n) + c[at].slice(i);
    return c;
  } },
  'long line: a long literal': { n: 2000, grow: (lines, at, n) => {
    const m = lines[at].match(/`[^`]*`/);
    if (!m) return null;
    const c = lines.slice();
    const i = m.index + m[0].length - 1;
    c[at] = c[at].slice(0, i) + 'ab-c '.repeat(n) + c[at].slice(i);
    return c;
  } },
  'long line: a trailing comment': { n: 2000, grow: (lines, at, n) => {
    if (lines[at].includes('"')) return null;
    const c = lines.slice();
    c[at] = `${c[at]} " ${'x( `a` ). '.repeat(n)}`;
    return c;
  } },
  'line block: comment and blank lines': { n: 2000, grow: (lines, at, n) => {
    const c = lines.slice();
    c.splice(at, 0, ...Array.from({ length: n }, (_, i) => (i % 2 ? '' : `    " filler ${i} \`x\` view->a( n = \`f\` ).`)));
    return c;
  } },
  'line block: distinct declarations': { n: 400, grow: (lines, at, n) => {
    const m = methodAround(lines, at);
    if (!m) return null;
    const c = lines.slice();
    c.splice(m.start + 1, 0, ...Array.from({ length: n }, (_, i) => `    DATA(lv_fill_${i}) = |x{ ${i} }|.`));
    return c;
  } },
  'line block: the statement repeated': { n: 100, grow: (lines, at, n) => {
    const m = methodAround(lines, at);
    if (!m || at <= m.start || at >= m.end) return null;
    let first = at;
    while (first - 1 > m.start && !ends(lines[first - 1])) first--;
    let last = at;
    while (last < m.end - 1 && !ends(lines[last])) last++;
    const statement = lines.slice(first, last + 1);
    /* a statement that opens a block, repeated, is n levels of nesting - an
     * IF never closed nests everything after it - which the nesting shapes
     * ask at a depth code has */
    if (/^\s*(?:IF|LOOP|CASE|DO|WHILE|TRY)\b/i.test(statement[0])) return null;
    const c = lines.slice();
    c.splice(last + 1, 0, ...Array.from({ length: n }, () => statement).flat());
    return c;
  } },
  'line block: the method copied': { n: 10, grow: (lines, at, n) => {
    const m = methodAround(lines, at);
    const pub = lines.findIndex((l) => /^\s*PUBLIC\s+SECTION\s*\./i.test(l));
    if (!m || pub < 0) return null;
    const body = lines.slice(m.start + 1, m.end + 1);
    const c = lines.slice();
    c.splice(m.end + 1, 0, ...Array.from({ length: n }, (_, i) => [`  METHOD fuzz_${i}.`, ...body]).flat());
    c.splice(pub + 1, 0, ...Array.from({ length: n }, (_, i) => `    METHODS fuzz_${i}.`));
    return c;
  } },
  'nesting: IF blocks': { n: 100, grow: (lines, at, n) => {
    const m = methodAround(lines, at);
    if (!m) return null;
    return [...lines.slice(0, m.start + 1), ...Array(n).fill('    IF client IS BOUND.'),
      ...lines.slice(m.start + 1, m.end), ...Array(n).fill('    ENDIF.'), ...lines.slice(m.end)];
  } },
  'nesting: the view in VBoxes': { n: 75, grow: (lines, at, n) => {
    const page = lines.findIndex((l) => /^\s*\)->ele\( `Page` \)\.$/.test(l));
    if (page < 0) return null;
    const c = lines.slice();
    c[page] = `${c[page].replace(/\.$/, '')}\n${Array(n).fill('    )->ele( `VBox`').join('\n')} ).`;
    return c;
  } },
};

/* the same three kinds for a raw view. Nesting stays at a few hundred
 * levels: the property walk recurses per level and runs out of stack at
 * about a thousand, which is a limit of its own and not a question of
 * growth (an unclosed tag nests everything after it, so it counts double). */
const XML_SHAPES = {
  'long line: a long attribute': { n: 4000, make: (n) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Text text="${'ab {c} '.repeat(n)}"/></mvc:View>` },
  'line block: sibling elements': { n: 500, make: (n) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">\n${
    Array.from({ length: n }, (_, i) => `  <Button id="b${i}" text="{/T_${i}}" press=".on${i}"/>`).join('\n')}\n</mvc:View>` },
  'line block: unclosed elements': { n: 25, make: (n) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">\n${'  <VBox><Text text="x">\n'.repeat(n)}</mvc:View>` },
  'nesting: elements': { n: 50, make: (n) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">${'<VBox>'.repeat(n)}<Text text="{/X}"/>${'</VBox>'.repeat(n)}</mvc:View>` },
};

/* One worker's share of the sweep: every shape of the cards it was handed.
 * Run in a worker, with the checks imported from lib/ directly - the sweep
 * asks about time, not about which rules fired, so it needs no observer. */
export async function sweep(ids) {
  const { checkAbapSource } = await import('../../lib/index.mjs');
  const results = [];
  for (const id of ids) {
    const file = playgroundSource(id);
    const opts = { render: false, file: file.name, rules: OPT_IN.has(id) ? { [id]: 'warning' } : {} };
    const lines = file.source.split('\n');
    const hit = checkAbapSource(file.source, opts).findings.find((f) => f.type === id);
    /* the reported line; for a card the frame cannot carry (UNWRAPPABLE in
     * test/run.mjs) the last statement of its first method */
    const at = hit && lines[hit.line - 1] !== undefined ? hit.line - 1
      : lines.findIndex((l) => /^\s*ENDMETHOD\b/i.test(l)) - 1;
    if (at < 0) continue;
    for (const [shape, { n, grow }] of Object.entries(SHAPES)) {
      if (!grow(lines, at, n)) continue;
      const r = screenedLinearly((k) => grow(lines, at, k).join('\n'), (src) => checkAbapSource(src, opts), n);
      results.push({ id, shape, ...r });
    }
  }
  return results;
}
if (!isMainThread && workerData?.timingSweep) parentPort.postMessage(await sweep(workerData.timingSweep));

export default function ({ section, assert, checkXmlSource }) {
  /* The cards are dealt round-robin to one worker per core (at most four):
   * the cases are independent, a section runs alone, and on one thread the
   * sweep took most of a minute. Each case is still timed on one thread
   * against itself, which is all scalesLinearly( ) compares. */
  section('timing sweep: every rule\'s card, grown three ways, stays linear', async () => {
    const workers = Math.max(1, Math.min(4, os.availableParallelism()));
    const hands = Array.from({ length: workers }, (_, w) => RULES.filter((_, i) => i % workers === w));
    const results = (await Promise.all(hands.map((ids) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { timingSweep: ids } });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => code && reject(new Error(`sweep worker exited with ${code}`)));
    })))).flat();
    const slow = results.filter((r) => !r.ok).map((r) => `${r.id} / ${r.shape}: ${r.small} ms -> ${r.big} ms`);
    assert(results.length > 8 * 100, `the sweep reaches the cards (${results.length} cases)`);
    assert(slow.length === 0, `every case grows linearly (super-linear: ${slow.join('; ') || 'none'})`);
  });

  section('timing sweep: a raw view, grown three ways, stays linear', () => {
    const slow = [];
    for (const [shape, { n, make }] of Object.entries(XML_SHAPES)) {
      const r = screenedLinearly(make, (xml) => checkXmlSource(xml, { render: false }), n);
      if (!r.ok) slow.push(`${shape}: ${r.small} ms -> ${r.big} ms`);
    }
    assert(slow.length === 0, `every raw-view shape grows linearly (super-linear: ${slow.join('; ') || 'none'})`);
  });
}
