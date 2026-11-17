import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';

/* `name` is a model type in one of the two namespaces the snapshot lists
 * completely (the walk's judgeModelType( ) has checked that); `toWritten`
 * spells a name the way the source does - dotted in a binding info,
 * slashed in a core:require. Returns whether it reported: a type that is
 * no class is not also too new. */
function check({ control, data, member, name, offset, toWritten, report }) {
  const modelTypes = data.__modelTypes || {};
  const modelTypeNames = Object.keys(modelTypes);
  const entry = modelTypes[name];
  if (entry) return false;
  const ns = name.slice(0, name.lastIndexOf('.') + 1);
  const suggestion = caseMatch(name, modelTypeNames);
  report({
    control, member, value: name, offset,
    allowed: modelTypeNames.filter((n) => n.startsWith(ns) && !n.slice(ns.length).includes('.')).map((n) => n.slice(ns.length)),
    snapshot: data.__ui5Version,
    ...(suggestion ? { written: toWritten(name), suggestion: toWritten(suggestion) } : {}),
  });
  return true;
}

export default defineRule({
  id: 'unknown-binding-type',
  severity: 'error',
  category: 'metadata',
  scope: 'node',
  fixable: true,
  message: (f) => {
    return `${f.value} is no model type in any UI5 release up to ${f.snapshot || 'the snapshot'} — ${
      f.member === 'core:require' || f.member === 'require'
        ? 'the core:require module 404s and the view is never created'
        : 'UI5 cannot resolve it, so the binding runs WITHOUT a type: the value is shown unformatted and input is never parsed back'
    }${f.allowed?.length ? ` (that namespace has ${[].concat(f.allowed).join(', ')})` : ''}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
