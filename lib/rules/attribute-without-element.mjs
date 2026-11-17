import { defineRule } from '../rule.mjs';

/* Called by the reconstructor for an attribute call whose target is the
 * bare factory root: there is no element to carry it, and both builders
 * assert on exactly that. */
function check({ target, member, offset, report }) {
  // …but an element whose NAME did not resolve is an element all the same
  if (target.unresolvedName) return;
  report({ member, offset });
}

export default defineRule({
  id: 'attribute-without-element',
  severity: 'error',
  category: 'structure',
  scope: 'tree',
  message: (f) => `an attribute (${f.member}) without an element to attach it to — the view builder asserts on that`,
  check,
});
