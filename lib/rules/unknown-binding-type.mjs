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
  summary: 'a binding `type:` or core:require naming a `sap.ui.model.type` / `sap.ui.model.odata.type` class no release has',
  detail: 'The two model-type namespaces are a closed set — `sap.ui.model.type.*` (Boolean, Currency, Date, DateInterval, DateTime, DateTimeInterval, FileSize, Float, Integer, String, Time, TimeInterval, Unit) and `sap.ui.model.odata.type.*` — which the snapshot lists from the sap.ui.core package. A name outside it is no class at all, and it fails in one of two ways. Named globally in a binding info (`{ path: \'…\', type: \'sap.ui.model.type.Decimal\' }`), UI5 cannot resolve it: it logs "Failed to resolve type" (and throws in future mode), the binding runs WITHOUT a type, the value is shown as the raw model string and input is never parsed back. Named in a `core:require`, the module request 404s and the view is never created. A plausible-sounding name is the usual cause — `sap.ui.model.type.Decimal` and `sap.ui.model.type.Number` do not exist (`Float` and `sap.ui.model.odata.type.Decimal` do). A type of the app\'s own, a controller-relative `.MyType` and an alias are not judged; the alias is judged at its core:require.',
  example: `DATA amount TYPE p LENGTH 10 DECIMALS 2.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = amount path = abap_true ) }', type: 'sap.ui.model.type.Decimal' \\}| )`,
  remedy: `DATA amount TYPE p LENGTH 10 DECIMALS 2.
view->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = amount path = abap_true ) }', type: 'sap.ui.model.type.Float' \\}| )`,
  fixNote: 'Where exactly one model type is the written name up to letter case (`sap.ui.model.type.Datetime` → `DateTime`), the finding names it and `--fix` rewrites it in place — in the `type:` of the binding, or as a module path in the core:require. Any other unknown name is reported without a suggestion.',
  message: (f) => {
    return `${f.value} is no model type in any UI5 release up to ${f.snapshot || 'the snapshot'} — ${
      f.member === 'core:require' || f.member === 'require'
        ? 'the core:require module 404s and the view is never created'
        : 'UI5 cannot resolve it, so the binding runs WITHOUT a type: the value is shown unformatted and input is never parsed back'
    }${f.allowed?.length ? ` (that namespace has ${[].concat(f.allowed).join(', ')})` : ''}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
