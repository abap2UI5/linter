/*
 * cc-controls — metadata-only MIRRORS of the bundled abap2UI5 companion
 * controls (`app/webapp/cc/*.js`, used declaratively in views as
 * `<z2ui5:Name xmlns:z2ui5="z2ui5.cc" …/>`).
 *
 * The render harness needs a control class to exist before it can create a
 * view that names one, and it only validates view CREATION — never their
 * behaviour — so a property list and the events are the whole mirror.
 *
 * This is the fourth hand-maintained knowledge file, and it rotted the way
 * the other three did before they were gated: abap2UI5 added TokenKeyCell /
 * TokenTextCells to MultiInputExt on 2026-08-22 and every view using them
 * failed view CREATION here — which is not a property finding a downstream
 * deviation can carry, but a dead view. `scripts/check-upstream.mjs` compares
 * this file against `app/webapp/cc/*.js` now, so the next one is caught.
 *
 * ONLY the controls a view can name declaratively belong here. Most companion
 * controls are wired by the framework itself and never appear in a view.
 */

/** name -> the control's public metadata, as UI5 wants it. */
export const CC_CONTROLS = {
  MultiInputExt: {
    properties: {
      MultiInputId: { type: 'string' },
      MultiInputName: { type: 'string' },
      addedTokens: { type: 'object' },
      checkInit: { type: 'boolean', defaultValue: false },
      removedTokens: { type: 'object' },
      TokenKeyCell: { type: 'int', defaultValue: -1 },
      TokenTextCells: { type: 'string', defaultValue: '' },
    },
    events: { change: { allowPreventDefault: true, parameters: {} } },
  },
  MessageManager: {
    properties: {
      items: { type: 'object' },
      checkInit: { type: 'boolean', defaultValue: false },
    },
    events: { change: { allowPreventDefault: true, parameters: {} } },
  },
};

/** The `sap.ui.define` blocks the harness boots with, one per mirrored
 *  control — generated from CC_CONTROLS so the harness and the drift gate
 *  cannot disagree about what is mirrored. */
export function ccMirrorScript(indent = '      ') {
  return Object.entries(CC_CONTROLS).map(([name, meta]) =>
    `${indent}sap.ui.define('z2ui5/cc/${name}', ['sap/ui/core/Control'], function (Control) {\n`
    + `${indent}  return Control.extend('z2ui5.cc.${name}', {\n`
    + `${indent}    metadata: ${JSON.stringify({ properties: meta.properties, events: meta.events })},\n`
    + `${indent}    renderer: { apiVersion: 2, render: function () {} },\n`
    + `${indent}  });\n`
    + `${indent}});`).join('\n');
}
