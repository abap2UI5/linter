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
 * abap2UI5's `z2ui5_cl_app_frontendaction_js` — a JavaScript module embedded
 * in an ABAP string concatenation, which is not something to parse. Refresh
 * by reading these constants there:
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
  MESSAGE_BOX: ['show', 'information', 'warning', 'error', 'success'],
  BUSY_INDICATOR: ['show', 'hide'],
  THEMING: ['setTheme'],
  // sap.ui.core.Popup.setWithinArea — confine every popup to the control whose
  // id is passed instead of to the window; an EMPTY argument releases it again
  POPUP: ['setWithinArea'],
  // sap.ui.core.InvisibleMessage (@since 1.78) — announce(text, mode) reads a
  // text out to a screen reader without rendering it. A singleton, so there is
  // no control id and CONTROL_BY_ID cannot reach it
  INVISIBLE_MESSAGE: ['announce'],
  // sap.ui.core.Formatting (@since 1.120) — global formatting configuration;
  // custom currency codes/digits for the standard sap.ui.model.type.Currency
  FORMATTING: ['setCustomCurrencies', 'addCustomCurrency'],
};

/** CONTROL_BY_ID's `css` pseudo-method writes ONE declaration onto the
 *  control's own DOM node, for a value no property carries (sap.m.Page has no
 *  width). The frontend accepts only these properties and logs an error for
 *  anything else - a wire with a different property looks fine in the source
 *  and silently does nothing.
 *  Mirrors CSS_PROPERTIES in app/webapp/core/FrontendAction.js. */
export const CSS_PROPERTIES = [
  'width', 'min-width', 'max-width',
  'height', 'min-height', 'max-height',
  'color', 'background-color', 'font-size', 'opacity',
];

/* CONTROL_BY_ID's denylist, mirroring FrontendAction.js `isSafeControlMethod`.
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

/** Actions whose FIRST t_arg is a control id, resolved in the browser with a
 *  SILENT return on a miss — SET_FOCUS / SCROLL_TO / SCROLL_INTO_VIEW call
 *  ViewSlots.resolveById and `return` without even a console line when
 *  nothing answers, KEYBOARD_SET_MODE the same via byId("MAIN"). That is one
 *  step quieter than CONTROL_BY_ID (which at least logs), so the unknown-id
 *  rule covers these too. */
export const ID_ADDRESSED_ACTIONS = new Set([
  'set_focus', 'scroll_to', 'scroll_into_view', 'keyboard_set_mode',
]);

/*
 * Which t_arg position carries what, per action token — ABAP-side positions,
 * 0-based. The runtime prepends the action itself and, for CONTROL_BY_ID,
 * inserts the view slot at index 2 on the server (get_event_client), so the
 * JS `args` indices in FrontendAction.js are NOT these.
 */
export const ACTION_ARGS = {
  control_global: [
    { at: 0, name: 'global object', allowed: () => Object.keys(GLOBAL_TARGETS) },
    { at: 1, name: 'method', allowed: (args) => GLOBAL_TARGETS[String(args[0]).toUpperCase()] },
  ],
  binding_call: [
    { at: 2, name: 'binding method', allowed: () => BINDING_METHODS },
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
