/*
 * cc-controls — metadata-only MIRRORS of the bundled abap2UI5 companion
 * controls (`app/webapp/cc/*.js`, used declaratively in views as
 * `<z2ui5:Name xmlns:z2ui5="z2ui5.cc" …/>`).
 *
 * The render harness needs a control class to exist before it can create a
 * view that names one, and it only validates view CREATION — never their
 * behaviour — so a property list, the events and the base class are the whole
 * mirror.
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
 *
 * **A control MISSING from this file is the one drift `check-upstream` cannot
 * see** — it walks the names in here and compares each one's properties, so a
 * companion control that was never mirrored is simply not looked at. That is
 * how nine of the eleven view-declarable ones stayed out until 2026-09-13,
 * when a downstream app (abap2UI5/samples-controls' Shopping Cart demo app)
 * named `<z2ui5:Storage>` — the browser-storage idiom abap2UI5/samples app
 * 327 documents — and its view CREATION failed on a control that exists in
 * every real installation. The set below is now the full declarable one; when
 * abap2UI5 adds another, ADD IT HERE, and check the render gate of a view
 * that names it rather than trusting a green drift run.
 */

/** name -> the control's public metadata, as UI5 wants it. `base` is the
 *  module the mirror extends and defaults to `sap/ui/core/Control`; only a
 *  companion control that extends a real UI5 control (CameraSelector, a
 *  ComboBox) needs it, and only so the aggregation rules see the right type. */
export const CC_CONTROLS = {
  // The camera controls and the file uploader are the visible ones: a view
  // places them like any other control.
  CameraPicture: {
    properties: {
      value: { type: 'string' },
      thumbnail: { type: 'string' },
      width: { type: 'string', defaultValue: '' },
      height: { type: 'string', defaultValue: '' },
      autoplay: { type: 'boolean', defaultValue: true },
      facingMode: { type: 'string' },
      deviceId: { type: 'string' },
    },
    events: {
      OnPhoto: { allowPreventDefault: true, parameters: { photo: { type: 'string' } } },
      press: { allowPreventDefault: true, parameters: {} },
    },
  },
  // A ComboBox rather than a Control, and with no metadata of its own: it
  // fills itself with the cameras navigator.mediaDevices reports. The mirror
  // is therefore the base class and nothing else - which is what the
  // aggregation rules need, because a view names it where a ComboBox is
  // allowed.
  CameraSelector: {
    base: 'sap/m/ComboBox',
    properties: {},
    events: {},
  },
  Dirty: {
    properties: {
      isDirty: { type: 'boolean', defaultValue: false },
    },
    events: {},
  },
  FileUploader: {
    properties: {
      value: { type: 'string', defaultValue: '' },
      path: { type: 'string', defaultValue: '' },
      fileType: { type: 'string', defaultValue: '' },
      placeholder: { type: 'string', defaultValue: '' },
      buttonText: { type: 'string', defaultValue: '' },
      style: { type: 'string', defaultValue: '' },
      uploadButtonText: { type: 'string', defaultValue: 'Upload' },
      enabled: { type: 'boolean', defaultValue: true },
      icon: { type: 'string', defaultValue: 'sap-icon://browse-folder' },
      iconOnly: { type: 'boolean', defaultValue: false },
      buttonOnly: { type: 'boolean', defaultValue: false },
      multiple: { type: 'boolean', defaultValue: false },
      checkDirectUpload: { type: 'boolean', defaultValue: false },
    },
    events: {
      upload: { allowPreventDefault: true, parameters: {} },
    },
  },
  Geolocation: {
    properties: {
      longitude: { type: 'string', defaultValue: '' },
      latitude: { type: 'string', defaultValue: '' },
      altitude: { type: 'string', defaultValue: '' },
      accuracy: { type: 'string', defaultValue: '' },
      altitudeAccuracy: { type: 'string', defaultValue: '' },
      speed: { type: 'string', defaultValue: '' },
      heading: { type: 'string', defaultValue: '' },
      enableHighAccuracy: { type: 'boolean', defaultValue: false },
      timeout: { type: 'string', defaultValue: '5000' },
    },
    events: {
      finished: { allowPreventDefault: true, parameters: {} },
      error: { parameters: { code: { type: 'string' }, message: { type: 'string' } } },
    },
  },
  MessageManager: {
    properties: {
      items: { type: 'object' },
      checkInit: { type: 'boolean', defaultValue: false },
    },
    events: {
      change: { allowPreventDefault: true, parameters: {} },
    },
  },
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
    events: {
      change: { allowPreventDefault: true, parameters: {} },
    },
  },
  // Browser storage, the read half: an invisible control that reports what it
  // found under `key` through `finished`. The write half is the STORE_DATA
  // frontend action, which no view names (abap2UI5/samples app 327).
  Storage: {
    properties: {
      type: { type: 'string', defaultValue: 'session' },
      prefix: { type: 'string', defaultValue: '' },
      key: { type: 'string', defaultValue: '' },
      value: { type: 'any', defaultValue: '' },
    },
    events: {
      finished: { parameters: { type: { type: 'string' }, prefix: { type: 'string' }, key: { type: 'string' }, value: { type: 'any' } } },
    },
  },
  Tree: {
    properties: {
      tree_id: { type: 'string' },
    },
    events: {},
  },
  UITableExt: {
    properties: {
      tableId: { type: 'string' },
    },
    events: {},
  },
  Websocket: {
    properties: {
      path: { type: 'string', defaultValue: '' },
      value: { type: 'string', defaultValue: '' },
      checkActive: { type: 'boolean', defaultValue: true },
      checkRepeat: { type: 'boolean', defaultValue: true },
    },
    events: {
      received: { allowPreventDefault: true, parameters: {} },
      error: { parameters: { code: { type: 'string' }, message: { type: 'string' } } },
    },
  },
};

/** The `sap.ui.define` blocks the harness boots with, one per mirrored
 *  control — generated from CC_CONTROLS so the harness and the drift gate
 *  cannot disagree about what is mirrored. */
export function ccMirrorScript(indent = '      ') {
  return Object.entries(CC_CONTROLS).map(([name, meta]) => {
    const base = meta.base || 'sap/ui/core/Control';
    const parent = base.split('/').pop();
    return `${indent}sap.ui.define('z2ui5/cc/${name}', ['${base}'], function (${parent}) {\n`
      + `${indent}  return ${parent}.extend('z2ui5.cc.${name}', {\n`
      + `${indent}    metadata: ${JSON.stringify({ properties: meta.properties, events: meta.events })},\n`
      + `${indent}    renderer: { apiVersion: 2, render: function () {} },\n`
      + `${indent}  });\n`
      + `${indent}});`;
  }).join('\n');
}
