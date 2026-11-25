/*
 * abap2ui5-preview — names abap2UI5's DEV branch has and its main does not yet.
 *
 * The linter judges against abap2UI5's main: data/abap2ui5-manifest.json is
 * main's manifest (npm run sync-manifest), and every mirror follows it. An app
 * written against DEV - the documentation of the day, the same week's release
 * candidate - then met an error for each name DEV added: `.eF('STOP_TIMER')`
 * as unknown-frontend-action, `z2ui5_cl_ui5_view_builder=>component_path( )`
 * as unknown-builder-method. Syncing against DEV instead would have taken
 * DEV's REMOVALS along too (a global target, view-slot methods), and reported
 * them for every app on the released main.
 *
 * So the additions are listed here, by hand and one at a time, each with the
 * commit that added it: accepted like the manifest's names, and judged by
 * abap2ui5-api-too-new as in no release yet. A name leaves this file the day
 * the manifest carries it - test/review/dev-preview.mjs fails while a name
 * is in both, so the list cannot outlive its reason.
 */
export const DEV_PREVIEW = Object.freeze({
  // Empty since the 1.151.0 sync: STOP_TIMER (abap2UI5 4a418249) and
  // z2ui5_cl_ui5_view_builder=>component_path( ) (40e8a073) are on main and in
  // its manifest now, and data/abap2ui5-since.json dates STOP_TIMER 'main'.
  frontendEvents: Object.freeze([]),
  clientEvents: Object.freeze([]),
  builderStatics: Object.freeze([]),
});
