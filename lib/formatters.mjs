/*
 * formatters — the curated formatter contract of the abap2UI5 frontend.
 *
 * The framework ships ONE formatter module (app/webapp/model/formatter.js,
 * registered as `z2ui5/model/formatter` and published as the `z2ui5.Formatter`
 * global). Its export surface is deliberately tiny and machine-gated upstream
 * (.github/scripts/formatter-scope-gate.mjs): a function is admitted only when
 * it formats exactly the value handed to it AND there is a technical reason it
 * cannot be done in ABAP (a JS type the JSON model cannot carry, an icon-font
 * glyph, a locale/theme artefact). Everything else is backend work — computed
 * in ABAP, bound as a finished field.
 *
 * Precedent, so the line is not re-litigated here either: weightState /
 * weightStateByValue and the demo-kit pack (round2DP, dimensions,
 * stockStatusState, stockStatusIcon, deliveryStatusState) were shipped and
 * then REMOVED upstream — which silently broke the samples that used them,
 * because UI5 resolves a formatter string at binding time and an unknown name
 * simply yields no value. That failure mode is exactly what the
 * `uncurated-formatter` rule exists for.
 *
 * This list is hand-maintained against the upstream module, like
 * frontend-actions.mjs is against the z2ui5_cl_ui5f_*_js action classes. The render
 * harness (lib/render.mjs) mirrors the same four functions; a test keeps the
 * two in step.
 */

/** The module the `Formatter` core:require alias conventionally points at. */
export const FORMATTER_MODULE = 'z2ui5/model/formatter';

/** Every function the curated module exports. Kept in step 2026-08-04 with
 *  abap2UI5 app/webapp/model/formatter.js. */
export const CURATED_FORMATTERS = Object.freeze([
  'DateCreateObject',
  'DateAbapDateToDateObject',
  'DateAbapDateTimeToDateObject',
  'expandInlineIcons',
]);

/** The framework's SECOND curated module: `app/webapp/model/clipboard.js`,
 *  registered as `z2ui5/model/clipboard`. It holds the callbacks a control
 *  calls SYNCHRONOUSLY in the browser - a function-typed property no roundtrip
 *  can answer - and is held upstream to the formatter module's admission
 *  criteria by the same gate. A view reaches it through core:require
 *  (`{Clipboard: 'z2ui5/model/clipboard'}`) and names the function in the
 *  property: `<plugins:CopyProvider extractData="Clipboard.extractData"/>`.
 *  The render harness mirrors it for the same reason it mirrors the
 *  formatters - a core:require of a module the harness does not know 404s,
 *  and the whole view fails to create. */
export const CLIPBOARD_MODULE = 'z2ui5/model/clipboard';

/** Every function the clipboard module exports. Kept in step 2026-09-30 with
 *  abap2UI5 app/webapp/model/clipboard.js. */
export const CLIPBOARD_CALLBACKS = Object.freeze([
  'extractData',
]);
