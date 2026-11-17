import { defineRule } from '../rule.mjs';
import { bindingPath, modelValue } from '../binding-paths.mjs';

function check({ attr, bindings, full, member, offset, value, report }) {
  if (member.set !== 'properties' || !bindings) return;
  const bp = bindingPath(value);
  if (!bp) return;
  const cur = modelValue(bindings, bp);
  if (typeof cur === 'string' && ['int', 'float', 'boolean'].includes(member.decl?.type)) {
    /* An ABAP character field bound to a numeric or boolean UI5
     * property. The model ships JSON, so the property receives
     * "100" where it declared a float: 1.71 coerces it, UI5 2.x
     * and the render gate's future mode reject the view outright
     * ("100" is of type string, expected float). The shape's
     * default value carries the ABAP type - '' only for a
     * character-like field, 0 or false for the others. */
    report({
      control: full,
      member: attr,
      value: bp,
      memberType: member.decl.type,
      offset,
    });
  }
}

export default defineRule({
  id: 'binding-type-mismatch',
  severity: 'warning',
  category: 'data',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} expects ${f.memberType} but {${f.value}} is a character field — it arrives as a JSON string, which UI5 rejects in future mode`,
  check,
});
