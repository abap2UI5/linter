import { defineRule } from '../rule.mjs';

/* Called by the reconstructor for every closing call, with the depth of
 * the tree it is building; returns whether the call ascends past the root
 * (the tree is then left as it is). */
function check({ depth, offset, report }) {
  if (depth > 1) return false;
  // one ascend more than the tree is deep: both builders assert
  // `parent IS BOUND` there, so this dumps at runtime
  report({ offset });
  return true;
}

export default defineRule({
  id: 'excess-shut',
  severity: 'error',
  category: 'structure',
  scope: 'tree',
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
  message: (f) => 'one end( ) more than the tree is deep — asserts at runtime',
  check,
});
