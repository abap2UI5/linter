import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'chain-house-layout',
  summary: 'a chain not in the abap2UI5 house layout (opt-in)',
  detail: 'The only rule here that encodes a HOUSE STYLE rather than an inconsistency, and the only one that names a step. Its two neighbours judge a chain against itself and stay silent on any layout that is merely a choice; this one judges it against one canonical form: **one call per line including attributes** (stricter than `chain-element-per-line`, which lets an attribute share its control\'s line), **four spaces per level of the tree**, and the closing call alone in the column of the element it closes. It exists because that form now has a corpus behind it — abap2UI5, abap2UI5/samples and abap2UI5/samples-controls were unified onto it in 2026-08, and the drift it catches had passed every other gate: 77 ports whose whole chain sat one level too deep, which `chain-indentation` cannot see because a uniformly wrong rhythm is still a rhythm. **If your house style is a different one, switch it off** — `"chain-house-layout": false` — rather than reformatting to somebody else\'s taste. Every finding carries fixes, so `--fix` rewrites the chain; the rewrite only ever touches whitespace between chain segments and the indent of a continuation line that is not itself content, so it cannot change what the view builds.',
  example: `)->ele( \`Shell\` )->ele( \`Page\` )      " two levels on one line, and the step is 0
)->tag( \`Text\` )->a( n = \`text\` v = \`x\` )   " attribute on its control's line`,
  remedy: `)->ele( \`Shell\`
    )->ele( \`Page\`
        )->tag( \`Text\`
            )->a( n = \`text\` v = \`x\` )`,
  fixNote: `The chain is rewritten into the canonical layout: each call moved onto its own line at the column its depth in the tree gives it, and the continuation lines of a call's arguments moved with it. Only whitespace BETWEEN chain segments is touched — a literal, a comment's text and the inside of an argument list are copied through, and blank lines and comment lines between segments are kept where they are. The rewrite is checked to be whitespace-only before it is offered, so it cannot change what the view builds.`,
});
