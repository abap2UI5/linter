import path from 'path';

/*
 * findings — severity, wording and source position for a finding.
 *
 * Every gate produces findings in the same shape ({ type, control?, member?,
 * value?, offset? }). What a finding *means* — does it break the app, is it
 * a portability warning, is it merely a hint — was until now decided
 * separately by each consumer (the CLI failed the build on everything, the
 * VS Code extension carried its own error/warning table, the wording was
 * copy-pasted between them). That judgement belongs to the linter, so it
 * lives here and everything else reads it from one place.
 *
 * A finding's `type` is its **rule id** — the name printed at the end of
 * every reported line, keyed in `abap2ui5lint.jsonc`'s `rules` block and
 * usable in a source directive. `SEVERITY_BY_TYPE` below is therefore the
 * rule registry: a type missing from it is not a known rule.
 */
import { scrub } from './abap.mjs';
import { CS_VIEW_CONSTANT } from './frontend-actions.mjs';

/** Ordered from the mildest to the most severe — comparisons use the index. */
export const SEVERITIES = ['hint', 'warning', 'error'];

/** ABAP's hard limit on a source line, and therefore abapGit's. Not a style
 *  setting and not configurable: over it the object does not import. */
export const LINE_LIMIT = 255;

export const severityRank = (s) => Math.max(0, SEVERITIES.indexOf(s));

/*
 * error   — the app breaks: a dump, a control that will not load, a value
 *           UI5 rejects, or a defect that silently destroys the view
 * warning — it works on the machine it was written for, but not necessarily
 *           on the target system (version floor, deprecation), or the data
 *           behind it is not what the author thinks it is
 * hint    — worth knowing, never wrong by itself
 */
const SEVERITY_BY_TYPE = {
  // --- runtime dumps in the view builder itself ----------------------------
  'excess-shut': 'error',
  'duplicate-property': 'error',
  'attribute-without-element': 'error',
  // --- the class does not even compile -------------------------------------
  'popover-display-val': 'error',
  'popover-anchor-unknown-id': 'error',
  'get-viewname-removed': 'error',
  'escaped-brace-in-backtick': 'error',
  // --- the view does not load / UI5 rejects it -----------------------------
  'unknown-control': 'error',
  'unknown-property': 'error',
  'unknown-aggregation': 'error',
  'invalid-property-value': 'error',
  'invalid-aggregation-child': 'error',
  'too-many-children': 'error',
  'duplicate-id': 'error',
  'undeclared-namespace': 'error',
  'invalid-expression-binding': 'error',
  /* The one rule whose severity depends on what the CONFIG says rather
   * than on what the view does. `"distribution": "openui5"` states that
   * the target does not ship the library, so the control cannot load and
   * this is the error below. With no `distribution` at all the linter
   * does not know which system this runs on, so properties.mjs attaches
   * `hint` to the finding instead - see the emit site. `"sapui5"` reports
   * nothing. A `rules` override still beats both. */
  'sapui5-only-control': 'error',
  // a name that matches no glyph in any release: the control renders without
  // an icon, in every system, and nothing anywhere says so
  'unknown-icon': 'error',
  // an aggregation TAG the target release does not have: UI5 resolves it as a
  // control class and the 404 kills the whole view — the property version of
  // the same mistake is merely dropped, which is why this is not member-too-new
  'aggregation-too-new': 'error',
  // --- the class does not import into a system --------------------------------
  'source-line-too-long': 'error',
  // --- silent at runtime, but the view is not what was written -------------
  'binding-to-nonpublic': 'error',
  'binding-for-event': 'error',
  'event-for-property': 'error',
  'unconverted-abap-boolean': 'error',
  'duplicate-aggregation': 'error',
  'aggregation-in-aggregation': 'error',
  'view-never-displayed': 'error',
  'collection-bound-to-property': 'error',
  'relative-binding-without-context': 'error',
  'display-root-mismatch': 'error',
  'event-arg-out-of-range': 'error',
  'invalid-frontend-action': 'error',
  'unknown-frontend-action': 'error',
  'unknown-view-slot': 'error',
  'invalid-keyboard-shortcut': 'error',
  'invalid-action-payload': 'error',
  'filter-groups-not-arrays': 'error',
  'event-arg-js-callback': 'error',
  'enum-field-unset-on-insert': 'error',
  'relative-aggregation-without-context': 'error',
  'frontend-action-unknown-id': 'error',
  'unescaped-brace-in-style': 'error',
  'collapsed-brace-in-style': 'error',
  'date-type-without-source': 'error',
  'denied-control-method': 'error',
  'binding-on-association': 'error',
  'unknown-model': 'error',
  'uncurated-formatter': 'error',
  'missing-view-display-on-navigated': 'error',
  // --- portability and data ------------------------------------------------
  'control-too-new': 'warning',
  'member-too-new': 'warning',
  'event-parameter-too-new': 'warning',
  'enum-value-too-new': 'warning',
  'relative-asset-url': 'warning',
  'icon-too-new': 'warning',
  'icon-removed': 'warning',
  'toolbar-control-in-bar': 'warning',
  'ui5-internal-access': 'warning',
  'commercial-ui5-host': 'warning',
  'control-deprecated': 'warning',
  'member-deprecated': 'warning',
  'unknown-binding-path': 'warning',
  'binding-to-local': 'warning',
  'missing-required-aggregation': 'warning',
  'non-released-api': 'warning',
  /* The only rule whose severity is about what was NOT checked: a class on
   * the frozen builder reconstructs no view, so every other rule here is
   * silent about it for lack of anything to read.
   *
   * A warning, not an error, and the boundary is the same one the rest of
   * this block draws: such a class compiles and renders TODAY. What is wrong
   * with it is that `z2ui5_cl_xml_view` is deprecated - retired into the
   * frozen `src/99`, kept only so existing installations keep compiling, and
   * removable without a deprecation cycle - which is the "works on the
   * machine it was written for, but not necessarily on the target system"
   * bucket exactly. The whole gate being silent about the view is a reason to
   * report it, not a reason to call the app broken.
   * A repo that maintains such an app deliberately says so once:
   * `"rules": { "frozen-view-builder": "hint" }` (or `false`). */
  'frozen-view-builder': 'warning',
  'obsolete-binder': 'warning',
  'obsolete-model-update': 'warning',
  'obsolete-frontend-event': 'warning',
  'binding-type-mismatch': 'warning',
  'json-bind-on-scalar-property': 'warning',
  'raw-javascript-to-frontend': 'warning',
  'event-arg-unresolved': 'warning',
  'trailing-empty-event-arg': 'warning',
  'json-literal-in-attribute': 'error',
  'binding-to-reference': 'error',
  'manual-init-flag': 'warning',
  'hardcoded-binding-path': 'warning',
  'separate-lifecycle-ifs': 'warning',
  // a warning, not an error, and deliberately: the app is not broken TODAY.
  // It breaks the first time something navigates into it — a sub-app, a
  // built-in popup, a restored bookmark — and that day may never come for a
  // standalone app. The defect is latent, so it is reported as one
  'missing-on-navigated-branch': 'warning',
  'duplicate-for-iterator': 'warning',
  /* A warning, not an error, and the boundary is deliberate. That the control
   * writes a LOCALE string back through the two-way binding is measured, not
   * inferred — but whether the field on the other end is really a date is read
   * off what the ABAP writes into it, which is strong evidence and not proof.
   * "the data behind it is not what the author thinks it is" is exactly this
   * bucket, and it still fails a corpus gate: only `hint` is advisory. */
  'picker-value-without-format': 'warning',
  // --- worth knowing -------------------------------------------------------
  // a hint, not a warning: a control can FIRE more than its metadata
  // declares (ColorPickerPopover forwards the picker's change parameters
  // verbatim, colorString included, and declares none of that) — so a
  // missing declaration is strong evidence of a typo, never proof
  'unknown-event-parameter': 'hint',
  'event-without-handler': 'hint',
  'unused-public-attribute': 'hint',
  'settable-property-via-action': 'hint',
  // the inverse rule, and a hint for the same reason its sibling is one: the
  // wire is not broken, it is incomplete — and only the app knows whether the
  // state it sets still matters after the screen has been rebuilt
  'control-state-lost-on-rebuild': 'hint',
  'missing-accessibility': 'hint',
  'live-event-roundtrip': 'hint',
  'event-on-disabled-control': 'hint',
  // formatting: a chain builds the same view however it is written, so this
  // family is advisory by construction — see lib/chain-layout.mjs
  'chain-indentation': 'hint',
  'chain-element-per-line': 'hint',
  // the one rule in this linter that encodes a HOUSE STYLE rather than an
  // inconsistency, and therefore the one that is OFF until asked for — see
  // OPT_IN below
  'chain-house-layout': 'hint',
  /* The wire WORKS — that is the whole distinction from `unknown-view-slot`
   * next to it. What it lacks is the compiler: a retyped slot value is one
   * keystroke from being that error, and `cs_view-nested` -> `NEST` is a
   * pairing nobody holds in their head. `--fix` writes the constant. */
  'literal-view-slot': 'hint',
};

/*
 * Rules that do not run until a config asks for them.
 *
 * Every other rule here reports a defect or an inconsistency, so shipping it
 * on is right. `chain-house-layout` reports a deviation from ONE house style —
 * abap2UI5's — and two established styles (a two-space step, an attribute on
 * its control's line) are deviations from it. A linter that hands one
 * project's taste to every consumer as a default is what lib/chain-layout.mjs
 * argues against at length, so this one is offered rather than applied:
 *
 *   "rules": { "chain-house-layout": "warning" }
 *
 * turns it on, and nothing else changes for anybody who does not write that.
 */
export const OPT_IN = Object.freeze(new Set(['chain-house-layout']));

/** Whether a `rules` block switches an opt-in rule on. */
export const isOptInEnabled = (rules, type) => {
  const cfg = ruleConfig(rules?.[type]);
  return Boolean(cfg) && !cfg.off;
};

/** Every rule id the linter can report, sorted — the registry the config
 *  file and the schema generator validate against. */
export const RULES = Object.freeze(Object.keys(SEVERITY_BY_TYPE).sort());

/** The severity a rule carries before any `rules` override. */
export const defaultSeverityOf = (type) => SEVERITY_BY_TYPE[type] || 'error';

/** The rule id render-gate failures are reported under. It is not a
 *  configurable rule (use `render: false` to switch the gate off) — it only
 *  labels the line, so a render error reads like every other finding. */
export const RENDER_RULE = 'render-error';

/* The conventional prefix -> library pairs an undeclared-namespace fix may
 * assume. Closed by convention: anything else could mean any library, and a
 * fix that has to guess is worse than the finding. Lives HERE (not in
 * index.mjs) so in-process consumers that replicate the pipeline — the VS
 * Code extension's gate — attach the same fixes the CLI does. */
export const KNOWN_NS = Object.freeze({
  core: 'sap.ui.core', mvc: 'sap.ui.core.mvc',
  l: 'sap.ui.layout', layout: 'sap.ui.layout', form: 'sap.ui.layout.form',
  f: 'sap.f', table: 'sap.ui.table', u: 'sap.ui.unified', unified: 'sap.ui.unified',
  uxap: 'sap.uxap', tnt: 'sap.tnt', html: 'http://www.w3.org/1999/xhtml', cc: 'z2ui5.cc',
});

/**
 * Attach the undeclared-namespace fix where the prefix is conventional: the
 * declaration is inserted as a sibling attribute call right before the root's
 * first xmlns write — a single-line insertion, nothing to guess. ABAP sources
 * only; raw XML rarely misses one and has its own insertion grammar.
 * Mutates the findings, returns them.
 */
export function attachNamespaceFixes(findings, source) {
  for (const f of findings) {
    if (f.type !== 'undeclared-namespace') continue;
    const lib = KNOWN_NS[f.member];
    if (!lib) continue;
    /* Anchored in the SCRUBBED source: a commented-out builder line
     * (`" )->a( n = `xmlns` … ` — a previous root kept for reference) comes
     * before the live one often enough, and inserting the declaration there
     * would leave the view unfixed and the comment mangled. scrub( ) blanks
     * comments without moving anything, so the offset stays valid for the
     * raw source the fix is applied to.
     * The anchor is the attribute verb, `)->a( `. */
    const anchor = scrub(String(source)).match(/->\s*(a)\(\s*(?=n\s*=\s*`xmlns`)/);
    if (!anchor) continue;
    const at = anchor.index + anchor[0].length;
    f.fixes = [{ start: at, end: at, text: `n = \`xmlns:${f.member}\` v = \`${lib}\` )->${anchor[1]}( ` }];
  }
  return findings;
}

/** The parsed `rules` entry for the render gate's pseudo-rule. Render errors
 *  are strings, not findings, so applyRules never sees them — index.mjs
 *  applies this to a result's renderErrors instead: `false` and a matching
 *  `exclude` drop them (with a note), a severity decides what a render error
 *  counts as for the exit code. Directives cannot address them — a render
 *  error has no line in the ABAP source. */
export function renderRuleConfig(rules) {
  return ruleConfig(rules?.[RENDER_RULE]);
}

/** An unlisted type counts as an error: a new rule is loud until it is
 *  deliberately classified, never silently ignored. A severity already set
 *  on the finding wins — that is how a `rules` override survives. */
export function severityOf(finding) {
  return finding?.severity || defaultSeverityOf(finding?.type);
}

const short = (v, n = 80) => String(v ?? '').slice(0, n);

/** One line, plain English, no leading punctuation — the same sentence for
 *  the CLI, the JSON output and any editor integration. */
export function describe(f) {
  switch (f.type) {
    case 'view-never-displayed':
      return 'a view is built but never displayed — client->view_display( ) is missing';
    case 'escaped-brace-in-backtick':
      return `a binding written with ESCAPED braces inside a \`backtick\` literal (${f.value}) — a backtick literal has no escape processing, so the backslash lands in the attribute and UI5 never sees a binding; escaping is a |…| template rule`;
    case 'popover-display-val':
      return 'client->popover_display( val = … ) does not compile — popover_display imports xml, not val (unlike popup_display)';
    case 'uncurated-formatter':
      return `${f.control} ${f.member}: 'Formatter.${f.value}' is not in the curated formatter module — UI5 resolves the name at binding time and an unknown one silently yields no value; compute it in ABAP and bind the finished field`;
    case 'hardcoded-binding-path':
      return `an absolute binding path is written as text (${short(f.value, 40)}) — derive it from client->_bind( var ) (bare path: _bind( val = var path = abap_true )) so it moves with a variable rename`;
    case 'missing-view-display-on-navigated':
      return 'this check_on_navigated( ) branch never re-displays the view — after returning from the called app the browser keeps showing THAT app\'s view; call client->view_display( ) in the branch';
    case 'missing-on-navigated-branch':
      return 'main( ) dispatches on check_on_init( ) but has no check_on_navigated( ) branch — check_on_init is false when a called app or a popup hands control back and when a bookmarked state is restored, so nothing re-displays and the browser keeps showing the previous view; add ELSEIF client->check_on_navigated( ). view_display( ).';
    case 'separate-lifecycle-ifs':
      return `a second IF client->${f.member}( ) in the same method — lifecycle checks belong in one IF/ELSEIF chain; separate IF blocks can run more than one branch per roundtrip`;
    case 'duplicate-for-iterator':
      return `FOR iterator '${f.member}' is used twice in one method — a 7.02 downport materializes each as DATA ${f.member} TYPE i and fails with "variable already defined"; use distinct names (i, j, k)`;
    case 'unknown-event-parameter':
      return `${f.control} ${f.event}: the event has no parameter $parameters>/${f.member} (declared: ${(f.allowed || []).join(', ')}) — the value arrives empty`;
    case 'missing-required-aggregation':
      return `${f.control} has data but no ${f.member} — it renders empty`;
    case 'relative-binding-without-context':
      return `${f.control} ${f.member} binds {${f.value}} relatively, but the control has no binding context — the model resolves it against nothing and the control renders empty; bind the root field with client->_bind( )`;
    case 'collection-bound-to-property':
      return `${f.control} ${f.member} is a scalar property but {${f.value}} is a table/structure`;
    case 'picker-value-without-format':
      return `${f.control} binds ${f.member} to {/${f.value}} with no binding type and no valueFormat — the picker formats the string it writes BACK from the browser locale ("7/12/18", "Jul 12, 2018, 2:30:00 PM"), so the two-way binding overwrites the ABAP field with a value nothing on the backend can read; add valueFormat, or a binding type with formatOptions.source`;
    case 'date-type-without-source':
      return `${f.control} ${f.member} binds ${f.value} without formatOptions.source — the JSON model carries a string, the type wants a Date object, and every format() raises a FormatException`;
    case 'binding-type-mismatch':
      return `${f.control} ${f.member} expects ${f.memberType} but {${f.value}} is a character field — it arrives as a JSON string, which UI5 rejects in future mode`;
    case 'display-root-mismatch':
      return f.value === 'mvc:View'
        ? `client->${f.member}( ) loads its XML as a fragment, but the document root is a ${f.value} — a view has no open( )`
        : `client->${f.member}( ) loads its XML as a view, but the document root is a ${f.value} — XMLView.create needs a mvc:View`;
    case 'denied-control-method':
      return `CONTROL_BY_ID calls ${f.value}( ), which the frontend denylist refuses (${f.member === f.value ? 'a generic reflection mutator' : `it starts with '${f.member}'`}) — the dispatch logs and returns, the control is never touched`;
    case 'binding-on-association':
      return `${f.control} ${f.member} is an ASSOCIATION — the XML parser takes its value as a control ID, never as a binding, so '${short(f.value, 40)}' becomes an id nothing answers to and the association stays empty`;
    case 'unknown-model':
      return `${f.control} ${f.member} binds against the model '${f.value}>', which no view of this class has (available: ${(f.allowed || []).join('>, ')}>) — UI5 resolves it to nothing and leaves the property unset; fold the field into the default model with client->_bind( )`;
    case 'frontend-action-unknown-id':
      return `${f.control} addresses '${f.value}', which no view of this class declares (known: ${(f.allowed || []).join(', ')}) — the frontend finds no control and the wire does nothing`;
    case 'popover-anchor-unknown-id':
      return `popover_display( by_id = \`${f.value}\` ) names an id no view of this class declares (known: ${(f.allowed || []).join(', ')}) — the fragment loads, finds no anchor and is destroyed again; nothing opens`;
    case 'get-viewname-removed':
      return `client->get( )-viewname was removed from ty_s_get (it always carried an empty string) — the read no longer compiles`;
    case 'invalid-frontend-action':
      return f.member === 'view slot'
        ? 'the empty 2nd t_arg of CONTROL_BY_ID is the obsolete view slot — the runtime inserts it now, and the empty one shifts the method out of place'
        : `${f.control}: '${f.value}' is not an accepted ${f.member} (allowed: ${(f.allowed || []).join(', ')}) — the frontend rejects the wire silently`;
    case 'unknown-frontend-action':
      return `'${f.value}' is not a frontend action the dispatch table knows (case-sensitive) — the frontend swallows it without even a console line`;
    case 'literal-view-slot':
      return `the view slot is written as the literal '${f.value}' — use client->cs_view-${CS_VIEW_CONSTANT[f.value]}: the constant is compile-checked, this string is not, and the two do not spell each other (cs_view-nested is NEST); \`--fix\` rewrites it`;
    case 'unknown-view-slot':
      return `'${f.value}' is not a view slot (MAIN, NEST, NEST2, POPUP, POPOVER — case-sensitive, and cs_view-nested is NEST) — the wire addresses no view, and for CONTROL_BY_ID a wrong slot even suppresses the global id fallback`;
    case 'invalid-keyboard-shortcut':
      return `the combo '${f.value}' names no non-modifier key — the shortcut is logged and never registered`;
    case 'invalid-action-payload':
      return f.allowed
        ? `${f.control} ${f.member}: '${f.value}' is not a ${f.allowed.length ? `known value (allowed: ${f.allowed.join(', ')})` : 'known value'} — UI5 drops it silently`
        : `${f.control} ${f.member}: the payload is not valid JSON (…${f.value}…) — castArg silently turns it into {}`;
    case 'relative-aggregation-without-context':
      return `${f.control} ${f.member} binds the RELATIVE path '${f.value}' with no binding context and no enclosing row template — the model resolves it against nothing, so the aggregation renders empty. A root-level aggregation needs the absolute form (client->_bind( val = … path = abap_true ))`;
    case 'enum-field-unset-on-insert':
      return `the row is built without ${f.member}, which the view binds to an ENUM-typed property — an ABAP field is never absent, so it ships as "" and validateProperty throws, taking the binding update and the view down. Seed the default or name it in omit_initial_paths`;
    case 'event-arg-js-callback':
      return `the argument (…${short(f.value, 50)}…) contains a JS callback — UI5's ExpressionParser has no 'function' keyword and reads { as an object literal, so the WHOLE handler fails to parse and every argument of this event is lost`;
    case 'filter-groups-not-arrays':
      return `${f.control} ${f.member}: every group in the payload (…${short(f.value, 40)}…) is dropped by buildFilterGroups, so the binding is CLEARED, not filtered — a group must be an array of [path, operator, value1] ARRAYS, not an object`;
    case 'collapsed-brace-in-style':
      return `${f.count} escaped brace(s) inside a |…| template in a <style> block (…${short(f.value, 40)}…) — the template collapses \\{ to { before the view is built; use a backtick literal`;
    case 'control-state-lost-on-rebuild':
      return `${f.member}( )${f.value ? ` on '${f.value}'` : ''} sets live ${f.control === 'CONTROL_BY_ID' ? 'control' : f.control} state no binding can carry, and only a handler off the display path issues it — view_display( ) destroys the slot and XMLView.create rebuilds the control tree, so the value is gone on the next rebuild while the ABAP field describing it survives. Re-issue the call from the method that displays the view`;
    case 'settable-property-via-action':
      return `${f.value}( ) drives ${f.control} ${f.member}, which is a bindable property — bind it two-way instead, so the state lives in the model and survives a view rebuild`;
    case 'unused-public-attribute':
      return `PUBLIC attribute ${f.member} is never bound, read or written — it is serialized and shipped on every roundtrip for nothing`;
    case 'unescaped-brace-in-style':
      return `${f.count} unescaped brace(s) in a <style> block (…${short(f.value, 40)}…) — the XMLView parser reads them as bindings; write \\{ and \\}`;
    case 'event-arg-out-of-range':
      return `get_event_arg( ${f.member} ) in the handler of ${f.value}, which sends ${f.count} t_arg — the read comes back empty`;
    case 'member-deprecated':
      return `${f.control} ${f.member} is deprecated (${short(f.deprecated?.text || f.deprecated, 70)})`;
    case 'aggregation-in-aggregation':
      return f.parentAggregation
        ? `${f.member} is an aggregation nested directly inside the aggregation ${f.parentAggregation} of ${f.control} — a missing shut( )?`
        : `${f.member} is an aggregation sitting at the view root — an aggregation belongs inside a control`;
    case 'duplicate-aggregation':
      return `${f.control} opens ${f.member} twice — the second tag replaces the first`;
    case 'duplicate-property':
      return `${f.member} is set twice on the same control — the view builder asserts on that`;
    case 'attribute-without-element':
      return `an attribute (${f.member}) without an element to attach it to — the view builder asserts on that`;
    case 'unconverted-abap-boolean':
      return `${f.member}: the ABAP boolean ${f.value} reaches the view as 'X'/' ' — ${
        f.fixHint || 'pass it as a( b = … ), which renders true/false itself'}`;
    case 'unknown-binding-path':
      return f.context
        ? `${f.control} ${f.member}="{${f.value}}" — the rows of {${f.context}} have no such field (silently empty)`
        : `${f.control} ${f.member}="{${f.value}}" — the model has no such path (silently empty)`;
    case 'binding-for-event':
      return `${f.control} ${f.member} is an event but carries a binding — use client->_event( )`;
    case 'event-for-property':
      return `${f.control} ${f.member} is a property but carries an event handler — use client->_bind( )`;
    case 'chain-indentation': {
      const what = f.member === 'att' ? 'attribute' : 'element';
      const why = ' — the indentation stops showing the tree the view actually has';
      return f.shape === 'outdented'
        ? `this ${what} call is written at column ${f.value}, LEFT of the element it belongs to (column ${f.count})${why}`
        : f.shape === 'attributes'
          ? `this attribute is written at column ${f.value}, the other attributes of the same control at ${f.count}${why}`
          : `this element is written at column ${f.value}, its siblings under the same parent at ${f.count}${why}`;
    }
    case 'chain-house-layout':
      return `this chain is not in the house layout — ${f.count} line(s) differ (one call per line including attributes, 4 spaces per level of the tree, the closing call in the column of the element it closes); \`--fix\` rewrites it`;
    case 'chain-element-per-line':
      return `${f.count} controls on one line of a multi-line chain — one element per line, or the indentation cannot show where they sit in the tree (their attributes may share the line)`;
    case 'frozen-view-builder':
      return `this class builds its view with ${f.value}, which is DEPRECATED — the frozen predecessor of z2ui5_cl_ui5_view_builder, kept in src/99 solely so existing installations keep compiling, so the next abapGit pull may take it away. It also means NOTHING about the view was checked here: no control, no property, no binding, no render. Rewrite the chain on z2ui5_cl_ui5_view_builder (verbs: ele, tag, a, end, stringify)`;
    case 'non-released-api':
      return `${f.value} is not part of abap2UI5's released API (src/02) — ${f.what} (${f.member}): ${
        f.frozen
          ? 'frozen legacy, kept only so existing installations keep compiling'
          : 'internal, renamed and restructured without notice'}${
        f.replacement ? `; use ${f.replacement}` : ''}`;
    case 'obsolete-binder':
      return f.value
        ? `client->${f.member}( ) is obsolete — use client->_bind( ); ${f.value} is still accepted for source compatibility but no longer evaluated, so drop it along with the rename`
        : `client->${f.member}( ) is obsolete — use client->_bind( )`;
    case 'obsolete-model-update':
      return `client->${f.member}( ) does nothing — the framework pushes the model by itself whenever a roundtrip changed it; delete the call`;
    case 'obsolete-frontend-event':
      return `client->${f.member}( ) is obsolete — use client->follow_up_action( ), which reaches the same get_event_client( ) wherever its result is consumed; one method schedules a frontend action and wires one`;
    case 'binding-to-local':
      return `${f.member} is a local variable — its value is lost after the roundtrip, bind an instance attribute`;
    case 'binding-to-nonpublic':
      return `${f.member} is bound but not PUBLIC — only public attributes are serialized into the model, so the first roundtrip fails with BINDING_ERROR; move it to the PUBLIC SECTION`;
    case 'ui5-internal-access':
      return `${f.value} is a private UI5 internal — no API contract, it changes across UI5 patches without notice; restructure to a two-way binding or a public parameter`;
    case 'commercial-ui5-host':
      return `${f.value} is the commercial SAPUI5 host — use sdk.openui5.org, or the app breaks on an OpenUI5-only landscape`;
    case 'relative-asset-url':
      return `${f.control} ${f.member}="${f.value}" is document-relative — an abap2UI5 app is served from the ICF node and has no document root to resolve it against, so the asset 404s and the control falls back to its placeholder; absolutize it onto the OpenUI5 host`;
    case 'enum-value-too-new':
      return `${f.control} ${f.member}="${f.value}" is @since ${f.since} — the enum value is newer than the ${f.minUi5} floor`;
    case 'aggregation-too-new':
      return `${f.control} has no aggregation ${f.member} before ${f.since} — on the ${f.minUi5} floor UI5 resolves the tag as a control class instead and the 404 takes the WHOLE view down, not just this part`;
    case 'source-line-too-long':
      return `line is ${f.value} characters — abapGit cannot import a source line over ${LINE_LIMIT} ("Literals across more than one line are not allowed"), and it carries on after the error, leaving an EMPTY class behind; split the literal into && chunks`;
    case 'unknown-icon':
      return `sap-icon://${f.value} is in no release of the SAP icon font — the control renders with NO icon and nothing is logged${
        /[A-Z]/.test(f.value) ? '; icon names are lower-case (IconPool reads them as a URI hostname), so a camelCase name never matches' : ' — typo?'}`;
    case 'icon-too-new':
      return `sap-icon://${f.value} reached the icon font in ${f.since} — newer than the ${f.minUi5} floor, where it renders with NO icon and nothing is logged`;
    case 'icon-removed':
      return `sap-icon://${f.value} is gone from the icon font again — ${
        f.since === f.lastSeen ? `it existed in ${f.since} only` : `it arrived in ${f.since} and left after ${f.lastSeen}`
      }, and renders with NO icon on every release after that`;
    case 'toolbar-control-in-bar':
      return `${f.control} is a block-level control inside ${f.member} — before UI5 1.76 a sap.m.Bar lays its children out in normal flow, so it starts a new line and the bar's overflow:hidden CUTS AWAY every sibling after it; express the grouping with a margin class (sapUiMediumMarginBegin) instead`;
    case 'event-without-handler':
      return `event ${f.value} is raised but never handled — dead control, unless the roundtrip alone is intended`;
    case 'live-event-roundtrip':
      return `${f.member} round-trips on every keystroke, and a round-trip in flight DROPS the events behind it — the bound value lags under fast input; prefer a two-way binding or the final-value event (change/submit)`;
    case 'binding-to-reference':
      return `${f.member} is declared TYPE REF TO — binding the reference throws at runtime; dereference it (client->_bind( ${f.member}->* )) or bind a data attribute`;
    case 'json-bind-on-scalar-property':
      return `${f.control} ${f.member} is a ${f.memberType} property bound to the json-spliced {${f.value}} — the spliced JSON node is not a ${f.memberType}, and the splice is outbound-only, so an edit is silently discarded; json = abap_true belongs on an object-typed property`;
    case 'raw-javascript-to-frontend':
      return f.member === 'follow_up_action'
        ? `follow_up_action carries raw JavaScript (…${f.value}…) — it runs unchecked in the browser; use a cs_event- frontend action, which travels as data`
        : f.value === 'script tag'
          ? `${f.control} ${f.member} carries a <script> tag — code does not travel in the view; move the logic to ABAP or a cs_event- frontend action`
          : `${f.control} ${f.member} carries a JavaScript handler string (…${f.value}…) — wire the event with client->_event*( ) so behaviour travels as data, not code`;
    case 'manual-init-flag':
      return `${f.member} is a hand-rolled init flag — client->check_on_init( ) already says whether this is the first run, without shipping a flag to the browser on every roundtrip`;
    case 'event-on-disabled-control':
      return `${f.control} wires ${f.member} but is enabled="false" as a literal — the control can never fire, so the handler is dead; bind enabled if it should ever flip`;
    case 'trailing-empty-event-arg':
      return `the LAST of ${f.value} t_arg entries is empty — get_t_arg drops a trailing empty argument, so it never arrives and get_event_arg( ${f.value} ) reads initial; fill it, drop it, or move it before a filled one`;
    case 'json-literal-in-attribute':
      return `${f.control} ${f.member} is a raw JSON literal — UI5 reads a leading { as a binding, so the attribute never receives the JSON; bind it (client->_bind( field )) and keep the JSON in the model`;
    case 'event-arg-unresolved':
      return `t_arg ${f.value} is a bare-brace literal — it is neither resolved nor quoted and arrives EMPTY at get_event_arg( ); use the $-prefixed form (\${...}) for a client-resolved value`;
    case 'duplicate-id':
      return `id="${f.value}" is used twice — duplicate ID error at runtime`;
    case 'undeclared-namespace':
      return `namespace prefix '${f.member}' is used but never declared (xmlns:${f.member})`;
    case 'invalid-expression-binding':
      return `${f.control} ${f.member}: unbalanced braces/parens in the expression binding`;
    case 'missing-accessibility':
      return `${f.control} has no ${f.member} — not usable with a screen reader`;
    case 'sapui5-only-control':
      return f.distribution === 'openui5'
        ? `control ${f.control} needs SAPUI5 — ${f.library} is not part of OpenUI5`
        : `control ${f.control} needs SAPUI5 — ${f.library} is not part of OpenUI5, and no "distribution" is configured, so this run cannot tell whether your system ships it; set "distribution": "openui5" to make this an error, or "sapui5" to silence it`;
    case 'unknown-control':
      return `control ${f.control} does not exist in UI5 — typo?`;
    case 'event-parameter-too-new':
      return `${f.control} ${f.event}: the event parameter $parameters>/${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`;
    case 'control-too-new':
      return `control ${f.control} is @since ${f.since} — newer than the ${f.minUi5} floor`;
    case 'control-deprecated':
      return `control ${f.control} is deprecated (${short(f.deprecated?.text || f.deprecated)})`;
    case 'unknown-property':
      return `${f.control} has no property/event/association ${f.member} — typo?`;
    case 'unknown-aggregation':
      return `${f.control} has no aggregation ${f.member} — typo?`;
    case 'invalid-property-value':
      return `${f.control} ${f.member}="${f.value}" is not a valid value (${
        f.allowed ? `allowed: ${f.allowed.join(', ')}` : `expected ${f.memberType}`})`;
    case 'invalid-aggregation-child':
      return `${f.control} is not allowed in ${f.parentControl} ${f.member} (expects ${f.expected})`;
    case 'too-many-children':
      return `${f.control} ${f.member} takes one child, ${f.count} given`;
    case 'excess-shut':
      return 'one shut( ) more than the tree is deep — asserts at runtime';
    default:
      return `${f.control} ${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`;
  }
}

/*
 * Source positions. The gates record a character offset into the file they
 * were given (the ABAP class or the XML document); turning that into a
 * 1-based line/column needs the source, which only the caller has.
 */
/** Offsets where each line starts — computed once per source, so locating
 *  many findings in one file does not rescan the file per finding. */
function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

const positionIn = (starts, length, offset) => {
  if (typeof offset !== 'number' || offset < 0 || offset > length) return null;
  // binary search: the last line start at or before the offset
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
};

export function positionAt(source, offset) {
  return positionIn(lineStarts(source), source.length, offset);
}

/**
 * Enrich findings in place with everything a consumer would otherwise
 * recompute: severity, message and — when the gate recorded an offset —
 * line/column in `source`.
 */
export function annotate(findings, source) {
  const starts = source == null ? null : lineStarts(source);
  for (const f of findings) {
    f.severity = severityOf(f);
    f.message = describe(f);
    const pos = starts ? positionIn(starts, source.length, f.offset) : null;
    if (pos) { f.line = pos.line; f.column = pos.column; }
  }
  return findings;
}

/*
 * Per-rule configuration — the `rules` block of abap2ui5lint.jsonc.
 *
 * Same shape as abaplint's rule config next door: a rule is switched off with
 * `false`, given another severity with a string, and both plus a file
 * `exclude` list with an object. A repo that considers, say, the
 * accessibility hints noise says so once in its config instead of teaching
 * every consumer of the library its own opinion table.
 *
 *   "rules": {
 *     "missing-accessibility": false,
 *     "member-deprecated": "hint",
 *     "event-without-handler": { "severity": "warning", "exclude": ["/test/"] }
 *   }
 */
function ruleConfig(value) {
  if (value === undefined || value === null || value === true) return null;
  if (value === false) return { off: true };
  if (typeof value === 'string') return { severity: value.toLowerCase() };
  const cfg = {};
  if (value.severity) cfg.severity = String(value.severity).toLowerCase();
  // abaplint's wording: "file regex filename patterns to exclude, case insensitive"
  if (Array.isArray(value.exclude)) cfg.exclude = value.exclude.map((p) => new RegExp(p, 'i'));
  return cfg;
}

/**
 * Drop the findings a `rules` entry switched off (or excluded for this file)
 * and apply its severity overrides. Returns the surviving findings — the
 * input array is not mutated, the findings themselves are.
 */
export function applyRules(findings, rules, file = '') {
  /* An `exclude` has to mean the same thing however the run was started.
   *
   * The path a finding carries is whatever string the file was COLLECTED
   * under, and that is absolute or relative depending on the invocation: a
   * discovered config joins `paths` onto its absolute dirname, while
   * `abap2ui5lint src` and `--config abap2ui5lint.jsonc` both leave it
   * relative. So the same config, on the same tree, silently waived different
   * things - and it was the run that LOOKED stricter that was broken
   * (abap2UI5/linter#35: `"exclude": ["/src/02/"]`, written with the leading
   * slash abaplint's convention gives it, matched only the absolute form, so
   * `abap2ui5lint src` reported 25 findings the repository had waived on
   * purpose). The mirror case is just as silent: `["^src/00/98/"]`, written
   * the way the REPORT prints the path, matched only the relative form.
   *
   * Both are the same defect, so both forms are derived here and the pattern
   * is tried against each - and against the string as given, which is what a
   * pattern written for some third spelling would have matched before. */
  const forms = new Set([file]);
  if (file) {
    forms.add(path.resolve(file));
    forms.add(path.relative(process.cwd(), path.resolve(file)));
  }
  /* And every one of them with forward slashes. An `exclude` pattern is a path
   * regex, and both spellings the README gives are written with `/` - but on
   * Windows `path.resolve` and `path.relative` hand back `\`, so `^src/00/98/`
   * matched none of the three forms and the config silently waived nothing.
   * The separator is not part of what the pattern is trying to say, so it is
   * normalised away rather than asking every config to spell both. */
  for (const f of [...forms]) if (f.includes('\\')) forms.add(f.replace(/\\/g, '/'));
  const excluded = (cfg) => cfg.exclude?.some((re) => [...forms].some((f) => re.test(f)));
  const kept = [];
  for (const f of findings) {
    const cfg = ruleConfig(rules?.[f.type]);
    // an opt-in rule needs a config entry that is not `false` to run at all
    if (OPT_IN.has(f.type) && (!cfg || cfg.off)) continue;
    if (cfg) {
      if (cfg.off) continue;
      if (excluded(cfg)) continue;
      if (cfg.severity) f.severity = cfg.severity;
    }
    kept.push(f);
  }
  return kept;
}

/*
 * Source directives — the local escape hatch.
 *
 * `--allow` and the `rules` block are repo-wide; the case that actually
 * comes up is one line that knows better than the gate. Spelled the way
 * ui5lint spells it, carried by whatever comment the file has:
 *
 *   " abap2ui5lint-disable-next-line unknown-binding-path -- filled in a LOOP
 *   <!-- abap2ui5lint-disable-next-line -->
 *   " abap2ui5lint-disable   ... " abap2ui5lint-enable
 *
 * No rule id after the directive means every rule. Everything after `--` is
 * a reason and ignored — which is also what terminates an XML comment, so
 * the `-->` never reads as a rule. One directive per line; `-enable` closes
 * every open `-disable` block. A finding the gate could not place (no line)
 * cannot be suppressed this way.
 */
const DIRECTIVE_RE = /abap2ui5lint-(disable-next-line|disable-line|disable|enable)\b([^\n]*)/;

/** The rule ids named after a directive; null means "all rules". */
function directiveRules(text) {
  const ids = String(text).split('--')[0].split(/[\s,]+/).filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

/**
 * Scan a source for directives. Returns null when it holds none (the common
 * case, and the reason this never costs anything), otherwise
 * `{ suppresses(line, rule) }`.
 */
export function parseDirectives(source) {
  if (!source || !String(source).includes('abap2ui5lint-')) return null;
  const perLine = new Map(); // line -> Set of rule ids, or null for all
  const spans = [];          // { from, to, rules }
  const open = [];
  const add = (line, rules) => {
    if (!perLine.has(line)) perLine.set(line, rules);
    else if (rules === null || perLine.get(line) === null) perLine.set(line, null);
    else for (const r of rules) perLine.get(line).add(r);
  };
  const lines = String(source).split('\n');
  lines.forEach((text, i) => {
    const m = DIRECTIVE_RE.exec(text);
    if (!m) return;
    const line = i + 1;
    const rules = directiveRules(m[2]);
    if (m[1] === 'disable-next-line') add(line + 1, rules);
    else if (m[1] === 'disable-line') add(line, rules);
    else if (m[1] === 'disable') open.push({ from: line, rules });
    else while (open.length) spans.push({ ...open.pop(), to: line });
  });
  while (open.length) spans.push({ ...open.pop(), to: lines.length + 1 });
  const covers = (rules, rule) => rules === null || rules.has(rule);
  return {
    suppresses(line, rule) {
      if (perLine.has(line) && covers(perLine.get(line), rule)) return true;
      return spans.some((s) => line >= s.from && line <= s.to && covers(s.rules, rule));
    },
  };
}

/** Drop the findings a directive in `source` suppresses. */
export function applyDirectives(findings, source) {
  const directives = parseDirectives(source);
  if (!directives) return findings;
  return findings.filter((f) => !(f.line && directives.suppresses(f.line, f.type)));
}
