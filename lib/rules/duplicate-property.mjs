import { defineRule } from '../rule.mjs';

/* Whether two writes can never both run: they sit in different arms of one
 * IF / CASE (`arms` as the reconstructor keeps them, `[id, arm]` per open
 * branch, outermost first). */
const exclusive = (a, b) => a.some(([id, arm]) => b.some(([id2, arm2]) => id2 === id && arm2 !== arm));

/* Called by the reconstructor for every attribute it writes onto an
 * element; returns whether `name` was written there before - the second
 * write is then dropped. A write in an arm of an IF / ELSEIF / ELSE or a
 * CASE that excludes every earlier write of the name is no duplicate: only
 * one of them reaches the rendered control (the first one's value stands in
 * the reconstructed view, and the arm is remembered beside it). */
function check({ target, name, offset, arms = [], armsOf = () => undefined, report }) {
  const first = target.attrs.find(([n]) => n === name);
  if (!first) return false;
  const seen = armsOf(first);
  if (Array.isArray(seen) && seen.every((other) => exclusive(other, arms))) { seen.push(arms); return true; }
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
