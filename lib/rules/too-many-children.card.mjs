import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'too-many-children',
  summary: 'two controls in a 0..1 aggregation',
  detail: 'A single-cardinality aggregation was filled more than once. Only one child survives — which one is not something to rely on. Only an aggregation the metadata declares `multiple: false` is 0..1 — UI5 defaults an undeclared flag to 0..n, and so does this rule. The children written straight under a control fill its default aggregation and are held to the same cardinality.',
  example: `view->ele( \`Page\`
    )->ele( \`customHeader\`
        )->tag( \`Bar\`
        )->tag( \`Bar\` )   " customHeader is 0..1 - one of the two is gone`,
  remedy: `view->ele( \`Page\`
    )->ele( \`customHeader\`
        )->tag( \`Bar\` )`,
});
