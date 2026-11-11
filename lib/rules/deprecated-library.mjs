import { defineRule } from '../rule.mjs';
import { deprecationApplies } from '../ui5-meta.mjs';

/*
 * Libraries SAP deprecated WHOLE, and the one library that was deprecated in
 * part. None of them is in `data/properties.json` - the snapshot is harvested
 * from what current UI5 documents, and a library nobody should write any more
 * is not in it - so every metadata rule of the walk is blind to them: a `<c:Button>` out of
 * `sap.ui.commons` resolves to no known control, sits in no known library, and
 * left the run with nothing to say. That silence is the whole reason this
 * table exists in source rather than in the snapshot, and it is why the table
 * is HAND-MAINTAINED: it cannot be regenerated from data the harvest does not
 * carry.
 *
 * It is a small closed set and it does not grow often - SAP has deprecated a
 * library five times in ten years. `since` is the release the deprecation took
 * effect, so `deprecationApplies` can hold it against the target the same way
 * a control's own deprecation is held: a 1.71 floor is far past all of them,
 * but the comparison is what keeps the rule honest if a sixth one lands
 * tomorrow.
 *
 * `except` is what `sap.viz` needs and nothing else does. The chart classes
 * directly under `sap.viz.ui5` - Bar, Line, Pie, Donut, Heatmap, ... - are the
 * deprecated ones; `sap.viz.ui5.controls.VizFrame` is their replacement and
 * lives one level deeper, so the prefix that catches the old ones catches the
 * new one too unless the exception is stated.
 */
const DEPRECATED_LIBS = [
  {
    lib: 'sap.ui.commons', since: '1.38',
    use: 'sap.m and sap.ui.layout',
    /* The one that actually happens. Half its control NAMES also exist in
     * sap.m - Button, Label, Dialog, Panel, ComboBox - so an old tutorial or
     * an older SAP sample copied with its xmlns still renders something, in
     * the wrong library, until it does not. */
  },
  { lib: 'sap.ui.ux3', since: '1.38', use: 'sap.m and sap.f' },
  { lib: 'sap.makit', since: '1.38', use: 'sap.viz.ui5.controls.VizFrame or sap.suite.ui.microchart' },
  { lib: 'sap.me', since: '1.34', use: 'sap.m' },
  {
    lib: 'sap.viz.ui5', since: '1.32',
    use: 'sap.viz.ui5.controls.VizFrame',
    except: ['sap.viz.ui5.controls', 'sap.viz.ui5.data', 'sap.viz.ui5.types'],
  },
];

/** The deprecated library a control belongs to, or null. */
function deprecatedLib(control) {
  return DEPRECATED_LIBS.find(({ lib, except }) => control.startsWith(`${lib}.`)
    && !(except || []).some((keep) => control.startsWith(`${keep}.`))) || null;
}

/* Returns whether it reported: the two rules under it (sapui5-only-control,
 * unknown-control) are then not asked. */
function check({ node, full, floor, report }) {
  /* A library that is deprecated whole is judged BEFORE the two rules
   * under it, and instead of them. `sap.viz.ui5.Bar` is SAPUI5-only and
   * deprecated, and both are true - but "there is no such library any
   * more, use VizFrame" is the sentence that gets the tag rewritten,
   * while "your distribution may not ship it" invites configuring the
   * distribution and keeping the control. Two findings on one tag would
   * also be the shape most consumers switch a rule off over. */
  if (!full) return false;
  const deadLib = deprecatedLib(full);
  /* Below the deprecating release the library is simply the library of
   * its day, and the tag falls through to whatever the rules under this
   * one make of it - which for sap.viz and sap.me is the portability
   * hint, exactly as before this rule existed. */
  const libIsDead = Boolean(deadLib) && deprecationApplies({ since: deadLib.since }, floor);
  if (!libIsDead) return false;
  report({
    control: full,
    library: deadLib.lib, since: deadLib.since, use: deadLib.use,
    offset: node.offset,
  });
  return true;
}

export default defineRule({
  id: 'deprecated-library',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'a UI5 library SAP deprecated in its entirety',
  detail: 'Five libraries are deprecated whole rather than control by control: `sap.ui.commons` and `sap.ui.ux3` (1.38), `sap.makit` (1.38), `sap.me` (1.34), and the legacy chart classes directly under `sap.viz.ui5` (1.32 — `sap.viz.ui5.controls.VizFrame` is the replacement and is not reported). None of them is in the metadata snapshot every other rule reads, because the harvest only carries what current UI5 documents — so before this rule a view out of `sap.ui.commons` was not merely unjudged, it was invisible, and that is the one library it actually happens with: half its control names (`Button`, `Label`, `Dialog`, `Panel`, `ComboBox`) also exist in `sap.m`, so XML copied from an old tutorial drags the dead namespace along and still renders something. The list is hand-maintained for the same reason it is needed: it cannot be regenerated from data the snapshot does not carry. Held against your target release like any other deprecation — below the deprecating version nothing is reported.',
  example: 'view->tag( n = `Button` ns = `c` )   " xmlns:c="sap.ui.commons" — gone since 1.38',
  remedy: 'view->tag( `Button` )   " sap.m, the library that replaced it',
  message: (f) => `control ${f.control} comes from ${f.library}, a library deprecated whole since ${f.since} — use ${f.use}`,
  check,
});
