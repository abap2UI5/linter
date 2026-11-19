import { defineRule } from '../rule.mjs';
import { bindingPath, modelValue } from '../binding-paths.mjs';

function check({ attr, bindings, full, member, offset, value, report }) {
  if (member.set !== 'properties' || !bindings) return;
  const bp = bindingPath(value);
  if (!bp) return;
  const cur = modelValue(bindings, bp);
  // only when the type is EXPLICITLY scalar - a missing type is
  // no evidence (sap.m.Table.sticky legitimately takes a list)
  const scalarType = ['string', 'int', 'float', 'boolean']
    .includes(member.decl?.type);
  /* An object of UNKNOWN type (`__unknownType`: a DDIC type, a type of a
   * class not among the sources) is the reconstructor's "cannot see it",
   * not a structure - it may as well be a number. Not judged; a declared
   * table or structure still is, an open one (an include it cannot
   * resolve) included. */
  const collection = Array.isArray(cur) || (cur && typeof cur === 'object' && !cur.__unknownType);
  if (scalarType && collection) {
    report({
      control: full,
      member: attr,
      value: bp,
      offset,
    });
  }
}

export default defineRule({
  id: 'collection-bound-to-property',
  severity: 'error',
  category: 'data',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} is a scalar property but {${f.value}} is a table/structure`,
  check,
});
