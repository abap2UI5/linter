import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'duplicate-aggregation',
  summary: 'the same aggregation opened twice under one control',
  detail: 'The second tag replaces the first, so everything built into the first one is gone from the rendered view — without a word from anywhere.',
  example: `view->ele( \`Page\`
    )->ele( \`content\` )->tag( \`Button\` )->end(
    )->ele( \`content\` )->tag( \`Text\` )   " the Button is gone`,
  remedy: `view->ele( \`Page\`
    )->ele( \`content\`
        )->tag( \`Button\`
        )->tag( \`Text\` )`,
});
