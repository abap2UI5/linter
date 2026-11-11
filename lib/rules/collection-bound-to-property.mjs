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
  if (scalarType && (Array.isArray(cur) || (cur && typeof cur === 'object'))) {
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
  summary: 'a table or structure bound to a scalar property',
  detail: 'The property receives an object where it expects a value. Nothing throws; the control shows nothing useful.',
  example: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`headerText\` v = client->_bind( t_rows ) )`,
  remedy: `DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
…
view->ele( \`Table\` )->a( n = \`items\` v = client->_bind( t_rows ) )`,
  message: (f) => `${f.control} ${f.member} is a scalar property but {${f.value}} is a table/structure`,
  check,
});
