import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'chain-element-per-line',
  summary: 'several controls on one line of a multi-line chain',
  detail: 'One element per line is what makes the indentation able to show the tree at all — a line holding three controls hides three levels of it. Only ELEMENTS count: an attribute on the same line as the control it belongs to hides nothing, so `)->tag( `Text` )->a( n = `text` v = `{TITLE}` )` is the compact one-control form half the samples (and abap2UI5\'s own startup app) are written in and is never reported. Closing calls do not count either, because `)->end( )->end( ).` as a chain\'s last line is an established ending. Reported only for a chain already written across several lines, so the one-liner stays available. A hint, like its neighbour.',
  example: ')->tag( `Input` )->tag( `Button` )->tag( `Text` )   " three controls, one line',
  remedy: `)->tag( \`Input\`
)->tag( \`Button\`
)->tag( \`Text\``,
});
