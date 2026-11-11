/*
 * abap-rules — checks that need the ABAP class, not just the view tree.
 *
 * These are the abap2UI5-specific defects: the ones that stay silent at
 * runtime because nothing throws. A button whose event nobody handles does
 * nothing; a value bound to a local variable is gone after the roundtrip.
 * No UI5 tooling can see them - they only exist in the relationship
 * between the class and the view it builds.
 *
 * `checkAbapRules( )` is the entry point and the order the rules run in. A
 * group that neither reads nor writes anything the rules around it use gets
 * its own name and its own stated inputs; the rest sit in the entry point,
 * where they are a few lines each. In this file:
 *
 *   checkEventArgs       what a backend _event( ) sends in t_arg, and what
 *                        get_event_arg( ) reads back out
 *   checkAbapBooleans    an ABAP flag written into an attribute value
 *   checkAttributeText   a value carrying data written through v instead of t
 *   (non-released-api is lib/rules/non-released-api.mjs, scope 'class')
 *   obsoleteCcHelpers    the frozen builder's helpers for the companion
 *                        controls abap2UI5 marks OBSOLETE (_z2ui5( )->timer( ))
 *   checkEnumRowLiterals a row built at runtime without an enum-fed field
 *
 * and two subjects large enough to be modules of their own:
 *
 *   lib/frontend-wires.mjs    every _event_client / follow_up_action wire: the
 *                             actions, their arguments, the control ids they
 *                             name. ~480 lines, one closed set after another
 *   lib/lifecycle-rules.mjs   what the class does ACROSS a roundtrip: the
 *                             dispatcher, the init flag, the view that is
 *                             never handed over
 *
 * plus lib/abap-source.mjs, the small readers all three share.
 *
 * Every one of them takes `report` rather than returning findings, because the
 * entry point's `report( )` collapses repeats and the FIRST finding of a shape
 * wins - so the order of the calls below is part of the output, not a detail.
 * That is also why the split moved code without moving a single call site.
 */
import obsoleteCustomControl from './rules/obsolete-custom-control.mjs';
import chainElementPerLine from './rules/chain-element-per-line.mjs';
import chainIndentation from './rules/chain-indentation.mjs';
import chainHouseLayout from './rules/chain-house-layout.mjs';
import unconditionalPopupDisplay from './rules/unconditional-popup-display.mjs';
import displayAfterNavAppCall from './rules/display-after-nav-app-call.mjs';
import doubleDisplayInBranch from './rules/double-display-in-branch.mjs';
import missingViewDisplayOnNavigated from './rules/missing-view-display-on-navigated.mjs';
import missingOnNavigatedBranch from './rules/missing-on-navigated-branch.mjs';
import eventArgUnresolved from './rules/event-arg-unresolved.mjs';
import eventArgSingleRowTable from './rules/event-arg-single-row-table.mjs';
import trailingEmptyEventArg from './rules/trailing-empty-event-arg.mjs';
import eventArgOutOfRange from './rules/event-arg-out-of-range.mjs';
import enumFieldUnsetOnInsert from './rules/enum-field-unset-on-insert.mjs';
import absentBooleanOverridesDefault from './rules/absent-boolean-overrides-default.mjs';
import eventWithoutHandler from './rules/event-without-handler.mjs';
import eventNameCaseMismatch from './rules/event-name-case-mismatch.mjs';
import obsoleteBinder from './rules/obsolete-binder.mjs';
import obsoleteBindArgument from './rules/obsolete-bind-argument.mjs';
import obsoleteModelUpdate from './rules/obsolete-model-update.mjs';
import obsoleteFrontendEvent from './rules/obsolete-frontend-event.mjs';
import bindingToLocal from './rules/binding-to-local.mjs';
import bindingToExpression from './rules/binding-to-expression.mjs';
import loopWorkAreaBound from './rules/loop-work-area-bound.mjs';
import bindingToStatic from './rules/binding-to-static.mjs';
import bindingToNonpublic from './rules/binding-to-nonpublic.mjs';
import ui5InternalAccess from './rules/ui5-internal-access.mjs';
import commercialUi5Host from './rules/commercial-ui5-host.mjs';
import bindingToReference from './rules/binding-to-reference.mjs';
import liveEventRoundtrip from './rules/live-event-roundtrip.mjs';
import messageBoxRemovedParameter from './rules/message-box-removed-parameter.mjs';
import unknownMessageBoxType from './rules/unknown-message-box-type.mjs';
import smartVariantWithoutInit from './rules/smart-variant-without-init.mjs';
import redundantSerializable from './rules/redundant-serializable.mjs';
import privateAppAttribute from './rules/private-app-attribute.mjs';
import handlerWithoutEvent from './rules/handler-without-event.mjs';
import unescapedBraceInStyle from './rules/unescaped-brace-in-style.mjs';
import unusedPublicAttribute from './rules/unused-public-attribute.mjs';
import unboundPublicAttribute from './rules/unbound-public-attribute.mjs';
import popupWithoutCloseWire from './rules/popup-without-close-wire.mjs';
import popoverAnchorUnknownId from './rules/popover-anchor-unknown-id.mjs';
import getViewnameRemoved from './rules/get-viewname-removed.mjs';
import popoverDisplayVal from './rules/popover-display-val.mjs';
import hardcodedBindingPath from './rules/hardcoded-binding-path.mjs';
import collapsedBraceInStyle from './rules/collapsed-brace-in-style.mjs';
import escapedBraceInBacktick from './rules/escaped-brace-in-backtick.mjs';
import { isCall, raisedEventLiterals, staticAttributes, publicAttributes, eventCaseRegions, collapseInlineStructures, handledEventLiterals } from './abap-helpers.mjs';
import { scrub, parenRegion, blankLiterals, skipWs } from './abap.mjs';
import { abapModel } from './abap-model.mjs';
import { runRules, runRule } from './rule.mjs';
import { timed } from './timing.mjs';
import { UNIT_RULES } from './rules/index.mjs';
/* The rules of scope 'app' (lib/rule.mjs) are run at their own place below. */
import bindPathAsValue from './rules/bind-path-as-value.mjs';
import bindPathFlag from './rules/bind-path-flag.mjs';
import unconvertedAbapBoolean from './rules/unconverted-abap-boolean.mjs';
import unescapedTextInAttribute from './rules/unescaped-text-in-attribute.mjs';
import manualInitFlag from './rules/manual-init-flag.mjs';
import lifecycleIsInitial from './rules/lifecycle-is-initial.mjs';
import viewNeverDisplayed from './rules/view-never-displayed.mjs';
import eventArgJsCallback from './rules/event-arg-js-callback.mjs';
import abapDateFormatterMismatch from './rules/abap-date-formatter-mismatch.mjs';
import escapeSequenceInBacktick from './rules/escape-sequence-in-backtick.mjs';
import closeOnlyRoundtrip from './rules/close-only-roundtrip.mjs';
import frontendActionAsBackendEvent from './rules/frontend-action-as-backend-event.mjs';
import popupDisplayXml from './rules/popup-display-xml.mjs';
import queueLastWithoutNoBusy from './rules/queue-last-without-no-busy.mjs';
import nestViewWithoutDestroy from './rules/nest-view-without-destroy.mjs';
import omitInitialDropsFalse from './rules/omit-initial-drops-false.mjs';
import duplicateForIterator from './rules/duplicate-for-iterator.mjs';
import separateLifecycleIfs from './rules/separate-lifecycle-ifs.mjs';
import redundantInitDisplay from './rules/redundant-init-display.mjs';
import { checkFrontendWires } from './frontend-wires.mjs';
import { literalElements } from './abap-source.mjs';
/* Re-exported so a consumer that assembles the pipeline itself can reach it:
 * it lives in abap-source.mjs, which no exports-map subpath names, and the
 * entry point that used to be its only route pulls the renderer - and with it
 * http/os/module - into any bundle that imports it. */
export { elementBoundSlots } from './abap-source.mjs';
import { checkIcons } from './icons.mjs';
import { dialectOf } from './builders.mjs';
import { declarationElements } from './reconstruct.mjs';
import { isOptInEnabled } from './findings.mjs';
import { multiLineChains } from './chain-layout.mjs';
/* The class index checkFiles( ) builds, for a caller judging one source at a
 * time (`classIndex`, below). */
export { classIndexOf } from './guide-rules.mjs';


/* The declaration blocks of a class definition: every line that opens with
 * `DATA`, `DATA:` or `CLASS-DATA` (after blanks - blank lines included),
 * with the text after the keyword's blanks up to the next line that opens
 * with DATA, CLASS-DATA or a section keyword. What
 *   /^\s*(?:CLASS-)?DATA:?\s+([\s\S]*?)(?=^\s*(?:CLASS-)?DATA\b|^\s*(?:METHODS|…|ENDCLASS)\b)/gim
 * captured, read line start by line start: that regex walked a run of blank
 * lines again from each of its line starts, and its lazy body retried the
 * lookahead, itself such a walk, at every character. `head` ends on a line
 * of its own reading ENDCLASS, so every block finds its end. */
const OPENS_DATA = /^(?:CLASS-)?DATA:?\s/i;
const ENDS_DATA = /^(?:(?:CLASS-)?DATA|METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|PUBLIC SECTION|PROTECTED SECTION|PRIVATE SECTION|ENDCLASS)\b/i;
function dataBlocks(head) {
  const blocks = [];
  const n = head.length;
  // `^` under the m flag: the start, and after each of the four line terminators
  const eol = (c) => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';
  const lineStart = (i) => {
    if (i === 0 || eol(head[i - 1])) return i;
    while (i < n && !eol(head[i])) i++;
    return i + 1;
  };
  // the first non-blank at or after a line start, cached: every line start in
  // a run of blank lines leads to the same one
  let runFrom = -1;
  let runTo = -1;
  const firstNonWs = (i) => {
    if (i < runFrom || i > runTo) { runFrom = i; runTo = skipWs(head, i); }
    return runTo;
  };
  for (let s = 0; s <= n;) {
    const t = firstNonWs(s);
    const open = OPENS_DATA.exec(head.slice(t, t + 12));
    if (!open) { s = lineStart(t + 1); continue; }
    const body = skipWs(head, t + open[0].length - 1);
    let p = lineStart(body);
    while (p <= n && !ENDS_DATA.test(head.slice(firstNonWs(p), firstNonWs(p) + 18))) p = lineStart(firstNonWs(p) + 1);
    if (p > n) break;
    blocks.push(head.slice(body, p));
    s = p;
  }
  return blocks;
}

function instanceAttributes(src) {
  const names = new Set();
  // DATA name TYPE ... / DATA: a TYPE x, b TYPE y - in the class definition.
  // ENDCLASS is re-appended on its own line: the block scan below finds a
  // declaration only up to a TERMINATOR line, and slicing the head right
  // before ENDCLASS used to cut that terminator off — silently dropping the
  // LAST declaration of the definition (latent until binding-to-nonpublic
  // started comparing against this set).
  const defEnd = src.search(/\bENDCLASS\b/i);
  const head = `${defEnd > 0 ? src.slice(0, defEnd) : src}\nENDCLASS`;
  for (const block of dataBlocks(head)) {
    for (const d of collapseInlineStructures(block).split(',')) {
      const n = d.trim().match(/^(\w+)/);
      if (n) names.add(n[1].toUpperCase());
    }
  }
  return names;
}


/* A `WHEN OTHERS.` inside a CASE over the event handles every event there is,
 * including the ones no WHEN names - the dispatcher that ends in
 *
 *     WHEN OTHERS.
 *       client->message_box_display( type = client->get_event( ) ... )
 *
 * handles five message types without naming one of them (abap2UI5/samples app
 * 382). Reading only the WHEN literals reported all five as dead, which is the
 * expensive kind of finding: the reader has to prove the tool wrong.
 *
 * Deliberately conservative in one direction: only a WHEN OTHERS at the event
 * CASE's own level counts - one inside a CASE nested in a handler is that
 * switch's catch-all, not the dispatcher's. Missing a catch-all costs a false
 * hint; inventing one would hide a genuinely dead event, which is worse. */
function hasEventCatchAll(src) {
  return eventCaseRegions(src).some((c) => /\bWHEN\s+OTHERS\b/i.test(c.body));
}


/** What the other classes of the run read of this class as `->name`
 *  (`outsideReads` in the class index, lower case), or null without one. */
function outsideReadsOf(src, classIndex) {
  const own = src.match(/\bCLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD)\b)/i)?.[1].toLowerCase();
  return classIndex?.get(own)?.outsideReads ?? null;
}

/** Whether another class of the run reads one of this class's PUBLIC
 *  attributes - the reads that stand `unused-public-attribute` and
 *  `unbound-public-attribute` down. Such a stand-down depends on what the RUN
 *  holds, not on the source: the same class named alone (an editor, a
 *  pre-commit hook) is judged and reported. So a waiver of either rule in such
 *  a class is unjudged rather than `unused-directive`, whose deleting fix
 *  would otherwise take out the waiver the single-file run still needs. */
export function publicReadFromOutside(source, classIndex) {
  const src = scrub(source);
  const reads = outsideReadsOf(src, classIndex);
  return Boolean(reads?.size) && publicAttributes(src).some((a) => reads.has(a.name.toLowerCase()));
}


/** Variables declared inline or with DATA inside a method body. */
function localVariables(src) {
  const names = new Set();
  for (const m of src.matchAll(/\bDATA\(\s*(\w+)\s*\)/gi)) names.add(m[1].toUpperCase());
  for (const m of src.matchAll(/\bFIELD-SYMBOLS?\s*<\s*(\w+)\s*>/gi)) names.add(m[1].toUpperCase());
  // DATA lv_x TYPE ... written inside a METHOD ... ENDMETHOD block, in the
  // single form and in the chained `DATA: lv_a TYPE i, lv_b TYPE string.`
  // form - the usual way to declare more than one local, and the one that
  // used to slip past this reader entirely
  for (const body of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    for (const el of declarationElements(body[0], /^DATA$/i)) {
      const m = el.match(/^(\w+)\s+(?:TYPE|LIKE)\b/i);
      if (m) names.add(m[1].toUpperCase());
    }
  }
  return names;
}

/** Literal event names in client->_event( `X` ) / ( 'X' ) / ( |X| ),
 *  mapped to where they are raised. */
function eventNames(src) {
  const names = new Map();
  for (const { name, offset } of raisedEventLiterals(src)) {
    const key = name.toUpperCase();
    if (!names.has(key)) names.set(key, offset);
  }
  return names;
}

/** Is the match at `index` CODE, or text inside a string literal? Both of the
 *  event scans below read a literal (the event name) and so have to run over
 *  the source with its literals intact — which also finds the calls a class
 *  QUOTES: a MessageStrip explaining that "a press is wired with
 *  client->_event( 'GHOST' )" raised no event and handled none. The blanked
 *  copy is offset-for-offset, so the head of a real call is still there and
 *  the head of a quoted one is blanks. */
// case-free like the language: `CLIENT->_EVENT( )` is the same call


/** Event names the class reacts to: check_on_event( `X` ), and constants
 *  compared against get_event( ). A constant reference on either side means
 *  we cannot resolve the name statically - handled by the caller. */
function handledEvents(src) {
  return new Set(handledEventLiterals(src).map((n) => n.toUpperCase()));
}


/* ABAP the SYSTEM refuses, and one thing SLIN reports.
 *
 * The precedent for these living here is `source-line-too-long`, which made
 * exactly this trip: for a consumer whose only gate is `npx abap2ui5lint`, a
 * class that does not activate is the most severe thing this tool can find,
 * and none of them is a view rule. Each one below reached a user through a
 * green CI — abaplint models none of them (measured on 2.120.24 with a control
 * probe in every case), and a systemless pipeline sees an activation error
 * only when somebody imports the transport. */
function checkAbapHygiene({ src, source, report, timings = null, ownObjects = null }) {
  /* The rules of this family that are written as one unit each (lib/rule.mjs,
   * lib/rules/) - they read the shared model of the class, not `src`. */
  /* The model is read lazily, so the first rule to touch it would pay for
   * reading it; under --timing that cost gets its own entry instead. */
  const model = timed(timings, 'abap-model', () => {
    const m = abapModel(source ?? src);
    if (timings) { m.statements; m.methods; } // eslint-disable-line no-unused-expressions
    return m;
  });
  runRules(UNIT_RULES, 'class', { model, src, source: source ?? src, report, ownObjects }, { timings });
}


// the XML view attributes the template processor never parses for a binding



/** The legacy-helper half of `obsolete-custom-control` on its own - what a
 *  class on the frozen builder is judged by beside `frozen-view-builder`
 *  (lib/index.mjs), since it reconstructs no document for the view walk. */
export function obsoleteCcHelperFindings(source) {
  const out = [];
  // straight into the list: the collector, which drops `dedupe`, is not in play
  runRule(obsoleteCustomControl, { src: scrub(source), report: (f) => { delete f.dedupe; out.push(f); } });
  return out;
}

/** The models a view of this class can actually resolve a `name>` binding
 *  against: the three the framework attaches to every view slot, plus every
 *  model a `SET_ODATA_MODEL` wire registers under a name of its own
 *  (t_arg = service url, model name, annotation url).
 *
 *  Returns null when the class registers a model under a name that is not a
 *  literal — then the set is not the full truth and no prefix may be called
 *  unknown, the same caution `viewIds` takes. */
export function namedModels(source) {
  const src = scrub(source);
  // device> and message> are set on every view slot (ViewSlots.js), http> on
  // the main view when the app runs over a switched path (View1.controller.js)
  const models = new Set(['device', 'message', 'http']);
  const code = blankLiterals(src);
  for (const call of src.matchAll(/client->(?:_event_client|follow_up_action)\s*\(/gi)) {
    if (!isCall(code, call.index, 'client->')) continue;
    const open = src.indexOf('(', call.index + call[0].length - 1);
    const { body } = parenRegion(src, open);
    // the constant, or the name-shaped literal the dispatcher accepts the
    // same way (case-sensitive, exactly like the runtime)
    if (!/cs_event-set_odata_model\b/i.test(body)
      && !/[`']SET_ODATA_MODEL[`']/.test(body)) continue;
    const tm = body.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
    if (!tm) return null; // a wire whose args this pass cannot read at all
    const argOpen = body.indexOf('(', tm.index + tm[0].length - 1);
    const args = literalElements(parenRegion(body, argOpen).body, 0);
    // no second element at all = the default (unnamed) model, which is fine;
    // a non-literal one is a name this pass cannot know
    if (args.length < 2) continue;
    if (args[1].value === null) return null;
    if (args[1].value) models.add(args[1].value);
  }
  return models;
}

/* The findings of one class and the `report( )` that collects them. Repeated
 * identical findings collapse into one (a row template reports the same
 * defect once), but their FIXES do not: every occurrence carries its own
 * span, or `--fix` would need one run per call site.
 *
 * A rule whose every occurrence is a finding of its own - two keyless tables
 * in one class are two declarations to fix - says so with `dedupe` (its
 * offset, as a string). It joins the collapse key and is then dropped: it
 * used to be written into `value`, which is part of the BASELINE key too, so
 * a baselined finding went stale the moment a line was inserted above it. */
function collector() {
  const findings = [];
  const seen = new Map();
  const report = (f) => {
    const key = `${f.type}|${f.control || ''}|${f.member || ''}|${f.value || ''}|${f.dedupe ?? ''}`;
    delete f.dedupe;
    const prev = seen.get(key);
    if (prev) {
      if (f.fixes) (prev.fixes ??= []).push(...f.fixes);
      return;
    }
    seen.set(key, f);
    findings.push(f);
  };
  return { findings, report };
}

/** The source-side rules alone - what a class that builds no view can be
 *  judged by, and all it is judged by under `allClasses`: the round-trip
 *  family (a 256-column line does not import, a BOM or CRLF never stops
 *  diffing), the activation and hygiene rules of checkAbapHygiene( ), and
 *  the released-API check. No view, no wire, no lifecycle: those rules read
 *  an app class, and a helper class has nothing for them to read. */
/** The rule ids checkSourceRules( ) can emit - everything a class that
 *  builds no view is judged by under `allClasses`, and the base of what a
 *  view-less APP class is judged by. A directive in such a class naming any
 *  other rule is unjudged, not unused (index.mjs). `npm test` keeps the set
 *  equal to the ids the four functions below emit. */
export const SOURCE_RULES = Object.freeze(new Set([
  // every class-scoped rule written as a unit reads a class with or without a view
  ...UNIT_RULES.filter((r) => r.scope === 'class').map((r) => r.id),
]));

export function checkSourceRules(source, { ownObjects = null, timings = null } = {}) {
  const src = scrub(source);
  const { findings, report } = collector();
  checkAbapHygiene({ src, source, report, timings, ownObjects });
  return findings;
}

export function checkAbapRules(source, { data = null, controlIds = null, containerPages = null, enumFields = null, boolFields = null, minUi5 = '1.71', rules = null, classIndex = null, ownObjects = null, timings = null } = {}) {
  const src = scrub(source);
  /* The same source with literal CONTENT blanked as well. `scrub( )` blanks
   * comments and KEEPS literals, which is what the rules reading an event
   * name or a bound path out of a call need — but a `client->` written inside
   * a string is prose ABOUT the API, not a call to it, and a sample that
   * documents itself in a MessageStrip is full of those. Every scan below
   * that asks WHERE A CALL IS reads this; the arguments are then read out of
   * `src`, where they still have their text. `blankLiterals( )` is
   * offset-for-offset, so a span computed here addresses `source` unchanged —
   * which matters most for the three of these that carry a `--fix`: read
   * raw, `--fix` rewrote the prose inside the string. */
  const code = blankLiterals(src);
  // which builder's vocabulary this class is written in (lib/builders.mjs) —
  // every rule that reads a builder call out of the source text is built from
  // it, so both dialects are judged by the same rules
  const d = dialectOf(src);
  const { findings, report } = collector();

  /* The ids this class hands out in its views: `)->a( n = `id` v = `x` )`.
   * -> a Set of literal ids, or null when ANY id attribute is built at
   * runtime (a template, a variable, a concatenation) — then the set is not
   * the full truth and no id may be called unknown. */
  const viewIds = (() => {
    /* Either quote spells the same attribute (`id` and 'id'), and the value
     * may be quoted either way too - a `'…'` id used to be invisible here, so
     * once any other id stood in backticks the set was trusted without it and
     * every wire naming it was an error on correct code. The ids the
     * reconstructed tree resolved (controlIds, handed in by the caller) join
     * the set: they include what a helper chain contributed. */
    const ids = new Set();
    // `t =` carries an id like `v =` does - an id written as text is still
    // this class's id, and a text id built at runtime still voids the set
    for (const m of src.matchAll(new RegExp(`\\b(?:${d.att})\\(\\s*n\\s*=\\s*[\`']id[\`']\\s+[vt]\\s*=\\s*([^\\n]*)`, 'gi'))) {
      const literal = m[1].match(/^\s*([`'])([^`']*)\1/);
      if (!literal) return null;
      ids.add(literal[2]);
    }
    for (const id of Object.keys(controlIds ?? {})) if (!/[{}]/.test(id)) ids.add(id);
    return ids.size ? ids : null;
  })();

  runRule(obsoleteBinder, { code, src, report }, { timings });

  runRule(obsoleteBindArgument, { code, src, report }, { timings });

  runRule(obsoleteModelUpdate, { code, source, src, report }, { timings });

  runRule(obsoleteFrontendEvent, { code, report }, { timings });

  // a value bound to a local variable is lost after the roundtrip: the
  // instance is serialized, the method stack is not
  const locals = localVariables(src);
  const attrs = instanceAttributes(src);
  runRule(bindingToLocal, { attrs, code, locals, src, report }, { timings });

  runRule(bindingToExpression, { code, src, report }, { timings });

  runRule(loopWorkAreaBound, { attrs, code, src, report }, { timings });

  /* A bound attribute that is not PUBLIC. Only public attributes are
   * serialized into the model (z2ui5_cl_ui5_srv_model filters on
   * visibility), so binding a PROTECTED/PRIVATE attribute fails the FIRST
   * roundtrip with "BINDING_ERROR - No class attribute for binding found".
   * Found live: samples-controls app 043 bound `expanded` from its PROTECTED
   * SECTION and had never worked in a running system — the e2e interaction
   * that closed its LIVE_TEST deviation was what surfaced it. Judged by the
   * ROOT of the bound name (a structure component travels with its root),
   * and only when the class declares a PUBLIC SECTION to compare against. */
  /* A bound CONSTANT or CLASS-DATA. The model is built from the app's
   * INSTANCE attributes: `attri_search` skips every static and every constant
   * (`is_class = abap_false AND is_constant = abap_false`), so the bind finds
   * no attribute at all and the first roundtrip raises BINDING_ERROR — in
   * any section, which is why this is not a case of the rule below: moving a
   * constant to PUBLIC changes nothing. Judged before it, and the root of the
   * bound name decides (a component of a structured constant is the
   * constant). A local CONSTANTS in a method is the same call with the same
   * exception, so the whole source is read, not only the definition. */
  const statics = staticAttributes(src);
  runRule(bindingToStatic, { code, statics, report }, { timings });

  runRule(bindingToNonpublic, { attrs, code, locals, source, src, statics, report }, { timings });

  runRule(ui5InternalAccess, { src, report }, { timings });

  /* A URL pointing at the commercial SAPUI5 host. The same portability
   * family as sapui5-only-control: sdk.openui5.org serves the open
   * distribution, ui5.sap.com / *.hana.ondemand.com serve SAPUI5 — an app
   * pinned to the commercial host breaks the moment it runs against an
   * OpenUI5-only landscape (and its assets differ). */
  /* Scoped to a URL that loads the RUNTIME, which is what the paragraph above
   * is actually about. The bare host is not evidence: a class header linking
   * the control's demo-kit page is on ui5.sap.com because SAPUI5 has no other
   * home, and a demo image under `/test-resources/` is an asset, not a
   * distribution. Reporting those made every SAPUI5-facing consumer switch the
   * rule off wholesale, which cost them the one case it exists for.
   *
   * The runtime is served from `/resources/` (note that `/test-resources/`
   * does not contain that path) or names the bootstrap script outright. */
  const RUNTIME_PATH = /\/resources\//;
  /* `sap-ui-core…` / `sap-ui-custom…` up to `.js`, i.e. what
   * `/sap-ui-(?:core|custom)[\w-]*\.js/` found: a run of name characters that
   * contains either and is followed by `.js`. Judged per run, which that
   * regex rescanned from each occurrence of the prefix in it. */
  const bootstrap = (text) => [...text.matchAll(/[\w-]+/g)]
    .some((r) => text.startsWith('.js', r.index + r[0].length) && /sap-ui-(?:core|custom)/.test(r[0]));
  runRule(commercialUi5Host, { RUNTIME_PATH, bootstrap, src, report }, { timings });


  /* Icon names, over the whole class rather than over the view tree: an icon
   * travels as data at least as often as it travels as an attribute — a
   * column of a bound table, a constant, a status-to-icon mapping — and none
   * of those reach the reconstructed view the property gate walks. Comments
   * are already blanked, so a name in prose is not a use. */
  for (const f of checkIcons(src, { minUi5, timings })) report(f);

  runRule(bindPathAsValue, { src, source, d, report }, { timings });
  runRule(bindPathFlag, { src, report }, { timings });
  const boolVars = runRule(unconvertedAbapBoolean, { src, d, report }, { timings });
  runRule(unescapedTextInAttribute, { src, d, boolVars, report, data }, { timings });

  /* An event raised in the view that nothing handles is usually a dead
   * control - but not always: in abap2UI5 an event also forces a roundtrip,
   * which alone synchronises the model back into ABAP. That makes this a
   * hint, never an error, and it is skipped entirely when handler names
   * are not literals (a constant or variable is not statically knowable). */
  const raised = eventNames(src);
  const handled = handledEvents(src);
  const dynamicHandling = /check_on_event\s*\(\s*(?:val\s*=\s*)?[a-z_]\w*[-\s)]/i.test(src)
    || hasEventCatchAll(src);
  if (!dynamicHandling) {
    runRule(eventWithoutHandler, { handled, raised, report }, { timings });
    runRule(eventNameCaseMismatch, { src, report }, { timings });
  }

  /* The lifecycle module reads STATEMENTS and nothing else - no rule in it
   * looks at literal content - so it is handed the blanked copy whole. A
   * class that quotes its own dispatcher in a MessageStrip (`IF
   * client->check_on_init( ). … ENDIF.`) used to be judged on the sentence:
   * missing-on-navigated-branch, separate-lifecycle-ifs, lifecycle-is-initial,
   * redundant-init-display and duplicate-for-iterator all fired on prose. */
  runRule(manualInitFlag, { src: code, report, boolVars, attrs, locals }, { timings });
  runRule(lifecycleIsInitial, { src: code, source, report, boolVars }, { timings });

  runRule(bindingToReference, { code, src, report }, { timings });

  runRule(liveEventRoundtrip, { d, src, report }, { timings });

  runRule(messageBoxRemovedParameter, { code, src, report }, { timings });

  runRule(unknownMessageBoxType, { code, source, src, report }, { timings });

  runRule(smartVariantWithoutInit, { controlIds, src, report }, { timings });

  runRule(viewNeverDisplayed, { src: code, d, report }, { timings });

  runRule(eventArgUnresolved, { src, report }, { timings });
  runRule(eventArgSingleRowTable, { src, report }, { timings });
  runRule(trailingEmptyEventArg, { source, src, report }, { timings });
  runRule(eventArgOutOfRange, { src, report }, { timings });
  runRule(eventArgJsCallback, { src, report }, { timings });
  runRule(abapDateFormatterMismatch, { src, code, report }, { timings });
  runRule(escapeSequenceInBacktick, { src, source, report }, { timings });
  checkAbapHygiene({ src, source, report, timings, ownObjects });

  runRule(redundantSerializable, { source, src, report }, { timings });

  runRule(privateAppAttribute, { source, src, report }, { timings });
  runRule(enumFieldUnsetOnInsert, { enumFields, src, report }, { timings });
  runRule(absentBooleanOverridesDefault, { boolFields, src, report }, { timings });

  // its rules time themselves (rule:<id>); the reading of the wires is part
  // of what checkAbapRules( ) spends outside every named pass
  const frontendRaised = checkFrontendWires({ src, code, report, viewIds, data, controlIds, containerPages, minUi5, timings });
  runRule(closeOnlyRoundtrip, { src, source, frontendRaised, report }, { timings });

  /* The backend events the loop above collected from KEYBOARD_SHORTCUT and
   * START_TIMER wires, judged like any raised event: no branch handles the
   * name, the shortcut/timer fires a roundtrip that falls through every
   * CASE. Skipped under the same dynamic-handling caution as above. */
  if (!dynamicHandling) runRule(eventWithoutHandler, { handled, raised: frontendRaised, report }, { timings });

  runRule(handlerWithoutEvent, { code, dynamicHandling, frontendRaised, raised, src, report }, { timings });

  runRule(unescapedBraceInStyle, { src, report }, { timings });

  /* A PUBLIC attribute nothing in the class ever touches. Every one of them
   * is serialized into the model and shipped to the browser on every
   * roundtrip, so one that is never bound, never read and never written is
   * pure transport weight.
   *
   * Deliberately NARROWER than "not bound in any view": a PUBLIC attribute
   * used only in ABAP code is not dead, it is state - PUBLIC is precisely how
   * a value survives the roundtrip, so demanding a binding for it would
   * report the correct way to keep state. Only a name that appears exactly
   * once in the whole class, its own declaration, is judged. A hint, because
   * an attribute can still be read from outside the class (a called app
   * reaching into the caller's instance), which no single source can see. */
  /* How often each PUBLIC attribute's name occurs as a whole word, counted in
   * ONE scan for all of them: `\bname\b` over the source for every
   * attribute was a scan of the whole class per declaration. Names are
   * `\w` runs (anything else keeps its own regex), so the alternation finds
   * exactly the matches the per-name regex found. */
  const publicAttrs = publicAttributes(src);
  const declaredNames = new Set(publicAttrs.map((a) => a.name.toLowerCase()).filter((n) => /^\w+$/.test(n)));
  const wordCounts = new Map();
  if (declaredNames.size) {
    for (const w of src.matchAll(new RegExp(`\\b(?:${[...declaredNames].join('|')})\\b`, 'gi'))) {
      const k = w[0].toLowerCase();
      wordCounts.set(k, (wordCounts.get(k) || 0) + 1);
    }
  }
  const wordUses = (name) => (declaredNames.has(name.toLowerCase())
    ? wordCounts.get(name.toLowerCase()) || 0
    : (src.match(new RegExp(`\\b${name}\\b`, 'gi')) || []).length);
  /* What the other classes of the run read of this one as `->name`
   * (`outsideReads` in the class index): a caller taking a popup's result
   * back reads it from OUTSIDE, which is the case both rules here say no
   * single source can see. Where the run holds that caller, it is seen. */
  const readOutside = outsideReadsOf(src, classIndex);
  const readFromOutside = (name) => Boolean(readOutside?.has(name.toLowerCase()));
  runRule(unusedPublicAttribute, { publicAttrs, readFromOutside, wordUses, report }, { timings });

  runRule(unboundPublicAttribute, { readFromOutside, src, wordUses, report }, { timings });

  runRule(popupWithoutCloseWire, { d, src, report }, { timings });

  runRule(popoverAnchorUnknownId, { code, src, viewIds, report }, { timings });

  runRule(getViewnameRemoved, { code, report }, { timings });

  runRule(popoverDisplayVal, { code, src, report }, { timings });

  runRule(duplicateForIterator, { src: code, source, report }, { timings });
  runRule(separateLifecycleIfs, { src: code, source, report }, { timings });
  runRule(redundantInitDisplay, { src: code, source, report }, { timings });
  runRule(unconditionalPopupDisplay, { src: code, report }, { timings });
  runRule(displayAfterNavAppCall, { src: code, report }, { timings });
  runRule(doubleDisplayInBranch, { src: code, report }, { timings });
  runRule(missingViewDisplayOnNavigated, { source, src: code, report }, { timings });
  runRule(missingOnNavigatedBranch, { source, src: code, report }, { timings });

  runRule(hardcodedBindingPath, { d, src, report }, { timings });

  runRule(collapsedBraceInStyle, { src, report }, { timings });

  runRule(escapedBraceInBacktick, { src, report }, { timings });

  runRule(frontendActionAsBackendEvent, { src, source, code, d, boolFields, classIndex, report }, { timings });
  runRule(popupDisplayXml, { src, source, code, d, boolFields, classIndex, report }, { timings });
  runRule(queueLastWithoutNoBusy, { src, source, code, d, boolFields, classIndex, report }, { timings });
  runRule(nestViewWithoutDestroy, { src, source, code, d, boolFields, classIndex, report }, { timings });
  runRule(omitInitialDropsFalse, { src, source, code, d, boolFields, classIndex, report }, { timings });

  /* How the chain is WRITTEN (lib/chain-layout.mjs). Pushed directly rather
   * than through report( ): those findings are one-per-chain already, and
   * collapsing two chains with the same deviation would drop the second
   * chain's line — the only thing a layout finding has to offer. */
  // straight into `findings`, as before: a layout finding is never collapsed
  const toFindings = (f) => findings.push(f);
  const chains = multiLineChains(source, d);
  for (const tokens of chains.list) {
    runRule(chainElementPerLine, { src: chains.src, tokens, report: toFindings }, { timings });
    runRule(chainIndentation, { src: chains.src, tokens, report: toFindings }, { timings });
  }
  /* Opt-in (findings.mjs OPT_IN): not produced at all unless a config asks
   * for it, rather than produced and filtered later. Its fixes span a whole
   * chain, so they would collide with the mechanical fixes of any other rule
   * inside the same chain and defer them to a second --fix run. */
  if (isOptInEnabled(rules, 'chain-house-layout')) runRule(chainHouseLayout, { d, source, report: toFindings }, { timings });

  return findings;
}
