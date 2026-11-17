import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-expression-binding',
  summary: 'unbalanced braces or parens in `{= … }`',
  detail: 'The expression binding cannot be parsed. UI5 reports a parse error and the attribute stays unbound.',
  example: 'view->tag( `Text` )->a( n = `text` v = `{= ${/N} > 1 ? \'many\' : \'one\' }}` )   " one } too many',
  remedy: 'view->tag( `Text` )->a( n = `text` v = `{= ${/N} > 1 ? \'many\' : \'one\' }` )',
});
