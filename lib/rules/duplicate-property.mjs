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
  summary: 'the same attribute written twice on one control',
  detail: 'The view builder asserts on a repeated attribute (`ASSERT NOT line_exists( t_pair[ n = n ] )`) rather than letting the second value win silently, so the class dumps when the view is built. Two different values are a conflict only the author can settle; the same call written twice — a copy left behind by a merge or an edit — is only the dump.',
  example: 'view->tag( `Button` )->a( n = `text` v = `A` )->a( n = `text` v = `B` )',
  remedy: 'view->tag( `Button` )->a( n = `text` v = `B` )',
  fixNote: 'Where the second write REPEATS the first — the same attribute call with the same argument text, blanks aside — the second call is deleted, from its `->` to its closing parenthesis; the first one already says everything it does. Two different values keep the finding: which one was meant is not the linter\'s to decide.',
  message: (f) => `${f.member} is set twice on the same control — the view builder asserts on that`,
  check,
});
