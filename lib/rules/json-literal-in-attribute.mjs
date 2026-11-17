import { defineRule } from '../rule.mjs';

function check({ attr, full, offset, value, report }) {
  /* A raw JSON OBJECT literal written straight into an attribute.
   * UI5 reads a leading `{` as a binding, so the value never reaches
   * the property - the classic way to lose an integration Card's
   * manifest, which is why app 118 binds it instead. `{"` is
   * unambiguous: no binding, binding-info or expression starts with a
   * quoted key, and a `{0}` message placeholder does not either. */
  if (/^\{\s*"/.test(String(value))) {
    report({ control: full, member: attr, value: String(value).slice(0, 60), offset });
  }
}

export default defineRule({
  id: 'json-literal-in-attribute',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} is a raw JSON literal — UI5 reads a leading { as a binding, so the attribute never receives the JSON; bind it (client->_bind( field )) and keep the JSON in the model`,
  check,
});
