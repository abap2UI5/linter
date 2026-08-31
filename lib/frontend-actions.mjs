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

/** The minimum UI5 release a CONTROL_GLOBAL wire needs, keyed `TARGET.method`.
 *
 *  Four of the targets above are resolved with a LAZY `sap.ui.require`, on
 *  purpose: a hard dependency on a module the running release does not carry
 *  404s and takes the whole component down. What the lazy form buys in
 *  robustness it pays for in silence — the require returns `undefined`, the
 *  dispatch hits its "not available" guard, and the wire does nothing at all.
 *  On a 1.71 floor every one of these is a dead wire with a console line, and
 *  no other gate can see it: the ABAP compiles, the view renders, the button
 *  does nothing.
 *
 *  Keyed per METHOD rather than per target because the two reasons differ. For
 *  THEMING, INVISIBLE_MESSAGE and FORMATTING the whole MODULE is too new, so
 *  every method carries the same floor; sap/ui/core/Popup exists on every
 *  supported release and only `setWithinArea` is @since 1.89. One key shape
 *  covers both, and a target with no entry is available everywhere.
 *
 *  Upstream records these as prose on the target entries rather than as data,
 *  so this is one of the few mirrors check-upstream does NOT compare — there
 *  is no literal to read. What the drift gate DOES compare is the target and
 *  method NAMES, so a fifth lazy target cannot arrive unnoticed; only its
 *  release would have to be added here by hand. Same reason
 *  FRONTEND_EVENT_ALIASES and SERVER_EVENTS are ungated: they live in the
 *  server, or in a comment, not in a closed set the script can parse. */
export const GLOBAL_TARGET_SINCE = {
  'THEMING.setTheme': '1.118',
  'INVISIBLE_MESSAGE.announce': '1.78',
  'FORMATTING.setCustomCurrencies': '1.120',
  'FORMATTING.addCustomCurrencies': '1.120',
  'POPUP.setWithinArea': '1.89',
};

/** sap.m.MessagePopover.setAsyncURLHandler takes a live JS callback — a shape
 *  no backend payload can carry — so the wire names one of these three
 *  built-in policies instead and the link gating stays declarative data.
 *  A name outside the set resolves to no policy at all.
 *  Mirrors URL_POLICIES in actions/ControlCall.js. */
export const URL_POLICIES = ['ALLOW_ALL', 'RELATIVE_ONLY', 'DENY_ALL'];

/** The three ScrollIntoViewOptions enums (SCROLL_INTO_VIEW) and the scroll
 *  behavior SCROLL_TO passes to Element.scrollTo. A value outside the set is
 *  a WebIDL TypeError inside the module's own try, so it becomes a
 *  Lib.logError and a scroll that does not happen.
 *  Mirrors the argument comments in actions/ViewOps.js. */
export const SCROLL_BEHAVIORS = ['auto', 'smooth', 'instant'];
export const SCROLL_BLOCKS = ['start', 'center', 'end', 'nearest'];

/** KEYBOARD_SET_MODE writes its argument straight into the DOM `inputmode`
 *  attribute. The browser IGNORES a value outside this set — the soft keyboard
 *  silently stays `text` — and nothing logs. An HTML closed set, so unlike the
 *  mirrors around it this one has no upstream drift to gate. */
export const INPUT_MODES = [
  'none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url',
];

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
  'HISTORY_BACK', 'SYSTEM_LOGOUT', 'OPEN_NEW_TAB',
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

/** Names the server CONSUMES: `z2ui5_cl_ui5_client~follow_up_action` opens on
 *  a CASE over these three and RETURNS, so they queue no action of their own
 *  and never reach the frontend dispatch table at all — they configure how the
 *  browser URL has to look after the roundtrip, and Router derives one outcome
 *  from all of them together.
 *
 *  They are released `cs_event` constants an app is meant to use, so the
 *  linter must accept them. Written as a cs_event constant they never entered
 *  the dispatch check to begin with; spelled as a LITERAL they were reported
 *  as an unknown action, which is a finding on correct code.
 *
 *  Not in the frontend source, so — like FRONTEND_EVENT_ALIASES — not gated by
 *  check-upstream. */
export const SERVER_EVENTS = [
  'SET_NAV_ROUTING', 'SET_PUSH_STATE', 'SET_APP_STATE_ACTIVE',
];

/** SET_NAV_ROUTING's one argument: `z2ui5_if_client=>cs_nav_mode`, which
 *  decides how much of the running app the URL hash carries and therefore what
 *  Back/Forward, a reload and a bookmark restore. Compared as an ABAP string
 *  on the server and as `state.navMode === "FRESH"` in Router.js, so it is
 *  case-sensitive; an EMPTY argument list is the documented way to mean KEEP
 *  and is not judged. A mode outside the set is stored and matches nothing:
 *  the app routes as if routing were off. */
export const NAV_MODES = ['DEFAULT', 'FRESH', 'KEEP'];

/** The five view slots (cs_view values / ViewSlots keys). Case-sensitive on
 *  the wire: the server compares the `view` parameter as an ABAP string and
 *  the frontend uses it as an object key, so `main` misses and `NESTED` —
 *  the natural guess for cs_view-nested, whose VALUE is `NEST` — misses too.
 *  Worse than a missing slot: for CONTROL_BY_ID a wrong slot SUPPRESSES the
 *  global id fallback, so the wire dies although the id exists. */
export const VIEW_SLOTS = ['MAIN', 'NEST', 'NEST2', 'POPUP', 'POPOVER'];

/** The same five, the other way round: a slot VALUE -> the `cs_view` constant
 *  that carries it. The pairing is not derivable — `cs_view-nested` is `NEST`
 *  and `cs_view-nested2` is `NEST2` — which is the whole reason a wire should
 *  name the constant rather than retype the value (`literal-view-slot`). */
export const CS_VIEW_CONSTANT = Object.freeze({
  MAIN: 'main', NEST: 'nested', NEST2: 'nested2', POPUP: 'popup', POPOVER: 'popover',
});

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

/** URLHELPER's SECOND argument is an OBJECT, not a value: `evUrlHelper` reads
 *  `args[2] ?? {}` and then picks named keys out of it. Handing it a plain
 *  string is therefore not a wrong value but a wrong SHAPE — every lookup
 *  comes back undefined and `URLHelper.triggerTel(undefined)` navigates to a
 *  bare `tel:`, which opens the dialler with no number and reports nothing.
 *
 *  The key names are worth mirroring rather than guessing at, because one of
 *  them is not the name anybody would guess: TRIGGER_SMS reads `params.TEL`,
 *  the same key as TRIGGER_TEL, and not `SMS` or `NUMBER`. A key outside the
 *  set is dropped in silence like every other miss on this wire. */
export const URLHELPER_PARAMS = {
  REDIRECT: { required: ['URL'], optional: ['NEW_WINDOW'] },
  TRIGGER_EMAIL: { required: ['EMAIL'], optional: ['SUBJECT', 'BODY', 'CC', 'BCC', 'NEW_WINDOW'] },
  TRIGGER_SMS: { required: ['TEL'], optional: ['TEXT', 'NEW_WINDOW'] },
  TRIGGER_TEL: { required: ['TEL'], optional: [] },
};

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
 *  about the argument this list is checking.
 *
 *  `backToPage` carries the same kind for a DIFFERENT reason, worth keeping
 *  apart: it does normalise a Control (NavContainer.js:1065, the same guard
 *  `to` has), so the kind is not there to rescue a Control. It is there
 *  because the id is matched against `_pageStack`, whose every entry was
 *  pushed as `page.getId()` — so `_findClosestPreviousPageInfo` compares with
 *  `===` (NavContainer.js:1203) and an unprefixed literal matches nothing,
 *  logs, and returns without navigating. */
/** CONTROL_METHODS itself: method -> the KINDS of its positional arguments,
 *  in order. Mirrors the map in actions/ControlCall.js.
 *
 *  Two things fall out of it that nothing else can see, and both are silent:
 *
 *  - ARITY. `castArgs` ends `kinds.slice(0, count)`, where `count` never
 *    exceeds `kinds.length`, so every t_arg past the declared kinds is
 *    DROPPED. A `back` or `collapseAll` wire carrying an argument, or a
 *    `setExpanded` carrying two, reads as intent and is dead weight.
 *  - KIND. `int` is load-bearing rather than decoration: the badge setters
 *    compare the incoming value against the STORED bound, so an undeclared
 *    numeric string makes the second comparison a STRING comparison —
 *    "50" >= "9" is false — and the value is dropped into an `else` whose
 *    only effect is a Log.warning.
 *
 *  The whole map is mirrored rather than the two projections the linter used
 *  to carry, because check-upstream already parsed it in full to derive them:
 *  keeping only the projections threw away the arity, which is the half no
 *  rule could ask for. A method ABSENT from the map is the open case — any
 *  public control method the denylist does not match — and is never judged
 *  on arity or kind. */
export const CONTROL_METHOD_KINDS = {
  to: ['pageId', 'string'],
  back: [],
  backToPage: ['pageId'],
  toDetail: ['controlId'],
  toMaster: ['controlId'],
  backDetail: [],
  backMaster: [],
  setMode: ['string'],
  navigateBack: [],
  focus: [],
  scrollToIndex: ['int'],
  scrollTo: ['int', 'int'],
  open: ['string'],
  close: [],
  setExpanded: ['bool'],
  discardProgress: ['controlId'],
  setNextStep: ['controlId'],
  goToStep: ['controlId', 'bool'],
  openBy: ['anchor'],
  toggleBy: ['anchor'],
  setActivePage: ['controlId'],
  expandToLevel: ['int'],
  collapseAll: [],
  expandSelected: [],
  collapseSelected: [],
  setHiddenInPopin: ['object'],
  setSticky: ['object'],
  setSelectedSection: ['controlIdOrNull'],
  setSelectedItem: ['controlIdOrNull'],
  setP13nData: ['object'],
  setBadgeMinValue: ['int'],
  setBadgeMaxValue: ['int'],
  css: ['string', 'string'],
  enablePostButton: ['bool'],
  addStyleClass: ['string'],
  removeStyleClass: ['string'],
  toggleStyleClass: ['string'],
  setAsyncURLHandler: ['string'],
};

/** The kinds that name a control id. `pageId` resolves one exactly as
 *  `controlId` does and differs only in what it hands the container
 *  afterwards; the `OrNull` variants take an EMPTY argument as the documented
 *  way to clear. */
const ID_KINDS = ['controlId', 'controlIdOrNull', 'pageId', 'anchor'];

/* Derived from the map above rather than retyped — the two used to be
 * maintained side by side, which is a mirror of a mirror. check-upstream
 * compares this against the same upstream parse either way. */
export const CONTROL_METHOD_ID_ARG = Object.keys(CONTROL_METHOD_KINDS)
  .filter((m) => ID_KINDS.includes(CONTROL_METHOD_KINDS[m][0]));

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
 *
 * `allowed( args, data )` returns the closed set for that slot, or null to
 * stay silent — an earlier slot already being wrong, or the value simply not
 * being one this slot constrains. `data` is the metadata snapshot, for the
 * slots whose set is a UI5 enum the snapshot already carries rather than a
 * frontend constant to mirror.
 */
export const ACTION_ARGS = {
  control_global: [
    { at: 0, name: 'global object', allowed: () => Object.keys(GLOBAL_TARGETS) },
    { at: 1, name: 'method', allowed: (args) => GLOBAL_TARGETS[String(args[0]).toUpperCase()] },
    /* INVISIBLE_MESSAGE.announce( text, mode ) — sap.ui.core.InvisibleMessageMode,
     * a two-value enum the snapshot already knows, so it is read from there
     * rather than retyped as a fourth constant to keep in step. An unknown
     * mode is not announced politely OR assertively: UI5 rejects it. */
    {
      at: 3,
      name: 'announce mode',
      allowed: (args, data) => (String(args[0]).toUpperCase() === 'INVISIBLE_MESSAGE'
        && String(args[1]) === 'announce'
        ? data?.__enums?.['sap.ui.core.InvisibleMessageMode'] ?? null : null),
    },
  ],
  /* The three URL-hash actions the SERVER consumes. Only the routing mode is
   * a closed set; set_push_state takes a free string and set_app_state_active
   * an empty argument (on) or a single space (off). An absent argument is the
   * documented KEEP default and never reaches this check. */
  set_nav_routing: [
    { at: 0, name: 'nav mode', allowed: () => NAV_MODES },
  ],
  scroll_to: [
    { at: 3, name: 'scroll behavior', allowed: () => SCROLL_BEHAVIORS },
  ],
  scroll_into_view: [
    { at: 1, name: 'scroll behavior', allowed: () => SCROLL_BEHAVIORS },
    { at: 2, name: 'scroll block', allowed: () => SCROLL_BLOCKS },
    { at: 3, name: 'scroll inline', allowed: () => SCROLL_BLOCKS },
  ],
  keyboard_set_mode: [
    { at: 1, name: 'inputmode', allowed: () => INPUT_MODES },
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
    /* …and setAsyncURLHandler, whose argument is a POLICY NAME rather than a
     * value: the real UI5 API takes a live JS callback, which no payload can
     * carry, so the frontend resolves one of three built-ins instead. A
     * misspelled name resolves to no policy at all. */
    {
      at: 2,
      name: 'URL policy',
      allowed: (args) => (String(args[1] ?? '') === 'setAsyncURLHandler' ? URL_POLICIES : null),
    },
  ],
};
