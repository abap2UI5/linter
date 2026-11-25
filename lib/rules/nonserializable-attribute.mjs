import { defineRule } from '../rule.mjs';
import { abapModel } from '../abap-model.mjs';
import { factsOf, inheritsApp, serializableOf } from '../guide-rules.mjs';

/* An instance attribute of an app class typed `REF TO <class>` whose class
 * does not implement if_serializable_object. abap2UI5 writes the app into the
 * draft after every roundtrip; a reference to such an object is LEFT OUT -
 * on purpose without a word (z2ui5_cl_ui5_srv_model, test
 * ltcl_05_draft->dead_objects_stay_quiet) - and the attribute is initial on
 * the next roundtrip. Code that sets and reads it in one roundtrip works,
 * the same code one roundtrip later dereferences null.
 *
 * Judged only where it is KNOWN (serializableOf( ) in guide-rules.mjs): a
 * class of the run's index whose whole chain - superclasses and the
 * interfaces of each, including the interfaces those include - is in the
 * index and implements neither if_serializable_object nor z2ui5_if_app; or a
 * framework class of NONSERIALIZABLE_FRAMEWORK_CLASSES (the view builder).
 * Not judged: a class the run does not hold (SAP standard, an addon outside
 * the paths), an interface (the class behind it is not known), `REF TO data`
 * and `REF TO object`, z2ui5_if_client (client-handle-capture's), CLASS-DATA
 * (not part of the instance), and any class that is not an app - its
 * reference only matters once an app keeps the helper, and then the helper
 * is the finding. */
const REF_TO = /^ref\s+to\s+([\w/]+)$/i;
const NOT_JUDGED = new Set(['data', 'object', 'z2ui5_if_client']);

function check({ source, classIndex, report }) {
  const model = abapModel(source);
  const facts = factsOf(model.src);
  if (!facts) return;
  if (!facts.app && inheritsApp(facts.superclass, classIndex) !== true) return;
  const definition = model.classes.find((c) => c.part === 'definition' && c.name === facts.name);
  if (!definition) return;
  for (const attr of definition.attributes) {
    if (attr.kind !== 'data') continue;
    const cls = REF_TO.exec(attr.type.trim())?.[1].toLowerCase();
    if (!cls || NOT_JUDGED.has(cls)) continue;
    if (serializableOf(cls, classIndex) !== false) continue;
    report({ member: attr.name, value: cls, offset: attr.start });
  }
}

export default defineRule({
  id: 'nonserializable-attribute',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `${f.member} is TYPE REF TO ${f.value}, a class without if_serializable_object - abap2UI5 leaves the reference out of the draft without a word, so ${f.member} is initial on the next roundtrip; keep it in a local variable, pass it as a parameter, or rebuild it per roundtrip`,
  check,
});
