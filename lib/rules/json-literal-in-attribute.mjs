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
  summary: 'a raw JSON literal written into a view attribute',
  detail: 'UI5 parses an attribute value starting with `{` as a binding, so a JSON object literal (`{"sap.card":…`) is read as a binding path and the attribute ends up empty — the classic way to lose an integration Card\'s manifest. Keep the JSON in the model and bind it: `client->_bind( manifest )`.',
  example: 'view->tag( n = `Card` ns = `card` )->a( n = `manifest` v = `{"sap.card":{"type":"List"}}` )',
  remedy: `DATA manifest TYPE string.   " PUBLIC, holding the same JSON
" …
view->tag( n = \`Card\` ns = \`card\`
    )->a( n = \`manifest\` v = client->_bind( val = manifest json = abap_true ) )`,
  message: (f) => `${f.control} ${f.member} is a raw JSON literal — UI5 reads a leading { as a binding, so the attribute never receives the JSON; bind it (client->_bind( field )) and keep the JSON in the model`,
  check,
});
