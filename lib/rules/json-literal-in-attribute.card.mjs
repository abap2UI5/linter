import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'json-literal-in-attribute',
  summary: 'a raw JSON literal written into a view attribute',
  detail: 'UI5 parses an attribute value starting with `{` as a binding, so a JSON object literal (`{"sap.card":…`) is read as a binding path and the attribute ends up empty — the classic way to lose an integration Card\'s manifest. Keep the JSON in the model and bind it: `client->_bind( manifest )`.',
  example: 'view->tag( n = `Card` ns = `card` )->a( n = `manifest` v = `{"sap.card":{"type":"List"}}` )',
  remedy: `DATA manifest TYPE string.   " PUBLIC, holding the same JSON
" …
view->tag( n = \`Card\` ns = \`card\`
    )->a( n = \`manifest\` v = client->_bind( val = manifest json = abap_true ) )`,
});
