import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-model',
  summary: 'a `name>` binding against a model the app does not have',
  detail: 'abap2UI5 serves exactly **one** data model per view slot — the default one, serialized from the class\'s PUBLIC attributes — plus the framework\'s own `device>` and `message>` (and `http>` on a switched path). A prefix outside that set resolves to no model at all, and UI5 leaves the property unset without a word. It is the most common leftover of a ported demo-kit sample, whose original names its models freely (`{ui>/rowMode}`, `{i18n>KEY}`): the fix is to fold the field into the default model with `client->_bind( )`, not to add a model — and there is no i18n model by design, because translation is a backend concern. A model registered by a `SET_ODATA_MODEL` wire of the same class counts as available; a class that registers one under a non-literal name is not judged at all.',
  example: 'a( n = `text` v = `{i18n>title}` )',
  remedy: 'a( n = `text` v = client->_bind( title ) )',
  fixNote: 'Only when the written name is a known model up to letter case (`Device>` for `device>`): the name is rewritten. A model the app really does not have keeps the finding.',
});
