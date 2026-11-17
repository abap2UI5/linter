import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'excess-shut',
  summary: 'one `shut( )` more than the builder tree is deep',
  detail: 'The builder ascends past the root — one `end( )` too many. The builder asserts on it (`parent IS BOUND`), so the app dumps before it renders. The rule id keeps the older spelling `shut`: renaming it would silently invalidate every baseline entry and rule override that names it.',
  example: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\` v = \`sap.m\`
    )->ele( \`Page\`
        )->tag( \`Button\`
    )->end(
)->end(
)->end( )   " one end( ) past the root`,
  remedy: `view->ele( n = \`View\` ns = \`mvc\`
    )->a( n = \`xmlns\` v = \`sap.m\`
    )->ele( \`Page\`
        )->tag( \`Button\`
    )->end(
)->end( )`,
  fixNote: 'The `->end( )` call the finding sits on is deleted; the paren before it, which closes the previous call, stays.',
});
