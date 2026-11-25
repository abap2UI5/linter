import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'private-app-attribute',
  summary: 'a `PRIVATE` instance attribute on a `z2ui5_if_app` class',
  detail: 'The app\'s state is persisted with `CALL TRANSFORMATION id`, and the transpiled runtime re-implements that walk with a dynamic `ASSIGN obj->(name)`, which reaches a PROTECTED attribute and **not** a private one. `sy-subrc` comes back 4, the serializer asserts, and every roundtrip answers `ASSERTION_FAILED` out of `lcl_heap.add_object` — with nothing in the message naming the attribute that caused it, which is what makes it expensive to find rather than merely wrong. A warning rather than an error, deliberately: a real SAP kernel serializes a private attribute fine, so the class works on the system it was written for and breaks on the transpiled runtime — abap2UI5\'s own Node backend and every e2e smoke. Six ports carried it while the 53 with a PROTECTED attribute were fine, which is what isolated it. App state belongs in PUBLIC — that is also what makes it reach the model at all — and helpers in PROTECTED, **except a `TYPE REF TO data`**: that one belongs in PUBLIC as well, since only the PUBLIC generic data references are written by abap2UI5 itself (`nonpublic-data-reference`). `CLASS-DATA` is never reported: a static attribute is not instance state and is not serialized with the app.',
  example: `PRIVATE SECTION.
  DATA t_all TYPE ty_t_row.`,
  remedy: `PUBLIC SECTION.
  DATA t_all TYPE ty_t_row.   " PUBLIC for bound state, PROTECTED for a helper
  DATA mr_row TYPE REF TO data.   " a data reference: PUBLIC, never PROTECTED`,
  fixNote: 'With no PROTECTED SECTION in the class, `PRIVATE SECTION.` is renamed to `PROTECTED SECTION.` (one span, on the first finding) - not while the section holds a `TYPE REF TO data`. With one present, the single-line declaration is moved into it; a `TYPE REF TO data` is moved to the PUBLIC SECTION instead. A chained `DATA:` element keeps the finding without a fix.',
});
