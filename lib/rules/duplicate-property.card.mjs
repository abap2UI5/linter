import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'duplicate-property',
  summary: 'the same attribute written twice on one control',
  detail: 'The view builder asserts on a repeated attribute (`ASSERT NOT line_exists( t_pair[ n = n ] )`) rather than letting the second value win silently, so the class dumps when the view is built. Two different values are a conflict only the author can settle; the same call written twice — a copy left behind by a merge or an edit — is only the dump.',
  example: 'view->tag( `Button` )->a( n = `text` v = `A` )->a( n = `text` v = `B` )',
  remedy: 'view->tag( `Button` )->a( n = `text` v = `B` )',
  fixNote: 'Where the second write REPEATS the first — the same attribute call with the same argument text, blanks aside — the second call is deleted, from its `->` to its closing parenthesis; the first one already says everything it does. Two different values keep the finding: which one was meant is not the linter\'s to decide.',
});
