import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';
import { isBinding } from '../ui5-meta.mjs';

/* Every model name a binding value addresses, in source order: the simple
 * and embedded forms `{m>…}` / `${m>…}`, and the complex binding info's
 * `path: 'm>…'` plus each quoted `parts: ['m>…']` entry - the composite
 * written the long way, which lib/binding-paths.mjs leaves to this rule.
 * Keyed by where the name starts, so an object entry of `parts`
 * (`{ path: 'm>x' }`) is not counted twice. */
const NAME = '([A-Za-z_][\\w.]*)\\s*>';
function modelNames(v) {
  const at = new Map();
  for (const m of v.matchAll(new RegExp(`\\{\\s*${NAME}`, 'g'))) at.set(m.index + m[0].indexOf(m[1]), m[1]);
  for (const m of v.matchAll(new RegExp(`\\bpath\\s*:\\s*['"]\\s*${NAME}`, 'g'))) at.set(m.index + m[0].lastIndexOf(m[1]), m[1]);
  for (const parts of v.matchAll(/\bparts\s*:\s*\[([^\]]*)\]/g)) {
    const base = parts.index + parts[0].indexOf('[') + 1;
    for (const m of parts[1].matchAll(new RegExp(`['"]\\s*${NAME}`, 'g'))) at.set(base + m.index + m[0].lastIndexOf(m[1]), m[1]);
  }
  return [...at.keys()].sort((a, b) => a - b).map((k) => at.get(k));
}

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
    for (const name of modelNames(String(value))) {
      if (!knownModels.has(name)) {
        // `Device>` for `device>` is a case miss, not a foreign model
        const suggestion = caseMatch(name, [...knownModels]);
        report({
          control: full, member: attr, value: name, allowed: [...knownModels].sort(), offset,
          ...(suggestion ? { written: name, suggestion } : {}),
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
