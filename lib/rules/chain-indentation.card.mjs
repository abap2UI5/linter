import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'chain-indentation',
  summary: 'a builder call whose indentation contradicts the tree it builds',
  detail: 'A builder chain is the one part of an abap2UI5 class that nothing else formats: abaplint has `indentation` and `in_statement_indentation` switched off (a chain is a single statement spanning fifty lines), so neither `abaplint --fix` nor the auto-format workflow ever touches its inner lines. And the reader has no other picture of the view — the XML the builder emits is one long line by construction, so **the ABAP indentation IS the view\'s structure**. When it drifts, the tree in the file stops matching the tree in the browser. What is judged is only that: a sibling written at a different column than the siblings it shares a parent with, or a call written to the LEFT of the element it belongs to. The SIZE of the indent step is not judged — two and four are both house styles in the wild, and the first child under a node defines the column its siblings are held to, so a chain that keeps its own rhythm is never reported. Neither is the column of `end( )` (the hanging close is established), nor `v =` alignment, nor line length, nor a chain written entirely on one line. A hint: the view renders identically either way.',
  example: `)->ele( \`Page\`
    )->tag( \`Input\`
  )->tag( \`Button\`   " a sibling of Input, written a level out`,
  remedy: `)->ele( \`Page\`
    )->tag( \`Input\`
    )->tag( \`Button\``,
});
