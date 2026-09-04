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
 *   checkReleasedApi     abap2UI5 objects outside the released five
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
import { scrub, parenRegion, blankLiterals } from './abap.mjs';
import { caseMatch } from './suggest.mjs';
import { checkFrontendWires } from './frontend-wires.mjs';
import {
  manualInitFlag, lifecycleIsInitial, viewNeverDisplayed, checkLifecycleDispatch,
} from './lifecycle-rules.mjs';
import { literalElements } from './abap-source.mjs';
/* Re-exported so a consumer that assembles the pipeline itself can reach it:
 * it lives in abap-source.mjs, which no exports-map subpath names, and the
 * entry point that used to be its only route pulls the renderer - and with it
 * http/os/module - into any bundle that imports it. */
export { elementBoundSlots } from './abap-source.mjs';
import { checkIcons } from './icons.mjs';
import { LINE_LIMIT } from './findings.mjs';
import { apiVerdict } from './released-api.mjs';
import { dialectOf, builderOfVerb } from './builders.mjs';
import { checkChainLayout, checkChainHouseLayout } from './chain-layout.mjs';
import { isOptInEnabled } from './findings.mjs';

/** Every string literal in the source with its kind: a backtick literal takes
 *  a backslash verbatim, a |…| template reads it as an escape. That is the
 *  whole difference between CSS that renders and CSS that kills the view. */
function literalSegments(abap) {
  const segments = [];
  let kind = null;
  let start = 0;
  for (let i = 0; i < abap.length; i++) {
    const c = abap[i];
    if (kind === '`') {
      if (c === '`') { segments.push({ kind, start, end: i }); kind = null; }
    } else if (kind === '|') {
      if (c === '\\') i++;
      else if (c === '|') { segments.push({ kind, start, end: i }); kind = null; }
    } else if (c === '`' || c === '|') {
      kind = c;
      start = i + 1;
    }
  }
  return segments;
}

/** Top-level `( … )` elements of a VALUE #( ) region - string-aware, so a
 *  bracket inside a literal never opens an element. */
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
  add(/\bWHEN\s+[`'|]([A-Z0-9_]+)[`'|]/gi);
  add(/\bENDMETHOD\b/gi, () => null);
  return scopes.sort((a, b) => a.at - b.at);
}



/* The span a whole statement occupies when it has its line to itself —
 * leading indentation and the closing newline included, so deleting a no-op
 * call leaves neither a blank line nor stray indentation behind. Anything
 * else on the line (another statement, a trailing comment) and only the
 * statement itself is returned: removing a comment nobody asked about is a
 * guess, and a fix that guesses is worse than a finding that stays.
 * Measured on the ORIGINAL source, where a comment is still visible. */
function statementSpan(source, start, end) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const nl = source.indexOf('\n', end);
  const lineEnd = nl === -1 ? source.length : nl + 1;
  const alone = !source.slice(lineStart, start).trim() && !source.slice(end, lineEnd).trim();
  return alone ? { start: lineStart, end: lineEnd } : { start, end };
}

/** Instance data survives the roundtrip; a local does not. */
/* An INLINE structure declares the attribute and its structure in one go:
 * `DATA: BEGIN OF email, text TYPE string, END OF email.` The attribute is
 * `email` — but a comma split sees `BEGIN OF email`, `text TYPE string` and
 * `END OF email`, so the attribute itself was never registered and its
 * FIELDS were registered in its place. binding-to-nonpublic then reported
 * every binding through a public inline structure as non-public (samples 316
 * carried two).
 *
 * Each region collapses to `<name>.` — the declaration it is, written flat.
 * Deleting it outright is what does NOT work: an emptied `DATA:` leaves the
 * block regexes below with a `DATA:` whose `\s+` then swallows the newline
 * into the NEXT declaration, and that one is read as an attribute called
 * `DATA`. */
const collapseInlineStructures = (text) => text
  .replace(/BEGIN OF\s+(\w+)(?:\s+READ-ONLY)?\s*,[\s\S]*?END OF\s+\1\s*([,.])/gi, '$1$2');

function instanceAttributes(src) {
  const names = new Set();
  // DATA name TYPE ... / DATA: a TYPE x, b TYPE y - in the class definition.
  // ENDCLASS is re-appended on its own line: the block regex below finds a
  // declaration only up to a TERMINATOR lookahead, and slicing the head right
  // before ENDCLASS used to cut that terminator off — silently dropping the
  // LAST declaration of the definition (latent until binding-to-nonpublic
  // started comparing against this set).
  const defEnd = src.search(/\bENDCLASS\b/i);
  const head = `${defEnd > 0 ? src.slice(0, defEnd) : src}\nENDCLASS`;
  for (const m of head.matchAll(/^\s*(?:CLASS-)?DATA:?\s+([\s\S]*?)(?=^\s*(?:CLASS-)?DATA\b|^\s*(?:METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|PUBLIC SECTION|PROTECTED SECTION|PRIVATE SECTION|ENDCLASS)\b)/gim)) {
    for (const d of collapseInlineStructures(m[1]).split(',')) {
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
 * Deliberately conservative in one direction: the body is matched only to the
 * FIRST ENDCASE, so a nested CASE hides the catch-all and the events keep being
 * reported. Missing a catch-all costs a false hint; inventing one would hide a
 * genuinely dead event, which is worse. */
function hasEventCatchAll(src) {
  const CASE_OVER_EVENT = /\bCASE\s+[^.]*?(?:get_event\s*\(\s*\)|get\s*\(\s*\)-event)[^.]*\.([\s\S]*?)\bENDCASE\b/gi;
  for (const m of src.matchAll(CASE_OVER_EVENT)) {
    if (/\bWHEN\s+OTHERS\b/i.test(m[1])) return true;
  }
  return false;
}

/* The names a section's DATA declarations introduce, with where each one sits.
 *
 * Shared by publicAttributes and privateInstanceAttributes because they got the
 * same thing wrong in the same way. Their block regex ended on
 * `…|^\s*(?:METHODS|…)\b|$)` under /m, and under /m `$` matches at the end of
 * every LINE — so the lazy body could always stop at the first newline, and it
 * did. A CHAIN
 *
 *     DATA: mv_alpha TYPE string,
 *           mv_beta  TYPE abap_bool,
 *           mv_gamma TYPE i.
 *
 * yielded `mv_alpha` and nothing else: `unused-public-attribute` never looked
 * past the first name of a public chain, and `private-app-attribute` — whose
 * whole point is that the missed attribute answers ASSERTION_FAILED with
 * nothing naming it — never looked past the first name of a private one. Both
 * were silent, which is the expensive direction. `instanceAttributes` above
 * has no `$` alternative and was never affected; that asymmetry is what
 * isolated this.
 *
 * `(?![\s\S])` is end of INPUT, which is what the terminator meant. `^` in the
 * other alternatives still needs /m, so the flag stays.
 *
 * The comma split then stops at the fragment carrying the statement's `.`: a
 * chain ends there, and without the stop the last block of a section would
 * swallow whatever follows it (a comment, an EVENTS declaration) and read a
 * name out of it. */
function sectionDataNames(section, chainOnly) {
  const bodyAt = section.index + section[0].length - section[1].length;
  const names = [];
  /* Collapsed on the whole section, not per declaration block: an inline
   * structure spans several lines and a comma split would read its FIELDS as
   * the attributes. */
  const body = collapseInlineStructures(section[1]);
  const head = chainOnly ? 'DATA' : '(?:CLASS-)?DATA';
  const BLOCK = new RegExp(
    `^\\s*${head}:?\\s+([\\s\\S]*?)(?=^\\s*(?:CLASS-)?DATA\\b`
    + '|^\\s*(?:METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|ALIASES)\\b'
    + '|(?![\\s\\S]))',
    'gim',
  );
  for (const m of body.matchAll(BLOCK)) {
    // walked rather than searched for: `indexOf(name, m.index)` finds the first
    // text that LOOKS like the name, so a later `mv_a` resolved to an earlier
    // `mv_alpha` and the finding pointed at the wrong line.
    let at = m.index + m[0].length - m[1].length;
    for (const declaration of m[1].split(',')) {
      const name = declaration.trim().match(/^(\w+)/);
      if (name) names.push({ name: name[1], offset: bodyAt + at + declaration.indexOf(name[1]) });
      at += declaration.length + 1; // + the comma the split consumed
      if (declaration.includes('.')) break; // the statement ended here
    }
  }
  return names;
}

/** The PUBLIC SECTION's own DATA names. Only these are serialized into the
 *  model and shipped to the browser (z2ui5_cl_ui5_srv_model filters on
 *  visibility = public), which is what makes them the transport surface. */
function publicAttributes(src) {
  // `section.index` points at the `PUBLIC SECTION.` keyword and the body is a
  // suffix of the match, so sectionDataNames measures the offset from the body
  // exactly rather than searching for it — without that, every
  // unused-public-attribute finding landed one line early.
  const section = src.match(/\bPUBLIC\s+SECTION\s*\.([\s\S]*?)(?=\b(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS)\b)/i);
  if (!section) return [];
  return sectionDataNames(section, false);
}

/** The PRIVATE SECTION's own INSTANCE data names — the attributes that are
 *  part of the app's persisted state and cannot be reached to persist it.
 *
 *  `CLASS-DATA` is deliberately not collected: a static attribute is not
 *  instance state, is not serialized with the app, and is not what breaks. */
function privateInstanceAttributes(src) {
  const section = src.match(/\bPRIVATE\s+SECTION\s*\.([\s\S]*?)(?=\bENDCLASS\b)/i);
  if (!section) return [];
  // chainOnly: CLASS-DATA is excluded here (see the doc block above), so the
  // block head is the bare DATA rather than the optional-CLASS- one
  return sectionDataNames(section, true);
}

/** Variables declared inline or with DATA inside a method body. */
function localVariables(src) {
  const names = new Set();
  for (const m of src.matchAll(/\bDATA\(\s*(\w+)\s*\)/gi)) names.add(m[1].toUpperCase());
  for (const m of src.matchAll(/\bFIELD-SYMBOLS?\s*<\s*(\w+)\s*>/gi)) names.add(m[1].toUpperCase());
  // DATA lv_x TYPE ... written inside a METHOD ... ENDMETHOD block
  for (const body of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    for (const m of body[0].matchAll(/^\s*DATA\s+(\w+)\s+TYPE\b/gim)) names.add(m[1].toUpperCase());
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
const isCall = (code, index, head) => code.startsWith(head, index);

/** Every raised event literal AS WRITTEN, with the span of the name inside
 *  its quotes — what a spelling rule compares and what a fix rewrites. */
function raisedEventLiterals(src) {
  const code = blankLiterals(src);
  const out = [];
  for (const m of src.matchAll(/client->_event(?:_client)?\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (!isCall(code, m.index, 'client->')) continue;
    out.push({ name: m[1], offset: m.index, at: m.index + m[0].length - 1 - m[1].length });
  }
  return out;
}

/** Event names the class reacts to: check_on_event( `X` ), and constants
 *  compared against get_event( ). A constant reference on either side means
 *  we cannot resolve the name statically - handled by the caller. */
function handledEvents(src) {
  return new Set(handledEventLiterals(src).map((n) => n.toUpperCase()));
}

/** The handled event names AS WRITTEN — the spellings a raised literal is
 *  held against, letter for letter, because the runtime compares them so. */
function handledEventLiterals(src) {
  const names = new Set();
  const code = blankLiterals(src);
  const LIT = '[`\'|]([A-Z0-9_]+)[`\'|]';
  for (const m of src.matchAll(/check_on_event\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (!isCall(code, m.index, 'check_on_event')) continue;
    names.add(m[1]);
  }
  /* The two spellings of the same read: `get_event( )` and the struct field
   * `get( )-event` it is a shorthand for. Both appear across the corpora -
   * and an IF on the second one used to count as no handler at all, so a
   * handled event was reported as dead (samples-stack app 487). */
  for (const m of src.matchAll(new RegExp(
    `(?:get_event\\s*\\(\\s*\\)|get\\s*\\(\\s*\\)-event)\\s*=\\s*${LIT}`, 'gi'))) {
    names.add(m[1]);
  }
  /* WHEN `X`. inside a CASE over the event - including a WHEN that lists
   * ALTERNATIVES. `WHEN `A` OR `B`.` handles both, and reading only the
   * first literal reported the second as unhandled (samples-stack app 319). */
  for (const m of src.matchAll(new RegExp(`\\bWHEN\\s+${LIT}((?:\\s+OR\\s+${LIT})*)`, 'gi'))) {
    // a `WHEN` inside a literal is a sentence about a CASE, not one
    if (!isCall(code, m.index, src.slice(m.index, m.index + 4))) continue;
    names.add(m[1]);
    for (const alt of m[2].matchAll(new RegExp(LIT, 'gi'))) names.add(alt[1]);
  }
  return [...names];
}

/*
 * Run the ABAP-level rules over one class source. Returns findings in the
 * shape the property gate uses, so callers can treat them alike.
 */
/* opts.data        the metadata snapshot (optional — without it the rules that
 *                  need UI5 knowledge stay silent)
 * opts.controlIds  id -> control name, from the class's own views */


/*
 * The t_arg values a backend `client->_event( )` sends, and the
 * `get_event_arg( )` calls that read them back: an unresolved brace on the way
 * out, a trailing empty entry that never arrives, and an index the raise site
 * never filled.
 *
 * One pass, because the arity it collects on the way out is what the read side
 * is judged against.
 */
/* A JS callback in a t_arg is not a wrong VALUE — it is a parse failure that
 * loses the WHOLE handler. UI5's ExpressionParser has no `function` keyword
 * and reads `{` as an object literal, so `.map(function (o) { … })` throws in
 * BindingParser.parseExpression before any argument is read, and the event
 * never reaches the backend. Arrow functions fail the same way (`=>` is not a
 * token). Applies to every t_arg — a backend _event( ) and a frontend action
 * alike, because the failure is in the handler string both of them emit. */
/* A row built at runtime that leaves an ENUM-fed field unset.
 *
 * The originals push a JS object with the key ABSENT and UI5 falls back to the
 * property default. ABAP has no absent: the field ships as `""`, which is not
 * a member of any enum, so `validateProperty` throws — and
 * `ManagedObjectBindingSupport` re-throws anything that is not a
 * `FormatException`, so the binding update dies and takes the view with it.
 *
 * `enumFields` is what the VIEW exposes that way, keyed on the table each
 * bound aggregation names. Three construction sites are judged, because all
 * three ship the same row and a port picks between them for reasons that have
 * nothing to do with this defect:
 *
 *   INSERT VALUE #( … ) INTO TABLE t   the row written at the event
 *   t = VALUE #( ( … ) ( … ) )         the model_init seed, and the nested
 *                                      `elements = VALUE #( ( … ) )` inside it
 *   DATA(x) = VALUE ty_s( … ). … INSERT x INTO TABLE t.
 *                                      the same row through a work area
 *
 * The seed form is the DOMINANT one in this corpus and was the whole of three
 * missed defects; the work-area form is what two more used. A row copied from
 * another table, or built field by field with no constructor at all, still has
 * no single place to read and is still out of scope.
 */

/* Parenthesis depth at every offset, over a source whose literals are already
 * blanked - so a `(` inside a string cannot open a level. */
function parenDepths(body) {
  const d = new Int32Array(body.length + 1);
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') { d[i] = depth; depth++; continue; }
    if (c === ')') { depth--; d[i] = depth; continue; }
    d[i] = depth;
  }
  d[body.length] = depth;
  return d;
}

/** The field names assigned at the TOP level of a VALUE body. Nested rows are
 *  deliberately not counted: a `label =` two levels down says nothing about
 *  whether THIS row carries the field. */
function topAssigned(body) {
  const d = parenDepths(body);
  const out = new Set();
  for (const m of body.matchAll(/([A-Za-z_]\w*)\s*=(?!=)/g)) {
    if (d[m.index] === 0) out.add(m[1].toUpperCase());
  }
  return out;
}

/** The ROW groups of a table constructor body: the `( … )` at top level. A
 *  `(` that follows an identifier or `#` opens a CALL (`COND #( … )`,
 *  `lines( t )`), never a row, so it is not one. */
function topRows(body) {
  const d = parenDepths(body);
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '(' || d[i] !== 0) continue;
    const prev = body.slice(0, i).replace(/\s+$/, '').slice(-1);
    if (prev && /[\w#\]]/.test(prev)) continue;
    const { body: rowBody, end } = parenRegion(body, i);
    out.push({ body: rowBody, offset: i });
    i = end;
  }
  return out;
}

function checkEnumRowLiterals({ src, enumFields, boolFields, report }) {
  if (!enumFields?.size && !boolFields?.size) return;
  const omitted = new Set();
  for (const m of src.matchAll(/omit_initial_paths\s*=\s*VALUE\s+#?\s*\(([^)]*(?:\)[^)]*)*?)\)\s*\)/g)) {
    for (const f of (m[1] || '').matchAll(/[`'|]\s*([A-Za-z_][\w/]*)\s*[`'|]/g)) {
      omitted.add(f[1].split('/').pop().toUpperCase());
    }
  }
  if (/omit_initial\s*=\s*abap_true/.test(src)) return;

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
  for (const m of s.matchAll(/\bVALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/g)) {
    const open = s.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(s, open);
    if (body === undefined) continue;
    const before = s.slice(Math.max(0, m.index - 200), m.index);
    const lhs = before.match(/DATA\(\s*(\w+)\s*\)\s*=\s*$/)
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

function checkEventArgCallbacks({ src, report }) {
  /* Only an argument the frontend RESOLVES is parsed as an expression. One
   * that does not open with $ or { is shipped as a JS string literal, so the
   * word "function" inside a toast template is not this rule's business. */
  const judge = (raw, offset) => {
    const lit = String(raw ?? '').trim();
    if (!lit.startsWith('$') && !lit.startsWith('{') && !lit.startsWith('\\{')) return;
    if (!/\bfunction\s*\(|=>/.test(lit)) return;
    report({ type: 'event-arg-js-callback', value: lit.slice(0, 60), offset });
  };

  for (const m of src.matchAll(/\bt_arg\s*=\s*VALUE\s+#?\s*\(/g)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    for (const el of body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)) {
      judge(el[3] !== undefined ? el[3] : el[2], open + 1 + el.index);
    }
  }

  /* The `arg` shorthand carries exactly the same value into exactly the same
   * string_table, so a callback smuggled through it fails identically — and
   * only `client->_event( )` has the parameter, which is why this is a
   * separate scan rather than a widened regex above. The two other event-arg
   * rules learned the spelling in #78; this one was the third and was missed. */
  const code = blankLiterals(src);
  for (const ev of src.matchAll(/client->_event\s*\(/g)) {
    if (!isCall(code, ev.index, 'client->')) continue;
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    if (evBody === undefined) continue;
    const am = evBody.match(/\barg\s*=\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)/);
    if (am) judge(am[3] !== undefined ? am[3] : am[2], evOpen + 1 + am.index);
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
  for (const ev of src.matchAll(/client->_event\s*\(/g)) {
    if (!isCall(code, ev.index, 'client->')) continue;
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    const nameMatch = evBody.match(/^\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/i);
    const tm = evBody.match(/\bt_arg\s*=\s*VALUE\s+#?\s*\(/);
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
    const argSupplied = /\barg\s*=/.test(evBody);
    const argLit = evBody.match(/\barg\s*=\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)/);
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
    const m = { index: evOpen + evBody.indexOf(tm[0]) };
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
      report({ type: 'event-arg-unresolved', value: shown.slice(0, 40), offset: m.index + el.index, ...(fixes ? { fixes } : {}) });
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
        const rowStart = evOpen + open + 2 + last.index;
        const rowEnd = rowStart + last[0].length;
        let span;
        if (source) {
          const lineStart = source.lastIndexOf('\n', rowStart - 1) + 1;
          const nl = source.indexOf('\n', rowEnd);
          const lineEnd = nl === -1 ? source.length : nl + 1;
          if (!source.slice(lineStart, rowStart).trim() && !source.slice(rowEnd, nl === -1 ? source.length : nl).trim()) {
            span = { start: lineStart, end: lineEnd };
          } else {
            let s = rowStart;
            while (s > 0 && (source[s - 1] === ' ' || source[s - 1] === '\t')) s--;
            span = { start: s, end: rowEnd };
          }
        }
        report({
          type: 'trailing-empty-event-arg',
          value: String(argEls.length),
          offset: m.index + last.index,
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
    for (const m of src.matchAll(/get_event_arg\s*\(\s*(?:v\s*=\s*)?(\d*)\s*\)/gi)) {
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


/*
 * ABAP flags written straight into an attribute value. The builder's
 * `a( b = … )` renders true/false itself; passing the flag through `v` puts an
 * 'X' or a blank in the view, and UI5 reads the blank as a non-empty string -
 * the silent inversion this rule exists for.
 */
/* An ABAP date or time field converted with the JS-string date formatter.
 *
 * The curated module ships three date helpers, and which one a field needs is
 * decided by what the ABAP type SERIALIZES as. `DateCreateObject` is
 * `new Date( s )`: it wants a string the JS Date constructor parses, which is
 * an ISO one. An ABAP `TYPE d` reaches the model as `20240101` and a `TYPE t`
 * as `120000`, and the constructor parses NEITHER — both come back as an
 * Invalid Date. `DateAbapDateToDateObject` / `DateAbapDateTimeToDateObject`
 * exist for exactly that and split the digits themselves.
 *
 * What makes it worth a rule is the failure mode, which the framework module
 * documents in its own comment: an Invalid Date is TRUTHY, so every guard that
 * merely checks for presence accepts it, and the throw happens much later and
 * somewhere else — `sap.ui.unified` Month._checkDateEnabled →
 * `CalendarDate.fromLocalJSDate` throws for every rendered day and takes the
 * whole view down. Nothing between the binding and that stack says the word
 * "date".
 *
 * Deliberately NOT the empty-value case the corpus gate used to catch: the
 * framework closed that one at the source (`DateCreateObject` returns null for
 * a falsy input, and `isNoAbapDate` rejects anything that is not eight
 * digits), so a rule for it would now report correct code. The type mismatch
 * is the half no guard upstream can see, because the formatter is handed a
 * string and cannot know which ABAP type produced it. */
function checkDateFormatters({ src, code, report }) {
  /* The declaration forms that carry a date or a time: a DATA/constant
   * declaration and a component of a TYPES structure read the same. The
   * negative lookahead keeps `TYPE d` from matching the start of a longer
   * type name (`TYPE decfloat34`, `TYPE dats_long`).
   *
   * Read out of the blanked copy: this half looks for a DECLARATION, and a
   * class quoting one in its own prose declares nothing. The half below is
   * the opposite and reads `src` - a binding info only ever exists INSIDE a
   * literal, which is what makes it a binding info. */
  const dateFields = new Map();
  for (const m of code.matchAll(/\b(\w+)\s+TYPE\s+(dats|tims|d|t)\b(?![\w-])/gi)) {
    dateFields.set(m[1].toUpperCase(), m[2].toLowerCase());
  }
  if (!dateFields.size) return;

  /* One binding info at a time, so a `path` is only ever paired with the
   * formatter written beside it — and either order parses, since a hand-typed
   * binding info is as likely to open with the formatter as with the path. */
  for (const m of src.matchAll(/\{[^{}]*formatter:\s*'(?:z2ui5\.)?Formatter\.DateCreateObject'[^{}]*\}/g)) {
    const pm = m[0].match(/path:\s*'([^']+)'/);
    if (!pm) continue;
    const field = pm[1].split('/').filter(Boolean).pop();
    if (!field) continue;
    const abapType = dateFields.get(field.toUpperCase());
    if (!abapType) continue;
    report({
      type: 'abap-date-formatter-mismatch',
      member: field,
      value: abapType,
      offset: m.index + m[0].indexOf(pm[0]),
    });
  }
}

/* A backslash escape written in a literal that has no escapes.
 *
 * An ABAP `backtick` literal is RAW: `\n` in it is a backslash followed by an
 * n, and nothing further down the chain turns it into a line break — the
 * client's formatTemplate substitutes {N} placeholders and passes everything
 * else through. So a toast built as `` `value - {0}, \n action - {1}` ``
 * renders the two characters on screen, where the original (a double-quoted JS
 * string, shown through `.sapMMessageToast`'s `white-space: pre-line`) breaks
 * the line. The |…| STRING TEMPLATE is the ABAP form that does process
 * escapes, so the working spelling concatenates one:
 *
 *     `value - {0},` && |\n| && ` action - {1}`
 *
 * Scoped to text that REACHES THE USER — an attribute value and the on-screen
 * message helpers — rather than to every backtick literal in the class. A
 * backslash is legitimate in a regex pattern and in a Windows path, and those
 * are not read by anybody; reporting them would trade this rule's precision
 * for occurrences nobody can act on. A DOUBLED backslash is left alone
 * everywhere: whoever wrote it meant a backslash. */
function checkBacktickEscapes({ src, source, report }) {
  /* WHERE a display call is comes out of the blanked copy; WHAT it says is
   * read out of `src`, because the finding IS a literal. */
  const code = blankLiterals(src);
  const ESCAPE = /(?<!\\)\\[nrt]/;
  /* The fix is the spelling the paragraph above recommends, computed rather
   * than guessed: the literal is split at every escape, the text between
   * stays a backtick literal and each escape becomes its own |…| template,
   * concatenated with `&&`. Empty pieces are dropped, so a literal that
   * starts with the escape opens with the template. Offered only where the
   * ORIGINAL source spells the literal the same — the scan runs over the
   * scrubbed copy — and everything the rule reads is in expression position
   * (an attribute value, a message helper's argument), where a `&&` chain is
   * as valid as the literal it replaces. */
  const split = (text, at) => {
    const start = at - 1;
    const end = at + text.length + 1;
    if (!source || source.slice(start, end) !== src.slice(start, end)) return {};
    const pieces = text.split(/((?<!\\)\\[nrt])/).filter(Boolean)
      .map((piece) => (/^\\[nrt]$/.test(piece) ? `|${piece}|` : `\`${piece}\``));
    return { fixes: [{ start, end, text: pieces.join(' && ') }] };
  };
  /* The LITERAL is the finding's value, not the escape: `report( )` collapses
   * findings of an identical shape, and keyed on the escape alone a class with
   * a `\n` in a toast AND one in an attribute would report the first and
   * swallow the second — which is how one of the corpus occurrences survived
   * its own fix. Two identical texts still collapse, which is right. */
  const judge = (text, at) => {
    const m = text.match(ESCAPE);
    if (!m) return;
    report({
      type: 'escape-sequence-in-backtick', member: m[0],
      value: text.trim().slice(0, 40), offset: at + m.index,
      ...split(text, at),
    });
  };

  for (const m of src.matchAll(/\bv\s*=\s*`([^`\n]*)`/g)) {
    judge(m[1], m.index + m[0].indexOf('`') + 1);
  }
  for (const m of src.matchAll(/client->(?:message_toast_display|message_box_display)\s*\(/gi)) {
    if (!isCall(code, m.index, 'client->')) continue;
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    for (const lit of body.matchAll(/`([^`\n]*)`/g)) {
      judge(lit[1], open + 1 + lit.index + 1);
    }
  }
}

/* The class-constructor-visibility fix: the declaration line is deleted where
 * it is and written again right after the `PUBLIC SECTION.` of the SAME class
 * definition. Offered only for the shape that is exactly that and nothing
 * else — `CLASS-METHODS class_constructor.` alone on its line, no chained
 * colon form, no comment on the line, no ENDCLASS between the public section
 * and the declaration, and a PROTECTED/PRIVATE SECTION in between (so the
 * line really is in another section, not misjudged). Two spans that cannot
 * overlap: the insertion sits above the deletion. */
function classConstructorMove(src, source, at) {
  if (!source) return {};
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const lineBreak = source.indexOf('\n', at);
  const lineEnd = lineBreak === -1 ? source.length : lineBreak;
  const line = source.slice(lineStart, lineEnd);
  const shape = line.match(/^(\s*)CLASS-METHODS\s+class_constructor\s*\.\s*$/i);
  if (!shape) return {};
  let pub = null;
  for (const p of src.matchAll(/\bPUBLIC\s+SECTION\s*\./gi)) {
    if (p.index < at) pub = p;
  }
  if (!pub) return {};
  const between = src.slice(pub.index + pub[0].length, at);
  if (/\bENDCLASS\b/i.test(between) || !/\b(?:PROTECTED|PRIVATE)\s+SECTION\b/i.test(between)) return {};
  const insertAt = pub.index + pub[0].length;
  if (source.slice(pub.index, insertAt) !== pub[0]) return {};
  return {
    fixes: [
      { start: insertAt, end: insertAt, text: `\n${shape[1]}CLASS-METHODS class_constructor.` },
      { start: lineStart, end: lineBreak === -1 ? lineEnd : lineEnd + 1, text: '' },
    ],
  };
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
function checkAbapHygiene({ src, source, report }) {
  /* Literals blanked as well as comments: every scan here looks for a
   * STATEMENT, and a class that quotes ABAP in its own prose ("a
   * CLASS-METHODS class_constructor belongs in PUBLIC SECTION") is not
   * writing one. Offset-for-offset with `src`, so the spans still address the
   * source — which the class_constructor fix depends on. */
  const blankHygiene = blankLiterals(src);
  /* A component assigned in the VALUE HEADER and again inside a row. The
   * header assignment is a DEFAULT for all following lines, not an overridable
   * one, so the system's syntax check refuses the whole constructor with "The
   * component was specified more than once". abaplint accepts it: its VALUE
   * grammar does not model the one-assignment rule. Reached main through a
   * port and was found by a user running SYNTAX_CHECK over a pulled repo.
   * The way out is a second group — the default binds only to the lines AFTER
   * it — or writing the value per row. */
  for (const m of blankHygiene.matchAll(/\bVALUE\s+(?:#|[A-Za-z_][\w/]*)\s*\(/g)) {
    const open = blankHygiene.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(blankHygiene, open);
    if (body === undefined) continue;
    const rows = topRows(body);
    if (!rows.length) continue;
    const header = topAssigned(body);
    if (!header.size) continue;
    /* Only the rows AFTER the header assignment are bound by it — a group
     * opened before it is out of its scope, and closing the scope that way is
     * the documented remedy. `topAssigned` reads the top level, so the header
     * components are those assigned outside any row; a row that re-assigns one
     * of them is the defect. */
    for (const r of rows) {
      for (const field of topAssigned(r.body)) {
        if (!header.has(field)) continue;
        report({
          type: 'value-header-default-reassigned', member: field,
          offset: open + 1 + r.offset,
        });
      }
    }
  }

  /* `INTO CORRESPONDING FIELDS OF TABLE @DATA(…)` is 7.55 syntax. Below it the
   * system refuses the class with "Inline data declarations cannot be used
   * together with INTO CORRESPONDING additions", plus one follow-up "Field is
   * unknown" for every later read of the never-declared table — three errors
   * whose cause is the first. abaplint stays green because its SELECT grammar
   * puts no version gate on the inline declaration. Plain `INTO TABLE @DATA(…)`
   * is fine from 7.40 on; only the combination is late. */
  for (const m of blankHygiene.matchAll(/\bINTO\s+CORRESPONDING\s+FIELDS\s+OF\s+TABLE\s+@DATA\(\s*(\w+)\s*\)/gi)) {
    report({ type: 'into-corresponding-inline-decl', member: m[1], offset: m.index });
  }

  /* `class_constructor` outside the PUBLIC SECTION does not activate. It is a
   * static constructor the runtime calls itself, so its visibility is not a
   * design choice — the compiler requires it public. */
  const pub = blankHygiene.match(/\bPUBLIC\s+SECTION\s*\.([\s\S]*?)(?=\b(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS)\b)/i);
  const outsidePublic = (at) => !(pub && at > pub.index && at < pub.index + pub[0].length);
  for (const m of blankHygiene.matchAll(/\bCLASS-METHODS\s+class_constructor\b/gi)) {
    if (outsidePublic(m.index)) {
      report({
        type: 'class-constructor-visibility', member: 'class_constructor', offset: m.index,
        ...classConstructorMove(src, source, m.index),
      });
    }
  }
  /* The chained form — `CLASS-METHODS: a, class_constructor, b.` — declares
   * it just the same, anywhere in the list. Read over the literal-blanked
   * source so a `.` inside a default value does not end the statement early.
   * No fix: the line is shared with the other declarations. */
  for (const m of blankHygiene.matchAll(/\bCLASS-METHODS\s*:/gi)) {
    const end = blankHygiene.indexOf('.', m.index);
    if (end === -1) continue;
    const cc = /\bclass_constructor\b/i.exec(blankHygiene.slice(m.index, end));
    if (!cc) continue;
    const at = m.index + cc.index;
    if (outsidePublic(at)) report({ type: 'class-constructor-visibility', member: 'class_constructor', offset: at });
  }

  /* `CONV i( )` as the WHOLE right-hand side of an assignment into a name this
   * class declares `TYPE i`. The assignment converts by itself, so the CONV
   * says nothing and reads as if a conversion were needed; SLIN reports
   * "Redundant conversion for type I".
   *
   * Both halves of the scoping are load-bearing and were measured: the target
   * has to be declared IN THIS FILE (a type living in another class is left
   * alone rather than guessed at), and the CONV has to be the entire
   * right-hand side. A CONV inside a comparison or an arithmetic expression is
   * load-bearing or at least arguable, and one inside a string template
   * (`|{ CONV i( x ) WIDTH = 2 }|`) is a real conversion — all three were
   * false errors in the first draft of this rule. */
  const intTargets = new Set();
  for (const m of src.matchAll(/^\s*(?:CLASS-)?DATA\s+([a-z_]\w*)\s+TYPE\s+i\s*(?:VALUE\b[^.]*)?\./gim)) {
    intTargets.add(m[1].toLowerCase());
  }
  for (const m of src.matchAll(/^\s*(?:VALUE\()?([a-z_]\w*)\)?\s+TYPE\s+i\s*$/gim)) {
    intTargets.add(m[1].toLowerCase());
  }
  if (intTargets.size) {
    for (const m of src.matchAll(/^([ \t]*)([a-z_]\w*)([ \t]*=[ \t]*)(CONV[ \t]+i\(([^()|]*)\))([ \t]*\.[ \t]*)$/gim)) {
      if (!intTargets.has(m[2].toLowerCase())) continue;
      /* Mechanically fixable: the rule already guarantees the CONV is the
       * ENTIRE right-hand side and the target is declared TYPE i in this
       * file, so unwrapping it is exactly what the assignment does anyway.
       * The regex admits no nested parens, so the inner expression is whole. */
      const inner = m[5].trim();
      const convStart = m.index + m[1].length + m[2].length + m[3].length;
      report({
        type: 'redundant-conv-i', member: m[2], offset: m.index,
        ...(inner ? { fixes: [{ start: convStart, end: convStart + m[4].length, text: inner }] } : {}),
      });
    }
  }

  /* An empty CATCH block without ##NO_HANDLER. SLIN reports it on every real
   * system; the pragma is how a deliberately empty handler says so. Purely
   * structural: a CATCH statement followed by nothing before the next CATCH,
   * CLEANUP or ENDTRY. A comment does not fill the block — SLIN reads it the
   * same way, and the pragma is the sanctioned answer, not prose. A hint,
   * like redundant-conv-i: the code is correct, the extended check is not.
   * All three scans below run over the literal-blanked view: a CATCH, a
   * boolc( or a LOOP AT inside a string literal is prose, not code. */
  const blank = blankLiterals(src);
  for (const m of blank.matchAll(/\bCATCH\b([^.]*)\./gi)) {
    if (/##NO_HANDLER/i.test(m[1])) continue;
    const rest = blank.slice(m.index + m[0].length);
    if (!/^\s*(?:ENDTRY|CATCH|CLEANUP)\b/i.test(rest)) continue;
    const named = /(?:BEFORE\s+UNWIND\s+)?([a-z_][\w\/]*)/i.exec(m[1]);
    // value carries the offset so two empty catches of the SAME exception in
    // one class stay two findings (the dedupe key would collapse them)
    report({ type: 'empty-catch-block', member: named ? named[1] : '', value: String(m.index), offset: m.index });
  }

  /* `boolc( )` where the ecosystem writes `xsdbool( )`. The downport pipeline
   * converts xsdbool -> boolc automatically for the old releases, so a
   * hand-written boolc breaks the conversion in the other direction — and the
   * two are not aliases anyway: boolc returns a string whose false is a BLANK
   * (` `), xsdbool an abap_bool whose false is initial (''), which is why no
   * fix renames one into the other. */
  for (const m of blank.matchAll(/\bboolc\s*\(/gi)) {
    // value = offset, so every call site is its own finding (dedupe key)
    report({ type: 'boolc-instead-of-xsdbool', value: String(m.index), offset: m.index });
  }

  /* `DELETE itab INDEX sy-tabix` inside a `LOOP AT` over the SAME table,
   * reported only where sy-tabix is provably NOT the loop's own cursor any
   * more. The plain current-row delete is legal ABAP — the kernel adjusts the
   * loop cursor for a delete on the loop table, and @abaplint/runtime does
   * the same (`deleteIndex` decrements every registered loop controller), so
   * the first cut of this rule reporting that shape was the corpus doctrine
   * firing: it named a reviewed, working port. What the measured incidents
   * (abap-check §5: app 352's live TABLE_INVALID_INDEX 500, filter_itab's
   * wrong-table index) share is a CLOBBERED sy-tabix — an inner READ TABLE,
   * an inner LOOP that ended, or a DO between the loop header and the DELETE.
   * So the rule fires on exactly two shapes: the delete names an ENCLOSING
   * loop's table while an inner loop is open (sy-tabix belongs to the inner
   * one), or a clobbering statement sits lexically between the owning loop's
   * header and the delete. Lexical order is the right model per iteration:
   * the loop header re-sets sy-tabix on every pass, so only a clobberer
   * BEFORE the delete in the body runs before it each time around. */
  {
    const events = [];
    for (const m of blank.matchAll(/\bLOOP\s+AT\s+(?:me->)?([a-z_][\w\/]*)/gi)) {
      events.push({ at: m.index, kind: 'open', name: m[1].toLowerCase() });
    }
    for (const m of blank.matchAll(/\bENDLOOP\b/gi)) events.push({ at: m.index, kind: 'close' });
    // an ENDMETHOD closes whatever a broken source left open — the corpus
    // lesson about dispatch leaking across method boundaries
    for (const m of blank.matchAll(/\bENDMETHOD\b/gi)) events.push({ at: m.index, kind: 'reset' });
    // the sy-tabix clobberers the incidents were made of: READ TABLE writes
    // it outright, a completed inner LOOP leaves it 0, and ENDDO stands in
    // for the DO construct §5 names between the LOOP and the DELETE
    for (const m of blank.matchAll(/\bREAD\s+TABLE\b/gi)) events.push({ at: m.index, kind: 'clobber' });
    for (const m of blank.matchAll(/\bENDDO\b/gi)) events.push({ at: m.index, kind: 'clobber' });
    for (const m of blank.matchAll(/\bDELETE\s+(?:me->)?([a-z_][\w\/]*)\s+INDEX\s+sy-tabix\b/gi)) {
      events.push({ at: m.index, kind: 'delete', name: m[1].toLowerCase() });
    }
    events.sort((a, b) => a.at - b.at);
    const stack = [];
    for (const e of events) {
      if (e.kind === 'open') stack.push({ name: e.name, clobbered: false });
      else if (e.kind === 'close') {
        stack.pop();
        // sy-tabix now belongs to the loop that just ended (or is 0)
        for (const f of stack) f.clobbered = true;
      } else if (e.kind === 'clobber') {
        for (const f of stack) f.clobbered = true;
      } else if (e.kind === 'reset') stack.length = 0;
      else if (e.kind === 'delete') {
        const top = stack[stack.length - 1];
        const owns = stack.some((f) => f.name === e.name);
        if (!owns) continue;
        // the innermost loop's own, unclobbered cursor deletes the current
        // row - the kernel and the transpiler runtime both adjust for that
        if (top.name === e.name && top.clobbered === false) continue;
        // value = offset: two deletes on the same table are two call sites
        report({ type: 'delete-index-in-loop', member: e.name, value: String(e.at), offset: e.at });
      }
    }
  }
}

function checkAbapBooleans({ src, d, report }) {
  /* ABAP booleans are 'X' and ' ', UI5 wants "true"/"false". Writing one
   * into an attribute value puts an 'X' in the view - UI5 then reads a
   * non-empty string, so `visible = ' '` (abap_false!) turns the control
   * VISIBLE. The classic silent inversion. The way out is `a( b = )`, which
   * renders true/false itself. */
  const BOOL_TYPE = 'abap_bool|abap_boolean|boolean|xfeld|flag';
  const boolVars = new Set();
  for (const m of src.matchAll(new RegExp(`\\b(?:CLASS-)?DATA\\s+(\\w+)\\s+TYPE\\s+(?:${BOOL_TYPE})\\b`, 'gi'))) {
    boolVars.add(m[1].toUpperCase());
  }
  /* A CHAINED declaration declares more than one name, and only the first of
   * them was ever collected — `DATA: first TYPE abap_bool, second TYPE
   * abap_bool.` left `second` unknown, so writing it into an attribute went
   * unreported while its neighbour on the line above was caught. The chain
   * runs to its terminating `.`; each element is `name TYPE type`. */
  for (const chain of src.matchAll(/\b(?:CLASS-)?DATA:([\s\S]*?)\.\s*$/gim)) {
    for (const m of chain[1].matchAll(new RegExp(`(\\w+)\\s+TYPE\\s+(?:${BOOL_TYPE})\\b`, 'gi'))) {
      boolVars.add(m[1].toUpperCase());
    }
  }
  /* ->a( n = `x` v = <expr> ) with an ABAP flag behind `v`, where the `v`
   * token itself is what the correction replaces. A flag passed through
   * `b =` never matches: the regex asks for `v =`. */
  for (const m of src.matchAll(new RegExp(
    `->\\s*(${d.att})\\s*\\(\\s*n\\s*=\\s*[\`'|]([\\w:]+)[\`'|]\\s*(v)\\s*=\\s*([^)]*?)\\s*\\)`, 'gd'))) {
    const [, verb, attr, , rawValue] = m;
    const builder = builderOfVerb(verb);
    const value = rawValue.trim();
    if (/as_bool\s*\(/.test(value) || /_bind\w*\s*\(/.test(value)) continue;
    const isAbapBool =
      /^abap_(true|false|undefined)$/i.test(value) ||
      boolVars.has(value.toUpperCase()) ||
      /* the captured value can never contain a `)` (the capture stops at the
       * first one), so an argless call arrives as `client->check_…(` — test
       * for exactly that instead of a closing paren that cannot be there */
      /^client->check_\w+\s*\($/.test(value) ||
      /^xsdbool\s*\(/i.test(value) ||
      /^boolc\s*\(/i.test(value);
    if (isAbapBool) {
      /* Autofixable only for a bare token (abap_true, a declared flag): those
       * convert without changing what is evaluated. An expression is left
       * alone - a fix that has to guess where the value ends is not a fix.
       *
       * The correction is the parameter NAME: `v` becomes `b`, and the value
       * stays untouched - the builder renders the flag itself. */
      const bare = /^\w+$/.test(value);
      const fixes = !bare || !builder.bool ? null
        : [{ start: m.indices[3][0], end: m.indices[3][1], text: builder.bool }];
      report({
        type: 'unconverted-abap-boolean', member: attr, value: value.slice(0, 40),
        fixHint: builder.boolFix, offset: m.index,
        ...(fixes ? { fixes } : {}),
      });
    }
  }

  /* Handed back because manual-init-flag needs it too: the flag it looks for
   * is a declared ABAP boolean, and collecting the declarations a second time
   * would be two regexes to keep in step. */
  return boolVars;
}


/*
 * abap2UI5 objects a consumer must not name: everything outside the five of
 * `src/02`. See released-api.mjs for what the mirror knows and what it leaves
 * alone.
 */
function checkReleasedApi({ src, report }) {
  /* An abap2UI5 object outside the released package. `src/02` is the whole
   * contract - five objects - and everything else the framework ships says
   * in its own package description that it is not for consumers: `src/01` is
   * "internal use only", `src/99` is frozen legacy kept only so existing
   * installations keep compiling. Neither side announces a change: one
   * upstream commit renamed the entire core layer (`z2ui5_cl_core_*` ->
   * `z2ui5_cl_ui5_*`) AND moved the old view builder and HTTP handler into
   * the frozen package. An app naming one of those compiles today and fails
   * to activate after the next pull, with no deprecation in between - which
   * is exactly the kind of defect this gate exists for, since no compiler
   * sees it until the object is already gone.
   *
   * Only names the mirror KNOWS are framework objects are judged (see
   * released-api.mjs): the released five are silent, the frozen package and
   * the internal prefix families are reported, and anything else is somebody
   * else's class - the samples are `z2ui5_cl_demo_app_*` and must never be
   * touched by this rule. A name inside a `…`/|…| literal is text, not a
   * reference, and the class's OWN name is not a use of itself. */
  {
    const own = new Set(
      [...src.matchAll(/\b(?:CLASS|INTERFACE)\s+(z2ui5_\w+)/gi)].map((m) => m[1].toLowerCase()),
    );
    const literals = literalSegments(src);
    const inLiteral = (at) => literals.some((s) => at >= s.start && at < s.end);
    for (const m of src.matchAll(/\bz2ui5_\w+/gi)) {
      const name = m[0].toLowerCase();
      if (own.has(name) || inLiteral(m.index)) continue;
      const verdict = apiVerdict(name);
      if (!verdict) continue;
      report({
        type: 'non-released-api',
        value: name, // lower-cased: ABAP is case-insensitive, so are the findings
        member: verdict.area,
        what: verdict.what,
        replacement: verdict.replacement,
        frozen: verdict.frozen,
        offset: m.index,
      });
    }
  }
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
  for (const call of src.matchAll(/client->(?:_event_client|follow_up_action)\s*\(/g)) {
    if (!isCall(code, call.index, 'client->')) continue;
    const open = src.indexOf('(', call.index + call[0].length - 1);
    const { body } = parenRegion(src, open);
    // the constant, or the name-shaped literal the dispatcher accepts the
    // same way (case-sensitive, exactly like the runtime)
    if (!/cs_event-set_odata_model\b/i.test(body)
      && !/[`']SET_ODATA_MODEL[`']/.test(body)) continue;
    const tm = body.match(/\bt_arg\s*=\s*VALUE\s+#?\s*\(/);
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

export function checkAbapRules(source, { data = null, controlIds = null, enumFields = null, boolFields = null, minUi5 = '1.71', rules = null } = {}) {
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
  const findings = [];
  const seen = new Map();
  /* Repeated identical findings collapse into one (a row template reports the
   * same defect once), but their FIXES do not: every occurrence carries its
   * own span, or `--fix` would need one run per call site. */
  const report = (f) => {
    const key = `${f.type}|${f.control || ''}|${f.member || ''}|${f.value || ''}`;
    const prev = seen.get(key);
    if (prev) {
      if (f.fixes) (prev.fixes ??= []).push(...f.fixes);
      return;
    }
    seen.set(key, f);
    findings.push(f);
  };

  /* The ids this class hands out in its views: `)->a( n = `id` v = `x` )`.
   * -> a Set of literal ids, or null when ANY id attribute is built at
   * runtime (a template, a variable, a concatenation) — then the set is not
   * the full truth and no id may be called unknown. */
  const viewIds = (() => {
    const ids = new Set();
    for (const m of src.matchAll(new RegExp(`\\b(?:${d.att})\\(\\s*n\\s*=\\s*\`id\`\\s+v\\s*=\\s*([^\\n]*)`, 'g'))) {
      const literal = m[1].match(/^\s*`([^`]*)`/);
      if (!literal) return null;
      ids.add(literal[1]);
    }
    return ids.size ? ids : null;
  })();

  /* _bind_edit is obsolete - _bind is two-way as well, and _bind_edit is a
   * pure alias for it now. The one exception this rule used to make is gone
   * with the parameters it was made for: custom_mapper_back /
   * custom_filter_back are still ACCEPTED for source compatibility but no
   * longer evaluated ("per-direction mapping is gone"), so a call passing one
   * is no longer the only way to say what it says - it says nothing. It is
   * reported like every other, but without the fix: dropping an argument is
   * not a rename, and _bind has no parameter to rename it to. */
  for (const m of code.matchAll(/client->(_bind_edit)\s*\(/g)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    const back = body.match(/\bcustom_(?:mapper|filter)_back\b/);
    // autofixable where the call is identical apart from the method name
    const token = m.index + m[0].indexOf(m[1]);
    report({
      type: 'obsolete-binder', member: m[1], value: back?.[0], offset: m.index,
      ...(back ? {} : { fixes: [{ start: token, end: token + m[1].length, text: '_bind' }] }),
    });
  }

  /* Two OBSOLETE ARGUMENTS on the binder itself, which the rule above cannot
   * see: it judges the METHOD, and these are wrong on the current one.
   *
   *   view                 "obsolete - inactive, not passed on internally".
   *                        A call scoping a binding to cs_view-popup reads as
   *                        if the binding belonged to that slot; nothing
   *                        reads the value at all. Deleting it is the whole
   *                        correction and cannot change behaviour — which is
   *                        what makes it a mechanical fix rather than a guess.
   *   custom_mapper /      "obsolete - still evaluated, but do not use in new
   *   custom_filter        code". Both hand the app a reference to the BUNDLED
   *                        AJSON copy in src/00 — a mirror of an external
   *                        project, not a contract this framework owns — so an
   *                        app implementing the interface binds itself to
   *                        whatever that mirror looks like today. It is the
   *                        `non-released-api` argument one level down, at a
   *                        parameter instead of a class name. No fix: they are
   *                        still evaluated, so dropping one changes what the
   *                        model carries. The declarative replacements are
   *                        omit_initial / omit_initial_paths / json.
   *
   * Only `_bind` is scanned for the mapper pair: on `_bind_edit` the whole
   * call is already reported by `obsolete-binder` above, and two findings for
   * one line is one too many. */
  for (const m of code.matchAll(/client->(_bind(?:_edit)?)\s*\(/g)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const base = open + 1;

    const vm = body.match(/\bview\s*=\s*(\S+)/);
    if (vm) {
      const start = base + vm.index;
      let end = start + vm[0].length;
      /* Take the run of spaces behind it too, so the deletion closes up
       * instead of leaving a double gap — but never a newline, which would
       * pull the next argument onto this line. */
      while (src[end] === ' ' || src[end] === '\t') end++;
      /* A value carrying parentheses is an expression this pass does not
       * measure the end of; it is still reported, just without the fix. */
      const simple = !/[()]/.test(vm[1]);
      report({
        type: 'obsolete-bind-argument', member: 'view', value: vm[1], offset: start,
        ...(simple ? { fixes: [{ start, end, text: '' }] } : {}),
      });
    }

    if (m[1] === '_bind') {
      const cm = body.match(/\bcustom_(?:mapper|filter)\b/);
      if (cm) {
        report({ type: 'obsolete-bind-argument', member: cm[0], offset: base + cm.index });
      }
    }
  }

  /* The manual model pushes do NOTHING. The framework compares the model
   * state before main( ) with the state after it returned and, when they
   * differ, sends it to every open view slot by itself - so view_model_update
   * and its four siblings are deliberately EMPTY methods in
   * z2ui5_cl_ui5_client, kept in the interface only so existing apps keep
   * compiling. A leftover call is not just dead weight, it is misleading: it
   * reads as "the model is pushed here" at a place where nothing happens.
   * Deleting it is the whole correction, so it carries the fix. */
  for (const m of code.matchAll(/client->((?:nest2?_)?view_model_update|popup_model_update|popover_model_update)\s*\(/g)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { end } = parenRegion(src, open);
    /* Only a statement of its own is deleted - these methods return nothing,
     * so that is the only shape they legally have, and a call this pass
     * cannot see the end of is reported without a fix rather than cut. */
    const dot = src.slice(end + 1).match(/^\s*\./);
    report({
      type: 'obsolete-model-update', member: m[1], offset: m.index,
      ...(dot ? { fixes: [{ ...statementSpan(source, m.index, end + 1 + dot[0].length), text: '' }] } : {}),
    });
  }

  /* _event_client is obsolete - follow_up_action is the same call, and since
   * it gained a RETURNING parameter it is the same call in the same POSITION
   * too. Both delegate to mo_srv_event->get_event_client( val view t_arg )
   * with the identical arguments; follow_up_action reaches it through
   * `IF result IS SUPPLIED`, which is exactly the view-attribute form
   * `v = client->_event_client( … )` is written in. One method for scheduling
   * a frontend action and wiring one, so the rename is a pure one.
   *
   * The one non-equivalence is in follow_up_action's CASE, which intercepts
   * cs_event-set_nav_routing / set_push_state / set_app_state_active before
   * the expression path: those three are backend-side nav options, not
   * frontend handlers, so a view attribute wired to one of them never worked
   * (the dispatch table has no such name) - the fix does not preserve a
   * behaviour, it removes a wire that was already silent. */
  for (const m of code.matchAll(/client->(_event_client)\s*\(/g)) {
    const token = m.index + m[0].indexOf(m[1]);
    report({
      type: 'obsolete-frontend-event', member: m[1], offset: m.index,
      fixes: [{ start: token, end: token + m[1].length, text: 'follow_up_action' }],
    });
  }

  // a value bound to a local variable is lost after the roundtrip: the
  // instance is serialized, the method stack is not
  const locals = localVariables(src);
  const attrs = instanceAttributes(src);
  for (const m of code.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?(\w+)\s*[)\s]/g)) {
    const name = m[1].toUpperCase();
    if (locals.has(name) && !attrs.has(name)) {
      report({ type: 'binding-to-local', member: m[1], offset: m.index });
    }
  }

  /* A bound attribute that is not PUBLIC. Only public attributes are
   * serialized into the model (z2ui5_cl_ui5_srv_model filters on
   * visibility), so binding a PROTECTED/PRIVATE attribute fails the FIRST
   * roundtrip with "BINDING_ERROR - No class attribute for binding found".
   * Found live: samples-controls app 043 bound `expanded` from its PROTECTED
   * SECTION and had never worked in a running system — the e2e interaction
   * that closed its LIVE_TEST deviation was what surfaced it. Judged by the
   * ROOT of the bound name (a structure component travels with its root),
   * and only when the class declares a PUBLIC SECTION to compare against. */
  if (/\bPUBLIC\s+SECTION\b/i.test(src)) {
    const publicNames = new Set(publicAttributes(src).map((a) => a.name.toUpperCase()));
    for (const m of code.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/g)) {
      const root = m[1].replace(/^me->/, '').split('-')[0];
      const up = root.toUpperCase();
      if (attrs.has(up) && !publicNames.has(up) && !locals.has(up)) {
        report({ type: 'binding-to-nonpublic', member: root, offset: m.index });
      }
    }
  }

  /* Private UI5 internals reached from ABAP-built wires or bindings.
   * mProperties & friends are UI5's internal member tables — no API
   * contract, renamed or restructured across patches without notice. A wire
   * that reads them works on the UI5 version it was written against and
   * breaks silently on the next one. Restructure to a two-way binding or a
   * public parameter. */
  for (const m of src.matchAll(/\bm(?:Properties|Aggregations|BindingInfos|EventRegistry)\b/g)) {
    report({ type: 'ui5-internal-access', value: m[0], offset: m.index });
  }

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
  const BOOTSTRAP = /sap-ui-(?:core|custom)[\w-]*\.js/;
  for (const m of src.matchAll(/\b(?:ui5\.sap\.com|(?:[\w-]+\.)?hana\.ondemand\.com)\b([^\s`'"|)]*)/g)) {
    const urlPath = m[1] || '';
    if (!RUNTIME_PATH.test(urlPath) && !BOOTSTRAP.test(urlPath)) continue;
    report({ type: 'commercial-ui5-host', value: m[0].slice(0, 60), offset: m.index });
  }

  /* A source line ABAP cannot hold. 255 characters is the limit, and over it
   * the class does not fail to lint — it fails to IMPORT: abapGit reports
   * "Literals across more than one line are not allowed" for the object and
   * CARRIES ON, so what stays behind in the system is an empty class stub.
   * The tree looks imported and the app is gone (abap2UI5/samples#669 left
   * two demo classes as stubs exactly this way, and it reached main because
   * every check runs on the files, where the line is merely long).
   *
   * Over the RAW source, not the scrubbed copy: a comment is part of the line
   * the system has to hold. Generated code is where this comes from, so the
   * fix usually belongs in the generator — split the literal into && chunks. */
  let lineStart = 0;
  source.split('\n').forEach((line, i) => {
    // \r is the line separator's other half, not content the system stores
    const content = line.replace(/\r$/, '');
    const length = content.length;
    if (length > LINE_LIMIT) {
      /* Keyed by line number rather than by length, so twenty over-long lines
       * are twenty findings: each one needs its own split, and the dedupe key
       * would otherwise collapse two lines that happen to be equally long. */
      report({ type: 'source-line-too-long', member: String(i + 1), value: length, offset: lineStart + LINE_LIMIT });
    }
    /* The rest of the abapGit round-trip family rides the same walk (abap-check
     * §1): the ABAP editor strips a trailing blank when it saves, so a line
     * ending in one comes back DIFFERENT on the next pull — permanently, for
     * everyone. A warning, not an error: unlike the 255-character line above,
     * nothing fails to import; the file merely never stops diffing. Judged on
     * the RAW line — whitespace is exactly what scrubbing normalizes away —
     * and keyed by line number like its neighbour. */
    /* A backwards character scan instead of /[ \t]+$/: the regex is quadratic
     * on a line of many blanks (every start position re-walks the run before
     * failing the anchor - CodeQL js/polynomial-redos), and library input is
     * exactly where such a line comes from. */
    let wsStart = content.length;
    while (wsStart > 0 && (content[wsStart - 1] === ' ' || content[wsStart - 1] === '\t')) wsStart--;
    if (wsStart < content.length) {
      report({
        type: 'trailing-whitespace', member: String(i + 1), value: content.length - wsStart,
        offset: lineStart + wsStart,
        fixes: [{ start: lineStart + wsStart, end: lineStart + content.length, text: '' }],
      });
    }
    lineStart += line.length + 1;
  });

  /* Three more of the round-trip family, judged over the whole file (all
   * abap-check §1, all warnings for the trailing-whitespace reason above, all
   * with a mechanical fix):
   *   - a UTF-8 BOM on a .abap file — abapGit never writes one, so the file
   *     diffs against what the system serializes back on every pull,
   *   - CRLF line endings — abapGit writes LF only,
   *   - a missing terminating newline — abapGit ends every file with
   *     exactly one. */
  if (source.charCodeAt(0) === 0xFEFF) {
    report({ type: 'byte-order-mark', offset: 0, fixes: [{ start: 0, end: 1, text: '' }] });
  }
  {
    const crlf = [...source.matchAll(/\r\n/g)];
    if (crlf.length) {
      // ONE finding carrying every \r as a fix span: a file is CRLF or it is
      // not, and a finding per line would drown everything else it has to say
      report({
        type: 'crlf-line-ending', value: crlf.length, offset: crlf[0].index,
        fixes: crlf.map((m) => ({ start: m.index, end: m.index + 1, text: '' })),
      });
    }
  }
  // only a source that HAS lines is judged: a one-line string is a snippet
  // handed to the library, not a file abapGit will ever serialize
  if (source.includes('\n') && !source.endsWith('\n')) {
    report({
      type: 'missing-final-newline', offset: source.length - 1,
      fixes: [{ start: source.length, end: source.length, text: '\n' }],
    });
  }

  /* Icon names, over the whole class rather than over the view tree: an icon
   * travels as data at least as often as it travels as an attribute — a
   * column of a bound table, a constant, a status-to-icon mapping — and none
   * of those reach the reconstructed view the property gate walks. Comments
   * are already blanked, so a name in prose is not a use. */
  for (const f of checkIcons(src, { minUi5 })) report(f);

  checkReleasedApi({ src, report });

  const boolVars = checkAbapBooleans({ src, d, report });

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
  manualInitFlag({ src: code, report, boolVars, attrs, locals });
  lifecycleIsInitial({ src: code, source, report, boolVars });

  /* client->_bind( ) on a reference. The model serializer walks DATA, not
   * REF TO data — binding the reference itself (without dereferencing it as
   * ref->*) throws at runtime, and the two sample fixes that established
   * this pattern were both found by users hitting the exception. Judged on
   * the class's own declarations, so a plain data attribute never matches. */
  {
    /* The fix dereferences: `_bind( mt_data )` becomes `_bind( mt_data->* )`.
     * Only where the attribute is `TYPE REF TO data` — that is the one shape
     * whose dereference is certainly a data object the serializer can walk.
     * A reference to a named type may be a class, and `->*` on an object
     * reference does not compile; those are reported without a fix. */
    const refVars = new Map();
    for (const d of src.matchAll(/\b(?:CLASS-)?DATA:?\s+(\w+)\s+TYPE\s+REF\s+TO\s+(\w+)/gi)) {
      refVars.set(d[1].toUpperCase(), d[2].toUpperCase() === 'DATA');
    }
    if (refVars.size) {
      for (const m of code.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?(\w+))\s*(?![-\w>])/g)) {
        if (refVars.has(m[2].toUpperCase())) {
          const at = m.index + m[0].trimEnd().length;
          const toData = refVars.get(m[2].toUpperCase());
          report({
            type: 'binding-to-reference', member: m[2], offset: m.index,
            ...(toData ? { fixes: [{ start: at, end: at, text: '->*' }] } : {}),
          });
        }
      }
    }
  }

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
  for (const m of src.matchAll(new RegExp(
    `->\\s*(?:${d.att})\\s*\\(\\s*n\\s*=\\s*[\`'|]liveChange[\`'|]\\s+v\\s*=\\s*client->_event\\s*\\(`, 'g'))) {
    report({ type: 'live-event-roundtrip', member: 'liveChange', offset: m.index });
  }

  viewNeverDisplayed({ src: code, d, report });

  checkEventArgs({ src, source, report });
  checkEventArgCallbacks({ src, report });
  checkDateFormatters({ src, code, report });
  checkBacktickEscapes({ src, source, report });
  checkAbapHygiene({ src, source, report });

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
  if (/\bINTERFACES\s+z2ui5_if_app\b/i.test(src)) {
    for (const attr of privateInstanceAttributes(src)) {
      report({ type: 'private-app-attribute', member: attr.name, offset: attr.offset });
    }
  }
  checkEnumRowLiterals({ src, enumFields, boolFields, report });

  const frontendRaised = checkFrontendWires({ src, code, report, viewIds, data, controlIds, minUi5 });

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

  /* Literal CSS braces in a view. UI5's XMLView parser reads an unescaped
   * `{` in an attribute value as the start of a binding, so a stylesheet
   * injected through a core:HTML content attribute takes the whole view down
   * with a binding parse error. Every brace has to be written `\{` / `\}`.
   * Caught the hard way in samples-controls (apps 026, 028 and 031, all by the
   * render gate).
   *
   * The unit is the span between <style> and </style>, not the literal and
   * not the statement. A stylesheet is written as a `&&` chain whose first
   * literal alone carries the opening tag, so checking literal by literal
   * sees that line and misses every rule below it - and a whole builder chain
   * is ONE ABAP statement, so widening to the statement swallows the entire
   * view (on the samples-controls corpus that produced ten false positives at once:
   * `{0}` toast templates and `${$parameters>/…}` wires that merely shared a
   * statement with a stylesheet). Between the two tags there is only CSS. */
  for (const open of src.matchAll(/<style>/g)) {
    const from = open.index + open[0].length;
    const to = src.indexOf('</style>', from);
    if (to === -1) continue; // no closing tag in sight - not a stylesheet we can bound
    // one finding per stylesheet, at its first unescaped brace: a sheet with
    // twenty rules has forty braces and exactly one thing to do about them
    const css = src.slice(from, to);
    const first = css.search(/(?<!\\)[{}]/);
    if (first === -1) continue;
    const braces = [...css.matchAll(/(?<!\\)[{}]/g)];
    /* The fix writes the backslash in front of every brace — but only where
     * ALL of them sit inside `backtick` literals, which take the backslash
     * verbatim. A brace inside a |…| template is either an embedded
     * expression or already a syntax error, and a brace outside any literal
     * is code; neither is CSS to escape, so a sheet mixing them gets no fix. */
    const backticks = literalSegments(src).filter((s) => s.kind === '`');
    const inBacktick = (i) => backticks.some((s) => i >= s.start && i < s.end);
    const fixable = braces.every((b) => inBacktick(from + b.index));
    report({
      type: 'unescaped-brace-in-style',
      count: braces.length,
      value: css.slice(Math.max(0, first - 15), first + 25).replace(/\s+/g, ' ').trim(),
      offset: from + first,
      ...(fixable ? { fixes: braces.map((b) => ({ start: from + b.index, end: from + b.index, text: '\\' })) } : {}),
    });
  }

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
  for (const attribute of publicAttributes(src)) {
    const uses = src.match(new RegExp(`\\b${attribute.name}\\b`, 'gi'));
    if (uses && uses.length === 1) {
      report({ type: 'unused-public-attribute', member: attribute.name, offset: attribute.offset });
    }
  }

  /* A Dialog nothing can close. `popup_display( )` opens a sap.m.Dialog that
   * has no close affordance of its own: no button, no `afterClose`/
   * `escapeHandler` wire — only Escape, which the app never hears about. A
   * method that builds a `Dialog` root and wires NO event at all (no
   * `_event( )`, no `_event_client( )`, no `follow_up_action( )` anywhere
   * in it) has left the dialog without a way back to the app. Judged per
   * METHOD rather than per statement, because a dialog's buttons are often
   * chained in a second statement on the same handle; a method that hands
   * the buttons to a helper is the shape this cannot see, which is why it is
   * a hint. */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const dlg = new RegExp(`->\\s*(?:${d.open}|${d.leaf})\\(\\s*(?:n\\s*=\\s*)?\`Dialog\``).exec(mm[0]);
    if (!dlg) continue;
    if (/\b_event\s*\(|\b_event_client\s*\(|\bfollow_up_action\s*\(/.test(mm[0])) continue;
    report({ type: 'popup-without-close-wire', control: 'Dialog', offset: mm.index + dlg.index });
  }

  /* popover_display anchors its fragment to a control id (by_id) — and a
   * literal id no view of this class declares is the quietest failure in the
   * display family: the fragment LOADS, then displayPopover logs "openBy
   * control not found" and DESTROYS it again. Nothing opens, nothing
   * renders red, and the property gate saw a perfectly valid fragment.
   * Judged under the same viewIds trust condition as the wire rules. */
  if (viewIds) {
    for (const m of src.matchAll(/popover_display\s*\(/g)) {
      const open = src.indexOf('(', m.index + m[0].length - 1);
      const { body } = parenRegion(src, open);
      const idm = body.match(/\bby_id\s*=\s*`([^`]*)`/);
      if (idm && !viewIds.has(idm[1])) {
        const suggestion = caseMatch(idm[1], viewIds);
        const at = open + 1 + idm.index + idm[0].length - 1 - idm[1].length;
        report({
          ...(suggestion ? { written: idm[1], suggestion, fixes: [{ start: at, end: at + idm[1].length, text: suggestion }] } : {}),
          type: 'popover-anchor-unknown-id', member: 'by_id', value: idm[1],
          allowed: [...viewIds].sort(), offset: open + 1 + idm.index,
        });
      }
    }
  }

  /* client->get( )-viewname was REMOVED from ty_s_get (it always carried an
   * empty string). The read no longer compiles — but nothing in a systemless
   * pipeline says so before activation, the same blindness popover-display-val
   * covers. */
  for (const m of code.matchAll(/->get\s*\(\s*\)-viewname\b/gi)) {
    report({ type: 'get-viewname-removed', member: 'viewname', offset: m.index });
  }

  /* popover_display imports XML, not VAL — the one asymmetry in the display
   * family (popup_display takes val). A `val =` guessed by analogy does not
   * compile, but nothing in a systemless pipeline says so before activation:
   * abaplint has no signature knowledge of z2ui5_if_client, and the render
   * gate never sees the class fail. One of the most common first-try
   * mistakes in generated code (samples-controls hold-out probes 607/613/617). */
  for (const m of code.matchAll(/popover_display\s*\(\s*(val)\s*=/gd)) {
    const [start, end] = m.indices[1];
    report({
      type: 'popover-display-val', member: 'val', offset: m.index,
      fixes: [{ start, end, text: 'xml' }],
    });
  }

  checkLifecycleDispatch({ src: code, source, report });

  /* An absolute binding path written as TEXT — `{/PATH}` in a literal, or
   * `path: '/PATH'` in a binding-info string. The runtime only registers what
   * client->_bind( ) was given, so a textual path either addresses nothing
   * (caught as unknown-binding-path) or duplicates a bind that exists — and
   * then silently breaks the moment the attribute is renamed, because no
   * compiler follows a string. Derive it instead: client->_bind( var ), or
   * the bare-path form `_bind( val = var path = abap_true )` interpolated
   * into the binding-info template.
   *
   * Two shapes stay out: an OData ENTITY path with a key predicate
   * (`{/Products('4711')}`) in a class that switches its default model to an
   * OData service — that path addresses the service, not an ABAP variable,
   * so there is nothing to derive it from. And anything between <style> and
   * </style>, where `{/` is a CSS brace meeting a CSS comment, not a path. */
  {
    const odata = /switch_default_model_path/.test(src);
    const styleSpans = [...src.matchAll(/<style>/g)].map((o) => {
      const to = src.indexOf('</style>', o.index);
      return { from: o.index, to: to === -1 ? src.length : to };
    });
    const inStyle = (i) => styleSpans.some((s) => i >= s.from && i <= s.to);
    for (const m of src.matchAll(/\{\/[^}\n]{0,60}\}?|\bpath\s*:\s*'(\/[^'\n]{0,60})'?/g)) {
      if (inStyle(m.index)) continue;
      const text = m[0];
      if (odata && /^(?:\{|path\s*:\s*')\/\w+\([^)]*\)/.test(text)) continue;
      report({ type: 'hardcoded-binding-path', value: text.slice(0, 40), offset: m.index });
    }
  }

  /* The other half of the same defect. An escape only survives to the
   * serialized attribute when the backslash is taken verbatim - which is what
   * a `backtick` literal does. Inside a |…| template the backslash is ABAP's
   * own escape: `\{` collapses to a bare `{` before the builder ever sees it,
   * and the view crashes exactly as if nothing had been escaped. Written in a
   * template the form has to be `\\\{`.
   *
   * Invisible to the rule above, which reads the SOURCE and sees a backslash
   * in front of every brace. Only the literal's kind tells the two apart. */
  const templates = literalSegments(src).filter((s) => s.kind === '|');
  for (const open of src.matchAll(/<style>/g)) {
    const from = open.index + open[0].length;
    const to = src.indexOf('</style>', from);
    if (to === -1) continue;
    /* One finding per stylesheet, as above — but the fix covers every
     * template segment of the sheet, so one `--fix` pass settles it: each
     * `\{` gains a `\\` in front, the form a template needs to deliver `\{`. */
    let first = null;
    const fixes = [];
    for (const segment of templates) {
      if (segment.end <= from || segment.start >= to) continue;
      const base = Math.max(segment.start, from);
      const text = src.slice(base, Math.min(segment.end, to));
      for (const b of text.matchAll(/(?<!\\)\\[{}]/g)) {
        fixes.push({ start: base + b.index, end: base + b.index, text: '\\\\' });
        first ??= { text, at: b.index, base };
      }
    }
    if (!first) continue;
    report({
      type: 'collapsed-brace-in-style',
      count: fixes.length,
      value: first.text.slice(Math.max(0, first.at - 15), first.at + 25).replace(/\s+/g, ' ').trim(),
      offset: first.base + first.at,
      fixes,
    });
  }

  /* The mirror image of collapsed-brace-in-style, and the one that bit
   * samples-controls app 166. Brace escaping is a |…| TEMPLATE rule: the backslash
   * is ABAP's escape there, so `\{` reaches the builder as a bare `{`. Inside a
   * `backtick` literal there is no escape processing at all - the backslash is
   * taken verbatim and lands in the serialized attribute, where UI5 sees
   * `\{ path: … \}` instead of a binding and either renders the text raw or
   * fails to parse it. A binding written in a backtick literal needs plain
   * braces; only the |…| form needs the escapes.
   *
   * Scoped to attribute VALUES (`v = ` … `n = `), because a backslash-brace in
   * ordinary text (a core:HTML stylesheet built from backticks) is legitimate. */
  for (const m of src.matchAll(/\bv\s*=\s*`([^`]*)`/g)) {
    const value = m[1];
    const at = value.search(/\\[{}]/);
    if (at === -1) continue;
    /* A stylesheet injected through a core:HTML content attribute escapes its
     * braces for the same parser and is CORRECT in a backtick literal - the
     * backslash has to survive there. Only a value that is itself a BINDING is
     * the defect: it starts with the escaped brace and carries binding syntax
     * (a binding-info object, a model prefix or an expression). */
    if (!/^\s*\\\{/.test(value)) continue;
    if (!/path\s*:|>\/|\{=|\bmodel\s*:/.test(value)) continue;
    /* Mechanically fixable: the correct form is the same literal with plain
     * braces (see the rule doc), so every backslash in front of a brace is
     * simply deleted. A backtick literal has no escape processing, so the
     * deletion cannot change anything else the literal says. */
    const valueStart = m.index + m[0].indexOf('`') + 1;
    const fixes = [...value.matchAll(/\\(?=[{}])/g)]
      .map((b) => ({ start: valueStart + b.index, end: valueStart + b.index + 1, text: '' }));
    report({
      type: 'escaped-brace-in-backtick',
      value: value.slice(Math.max(0, at - 12), at + 28).replace(/\s+/g, ' ').trim(),
      offset: m.index + m[0].indexOf('`') + 1 + at,
      fixes,
    });
  }

  /* How the chain is WRITTEN (lib/chain-layout.mjs). Pushed directly rather
   * than through report( ): those findings are one-per-chain already, and
   * collapsing two chains with the same deviation would drop the second
   * chain's line — the only thing a layout finding has to offer. */
  findings.push(...checkChainLayout(source, d));
  /* Opt-in (findings.mjs OPT_IN): not produced at all unless a config asks
   * for it, rather than produced and filtered later. Its fixes span a whole
   * chain, so they would collide with the mechanical fixes of any other rule
   * inside the same chain and defer them to a second --fix run. */
  if (isOptInEnabled(rules, 'chain-house-layout')) findings.push(...checkChainHouseLayout(source, d));

  return findings;
}
