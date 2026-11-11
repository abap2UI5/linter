import { defineRule } from '../rule.mjs';
import { brokenExpression } from '../binding-paths.mjs';

function check({ attr, full, offset, value, report }) {
  if (brokenExpression(value)) {
    report({ control: full, member: attr, value: String(value).slice(0, 80), offset });
  }
}

export default defineRule({
  id: 'invalid-expression-binding',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  summary: 'unbalanced braces or parens in `{= … }`',
  detail: 'The expression binding cannot be parsed. UI5 reports a parse error and the attribute stays unbound.',
  example: 'view->tag( `Text` )->a( n = `text` v = `{= ${/N} > 1 ? \'many\' : \'one\' }}` )   " one } too many',
  remedy: 'view->tag( `Text` )->a( n = `text` v = `{= ${/N} > 1 ? \'many\' : \'one\' }` )',
  message: (f) => `${f.control} ${f.member}: unbalanced braces/parens in the expression binding`,
  check,
});
