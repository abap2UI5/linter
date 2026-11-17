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
  fixable: true,
  message: (f) => 'one end( ) more than the tree is deep — asserts at runtime',
  check,
});
