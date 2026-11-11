import { defineRule } from '../rule.mjs';
import { moveDeclarationFix, privateInstanceAttributes } from '../abap-helpers.mjs';

function check({ source, src, report }) {
  if (/\bINTERFACES\s+z2ui5_if_app\b/i.test(src)) {
    /* The fix: with no PROTECTED SECTION in the definition, the PRIVATE
     * one is renamed - everything in it widens to PROTECTED, which is what
     * the remedy says for a helper (bound state then gets its own finding
     * and its own move to PUBLIC on the next pass). With a PROTECTED
     * SECTION present the declaration is moved into it, one line at a time
     * (moveDeclarationFix); a chained `DATA:` element is reported without
     * a fix. The rename rides on the FIRST finding only - one span, not one
     * per attribute. */
    const defEnd = src.search(/\bENDCLASS\b/i);
    const definition = defEnd === -1 ? '' : src.slice(0, defEnd);
    const hasProtected = /\bPROTECTED\s+SECTION\s*\./i.test(definition);
    const priv = /\bPRIVATE(?=\s+SECTION\s*\.)/i.exec(definition);
    privateInstanceAttributes(src).forEach((attr, i) => {
      const fixes = hasProtected
        ? moveDeclarationFix(source, src, attr.name, 'PROTECTED')
        : (i === 0 && priv ? [{ start: priv.index, end: priv.index + 'PRIVATE'.length, text: 'PROTECTED' }] : null);
      report({ member: attr.name, offset: attr.offset, ...(fixes ? { fixes } : {}) });
    });
  }
}

export default defineRule({
  id: 'private-app-attribute',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a `PRIVATE` instance attribute on a `z2ui5_if_app` class',
  detail: 'The app\'s state is persisted with `CALL TRANSFORMATION id`, and the transpiled runtime re-implements that walk with a dynamic `ASSIGN obj->(name)`, which reaches a PROTECTED attribute and **not** a private one. `sy-subrc` comes back 4, the serializer asserts, and every roundtrip answers `ASSERTION_FAILED` out of `lcl_heap.add_object` — with nothing in the message naming the attribute that caused it, which is what makes it expensive to find rather than merely wrong. A warning rather than an error, deliberately: a real SAP kernel serializes a private attribute fine, so the class works on the system it was written for and breaks on the transpiled runtime — abap2UI5\'s own Node backend and every e2e smoke. Six ports carried it while the 53 with a PROTECTED attribute were fine, which is what isolated it. App state belongs in PUBLIC — that is also what makes it reach the model at all — and helpers in PROTECTED. `CLASS-DATA` is never reported: a static attribute is not instance state and is not serialized with the app.',
  example: `PRIVATE SECTION.
  DATA t_all TYPE ty_t_row.`,
  remedy: `PUBLIC SECTION.
  DATA t_all TYPE ty_t_row.   " PUBLIC for bound state, PROTECTED for a helper`,
  fixNote: 'With no PROTECTED SECTION in the class, `PRIVATE SECTION.` is renamed to `PROTECTED SECTION.` (one span, on the first finding). With one present, the single-line declaration is moved into it; a chained `DATA:` element keeps the finding without a fix.',
  message: (f) => `${f.member} is a PRIVATE instance attribute of an app class — the app's state is persisted with CALL TRANSFORMATION id, and the transpiled runtime walks the attributes with a dynamic ASSIGN obj->(name), which reaches PROTECTED and not PRIVATE: every roundtrip then answers ASSERTION_FAILED with nothing naming the attribute. App state belongs in PUBLIC, helpers in PROTECTED`,
  check,
});
