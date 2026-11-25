import { defineRule } from '../rule.mjs';
import { moveDeclarationFix } from '../abap-helpers.mjs';

/* A `TYPE REF TO data` instance attribute in the PROTECTED or PRIVATE
 * section of an app class. abap2UI5 writes the app into the draft after
 * every roundtrip; the generic data references of PUBLIC attributes are
 * written by the framework's own S-RTTI handling (z2ui5_cl_ui5_srv_model,
 * dissolve / main_attri_db_save_srtti), a non-public one is left to CALL
 * TRANSFORMATION, which refuses a target whose type was built at run time:
 * APP_SERIALIZATION_ERROR, CX_REFERENCE_NOT_SERIALIZABLE "The (Anonymous)
 * data object referenced has only got a technical type". On a system only -
 * the transpiled runtime and the unit tests pass
 * (abap2UI5-addons/table-maintenance 9c8f911 -> ca6da36).
 *
 * A warning: a target with a static type (CREATE DATA mr TYPE string) is
 * written fine. An error when the class fills the reference with
 * CREATE DATA … TYPE HANDLE or LIKE - the shapes that give a runtime type.
 * Only the direct form; a structure or table holding a REF TO data is a type
 * this source would have to resolve ("unknown is not missing"). */
const REF_TO_DATA = /^ref\s+to\s+data$/i;

function check({ model, report }) {
  if (!/\bINTERFACES\s+z2ui5_if_app\b/i.test(model.src)) return;
  for (const attr of model.attributes) {
    if (attr.kind !== 'data' || (attr.visibility !== 'protected' && attr.visibility !== 'private')) continue;
    if (!REF_TO_DATA.test(attr.type.trim())) continue;
    const escaped = attr.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const runtimeTyped = new RegExp(`\\bCREATE\\s+DATA\\s+(?:me->)?${escaped}\\s+(?:TYPE\\s+HANDLE|LIKE)\\b`, 'i').test(model.code);
    const fixes = moveDeclarationFix(model.source, model.src, attr.name, 'PUBLIC');
    report({
      member: attr.name,
      offset: attr.start,
      value: attr.visibility.toUpperCase(),
      ...(runtimeTyped ? { severity: 'error' } : {}),
      ...(fixes ? { fixes } : {}),
    });
  }
}

export default defineRule({
  id: 'nonpublic-data-reference',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'class',
  fixable: true,
  message: (f) => `${f.member} is a ${f.value} TYPE REF TO data attribute of an app class — abap2UI5 writes the generic data references of PUBLIC attributes itself, a non-public one goes to CALL TRANSFORMATION, which refuses a target typed at run time (APP_SERIALIZATION_ERROR, CX_REFERENCE_NOT_SERIALIZABLE) on the system, while the transpiled runtime passes. Declare it in the PUBLIC SECTION`,
  check,
});
