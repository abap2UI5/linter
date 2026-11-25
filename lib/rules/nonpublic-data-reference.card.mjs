import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'nonpublic-data-reference',
  summary: 'a `TYPE REF TO data` instance attribute of a `z2ui5_if_app` class outside the PUBLIC SECTION',
  detail: 'abap2UI5 writes the app into the draft after every roundtrip. The generic data references of **PUBLIC** attributes are written by the framework\'s own S-RTTI handling; a PROTECTED or PRIVATE one is left to `CALL TRANSFORMATION`, which refuses a target whose type was built at run time (`CREATE DATA … TYPE HANDLE`, `LIKE` a row of an RTTI table): the first roundtrip fails with `APP_SERIALIZATION_ERROR` / `CX_REFERENCE_NOT_SERIALIZABLE` "The (Anonymous) data object referenced has only got a technical type". Only on a system - the transpiled runtime and the unit tests pass. A warning, an error when the class itself fills the reference with `TYPE HANDLE` or `LIKE`. Only the direct `TYPE REF TO data` is read; a structure or table type holding one is not resolved. `CLASS-DATA` is not app state and is not reported.',
  example: `PROTECTED SECTION.
  DATA mr_row TYPE REF TO data.   " CREATE DATA mr_row LIKE <row>`,
  remedy: `PUBLIC SECTION.
  DATA mr_row TYPE REF TO data.`,
  fixNote: 'The single-line declaration is moved to the end of the PUBLIC SECTION; a chained `DATA:` element keeps the finding without a fix.',
});
