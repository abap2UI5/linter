import { defineRule } from '../rule.mjs';

/* Called by the reconstructor for every attribute it writes onto an
 * element; returns whether `name` was written there before - the second
 * write is then dropped. */
function check({ target, name, offset, report }) {
  const first = target.attrs.find(([n]) => n === name);
  if (!first) return false;
  // where the first write is, so a fix can tell a repeat from a conflict
  report({ control: target.name, member: name, offset, ...(Number.isInteger(first[2]) ? { firstOffset: first[2] } : {}) });
  return true;
}

export default defineRule({
  id: 'duplicate-property',
  severity: 'error',
  category: 'structure',
  scope: 'tree',
  fixable: true,
  message: (f) => `${f.member} is set twice on the same control — the view builder asserts on that`,
  check,
});
