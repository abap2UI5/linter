import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';
import { isBinding } from '../ui5-meta.mjs';

function check({ attr, full, knownModels, offset, value, report }) {
  /* A binding against a NAMED model. abap2UI5 serves exactly one
   * data model per view slot - the default one, built from the
   * class's PUBLIC attributes - plus the framework's own `device>`
   * and `message>` (and `http>`); a name outside that set resolves to
   * no model, and UI5 leaves the property unset without a word. This
   * is the single most common leftover when a demo-kit sample is
   * ported, because samples name their models freely ({ui>/x},
   * {i18n>KEY}): the fix is to fold the field into the default model
   * (client->_bind( )), not to add a model. Only judged when the
   * caller could enumerate the models (an ABAP class whose
   * SET_ODATA_MODEL wires are all literal). */
  if (knownModels && isBinding(value)) {
    for (const mm of String(value).matchAll(/\{\s*([A-Za-z_][\w.]*)\s*>/g)) {
      if (!knownModels.has(mm[1])) {
        // `Device>` for `device>` is a case miss, not a foreign model
        const suggestion = caseMatch(mm[1], [...knownModels]);
        report({
          control: full, member: attr, value: mm[1], allowed: [...knownModels].sort(), offset,
          ...(suggestion ? { written: mm[1], suggestion } : {}),
        });
      }
    }
  }
}

export default defineRule({
  id: 'unknown-model',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  summary: 'a `name>` binding against a model the app does not have',
  detail: 'abap2UI5 serves exactly **one** data model per view slot — the default one, serialized from the class\'s PUBLIC attributes — plus the framework\'s own `device>` and `message>` (and `http>` on a switched path). A prefix outside that set resolves to no model at all, and UI5 leaves the property unset without a word. It is the most common leftover of a ported demo-kit sample, whose original names its models freely (`{ui>/rowMode}`, `{i18n>KEY}`): the fix is to fold the field into the default model with `client->_bind( )`, not to add a model — and there is no i18n model by design, because translation is a backend concern. A model registered by a `SET_ODATA_MODEL` wire of the same class counts as available; a class that registers one under a non-literal name is not judged at all.',
  example: 'a( n = `text` v = `{i18n>title}` )',
  remedy: 'a( n = `text` v = client->_bind( title ) )',
  fixNote: 'Only when the written name is a known model up to letter case (`Device>` for `device>`): the name is rewritten. A model the app really does not have keeps the finding.',
  message: (f) => `${f.control} ${f.member} binds against the model '${f.value}>', which no view of this class has (available: ${[].concat(f.allowed || []).join('>, ')}>) — UI5 resolves it to nothing and leaves the property unset; fold the field into the default model with client->_bind( )` + (f.suggestion ? ` — did you mean ${f.suggestion}>?` : ''),
  check,
});
