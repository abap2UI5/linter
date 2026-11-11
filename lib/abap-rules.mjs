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
import { isCall, raisedEventLiterals, staticAttributes, publicAttributes, handledEventSites, eventCaseRegions, collapseInlineStructures } from './abap-helpers.mjs';
import { scrub, parenRegion, blankLiterals, skipWs, literalEnd, statementSpan, topAssigned, topRows } from './abap.mjs';
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
import { checkLifecycleDispatch } from './lifecycle-rules.mjs';
import { literalElements } from './abap-source.mjs';
/* Re-exported so a consumer that assembles the pipeline itself can reach it:
 * it lives in abap-source.mjs, which no exports-map subpath names, and the
 * entry point that used to be its only route pulls the renderer - and with it
 * http/os/module - into any bundle that imports it. */
export { elementBoundSlots } from './abap-source.mjs';
import { checkIcons } from './icons.mjs';
import { CC_NAMESPACE, OBSOLETE_CC_CONTROLS, OBSOLETE_CC_HELPERS } from './cc-controls.mjs';
import { dialectOf } from './builders.mjs';
import { declarationElements } from './reconstruct.mjs';
import { checkChainLayout, checkChainHouseLayout } from './chain-layout.mjs';
import { isOptInEnabled } from './findings.mjs';
/* The class index checkFiles( ) builds, for a caller judging one source at a
 * time (`classIndex`, below). */
export { classIndexOf } from './guide-rules.mjs';


/** Top-level `( … )` elements of a VALUE #( ) region - string-aware, so a
 *  bracket inside a literal never opens an element. */
/** The span of the FIRST `( … )` element of a VALUE body — `open` is the
 *  row's own paren, `end` its closing one, both indices into `body`. Skips
 *  literals exactly as countElements does, so the two agree on what a row is
 *  and a rule can count rows and then address the one it found. */
function firstElement(body) {
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '`' || c === '|' || c === "'") {
      for (i++; i < body.length; i++) {
        if (body[i] === '\\' && c === '|') i++;
        else if (body[i] === c) break;
      }
      continue;
    }
    if (c === '(') return { open: i, end: parenRegion(body, i).end };
  }
  return null;
}

function countElements(body) {
  let count = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '`' || c === '|') {
      for (i++; i < body.length; i++) {
        if (body[i] === '\\' && c === '|') i++;
        else if (body[i] === c) break;
      }
      continue;
    }
    if (c === '(') { count++; i = parenRegion(body, i).end; }
  }
  return count;
}


/* Where a handler for a named event begins: the three literal forms a class
 * dispatches with. A `get_event_arg( )` after one of them is read in that
 * event's handler - the nearest preceding marker wins.
 *
 * ENDMETHOD is a marker too, with no event: dispatch does not survive a
 * method boundary, and without that barrier a `get_event_arg( )` in some
 * later view-building method inherits the last WHEN of the handler method.
 * (Both of those were real false positives on the samples-controls corpus.) */
function eventScopes(src) {
  const scopes = [];
  const add = (re, event = (m) => m[1].toUpperCase()) => {
    for (const m of src.matchAll(re)) scopes.push({ at: m.index, event: event(m) });
  };
  add(/check_on_event\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi);
  add(/get_event\s*\(\s*\)\s*=\s*[`'|]([A-Z0-9_]+)[`'|]/gi);
  /* A WHEN literal names an event only inside a CASE over the EVENT - and
   * only at that CASE's own level. Read from any CASE it made `WHEN \`A\``
   * in a `CASE mv_status` the handler scope of event A, and a
   * get_event_arg( 2 ) three lines later was judged against A's arity - a
   * false error on a status switch inside B's handler; a status switch
   * NESTED in the event CASE is the same switch. The CASE's own ENDCASE
   * closes the scope again. */
  const cases = eventCaseRegions(src);
  for (const m of src.matchAll(/\bWHEN\s+[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (cases.some((c) => c.owns(m.index))) scopes.push({ at: m.index, event: m[1].toUpperCase() });
  }
  for (const c of cases) scopes.push({ at: c.to, event: null });
  add(/\bENDMETHOD\b/gi, () => null);
  return scopes.sort((a, b) => a.at - b.at);
}


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


/** The handled names as written, de-duplicated — what the spelling rule
 *  compares against; `handledEventSites( )` is the same read with offsets. */
function handledEventLiterals(src) {
  return [...new Set(handledEventSites(src).map((s) => s.name))];
}


/** The inside of every `omit_initial_paths = VALUE #( … ) )`: from the
 *  paren after VALUE up to the first `)` that another `)` follows, blanks
 *  between them allowed - what
 *  `/omit_initial_paths\s*=\s*VALUE\s+#?\s*\(([^)]*(?:\)[^)]*)*?)\)\s*\)/gi`
 *  captured. Each search starts where the last match ended, and a call with
 *  no closing pair after it ends the scan - no later call has one either;
 *  the regex searched the whole rest of the source again from every such
 *  call. */
function omitInitialPathLists(src) {
  const lists = [];
  let done = 0;
  for (const m of src.matchAll(/omit_initial_paths\s*=\s*VALUE\s+(?:#\s*)?\(/gi)) {
    if (m.index < done) continue;
    const from = m.index + m[0].length;
    let close = src.indexOf(')', from);
    let next = -1;
    while (close >= 0) {
      next = skipWs(src, close + 1);
      if (src[next] === ')') break;
      close = src.indexOf(')', next);
    }
    if (close < 0) break;
    lists.push(src.slice(from, close));
    done = next + 1;
  }
  return lists;
}

function checkEnumRowLiterals({ src, enumFields, boolFields, report }) {
  if (!enumFields?.size && !boolFields?.size) return;
  const omitted = new Set();
  for (const list of omitInitialPathLists(src)) {
    for (const f of list.matchAll(/[`'|]\s*([A-Za-z_][\w/]*)\s*[`'|]/g)) {
      omitted.add(f[1].split('/').pop().toUpperCase());
    }
  }
  if (/omit_initial\s*=\s*abap_true/i.test(src)) return;

  /* Structure over text: a `=` or a `(` inside a message string is not
   * syntax. Offsets are preserved, so a match here is a position in the file. */
  const s = blankLiterals(src);

  /* Fields the class fills AFTER the constructor, per table.
   *
   * A seed completed by a LOOP is not a row built without the field: half this
   * corpus computes an ObjectNumber `state` in the backend, because the
   * original computes it in a frontend Formatter the port has to move
   * server-side, and the seed deliberately carries no such column. Read
   * through the cursor the write goes through - a field filled on some other
   * table says nothing about this one. */
  const cursorTable = new Map();
  for (const m of s.matchAll(/\b(?:LOOP\s+AT|READ\s+TABLE)\s+(?:<\w+>-|\w+-)*(\w+)([^.]*)/gi)) {
    const table = m[1].toUpperCase();
    for (const c of m[2].matchAll(/(?:REFERENCE\s+INTO|ASSIGNING|INTO)\s+(?:DATA\(\s*(\w+)\s*\)|FIELD-SYMBOL\(\s*<(\w+)>\s*\)|<(\w+)>|(\w+))/gi)) {
      const name = c[1] || c[2] || c[3] || c[4];
      if (name) cursorTable.set(name.toUpperCase(), table);
    }
  }
  const filledAfter = new Map();
  const fill = (table, field) => {
    if (!table) return;
    const prev = filledAfter.get(table) ?? new Set();
    prev.add(field);
    filledAfter.set(table, prev);
  };
  // `t_appointments[ i ]-type = …` — the table names itself
  for (const m of s.matchAll(/\b(\w+)\s*\[[^\]]*\]\s*-(\w+)\s*=(?!=)/g)) {
    fill(m[1].toUpperCase(), m[2].toUpperCase());
  }
  // `lr_row->weight_state = …` / `<row>-weight_state = …` — through a cursor
  for (const m of s.matchAll(/(?:^|[^\w>])<?(\w+)>?\s*(?:->|-)(\w+)\s*=(?!=)/gm)) {
    fill(cursorTable.get(m[1].toUpperCase()), m[2].toUpperCase());
  }

  const judge = (table, body, offset, carried = null) => {
    const key = String(table).toUpperCase();
    const fields = enumFields.get(key);
    if (!fields) return;
    const set = topAssigned(body);
    const later = filledAfter.get(key);
    for (const field of fields) {
      if (set.has(field) || omitted.has(field)) continue;
      if (carried?.has(field) || later?.has(field)) continue;
      report({ type: 'enum-field-unset-on-insert', member: field, offset });
    }
  };

  /* Every `… = VALUE …( … )` in the class, read as what its left-hand side
   * names. A TABLE constructor (its body opens with row parens) is judged row
   * by row against that name; a STRUCTURE constructor is a work area, kept
   * until an INSERT names the table it goes into. */
  const workAreas = new Map();
  for (const m of s.matchAll(/\bVALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/gi)) {
    const open = s.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(s, open);
    if (body === undefined) continue;
    const before = s.slice(Math.max(0, m.index - 200), m.index);
    const lhs = before.match(/DATA\(\s*(\w+)\s*\)\s*=\s*$/i)
      || before.match(/([A-Za-z_<][\w<>-]*)\s*=\s*$/);
    const rows = topRows(body);
    if (rows.length) {
      /* A table constructor. Its name is the field it is assigned to - which
       * is exactly the path a nested aggregation binds (`elements`, `groups`,
       * `t_appointments`), so the nested seeds inside a model_init literal
       * come out of this same pass. */
      if (!lhs) continue;
      const key = (lhs[1].match(/(\w+)$/) || [])[1];
      if (!key) continue;
      /* ABAP lets a table constructor set a component ONCE, before the rows,
       * and every row after it inherits the value:
       *   VALUE #( design = `Default` ( title = … ) ( title = … ) )
       * App 407 seeds seven such defaults that way on purpose. A row is
       * judged against its own fields PLUS those. */
      const carried = topAssigned(body);
      /* A row that assigns no component is not a row literal: it is a whole
       * structure handed over as one expression, which is what a table
       * comprehension writes (`VALUE #( FOR row IN t_all WHERE ( … ) ( row ) )`,
       * app 505) and what a scalar table row looks like. A row copied from
       * somewhere else has no single place to read, and never had. */
      const usable = rows.filter((r) => topAssigned(r.body).size);

      /* The BOOLEAN counterpart of the enum rule, and it needs a second signal
       * the enum one does not.
       *
       * `abap_bool` has no absent state, so a field a row leaves out still
       * ships as a real JSON `false` — which is correct almost everywhere, and
       * wrong exactly where the UI5 property's own default is `true`: the row
       * then renders the OPPOSITE of what it meant, with nothing failing. On
       * its own that would report every boolean seed there is, so the rule asks
       * for both signals the probe measured: the property defaults to true AND
       * the seed is INCONSISTENT — some rows of this very table set the field
       * and others do not. A table that never sets it is ordinary data (`unread`,
       * `active` are false for every row on purpose); a table that always sets
       * it has nothing missing. The gap between two rows of one literal is what
       * is almost never deliberate — app 291's notification items lost both
       * close buttons that way, and with them the port's only backend wire. */
      const boolNames = boolFields?.get(key.toUpperCase());
      if (boolNames?.size && usable.length > 1) {
        const later = filledAfter.get(key.toUpperCase());
        for (const field of boolNames) {
          if (carried.has(field) || omitted.has(field) || later?.has(field)) continue;
          const sets = usable.filter((r) => topAssigned(r.body).has(field));
          if (!sets.length || sets.length === usable.length) continue;
          for (const r of usable) {
            if (topAssigned(r.body).has(field)) continue;
            report({
              type: 'absent-boolean-overrides-default',
              member: field, offset: open + 1 + r.offset,
            });
          }
        }
      }

      for (const r of usable) judge(key, r.body, open + 1 + r.offset, carried);
      continue;
    }
    if (!lhs || !lhs[1]) continue;
    const name = (lhs[1].match(/^(\w+)$/) || [])[1];
    if (!name) continue; // <fs>-comp or deep component: not a plain work area
    const key = name.toUpperCase();
    /* Two constructors for one name, or a wholesale copy into it, and there is
     * no single row to read any more. */
    if (workAreas.has(key)) { workAreas.set(key, null); continue; }
    workAreas.set(key, { body, offset: m.index });
  }
  for (const m of s.matchAll(/\b(?:MOVE-CORRESPONDING\s+\S+\s+TO|CLEAR)\s+(\w+)\b/gi)) {
    if (workAreas.has(m[1].toUpperCase())) workAreas.set(m[1].toUpperCase(), null);
  }

  /* INSERT/APPEND of an INLINE row literal - the construction site the port
   * writes at the event, and the one that omits a key. */
  for (const m of s.matchAll(/\b(?:INSERT|APPEND)\s+VALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/gi)) {
    const open = s.indexOf('(', m.index + m[0].length - 1);
    const { body, end } = parenRegion(s, open);
    if (body === undefined) continue;
    /* Which table this row is built for. Without it the rule judges an INSERT
     * against the fields of a template it has nothing to do with - app 547
     * builds an interval header and an appointment two lines apart, and only
     * the second one binds the enum. */
    const tail = s.slice(end ?? open, (end ?? open) + 160);
    const target = tail.match(/\b(?:INTO\s+TABLE|TO)\s+(?:<\w+>-|\w+-)*(\w+)/i);
    if (!target) continue;
    judge(target[1], body, m.index);
  }

  /* INSERT/APPEND of a WORK AREA built by a VALUE constructor above it. The
   * row is the same row; only the statement it is written in differs. A field
   * filled afterwards (`appointment-aria = …`) counts as set. */
  for (const m of s.matchAll(/\b(?:INSERT|APPEND)\s+(\w+)\s+(?:INTO\s+TABLE|TO)\s+(?:<\w+>-|\w+-)*(\w+)/gi)) {
    const wa = workAreas.get(m[1].toUpperCase());
    if (!wa) continue;
    const filled = [...s.matchAll(new RegExp(`\\b${m[1]}-(\\w+)\\s*=(?!=)`, 'gi'))]
      .map((f) => f[1].toUpperCase());
    judge(m[2], `${wa.body} ${filled.map((f) => `${f} =`).join(' ')}`, wa.offset);
  }
}


function checkEventArgs({ src, source, report }) {
  /* A t_arg value the app expects the CLIENT to resolve must be $-prefixed:
   * the runtime (z2ui5_cl_ui5_srv_event=>get_t_arg) sends `$...` and `{...}`
   * entries to the frontend verbatim, but only a $-prefixed expression is
   * resolved by UI5 before the roundtrip - a bare-brace `{COL}` is neither
   * resolved nor quoted, so get_event_arg( ) receives an EMPTY value with no
   * error anywhere. The one legitimate bare-brace form is a client-composed
   * template that STARTS with a {N} placeholder ({0}, {1?...}), which the
   * runtime quotes as a plain string. */
  // ONLY client->_event( ) - a BACKEND event, whose t_arg values travel back
  // and are read with get_event_arg( ). client->_event_client( ) and
  // follow_up_action( ) are FRONTEND actions: their t_arg is the argument list
  // of the action itself, and a brace object there is the documented way to
  // hand a parameter set to the frontend (cs_event-urlhelper takes
  // |\{ URL: '…', NEW_WINDOW: true \}|). Flagging those would be wrong.
  /* How many t_arg values each event actually sends, by name - the arity
   * get_event_arg( ) is read against below. The maximum wins when one name is
   * raised from several places: the reader is right as long as ANY raise site
   * sends that many. */
  const arity = new Map();
  const code = blankLiterals(src);
  for (const ev of src.matchAll(/client->_event\s*\(/gi)) {
    if (!isCall(code, ev.index, 'client->')) continue;
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    const nameMatch = evBody.match(/^\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/i);
    const tm = evBody.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
    /* `arg` is the ONE-VALUE spelling of t_arg: the client folds `arg = x`
     * into the same string_table as `t_arg = VALUE #( ( x ) )` - appending it
     * BEHIND any t_arg rows when both are given - so it counts as exactly one
     * more argument, and get_event_arg( ) reads it like any other.
     * `\barg` cannot hit the `arg` inside `t_arg`: `_` and `a` are both word
     * characters, so there is no boundary between them.
     * Presence and literal are matched separately on purpose - `arg = lv_key`
     * is still one argument, of a value this pass cannot know, and counting
     * only the literal form would under-count the arity and resurrect exactly
     * the false positive this handles. */
    const argSupplied = /\barg\s*=/i.test(evBody);
    const argLit = evBody.match(/\barg\s*=\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)/i);
    if (nameMatch) {
      let count = 0;
      if (tm) {
        const argOpen = evBody.indexOf('(', tm.index + tm[0].length - 1);
        count = countElements(parenRegion(evBody, argOpen).body);
      }
      if (argSupplied) count += 1;
      const name = nameMatch[1].toUpperCase();
      arity.set(name, Math.max(arity.get(name) ?? 0, count));
    }

    /* The unresolved-brace check owes the shorthand the same coverage: a bare
     * `{COL}` reaches the frontend unresolved and unquoted whichever spelling
     * carried it, and reading it back gives an empty value with no error. Run
     * before the t_arg branch below, which a call spelling its one argument
     * as `arg` never enters. */
    if (argLit) {
      const isTemplate = argLit[3] !== undefined;
      const raw = isTemplate ? argLit[3] : argLit[2];
      const lit = String(raw).trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      const shown = lit.replace(/\\/g, '');
      if (bad && !/^\{\d+[?}]/.test(shown)) {
        let fixes;
        if (!isTemplate) {
          const brace = evOpen + 1 + argLit.index + argLit[0].indexOf(argLit[1]) + 1 + raw.indexOf('{');
          fixes = [{ start: brace, end: brace, text: '$' }];
        }
        report({
          type: 'event-arg-unresolved', value: shown.slice(0, 40),
          offset: evOpen + 1 + argLit.index, ...(fixes ? { fixes } : {}),
        });
      }
    }

    if (!tm) continue;
    const open = evBody.indexOf('(', tm.index + tm[0].length - 1);
    const { body } = parenRegion(evBody, open);

    /* ONE row written as a table. `arg` is the one-value spelling of `t_arg`:
     * the client folds `arg = x` into the same string_table as
     * `t_arg = VALUE #( ( x ) )` - literally the same wire, read back with
     * the same `get_event_arg( )` - and the single argument is what most
     * wires carry (a row key, a `${$source>/...}`, one event parameter),
     * where the table constructor is longer than the value inside it. From
     * two values on `t_arg` is the right parameter and this stays silent.
     *
     * Only `client->_event( )`: `_event_client( )` and `follow_up_action( )`
     * have no `arg` parameter, and the surrounding loop already excludes
     * them.
     *
     * Silent, not merely unfixable, when both spellings are present (the
     * documented composition appends `arg` BEHIND the rows, so the call
     * sends two arguments and neither collapses) and when the row contains a
     * `#`: `arg` is generic (`TYPE clike`), so a `CONV #( )` / `VALUE #( )`
     * inside it has no type to derive `#` from and the remedy would not
     * compile. A finding whose remedy does not compile is worse than none. */
    const region = parenRegion(evBody, open);
    /* An UNCLOSED VALUE - a truncated source, a class the fuzzer cut mid-call
     * - gets end === evBody.length back, which is one past the last character
     * rather than a closing paren. Rewriting that span addresses text this
     * source does not have, and the fixer throws on it under strict fixes. */
    const closed = region.end < evBody.length;
    const row = closed && countElements(body) === 1 ? firstElement(body) : null;
    const rowText = row ? body.slice(row.open + 1, row.end).trim() : '';
    if (row && rowText && !argSupplied && !rowText.includes('#')) {
      report({
        type: 'event-arg-single-row-table',
        // shown whole up to ~40 characters, then cut between tokens (a backtick literal is one token) with an ellipsis, never mid-literal
        value: (rowText.match(/`[^`]*`?|[^\s`]+/g) ?? [rowText]).reduce((s, t) => (!s ? t : s.endsWith('…') ? s : `${s} ${t}`.length <= 40 ? `${s} ${t}` : `${s}…`), ''),
        offset: evOpen + 1 + tm.index,
        fixes: [{
          start: evOpen + 1 + tm.index,
          end: evOpen + 1 + region.end + 1,
          text: `arg = ${rowText}`,
        }],
      });
    }
    // body[i] is src[argBase + i]: the one base every offset and fix below
    // is computed from. A finding used to take the t_arg TOKEN's position
    // plus an index into the VALUE body - two coordinate systems, ~16
    // columns apart, which put the finding on the previous line and out of
    // reach of a disable-next-line directive.
    const argBase = evOpen + open + 2;
    // Only a `backtick` / 'quoted' literal hands its braces to the frontend
    // verbatim. A |…| STRING TEMPLATE is ABAP: |{ badgemin }| interpolates the
    // variable server-side and sends its value - perfectly correct, and not
    // this rule's business. A template only reaches the frontend with braces
    // when they are escaped (|\{COL\}|), which is the bad form again.
    for (const el of body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)) {
      const isTemplate = el[3] !== undefined;
      const raw = isTemplate ? el[3] : el[2];
      const lit = raw.trim();
      const bad = isTemplate ? lit.startsWith('\\{') : lit.startsWith('{');
      if (!bad) continue;
      const shown = lit.replace(/\\/g, '');
      if (/^\{\d+[?}]/.test(shown)) continue; // {N} template placeholder - quoted, fine
      /* Autofixable in the literal form: the missing `$` is a pure insertion
       * in front of the brace. body[i] is src[evOpen + open + 2 + i], and the
       * literal starts one character past its own quote. A |…| template is
       * left alone - there the braces are escaped ABAP, not a UI5 expression. */
      let fixes;
      if (!isTemplate) {
        const brace = evOpen + open + 2 + el.index + el[0].indexOf(el[1]) + 1 + raw.indexOf('{');
        fixes = [{ start: brace, end: brace, text: '$' }];
      }
      report({ type: 'event-arg-unresolved', value: shown.slice(0, 40), offset: argBase + el.index, ...(fixes ? { fixes } : {}) });
    }

    /* A TRAILING empty argument never arrives. get_t_arg buffers an empty
     * entry and only flushes it when a later non-empty one follows - the
     * comment in z2ui5_cl_ui5_srv_event says so - so an empty entry between
     * filled ones keeps its slot and a trailing one simply disappears. The
     * handler's `get_event_arg( <n> )` for that position then reads initial
     * and the author never learns why.
     *
     * The framework pads a missing trailing argument only for a NULLABLE
     * declared kind on a control method (control-method-null-arg), which is a
     * CONTROL_BY_ID concern - a backend `_event` has no declared kinds, so
     * nothing pads it here. Only the LAST entry is judged; an empty one in
     * the middle is correct and deliberate. */
    const argEls = [...body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)];
    const last = argEls[argEls.length - 1];
    if (argEls.length > 1 && last) {
      const raw = last[3] !== undefined ? last[3] : last[2];
      if (String(raw).trim() === '') {
        /* Mechanically fixable: the row never arrives, so deleting it changes
         * nothing the handler can observe. The span is measured on the
         * ORIGINAL source (the same statementSpan doctrine): a row with its
         * line to itself takes the whole line, an inline row also eats the
         * spaces in front of it, and the walk back stops at anything that is
         * not plain whitespace THERE - so a comment scrub( ) blanked to
         * spaces is never deleted along with the row. */
        const rowStart = argBase + last.index;
        const rowEnd = rowStart + last[0].length;
        let span;
        if (source) {
          const lineStart = source.lastIndexOf('\n', rowStart - 1) + 1;
          const nl = source.indexOf('\n', rowEnd);
          const lineEnd = nl === -1 ? source.length : nl + 1;
          if (!source.slice(lineStart, rowStart).trim() && !source.slice(rowEnd, nl === -1 ? source.length : nl).trim()) {
            span = { start: lineStart, end: lineEnd };
          } else {
            /* An inline row eats the spaces in front of it - unless those
             * spaces are the line's indentation (the row opens the line and
             * something follows it): eating them would pull `) )` to column
             * one. */
            let s = rowStart;
            while (s > lineStart && (source[s - 1] === ' ' || source[s - 1] === '\t')) s--;
            if (s === lineStart) s = rowStart;
            span = { start: s, end: rowEnd };
          }
        }
        report({
          type: 'trailing-empty-event-arg',
          value: String(argEls.length),
          offset: argBase + last.index,
          ...(span ? { fixes: [{ ...span, text: '' }] } : {}),
        });
      }
    }
  }

  /* Reading past the t_arg the event declares. The args are static - they are
   * written at the raise site - so `get_event_arg( 3 )` in the handler of an
   * event that sends two is never anything but a mistake: it returns initial
   * in ABAP and 500s in the transpiled runtime, and either way the value the
   * handler works with is not the one the author meant. Only a literal index
   * is judged (a variable one is not statically knowable), and only inside
   * the handler of an event this class raises itself. */
  if (arity.size) {
    const scopes = eventScopes(src);
    for (const m of src.matchAll(/get_event_arg\s*\(\s*(?:v\s*=\s*)?(?:(\d+)\s*)?\)/gi)) {
      const read = m[1] ? Number(m[1]) : 1; // the interface default is 1
      let scope = null;
      for (const s of scopes) {
        if (s.at < m.index) scope = s; else break;
      }
      /* The NEAREST preceding marker decides, whatever event it names - and
       * if that is a method boundary, or an event this class does not raise
       * with client->_event( ), the call is not judged at all. An event can
       * also arrive from a message_box_display( onclose = ) callback or a
       * frontend action, and those carry args from a source this pass cannot
       * see; skipping there is the difference between a rule and a guess. */
      if (!scope?.event || !arity.has(scope.event)) continue;
      const sent = arity.get(scope.event);
      if (read > sent) {
        report({ type: 'event-arg-out-of-range', value: scope.event, member: String(read), count: sent, offset: m.index });
      }
    }
  }
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


/*
 * The obsolete companion controls, in the spelling the view walk never sees:
 * the frozen builder's per-control helpers on `z2ui5_cl_xml_view_cc`, reached
 * through `z2ui5_cl_xml_view->_z2ui5( )`. The builder tag (`tag( n = \`Timer\`
 * ns = \`z2ui5\` )`) and the XML form (`<z2ui5:Timer>`) are judged on the
 * reconstructed document in properties.mjs; a class on z2ui5_cl_xml_view
 * reconstructs NO document, so this text scan is the only thing that can see
 * its Timer.
 *
 * Reading the old API at all is the exception frozen-view-builder's header
 * warns about ("confident noise"), and it is made on purpose: the question is
 * not what the view looks like but whether one of eight method NAMES is
 * called on the one receiver that has them - `_z2ui5( )`, or a handle
 * assigned from it. `->title( )` on the view itself is sap.m.Title and is not
 * touched. Over the scrubbed source with literal content blanked, so a name
 * in a comment or a string is prose, not a call.
 *
 * Returns the findings instead of taking `report`: the collector folds
 * identical findings into one, and every call site here is a rewrite of its
 * own - the same granularity the view half has, where each tag is a finding.
 */
function obsoleteCcHelpers(src) {
  const out = [];
  const code = blankLiterals(src);
  if (!/\b_z2ui5\s*\(/i.test(code)) return out;
  /* `DATA(cc) = view->_z2ui5( ).` / `cc = view->_z2ui5( ).` then
   * `cc->timer( … )` - the handle form, one statement away */
  const handles = new Set();
  for (const m of code.matchAll(/(?:\bDATA\s*\(\s*(\w+)\s*\)|\b(\w+))\s*=\s*[\w>~-]*?\b_z2ui5\s*\(\s*\)\s*\./gi)) {
    handles.add((m[1] || m[2]).toLowerCase());
  }
  const receivers = ['\\b_z2ui5\\s*\\(\\s*\\)', ...[...handles].map((h) => `\\b${h}`)].join('|');
  const helpers = Object.keys(OBSOLETE_CC_HELPERS).join('|');
  const re = new RegExp(`(?:${receivers})\\s*->\\s*(${helpers})\\s*\\(`, 'gid');
  for (const m of code.matchAll(re)) {
    const helper = m[1].toLowerCase();
    const name = OBSOLETE_CC_HELPERS[helper];
    out.push({
      type: 'obsolete-custom-control', control: `${CC_NAMESPACE}.${name}`, value: name, member: helper,
      replacement: OBSOLETE_CC_CONTROLS[name].replacement, offset: m.indices[1][0],
    });
  }
  return out;
}

/** The legacy-helper half of `obsolete-custom-control` on its own - what a
 *  class on the frozen builder is judged by beside `frozen-view-builder`
 *  (lib/index.mjs), since it reconstructs no document for the view walk. */
export function obsoleteCcHelperFindings(source) {
  return obsoleteCcHelpers(scrub(source));
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
  'obsolete-custom-control',
  // every class-scoped rule written as a unit reads a class with or without a view
  ...UNIT_RULES.filter((r) => r.scope === 'class').map((r) => r.id),
]));

export function checkSourceRules(source, { ownObjects = null, timings = null } = {}) {
  const src = scrub(source);
  const { findings, report } = collector();
  checkAbapHygiene({ src, source, report, timings, ownObjects });
  findings.push(...obsoleteCcHelpers(src));
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
  for (const f of timed(timings, 'pass:icons', () => checkIcons(src, { minUi5 }))) report(f);

  findings.push(...obsoleteCcHelpers(src));

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
    for (const [name, offset] of raised) {
      if (!handled.has(name)) {
        report({ type: 'event-without-handler', value: name, offset });
      }
    }

    /* The two sets above are compared case-blind, which is exactly how the
     * runtime does NOT compare them: `get_event( ) = val` is a string
     * comparison, so `_event( \`save\` )` never reaches `WHEN \`SAVE\``. A
     * raised spelling that no handler carries, where exactly one handled
     * spelling is the same name up to case, is that defect — and the fix
     * writes the handler's spelling into the raise, because the handler is
     * the one place the name is compared. Two handled spellings of one name
     * are left alone: which of them to follow would be a guess. */
    const handledRaw = handledEventLiterals(src);
    for (const r of raisedEventLiterals(src)) {
      if (handledRaw.includes(r.name)) continue;
      const spelt = [...new Set(handledRaw.filter((h) => h.toUpperCase() === r.name.toUpperCase()))];
      if (spelt.length !== 1) continue;
      report({
        type: 'event-name-case-mismatch', value: r.name, member: spelt[0], offset: r.offset,
        fixes: [{ start: r.at, end: r.at + r.name.length, text: spelt[0] }],
      });
    }
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

  /* A per-keystroke event wired to a BACKEND round-trip. abap2UI5 serializes
   * round-trips: an event fired while one is in flight is DROPPED, not
   * queued, so a liveChange wire that round-trips sees the value of the last
   * COMPLETED trip and skips the ones typed in between — it converges only
   * when the input pauses. (Measured on a real port: typing `abc` with no
   * delay left the bound field at `a` while the control held `abc`.) That
   * convergence is why this is a hint, not an error: the wire is lossy, not
   * dead. Prefer a two-way binding — the model updates without any event —
   * or the control's final-value event (change/search/submit); keep the live
   * wire only when every intermediate value genuinely must reach ABAP. Only
   * the plain client->_event( ) round-trips; _event_client and
   * follow_up_action are frontend-only and are not judged. */
  runRule(liveEventRoundtrip, { d, src, report }, { timings });

  runRule(messageBoxRemovedParameter, { code, src, report }, { timings });

  runRule(unknownMessageBoxType, { code, source, src, report }, { timings });

  runRule(smartVariantWithoutInit, { controlIds, src, report }, { timings });

  runRule(viewNeverDisplayed, { src: code, d, report }, { timings });

  checkEventArgs({ src, source, report });
  runRule(eventArgJsCallback, { src, report }, { timings });
  runRule(abapDateFormatterMismatch, { src, code, report }, { timings });
  runRule(escapeSequenceInBacktick, { src, source, report }, { timings });
  checkAbapHygiene({ src, source, report, timings, ownObjects });

  /* A PRIVATE instance attribute on an app class. The app's state is persisted
   * with `CALL TRANSFORMATION id`, and the transpiled runtime re-implements
   * that walk with a dynamic `ASSIGN obj->(name)` — which reaches a PROTECTED
   * attribute and NOT a private one. `sy-subrc` is then 4, the serializer
   * asserts, and EVERY roundtrip answers `ASSERTION_FAILED` out of
   * `lcl_heap.add_object`, with nothing in the message naming the attribute
   * that caused it.
   *
   * A warning rather than an error, and the line is the one this file's
   * severity comment draws: a real SAP kernel serializes a private attribute
   * fine, so such a class works on the system it was written for. It breaks on
   * the transpiled runtime — abap2UI5's own Node backend and every e2e smoke —
   * which is exactly the "not necessarily on the target system" bucket. Six
   * ports carried it while the 53 with a PROTECTED attribute were fine, which
   * is what isolated it; app state belongs in PUBLIC (that is also what makes
   * it reach the model at all) and helpers in PROTECTED. */
  runRule(redundantSerializable, { source, src, report }, { timings });

  runRule(privateAppAttribute, { source, src, report }, { timings });
  checkEnumRowLiterals({ src, enumFields, boolFields, report });

  const frontendRaised = timed(timings, 'pass:frontend-wires', () => checkFrontendWires({ src, code, report, viewIds, data, controlIds, containerPages, minUi5 }));
  runRule(closeOnlyRoundtrip, { src, source, frontendRaised, report }, { timings });

  /* The backend events the loop above collected from KEYBOARD_SHORTCUT and
   * START_TIMER wires, judged like any raised event: no branch handles the
   * name, the shortcut/timer fires a roundtrip that falls through every
   * CASE. Skipped under the same dynamic-handling caution as above. */
  if (!dynamicHandling) {
    for (const { name, offset } of frontendRaised) {
      if (!handled.has(name)) {
        report({ type: 'event-without-handler', value: name, offset });
      }
    }
  }

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

  /* popover_display imports XML, not VAL — the one asymmetry in the display
   * family (popup_display takes val). A `val =` guessed by analogy does not
   * compile, but nothing in a systemless pipeline says so before activation:
   * abaplint has no signature knowledge of z2ui5_if_client, and the render
   * gate never sees the class fail. One of the most common first-try
   * mistakes in generated code (samples-controls hold-out probes 607/613/617). */
  runRule(popoverDisplayVal, { code, src, report }, { timings });

  runRule(duplicateForIterator, { src: code, source, report }, { timings });
  runRule(separateLifecycleIfs, { src: code, source, report }, { timings });
  runRule(redundantInitDisplay, { src: code, source, report }, { timings });
  timed(timings, 'pass:lifecycle', () => checkLifecycleDispatch({ src: code, source, report }));

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
  findings.push(...timed(timings, 'pass:chain-layout', () => checkChainLayout(source, d)));
  /* Opt-in (findings.mjs OPT_IN): not produced at all unless a config asks
   * for it, rather than produced and filtered later. Its fixes span a whole
   * chain, so they would collide with the mechanical fixes of any other rule
   * inside the same chain and defer them to a second --fix run. */
  if (isOptInEnabled(rules, 'chain-house-layout')) findings.push(...timed(timings, 'pass:chain-layout', () => checkChainHouseLayout(source, d)));

  return findings;
}
