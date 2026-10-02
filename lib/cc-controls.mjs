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
 * The property walk reads the same mirrors (CC_METADATA): a mirrored
 * companion control is judged like any UI5 control - an attribute neither it
 * nor its base class declares is an `unknown-property`, with the did-you-mean
 * (`inputmode` -> `inputMode`) - where it used to be looked away from with
 * every other foreign-namespace tag. A companion control nobody mirrored
 * still is: no metadata, no verdict. So the base class is not a detail
 * either: InputExt extends sap.m.Input, and `value`, `placeholder` and
 * `submit` on it are correct only because the mirror says so too.
 *
 * This is the fourth hand-maintained knowledge file, and it rotted the way
 * the other three did before they were gated: abap2UI5 added TokenKeyCell /
 * TokenTextCells to MultiInputExt on 2026-08-22 and every view using them
 * failed view CREATION here — which is not a property finding a downstream
 * deviation can carry, but a dead view. `scripts/check-upstream.mjs` compares
 * this file against `app/webapp/cc/*.js` now, so the next one is caught.
 *
 * ONLY the controls a view can name declaratively belong here - which is
 * every one `app/webapp/cc` ships; the framework's own wiring lives elsewhere.
 *
 * **A control MISSING from this file was the one drift `check-upstream` could
 * not see** — it walked the names in here and compared each one's properties,
 * so a companion control that was never mirrored was simply not looked at.
 * That is how nine of the eleven view-declarable ones stayed out until
 * 2026-09-13, when a downstream app (abap2UI5/samples-controls' Shopping Cart
 * demo app) named `<z2ui5:Storage>` — the browser-storage idiom
 * abap2UI5/samples app 327 documents — and its view CREATION failed on a
 * control that exists in every real installation; and how three more did
 * until 2026-09-27: InputExt, UploadSetExt and SmartMultiInputExt, whose
 * views (abap2UI5/samples apps 516, 517 and 530, samples-stack app 319)
 * failed CREATION with a module 404 and were excused by file. The set below
 * is every control `app/webapp/cc` ships, and `check-upstream` compares the
 * two lists now, so the next one is a drift report instead of a dead view.
 * When it comes, ADD IT HERE, and check the render gate of a view that names
 * it rather than trusting a green drift run.
 *
 * **The OBSOLETE ones are mirrored too, and marked.** abap2UI5 flags eight
 * of its companion controls with an `// OBSOLETE: replaced by …` header in
 * their source (Timer, Focus, Scrolling, Title, LPTitle, Favicon, Info,
 * History - each replaced by a frontend action or a client method). They
 * still ship and still work, so a view naming one is NOT a dead view, and
 * the render gate must not say it is: before they were mirrored here a
 * `<z2ui5:Timer>` failed view CREATION with a module 404, which reads like a
 * broken view rather than a retired API. The entry's `obsolete` block is what
 * `obsolete-custom-control` reports instead - the replacement the finding
 * names, and the `z2ui5_cl_xml_view_cc` helper that emitted the control on
 * the frozen builder (`_z2ui5( )->timer( )`). `check-upstream` compares the
 * marked set against the `// OBSOLETE:` headers of ALL of
 * `app/webapp/cc/*.js` (both directions), the API names each header points
 * at (`cs_event-start_timer`, `s_device`, `hash_set`, …) against the
 * replacement written here, and the helper names against
 * `src/99/z2ui5_cl_xml_view_cc` - so the list is not hand-maintained drift,
 * it is a mirror with a gate like the rest of this file.
 */

/** The XML namespace the companion controls live in. A prefix is whatever a
 *  view binds to it - `z2ui5` by convention, `cc` in KNOWN_NS, anything else
 *  in a hand-written view. */
export const CC_NAMESPACE = 'z2ui5.cc';

/** name -> the control's public metadata, as UI5 wants it. `base` is the
 *  module the mirror extends and defaults to `sap/ui/core/Control`; only a
 *  companion control that extends a real UI5 control (CameraSelector, a
 *  ComboBox; InputExt, an Input) needs it, and it decides everything the
 *  control inherits - the attributes the harness accepts at view creation
 *  and the ones the property walk knows (CC_METADATA below), the aggregation
 *  types a view may put it in. `renderer` names the renderer module upstream
 *  renders the control with (InputExt: sap/m/InputRenderer); without it the
 *  mirror renders nothing, which is all an invisible companion does anyway. */
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
  // A sap.m.Input that carries the HTML `inputmode` of its inner <input> as a
  // bindable property (abap2UI5/samples apps 516 and 530). It IS an Input -
  // upstream extends sap/m/Input and renders with InputRenderer - so the base
  // is the real one, and so is the renderer: every attribute a view writes on
  // an Input is an attribute of this control too, and the gate renders the
  // field the app shows.
  InputExt: {
    base: 'sap/m/Input',
    renderer: 'sap/m/InputRenderer',
    properties: {
      inputMode: { type: 'string', defaultValue: '' },
    },
    events: {},
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
  // The invisible companion of a SmartMultiInput (sap.ui.comp, SAPUI5 only),
  // found through `multiInputId`: it mirrors the tokens and the range data
  // into bindable properties (abap2UI5/samples-stack app 319). A Control, not
  // a MultiInput - the input it serves is a separate control in the view.
  SmartMultiInputExt: {
    properties: {
      multiInputId: { type: 'string' },
      addedTokens: { type: 'object' },
      removedTokens: { type: 'object' },
      rangeData: { type: 'object' },
      checkInit: { type: 'boolean', defaultValue: false },
    },
    events: {
      change: { allowPreventDefault: true, parameters: {} },
    },
  },
  // The scan button of the native mobile shell (abap2UI5/mobile-shell): it
  // calls window.abap2ui5Native.scanBarcode( ) and fires OnScan / OnError.
  // Visible inside the shell; outside it an invisible placeholder unless
  // showInBrowser - the mirror renders nothing either way, which is all the
  // render gate needs to CREATE a view naming it.
  NativeBridgeScan: {
    properties: {
      value: { type: 'string', defaultValue: '' },
      text: { type: 'string', defaultValue: 'Scan' },
      icon: { type: 'string', defaultValue: 'sap-icon://bar-code' },
      enabled: { type: 'boolean', defaultValue: true },
      showInBrowser: { type: 'boolean', defaultValue: false },
    },
    events: {
      OnScan: { parameters: { value: { type: 'string' } } },
      OnError: { parameters: { message: { type: 'string' } } },
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
  // The invisible companion of a sap.m.upload.UploadSet, found through
  // `uploadSetId`: it reads every added file into the bindable properties as
  // a base64 data URL and reports removals, so no upload endpoint is needed
  // (abap2UI5/samples app 517). A Control, not an UploadSet.
  UploadSetExt: {
    properties: {
      uploadSetId: { type: 'string' },
      fileData: { type: 'string', defaultValue: '' },
      fileName: { type: 'string', defaultValue: '' },
      mediaType: { type: 'string', defaultValue: '' },
      fileSize: { type: 'string', defaultValue: '' },
      removedFileName: { type: 'string', defaultValue: '' },
      checkInit: { type: 'boolean', defaultValue: false },
    },
    events: {
      change: { allowPreventDefault: true, parameters: {} },
      remove: { allowPreventDefault: true, parameters: {} },
    },
  },
  /* ── OBSOLETE (see the header): mirrored so a view naming one still
   * CREATES in the render gate, marked so obsolete-custom-control reports
   * it. `replacement` is the sentence the finding ends on, spelled in the
   * released API's own names (z2ui5_if_client: cs_event, get( ), hash_set( ),
   * app_state_set_active( )); `helper` is the z2ui5_cl_xml_view_cc method
   * that wrote the tag on the frozen builder. ── */
  Favicon: {
    properties: {
      favicon: { type: 'string' },
    },
    events: {},
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-set_favicon t_arg = VALUE #( ( `<url>` ) ) )', helper: 'favicon' },
  },
  Focus: {
    properties: {
      setUpdate: { type: 'boolean', defaultValue: true },
      focusId: { type: 'string' },
      selectionStart: { type: 'string', defaultValue: '0' },
      selectionEnd: { type: 'string', defaultValue: '0' },
    },
    events: {},
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-set_focus t_arg = VALUE #( ( `<id>` ) ) )', helper: 'focus' },
  },
  History: {
    properties: {
      search: { type: 'string' },
    },
    events: {},
    obsolete: { replacement: 'client->hash_set( ) or client->app_state_set_active( )', helper: 'history' },
  },
  Info: {
    properties: {
      ui5_version: { type: 'string' },
      device_phone: { type: 'string' },
      device_desktop: { type: 'string' },
      device_tablet: { type: 'string' },
      device_combi: { type: 'string' },
      device_height: { type: 'string' },
      device_width: { type: 'string' },
      ui5_theme: { type: 'string' },
      ui5_gav: { type: 'string' },
      device_os: { type: 'string' },
      device_systemtype: { type: 'string' },
      device_browser: { type: 'string' },
    },
    events: {
      finished: { allowPreventDefault: true, parameters: {} },
    },
    obsolete: { replacement: 'client->get( )-s_device and client->get( )-s_ui5', helper: 'info_frontend' },
  },
  LPTitle: {
    properties: {
      title: { type: 'string' },
      ApplicationFullWidth: { type: 'boolean' },
    },
    events: {},
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-set_title_launchpad t_arg = VALUE #( ( `<title>` ) ) )', helper: 'lp_title' },
  },
  Scrolling: {
    properties: {
      setUpdate: { type: 'boolean', defaultValue: true },
      items: { type: 'object' },
    },
    events: {},
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-scroll_to … ) or ( val = client->cs_event-scroll_into_view … )', helper: 'scrolling' },
  },
  Timer: {
    properties: {
      delayMS: { type: 'int', defaultValue: 0 },
      checkActive: { type: 'boolean', defaultValue: true },
      checkRepeat: { type: 'boolean', defaultValue: false },
    },
    events: {
      finished: { allowPreventDefault: true, parameters: {} },
    },
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-start_timer t_arg = VALUE #( ( `<EVENT>` ) ( `<ms>` ) ) )', helper: 'timer' },
  },
  Title: {
    properties: {
      title: { type: 'string' },
    },
    events: {},
    obsolete: { replacement: 'client->follow_up_action( val = client->cs_event-set_title t_arg = VALUE #( ( `<title>` ) ) )', helper: 'title' },
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

/** name -> { replacement, helper } for every companion control abap2UI5
 *  marks `// OBSOLETE:` - derived from CC_CONTROLS, so the rule and the
 *  harness read one table. */
export const OBSOLETE_CC_CONTROLS = Object.freeze(Object.fromEntries(
  Object.entries(CC_CONTROLS).filter(([, m]) => m.obsolete).map(([name, m]) => [name, m.obsolete]),
));

/** The mirrors as entries of the metadata snapshot, keyed by class name
 *  (`z2ui5.cc.InputExt`) and shaped like the harvested ones: the parent is
 *  the base class in dotted form, so an InputExt inherits everything
 *  sap.m.Input declares; no member carries a `since`: a companion control
 *  ships whole with the framework release that has it. The property
 *  walk layers these over the snapshot (withCompanionControls( ) in
 *  properties.mjs) and judges a mirrored companion control like any other. */
export const CC_METADATA = Object.freeze(Object.fromEntries(
  Object.entries(CC_CONTROLS).map(([name, m]) => [`${CC_NAMESPACE}.${name}`, {
    parent: (m.base || 'sap/ui/core/Control').replaceAll('/', '.'),
    members: {},
    properties: m.properties,
    aggregations: {},
    associations: {},
    events: Object.fromEntries(Object.entries(m.events).map(([e, d]) => [e, { params: d.parameters || {} }])),
  }]),
));

/** z2ui5_cl_xml_view_cc helper method (lower case) -> the obsolete control
 *  it writes: `view->_z2ui5( )->timer( )` is `<z2ui5:Timer>`. */
export const OBSOLETE_CC_HELPERS = Object.freeze(Object.fromEntries(
  Object.entries(OBSOLETE_CC_CONTROLS).map(([name, o]) => [o.helper, name]),
));

/** The `sap.ui.define` blocks the harness boots with, one per mirrored
 *  control — generated from CC_CONTROLS so the harness and the drift gate
 *  cannot disagree about what is mirrored. */
export function ccMirrorScript(indent = '      ') {
  return Object.entries(CC_CONTROLS).map(([name, meta]) => {
    const base = meta.base || 'sap/ui/core/Control';
    const parent = base.split('/').pop();
    // a named renderer module is required and used, as upstream does -
    // UI5 does not inherit a renderer, it looks for `<Class>Renderer`
    const renderer = meta.renderer ? meta.renderer.split('/').pop() : null;
    const deps = renderer ? `'${base}', '${meta.renderer}'` : `'${base}'`;
    const params = renderer ? `${parent}, ${renderer}` : parent;
    return `${indent}sap.ui.define('z2ui5/cc/${name}', [${deps}], function (${params}) {\n`
      + `${indent}  return ${parent}.extend('z2ui5.cc.${name}', {\n`
      + `${indent}    metadata: ${JSON.stringify({ properties: meta.properties, events: meta.events })},\n`
      + `${indent}    renderer: ${renderer ?? '{ apiVersion: 2, render: function () {} }'},\n`
      + `${indent}  });\n`
      + `${indent}});`;
  }).join('\n');
}
