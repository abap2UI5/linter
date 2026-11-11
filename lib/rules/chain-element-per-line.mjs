import { defineRule } from '../rule.mjs';
import { lineStartOf } from '../chain-layout.mjs';

/* Several ELEMENTS on one line of an otherwise multi-line chain. Each of them
 * is a level of the tree that the indentation can no longer show.
 *
 * Only element calls count, and that distinction is the whole rule. An
 * attribute on the same line as the control it belongs to hides NOTHING —
 * `)->tag( `Text` )->a( n = `text` v = `{TITLE}` )` is one control with its
 * one property, the compact form half the samples and abap2UI5's own
 * `z2ui5_cl_ui5_app_start` are written in. Counting calls instead of elements
 * reported exactly that idiom and nothing else on the corpus: four hits, four
 * deliberate. A second CONTROL on the line is different — it is a sibling or
 * a child whose place in the tree the reader can no longer see.
 *
 * Closing calls do not count either: `)->end( )->end( ).` as a chain's last
 * line is an established ending, not a readability problem. */
function perLine(src, tokens, report) {
  const perLine = new Map();
  for (const t of tokens) {
    if (t.role !== 'open' && t.role !== 'leaf') continue;
    const line = lineStartOf(src, t.at);
    if (!perLine.has(line)) perLine.set(line, []);
    perLine.get(line).push(t);
  }
  for (const [, group] of perLine) {
    if (group.length < 2) continue;
    report({
      count: group.length,
      offset: group[1].at,
    });
    return; // one per chain
  }
}

/* Called once per multi-line chain (multiLineChains( ) in chain-layout.mjs),
 * with its calls and the scrubbed source they address. */
function check({ src, tokens, report }) {
  perLine(src, tokens, report);
}

export default defineRule({
  id: 'chain-element-per-line',
  severity: 'hint',
  category: 'layout',
  scope: 'app',
  summary: 'several controls on one line of a multi-line chain',
  detail: 'One element per line is what makes the indentation able to show the tree at all — a line holding three controls hides three levels of it. Only ELEMENTS count: an attribute on the same line as the control it belongs to hides nothing, so `)->tag( `Text` )->a( n = `text` v = `{TITLE}` )` is the compact one-control form half the samples (and abap2UI5\'s own startup app) are written in and is never reported. Closing calls do not count either, because `)->end( )->end( ).` as a chain\'s last line is an established ending. Reported only for a chain already written across several lines, so the one-liner stays available. A hint, like its neighbour.',
  example: ')->tag( `Input` )->tag( `Button` )->tag( `Text` )   " three controls, one line',
  remedy: `)->tag( \`Input\`
)->tag( \`Button\`
)->tag( \`Text\``,
  message: (f) => `${f.count} controls on one line of a multi-line chain — one element per line, or the indentation cannot show where they sit in the tree (their attributes may share the line)`,
  check,
});
