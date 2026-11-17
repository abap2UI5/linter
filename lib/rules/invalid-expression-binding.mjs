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
  message: (f) => `${f.control} ${f.member}: unbalanced braces/parens in the expression binding`,
  check,
});
