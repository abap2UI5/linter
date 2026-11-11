import { defineRule } from '../rule.mjs';

/* Libraries that ship with SAPUI5 but NOT with OpenUI5. The metadata
 * snapshot is generated from the OpenUI5 sources, so their controls can
 * never be resolved - but which of the two distributions the target system
 * serves decides whether using them is fine or a guaranteed runtime error.
 * Deliberately curated: sap.ui.commons and sap.ui.ux3 are OpenUI5 libraries
 * that merely happen to be outside the snapshot, and must not appear here. */
const SAPUI5_ONLY_LIBS = [
  'sap.ui.comp', 'sap.ui.generic', 'sap.ui.richtexteditor', 'sap.ui.export',
  'sap.ui.vk', 'sap.ui.vbm', 'sap.suite.ui.commons', 'sap.suite.ui.generic',
  'sap.suite.ui.microchart', 'sap.ushell', 'sap.fe', 'sap.collaboration',
  'sap.ndc', 'sap.me', 'sap.ca', 'sap.chart', 'sap.viz', 'sap.ovp',
  'sap.gantt', 'sap.apf', 'sap.rules', 'sap.zen', 'sap.landvisz',
  'sap.uiext.inbox', 'sap.makit',
];

/** The SAPUI5-only library a control belongs to, or null. */
function sapui5OnlyLib(control) {
  return SAPUI5_ONLY_LIBS.find((lib) => control.startsWith(`${lib}.`)) || null;
}

/* Returns whether the control is SAPUI5-only, reported or not: then it is
 * not judged as unknown. */
function check({ node, full, distribution, report }) {
  const sapui5Lib = full ? sapui5OnlyLib(full) : null;
  if (!sapui5Lib) return false;
  /* Not in the snapshot either way - but on OpenUI5 it simply is not
   * there, which is a runtime error waiting to happen. Which of the
   * three answers this is depends on what the repo has SAID:
   *
   *   openui5   the library is absent from the target -> error
   *   sapui5    the target ships it -> nothing to report
   *   unset     nobody has said which distribution this runs on, so
   *             the linter does not know. Silence was the wrong
   *             default: it is exactly the repo that never thought
   *             about the distribution that gets the surprise, and a
   *             SmartTable is a portability fact worth knowing even
   *             where it turns out to be fine. So it is reported as a
   *             HINT - "worth knowing, never wrong by itself" - and
   *             writing `distribution` in the config turns it into the
   *             answer that repo actually needs.
   */
  if (distribution !== 'sapui5') {
    report({
      control: full, library: sapui5Lib,
      // the finding carries what the run knew, so the wording and the
      // severity can both say it instead of guessing downstream
      ...(distribution === 'openui5' ? { distribution: 'openui5' } : { severity: 'hint' }),
      offset: node.offset,
    });
  }
  return true;
}

export default defineRule({
  id: 'sapui5-only-control',
  severity: 'error',
  category: 'version',
  scope: 'node',
  summary: 'needs SAPUI5, absent from OpenUI5',
  detail: 'SAPUI5 ships libraries OpenUI5 does not — `sap.ui.comp` (Smart controls), `sap.suite.*`, `sap.ushell`, `sap.fe`, `sap.viz` — so a SmartTable is fine on SAPUI5 and a guaranteed runtime error on OpenUI5. The severity therefore follows what your config says about the target, and this is the only rule of which that is true: with `--distribution openui5` (or `"distribution": "openui5"`) it is an **error**, because the library provably is not there; with `--distribution sapui5` it is not reported at all, because you have said it is; and with no `distribution` configured it is a **hint** — the linter does not know which system the app deploys to, and a control only one distribution ships is worth knowing about either way. Configure `distribution` to turn the hint into the answer your repository actually needs.',
  example: 'view->tag( n = `SmartTable` ns = `smart` )   " sap.ui.comp: SAPUI5 only',
  remedy: 'view->ele( `Table` )   " sap.m, in OpenUI5 too; or declare "distribution": "sapui5"',
  message: (f) => {
    return f.distribution === 'openui5'
      ? `control ${f.control} needs SAPUI5 — ${f.library} is not part of OpenUI5`
      : `control ${f.control} needs SAPUI5 — ${f.library} is not part of OpenUI5, and no "distribution" is configured, so this run cannot tell whether your system ships it; set "distribution": "openui5" to make this an error, or "sapui5" to silence it`;
  },
  check,
});
