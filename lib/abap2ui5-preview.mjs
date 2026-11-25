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
  // abap2UI5 4a418249 (2026-11-24): cs_event-stop_timer, the end of the
  // repeating START_TIMER, wired without a roundtrip as .eF('STOP_TIMER')
  frontendEvents: Object.freeze(['STOP_TIMER']),
  clientEvents: Object.freeze(['STOP_TIMER']),
  // abap2UI5 40e8a073 (2026-11-24): z2ui5_cl_ui5_view_builder=>component_path( ),
  // the row-relative binding path of a column (building-apps section 4)
  builderStatics: Object.freeze(['component_path']),
});
