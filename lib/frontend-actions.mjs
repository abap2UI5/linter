/*
 * frontend-actions — the closed sets the abap2UI5 runtime accepts on the wire.
 *
 * A frontend action (`client->_event_client( )`, `client->follow_up_action( )`)
 * is dispatched in the browser by name, and a name outside the whitelist is
 * not an exception anywhere: FrontendAction logs to the console and the wire
 * does nothing. Nothing in ABAP, nothing in the view and nothing in the render
 * gate can see that, which is exactly the kind of defect this linter exists
 * for.
 *
 * HAND-MAINTAINED, unlike data/properties.json. The source of truth is
 * abap2UI5's frontend action modules (`app/webapp/core/actions/*.js`,
 * shipped as the `z2ui5_cl_ui5f_*_js` classes) — JavaScript embedded in an
 * ABAP string concatenation, which is not something to parse. They were one
 * module, `FrontendAction.js`, until upstream split them per action group.
 * Refresh by reading these constants there:
 *
 *   GLOBAL_TARGETS               the global objects and their allowed methods
 *   BINDING_METHODS              the binding methods BINDING_CALL may build
 *   CONTROL_METHOD_DENY_EXACT    the generic reflection mutators
 *   CONTROL_METHOD_DENY_PREFIXES the framework-hostile method prefixes
 *
 * Only closed sets belong here. CONTROL_BY_ID's ALLOWED method list is
 * deliberately absent: the runtime accepts any public control method that the
 * denylist does not match, so the allowed side is open by design and a static
 * whitelist would report correct code. The DENIED side is the closed one, and
 * it is mirrored below.
 */

/** Global object -> the methods FrontendAction lets CONTROL_GLOBAL call.
 *  ABAP side: t_arg = VALUE #( ( `GLOBAL` ) ( `method` ) ( params… ) ). */
export const GLOBAL_TARGETS = {
  MESSAGE_TOAST: ['show'],
  // the method IS the box type, and showBox falls back to show( ) for a type
  // the running UI5 version does not carry
  MESSAGE_BOX: ['show', 'alert', 'confirm', 'information', 'warning', 'error', 'success'],
  // ViewSlots — the slot teardown/display path. `destroy` is what the server
  // formats cs_event-popup_close / popover_close into (see
  // FRONTEND_EVENT_ALIASES), `display` takes the slot AND the view XML, and
  // `updateModel` takes no slot at all: which slots are open is the
  // frontend's own knowledge, so the action only says the model changed
  VIEW_SLOTS: ['destroy', 'display', 'updateModel'],
  // the hash router; `sync` re-reads the hash after the backend changed it
  ROUTER: ['sync'],
  BUSY_INDICATOR: ['show', 'hide'],
  THEMING: ['setTheme'],
  // sap.ui.core.Popup.setWithinArea — confine every popup to the control whose
  // id is passed instead of to the window; an EMPTY argument releases it again
  POPUP: ['setWithinArea'],
  // sap.ui.core.InvisibleMessage (@since 1.78) — announce(text, mode) reads a
  // text out to a screen reader without rendering it. A singleton, so there is
  // no control id and CONTROL_BY_ID cannot reach it
  INVISIBLE_MESSAGE: ['announce'],
  // sap/base/i18n/Formatting (@since 1.120) — global formatting configuration;
  // custom currency codes/digits for the standard sap.ui.model.type.Currency.
  // setCustomCurrencies REPLACES the whole registration, addCustomCurrencies
  // MERGES into it. (Both names corrected 2026-08-24: the module was mirrored
  // as sap.ui.core.Formatting, which does not exist, and the merge method as
  // the singular addCustomCurrency, which is not an API either.)
  FORMATTING: ['setCustomCurrencies', 'addCustomCurrencies'],
  // sap.ui.core.IconPool — registerFont(fontFamily, fontURI) makes an icon
  // collection outside the default SAP-icons font resolvable. A module-level
  // singleton, so CONTROL_BY_ID cannot reach it; without the registration a
  // sap-icon://SAP-icons-TNT/... URI renders no glyph and logs nothing
  ICON_POOL: ['registerFont'],
};

/** CONTROL_BY_ID's `css` pseudo-method writes ONE declaration onto the
 *  control's own DOM node, for a value no property carries (sap.m.Page has no
 *  width). The frontend accepts only these properties and logs an error for
 *  anything else - a wire with a different property looks fine in the source
 *  and silently does nothing.
 *  Mirrors CSS_PROPERTIES in app/webapp/core/actions/ControlCall.js. */
export const CSS_PROPERTIES = [
  'width', 'min-width', 'max-width',
  'height', 'min-height', 'max-height',
  'color', 'background-color', 'font-size', 'opacity',
];

/* CONTROL_BY_ID's denylist, mirroring actions/ControlCall.js `isSafeControlMethod`.
 * A denied method never reaches the control: the dispatch logs "method not
 * allowed" and returns, so the wire is exactly as silent as an unknown id —
 * the ABAP compiles, the view renders, the button does nothing.
 *
 * Two lists because the runtime matches them differently. The GENERIC
 * reflection mutators take the member name as an argument and have one
 * spelling each, so they are denied by EXACT name — matching them by prefix
 * would swallow the NAMED per-aggregation methods (removeAllItems,
 * destroyContent), which the runtime allows and this rule must not report.
 * The rest is hostile in every spelling and stays a prefix. */
export const CONTROL_METHOD_DENY_EXACT = [
  'destroy', 'exit', 'fireEvent', 'clone', 'applySettings',
  'setAggregation', 'addAggregation', 'insertAggregation',
  'removeAggregation', 'removeAllAggregation', 'destroyAggregation',
  'setAssociation', 'addAssociation', 'removeAssociation', 'removeAllAssociation',
];
export const CONTROL_METHOD_DENY_PREFIXES = [
  '_', 'bind', 'unbind', 'attach', 'detach', 'addDependent', 'placeAt',
  'rerender', 'invalidate', 'setModel', 'setBinding', 'setParent',
];

/** Why the runtime refuses this method name, or null when it accepts it. */
export function deniedControlMethod(method) {
  const name = String(method ?? '');
  if (!name) return null;
  if (CONTROL_METHOD_DENY_EXACT.includes(name)) return name;
  return CONTROL_METHOD_DENY_PREFIXES.find((p) => name.startsWith(p)) ?? null;
}

/** The binding methods BINDING_CALL can build.
 *  ABAP side: t_arg = VALUE #( ( `id` ) ( `aggregation` ) ( `method` ) … ). */
export const BINDING_METHODS = ['filter', 'sort'];

/** The TOP-LEVEL dispatch table: every action name `FrontendAction.execute`
 *  knows. A name outside it is the quietest miss of all — `execute` looks up
 *  `handlers[args[0]]` and simply does nothing, not even a console line.
 *  Case-sensitive: the runtime never upper-cases, so `set_title` misses.
 *  Mirrors the `handlers` objects at the bottom of FrontendAction.js and of
 *  each actions/*.js module — the dispatch table is per action group now. */
export const FRONTEND_EVENTS = [
  'SET_SIZE_LIMIT', 'CLIPBOARD_COPY',
  'CLIPBOARD_APP_STATE', 'SET_ODATA_MODEL', 'STORE_DATA', 'DOWNLOAD_B64_FILE',
  'CROSS_APP_NAV_TO_PREV_APP', 'CROSS_APP_NAV_TO_EXT', 'LOCATION_RELOAD',
  'SYSTEM_LOGOUT', 'OPEN_NEW_TAB',
  'BIND_ELEMENT', 'URLHELPER', 'IMAGE_EDITOR_POPUP_CLOSE', 'SET_TITLE',
  'SET_FAVICON', 'SET_TITLE_LAUNCHPAD', 'SET_FOCUS', 'SCROLL_TO',
  'SCROLL_INTO_VIEW', 'START_TIMER', 'KEYBOARD_SET_MODE', 'KEYBOARD_SHORTCUT',
  'Z2UI5', 'WIZARD_SET_NEXT_STEP', 'PLAY_AUDIO', 'SMART_VARIANT_INIT',
  'FILTER_BAR_VARIANT_INIT', 'CONTROL_BY_ID', 'CONTROL_GLOBAL', 'BINDING_CALL',
];

/** Names the SERVER remaps before they reach the dispatch table
 *  (z2ui5_cl_ui5_srv_event=>map_client_event). Not in the frontend source, so
 *  not gated by check-upstream — but every one of them is a released cs_event
 *  constant an app is meant to use, so the linter must accept them.
 *
 *  The five `*_NAV_CONTAINER_TO` names become a CONTROL_BY_ID `to` wire; they
 *  are marked "obsolete?" upstream and have not moved in years.
 *
 *  POPUP_CLOSE / POPOVER_CLOSE became remaps too: the server formats either
 *  one as the CONTROL_GLOBAL `["VIEW_SLOTS","destroy","<slot>"]` action that
 *  popup_destroy( ) already queued, so the frontend has a single teardown
 *  path. Upstream is explicit that the two constants stay — closing a dialog
 *  with `_event_client( cs_event-popup_close )` round-trip free "is the whole
 *  point of them" — so they moved here rather than being dropped. */
export const FRONTEND_EVENT_ALIASES = [
  'NAV_CONTAINER_TO', 'NEST_NAV_CONTAINER_TO', 'NEST2_NAV_CONTAINER_TO',
  'POPUP_NAV_CONTAINER_TO', 'POPOVER_NAV_CONTAINER_TO',
  'POPUP_CLOSE', 'POPOVER_CLOSE',
];

/** The five view slots (cs_view values / ViewSlots keys). Case-sensitive on
 *  the wire: the server compares the `view` parameter as an ABAP string and
 *  the frontend uses it as an object key, so `main` misses and `NESTED` —
 *  the natural guess for cs_view-nested, whose VALUE is `NEST` — misses too.
 *  Worse than a missing slot: for CONTROL_BY_ID a wrong slot SUPPRESSES the
 *  global id fallback, so the wire dies although the id exists. */
export const VIEW_SLOTS = ['MAIN', 'NEST', 'NEST2', 'POPUP', 'POPOVER'];

/** BINDING_CALL filter's operator whitelist — case-sensitive (`contains`
 *  misses), a miss logs "operator not allowed" and leaves the binding
 *  untouched. Mirrors FILTER_OPERATORS in actions/ControlCall.js. */
export const FILTER_OPERATORS = [
  'BT', 'Contains', 'EndsWith', 'EQ', 'GE', 'GT', 'LE', 'LT',
  'NB', 'NE', 'NotContains', 'NotEndsWith', 'NotStartsWith', 'StartsWith',
];

/** URLHELPER's action names (first t_arg) — a miss is `if (fn) fn()`:
 *  a silent no-op, no log. Mirrors the `actions` map in evUrlHelper. */
export const URLHELPER_ACTIONS = [
  'REDIRECT', 'TRIGGER_EMAIL', 'TRIGGER_SMS', 'TRIGGER_TEL',
];

/** Which t_arg positions carry a control id, per action. All of them resolve
 *  in the browser and fail logged-or-silent: SET_FOCUS / SCROLL_TO /
 *  SCROLL_INTO_VIEW / KEYBOARD_SET_MODE `return` without even a console
 *  line, WIZARD_SET_NEXT_STEP guards each id silently, the two variant-init
 *  actions log only after five seconds of retries, BINDING_CALL logs "no
 *  binding on control". Same trust condition as CONTROL_BY_ID: judged only
 *  when every id the class declares is a literal. */
export const ACTION_ID_SLOTS = {
  set_focus: [0], scroll_to: [0], scroll_into_view: [0], keyboard_set_mode: [0],
  binding_call: [0],
  wizard_set_next_step: [0, 1, 2],
  smart_variant_init: [0, 1],
  filter_bar_variant_init: [0, 1],
};

/** CONTROL_BY_ID methods whose FIRST argument (t_arg position 2) is itself a
 *  control id — the `controlId` / `pageId` / `anchor` / `controlIdOrNull`
 *  kinds of the CONTROL_METHODS map in actions/ControlCall.js, from which
 *  check-upstream re-derives this list. A miss resolves nothing and logs.
 *
 *  `pageId` belongs here even though the container is handed a STRING: it is
 *  `resolveControl( )` first and `.getId( )` after, so what the app writes on
 *  the ABAP side is still a control id and still has to exist in the view.
 *  The kind only records that sap.f.FlexibleColumnLayout and
 *  sap.m.SplitContainer probe with `aPages[i].getId() == pageId` and so need
 *  the id rather than the control — which is a fact about the container, not
 *  about the argument this list is checking. */
export const CONTROL_METHOD_ID_ARG = [
  'to', 'toDetail', 'toMaster', 'discardProgress', 'setNextStep', 'goToStep',
  'openBy', 'toggleBy', 'setActivePage', 'setSelectedSection', 'setSelectedItem',
];

/** CONTROL_BY_ID methods whose argument is a JSON payload (`object` kind in
 *  CONTROL_METHODS): a literal that does not parse as JSON silently becomes
 *  `{}` (castArg's catch). For the two enum-array payloads the VALUES are
 *  checkable against the snapshot; setP13nData's shape is the panel's own. */
export const OBJECT_ARG_METHODS = {
  setSticky: 'sap.m.Sticky',
  setHiddenInPopin: 'sap.ui.core.Priority',
  setP13nData: null,
};

/** The shortcut normalizer's modifier and alias tables — a combo that names
 *  no non-modifier key is logged and never registered. Mirrors
 *  SHORTCUT_MODIFIERS / SHORTCUT_ALIASES in actions/Shortcuts.js. */
export const SHORTCUT_MODIFIERS = ['ctrl', 'shift', 'alt', 'meta'];
export const SHORTCUT_ALIASES = {
  control: 'ctrl', cmd: 'meta', command: 'meta', option: 'alt',
  esc: 'escape', del: 'delete', ins: 'insert', return: 'enter', space: ' ',
};

/*
 * Which t_arg position carries what, per action token — ABAP-side positions,
 * 0-based. The runtime prepends the action itself and, for CONTROL_BY_ID,
 * inserts the view slot at index 2 on the server (get_event_client), so the
 * JS `args` indices in the frontend modules are NOT these.
 */
export const ACTION_ARGS = {
  control_global: [
    { at: 0, name: 'global object', allowed: () => Object.keys(GLOBAL_TARGETS) },
    { at: 1, name: 'method', allowed: (args) => GLOBAL_TARGETS[String(args[0]).toUpperCase()] },
  ],
  binding_call: [
    { at: 2, name: 'binding method', allowed: () => BINDING_METHODS },
    /* the positional single-filter form: path@3, operator@4, values@5/6.
     * Only judged when a value slot exists — with none, the runtime clears
     * the filter before ever reading the operator, so an operator there is
     * inert, not broken. The compound form (a JSON param@3 starting with
     * `[`) is judged row by row in abap-rules instead. */
    {
      at: 4,
      name: 'filter operator',
      allowed: (args) => (String(args[2]) === 'filter'
        && !String(args[3] ?? '').trimStart().startsWith('[')
        && args.length > 5 ? FILTER_OPERATORS : null),
    },
  ],
  urlhelper: [
    { at: 0, name: 'action', allowed: () => URLHELPER_ACTIONS },
  ],
  control_by_id: [
    // only the `css` pseudo-method has a closed argument set; every other
    // control method is open by design (any public, non-denylisted method)
    {
      at: 2,
      name: 'css property',
      allowed: (args) => (String(args[1] ?? '').toLowerCase() === 'css' ? CSS_PROPERTIES : null),
    },
  ],
};
