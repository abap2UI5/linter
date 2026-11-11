import { defineRule } from '../rule.mjs';
import { isAggregationTag } from '../ui5-meta.mjs';

function check({ full, node, report }) {
  /* The same aggregation opened twice under ONE control: the second
   * tag replaces the first, so half the view silently disappears.
   * Checked per node instance - two Panels each having `content` is
   * of course fine. */
  const aggHere = new Set();
  for (const child of node.children) {
    if (child.name === null || !isAggregationTag(child.name)) continue;
    if (aggHere.has(child.name)) {
      report({ control: full, member: child.name, offset: child.offset ?? node.offset });
    }
    aggHere.add(child.name);
  }

}

export default defineRule({
  id: 'duplicate-aggregation',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  summary: 'the same aggregation opened twice under one control',
  detail: 'The second tag replaces the first, so everything built into the first one is gone from the rendered view — without a word from anywhere.',
  example: `view->ele( \`Page\`
    )->ele( \`content\` )->tag( \`Button\` )->end(
    )->ele( \`content\` )->tag( \`Text\` )   " the Button is gone`,
  remedy: `view->ele( \`Page\`
    )->ele( \`content\`
        )->tag( \`Button\`
        )->tag( \`Text\` )`,
  message: (f) => `${f.control} opens ${f.member} twice — the second tag replaces the first`,
  check,
});
