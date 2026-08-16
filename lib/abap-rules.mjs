/*
 * abap-rules — checks that need the ABAP class, not just the view tree.
 *
 * These are the abap2UI5-specific defects: the ones that stay silent at
 * runtime because nothing throws. A button whose event nobody handles does
 * nothing; a value bound to a local variable is gone after the roundtrip.
 * No UI5 tooling can see them - they only exist in the relationship
 * between the class and the view it builds.
 *
 * `checkAbapRules( )` is the entry point and the order the rules run in. Four
 * groups that neither read nor write anything the rules around them use have
 * their own names and their own stated inputs; the rest sit in the entry
 * point, where they are a few lines each:
 *
 *   checkFrontendWires   _event_client / follow_up_action: the actions, their
 *                        arguments and the control ids they name
 *   checkEventArgs       what a backend _event( ) sends in t_arg, and what
 *                        get_event_arg( ) reads back out
 *   checkAbapBooleans    an ABAP flag written into an attribute value
 *   checkReleasedApi     abap2UI5 objects outside the released five
 *
 * They take `report` rather than returning findings, because the entry point's
 * `report( )` collapses repeats and the FIRST finding of a shape wins - so the
 * order of the calls below is part of the output, not a detail.
 */
import { scrub, parenRegion, blankLiterals } from './abap.mjs';
import {
  ACTION_ARGS, ACTION_ID_SLOTS, CONTROL_METHOD_ID_ARG, OBJECT_ARG_METHODS,
  FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES, VIEW_SLOTS, FILTER_OPERATORS,
  SHORTCUT_MODIFIERS, SHORTCUT_ALIASES, deniedControlMethod,
} from './frontend-actions.mjs';
import { memberSection, propertyDecl } from './properties.mjs';
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

/** The literal t_arg elements of a `VALUE #( ( `a` ) ( `b` ) )` region, with
 *  the absolute offset of each. A non-literal element (a variable, an
 *  expression) is kept as null: its value is not statically knowable, and a
 *  rule that judged it would be guessing. */
function literalElements(body, base) {
  const elements = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '(') continue;
    const { body: inner, end } = parenRegion(body, i);
    const literal = inner.match(/^\s*(?:([`'])((?:[^`'])*)\1|\|([^|]*)\|)\s*$/);
    /* a |…| template WITH an interpolation is not a literal — its value is
     * composed at runtime (`|pages/{ idx }|`), so it is kept as null like
     * any other expression rather than judged on its raw source text */
    const value = literal
      ? (literal[3] !== undefined && /(?<!\\)\{/.test(literal[3]) ? null : (literal[2] ?? literal[3]))
      : null;
    elements.push({ value, offset: base + i });
    i = end;
  }
  return elements;
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

/* Where the branch opened by an IF/ELSEIF condition ending at `from` ends:
 * the next ELSEIF/ELSE/ENDIF at ITS OWN nesting level (inner IFs open and
 * close below it), or ENDMETHOD as the hard stop. Both lifecycle rules read
 * branches with this. */
function ifBranchEnd(src, from) {
  const tokenRe = /\b(IF|ELSEIF|ELSE|ENDIF|ENDMETHOD)\b/gi;
  // over the literal-free view: a MessageStrip whose text says "someone else"
  // used to end the branch there, four statements before its real ENDIF
  src = blankLiterals(src);
  tokenRe.lastIndex = from;
  let depth = 0;
  let t;
  while ((t = tokenRe.exec(src)) !== null) {
    const kind = t[1].toUpperCase();
    if (kind === 'IF') depth++;
    else if (kind === 'ENDIF') {
      if (depth === 0) return t.index;
      depth--;
    } else if ((kind === 'ELSEIF' || kind === 'ELSE') && depth === 0) {
      return t.index;
    } else if (kind === 'ENDMETHOD') return t.index;
  }
  return src.length;
}

/* Where the whole IF … ENDIF CONSTRUCT ends — past its ENDIF, with every
 * ELSEIF/ELSE branch inside it. `ifBranchEnd` stops at the next branch of the
 * same construct; this one steps over them, which is what cutting a dispatcher
 * out of a method body needs. */
function ifBlockEnd(src, from) {
  const tokenRe = /\b(IF|ENDIF|ENDMETHOD)\b/gi;
  src = blankLiterals(src);
  tokenRe.lastIndex = from;
  let depth = 0;
  let t;
  while ((t = tokenRe.exec(src)) !== null) {
    const kind = t[1].toUpperCase();
    if (kind === 'IF') depth++;
    else if (kind === 'ENDIF') {
      if (depth === 0) return t.index + t[0].length;
      depth--;
    } else if (kind === 'ENDMETHOD') return t.index;
  }
  return src.length;
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

/** The PUBLIC SECTION's own DATA names. Only these are serialized into the
 *  model and shipped to the browser (z2ui5_cl_ui5_srv_model filters on
 *  visibility = public), which is what makes them the transport surface. */
function publicAttributes(src) {
  const section = src.match(/\bPUBLIC\s+SECTION\s*\.([\s\S]*?)(?=\b(?:PROTECTED\s+SECTION|PRIVATE\s+SECTION|ENDCLASS)\b)/i);
  if (!section) return [];
  // where the BODY starts in the file — `section.index` points at the
  // `PUBLIC SECTION.` keyword, and the body is what the offsets below are
  // measured in. Without the keyword's own length every unused-public-attribute
  // finding landed one line early (the body is a suffix of the match, so the
  // difference is exact rather than searched for).
  const bodyAt = section.index + section[0].length - section[1].length;
  const names = [];
  /* Collapsed on the whole section, not per declaration block: the block
   * regex below ends a match at the end of a LINE (`$` under /m), and an
   * inline structure spans several. */
  const body = collapseInlineStructures(section[1]);
  for (const m of body.matchAll(/^\s*(?:CLASS-)?DATA:?\s+([\s\S]*?)(?=^\s*(?:CLASS-)?DATA\b|^\s*(?:METHODS|CLASS-METHODS|TYPES|CONSTANTS|INTERFACES|ALIASES)\b|$)/gim)) {
    for (const declaration of m[1].split(',')) {
      const name = declaration.trim().match(/^(\w+)/);
      if (name) names.push({ name: name[1], offset: bodyAt + section[1].indexOf(name[1], m.index) });
    }
  }
  return names;
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
  for (const m of src.matchAll(/client->_event(?:_client)?\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    const name = m[1].toUpperCase();
    if (!names.has(name)) names.set(name, m.index);
  }
  return names;
}

/** Event names the class reacts to: check_on_event( `X` ), and constants
 *  compared against get_event( ). A constant reference on either side means
 *  we cannot resolve the name statically - handled by the caller. */
function handledEvents(src) {
  const names = new Set();
  const LIT = '[`\'|]([A-Z0-9_]+)[`\'|]';
  for (const m of src.matchAll(/check_on_event\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    names.add(m[1].toUpperCase());
  }
  /* The two spellings of the same read: `get_event( )` and the struct field
   * `get( )-event` it is a shorthand for. Both appear across the corpora -
   * and an IF on the second one used to count as no handler at all, so a
   * handled event was reported as dead (samples-stack app 487). */
  for (const m of src.matchAll(new RegExp(
    `(?:get_event\\s*\\(\\s*\\)|get\\s*\\(\\s*\\)-event)\\s*=\\s*${LIT}`, 'gi'))) {
    names.add(m[1].toUpperCase());
  }
  /* WHEN `X`. inside a CASE over the event - including a WHEN that lists
   * ALTERNATIVES. `WHEN `A` OR `B`.` handles both, and reading only the
   * first literal reported the second as unhandled (samples-stack app 319). */
  for (const m of src.matchAll(new RegExp(`\\bWHEN\\s+${LIT}((?:\\s+OR\\s+${LIT})*)`, 'gi'))) {
    names.add(m[1].toUpperCase());
    for (const alt of m[2].matchAll(new RegExp(LIT, 'gi'))) names.add(alt[1].toUpperCase());
  }
  return names;
}

/*
 * Run the ABAP-level rules over one class source. Returns findings in the
 * shape the property gate uses, so callers can treat them alike.
 */
/* opts.data        the metadata snapshot (optional — without it the rules that
 *                  need UI5 knowledge stay silent)
 * opts.controlIds  id -> control name, from the class's own views */
/*
 * Every `client->_event_client( )` / `client->follow_up_action( )` wire in one
 * class: the frontend actions, their arguments, the control ids they name.
 *
 * Extracted from checkAbapRules, which it was 300 of 1,075 lines of. Nothing
 * about it is shared with the rules around it - it reads the source and the
 * metadata and reports - so it reads better with its own name and its own
 * inputs stated.
 *
 * Returns the backend event names it saw raised FROM the frontend
 * (KEYBOARD_SHORTCUT, START_TIMER), which the caller judges against the
 * class's own WHEN branches.
 */
function checkFrontendWires({ src, report, viewIds, data, controlIds }) {
  /* Frontend actions: a wire the browser rejects at dispatch.
   *
   * `client->_event_client( )` and `client->follow_up_action( )` name an
   * action and hand it positional t_arg values. FrontendAction resolves the
   * global object, the method and the binding method against closed
   * whitelists, and a miss is a console log - no exception, no failed render,
   * nothing the property or render gate can see. The button simply does
   * nothing when pressed.
   *
   * Only closed sets are judged (see frontend-actions.mjs) and only literal
   * arguments; CONTROL_BY_ID's method list is open by design and is left
   * alone, except for the one shape that is unambiguously wrong: an empty
   * second element. That slot used to carry the view and is now inserted by
   * the runtime, so an empty one shifts the method out of its position and
   * the frontend logs "method '' not allowed". */
  /* A literal that reaches the frontend as a STATIC id, or null: a
   * $-prefixed value is resolved client-side before dispatch
   * ($event.oSource.sId, ${...} expressions) — those are exactly how a
   * sample opens a popover by whoever was pressed, and no declared-id set
   * can judge them. The aggregation-item form (`id/agg/n`) is judged on its
   * id segment. */
  const staticIdOf = (v) => {
    const s = String(v ?? '');
    if (!s || s.startsWith('$') || s.includes('{')) return null;
    return s.split('/')[0];
  };

  /* Backend events raised from the FRONTEND: a KEYBOARD_SHORTCUT registration
   * dispatches its event name as eB(...) when the combo fires, START_TIMER
   * its callback when the timer expires. A name no branch handles is the same
   * dead wire as an unhandled client->_event( ) — collected in the loop,
   * judged after it. */
  const frontendRaised = [];

  for (const call of src.matchAll(/client->(_event_client|follow_up_action)\s*\(/g)) {
    const open = src.indexOf('(', call.index + call[0].length - 1);
    const { body: callBody } = parenRegion(src, open);
    const base = open + 1;
    const token = callBody.match(/cs_event-(\w+)/);
    let action = token ? token[1].toLowerCase() : null;
    if (!token) {
      /* No cs_event constant: the val is a string LITERAL or a runtime value
       * (the latter is not judged). A NAME-SHAPED literal (^[A-Za-z0-9_]+$)
       * is dispatched exactly like the constant — but the constant is
       * compile-checked and the literal is not, and the dispatch table
       * misses with NO log at all. Case-sensitive on purpose: the runtime
       * never upper-cases, so `set_title` misses at runtime too.
       *
       * Anything NOT name-shaped splits by POSITION, not by method name.
       * Queued as a statement, follow_up_action inserts the val VERBATIM as
       * custom_js — the raw-JavaScript escape hatch, which runs unchecked in
       * the browser and is reported as such: the frontend is a renderer,
       * logic that needs code belongs in ABAP or in a cs_event- action that
       * travels as data. Written where its RESULT is consumed (`v = client->…`,
       * the view-attribute form), it takes the `IF result IS SUPPLIED` path to
       * get_event_client instead, which has no custom_js at all — the same
       * path _event_client always takes. There a non-name literal can never
       * dispatch and is an unknown action, not code in flight. */
      const lit = callBody.match(/^\s*(?:val\s*=\s*)?(?:`((?:[^`]|``)*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|)/);
      if (!lit) continue;
      const text = lit[1] ?? lit[2] ?? lit[3];
      if (!/^[A-Za-z0-9_]+$/.test(text)) {
        let before = call.index - 1;
        while (before >= 0 && /\s/.test(src[before])) before--;
        const consumed = before >= 0 && src[before] === '=';
        if (call[1] === 'follow_up_action' && !consumed) {
          report({
            type: 'raw-javascript-to-frontend', member: 'follow_up_action',
            value: text.replace(/\s+/g, ' ').slice(0, 40), offset: base + lit.index,
          });
        } else {
          report({
            type: 'unknown-frontend-action', value: text.replace(/\s+/g, ' ').slice(0, 40),
            allowed: [...FRONTEND_EVENTS].sort(), offset: base + lit.index,
          });
        }
        continue;
      }
      if (!FRONTEND_EVENTS.includes(text) && !FRONTEND_EVENT_ALIASES.includes(text)) {
        report({
          type: 'unknown-frontend-action', value: text,
          allowed: [...FRONTEND_EVENTS].sort(), offset: base + lit.index,
        });
        continue;
      }
      action = text.toLowerCase();
    }

    /* The view PARAMETER names a slot, and the slot keys are case-sensitive
     * on the wire (an ABAP string compare on the server, an object key in the
     * browser). `NESTED` — the natural guess for cs_view-nested, whose VALUE
     * is `NEST` — misses, and for CONTROL_BY_ID a wrong slot is worse than
     * none: it SUPPRESSES the global id fallback, so the wire dies although
     * the id exists. */
    const vm = callBody.match(/\bview\s*=\s*([`'])([^`']*)\1/);
    if (vm && !VIEW_SLOTS.includes(vm[2])) {
      report({ type: 'unknown-view-slot', member: 'view', value: vm[2], offset: base + vm.index });
    }

    const tm = callBody.match(/\bt_arg\s*=\s*VALUE\s+#?\s*\(/);
    const argOpen = tm ? callBody.indexOf('(', tm.index + tm[0].length - 1) : -1;
    const args = tm ? literalElements(parenRegion(callBody, argOpen).body, base + argOpen + 1) : [];

    /* CONTROL_BY_ID addresses a control by the id the view gave it. A literal
     * id that no view of this class declares resolves to nothing: the
     * frontend logs "control not found" and the wire silently does nothing —
     * no exception, no failed render, and the property gate never sees the
     * ABAP side of it. Only judged when every id attribute in the class is a
     * literal (see viewIds), so a class that builds ids dynamically is left
     * alone rather than guessed at. The aggregation-item form (`id/agg/n`)
     * is judged on its id segment only. */
    if (action === 'control_by_id' && viewIds && staticIdOf(args[0]?.value)
        && !viewIds.has(staticIdOf(args[0].value))) {
      report({
        type: 'frontend-action-unknown-id', control: 'CONTROL_BY_ID', member: 'id',
        value: args[0].value, allowed: [...viewIds].sort(), offset: args[0].offset,
      });
      continue;
    }

    /* A CONTROL_BY_ID method whose own first argument is a control id too
     * (`to` targets, `openBy`/`toggleBy` anchors, `setSelectedSection`, …) —
     * the kinds CONTROL_METHODS declares as controlId/anchor. A miss resolves
     * nothing and logs. An EMPTY argument stays silent: for the OrNull kinds
     * it is the documented way to clear. */
    if (action === 'control_by_id' && viewIds && CONTROL_METHOD_ID_ARG.includes(args[1]?.value)
        && staticIdOf(args[2]?.value) && !viewIds.has(staticIdOf(args[2].value))) {
      report({
        type: 'frontend-action-unknown-id', control: 'CONTROL_BY_ID', member: args[1].value,
        value: args[2].value, allowed: [...viewIds].sort(), offset: args[2].offset,
      });
      continue;
    }

    /* A JSON payload the runtime silently downgrades: the `object`-kind
     * methods run their argument through castArg, whose catch turns a literal
     * that does not parse as JSON into `{}` — setSticky then un-sticks
     * everything instead of failing. For the enum-array payloads the VALUES
     * are checkable too: an unknown sap.m.Sticky key is dropped by UI5 with
     * the same silence. */
    if (action === 'control_by_id' && args[1]?.value && Object.hasOwn(OBJECT_ARG_METHODS, args[1].value)) {
      const payload = args[2];
      if (payload && payload.value !== null && payload.value !== '') {
        let parsed;
        try { parsed = JSON.parse(payload.value); } catch { parsed = undefined; }
        if (parsed === undefined) {
          report({
            type: 'invalid-action-payload', control: 'CONTROL_BY_ID', member: args[1].value,
            value: String(payload.value).slice(0, 40), offset: payload.offset,
          });
        } else {
          const allowed = OBJECT_ARG_METHODS[args[1].value]
            ? data?.__enums?.[OBJECT_ARG_METHODS[args[1].value]] : null;
          const bad = allowed && Array.isArray(parsed) ? parsed.find((v) => !allowed.includes(v)) : undefined;
          if (bad !== undefined) {
            report({
              type: 'invalid-action-payload', control: 'CONTROL_BY_ID', member: args[1].value,
              value: String(bad).slice(0, 40), allowed, offset: payload.offset,
            });
          }
        }
      }
    }

    /* The compound filter form: ONE JSON param of groups, each group rows of
     * [path, operator, value1, value2]. A malformed literal is rejected with
     * a log and the binding stays untouched; a row operator outside the
     * whitelist the same. Only a literal payload is judged. */
    if (action === 'binding_call' && args[2]?.value === 'filter'
        && typeof args[3]?.value === 'string' && args[3].value.trimStart().startsWith('[')) {
      let groups;
      try { groups = JSON.parse(args[3].value); } catch { groups = undefined; }
      if (groups === undefined || !Array.isArray(groups)) {
        report({
          type: 'invalid-action-payload', control: 'BINDING_CALL', member: 'filter groups',
          value: String(args[3].value).slice(0, 40), offset: args[3].offset,
        });
      } else {
        /* the same walk buildFilterGroups does: an array of GROUPS, each an
         * array of [path, operator, v1, v2] ROWS (an empty groups array is
         * the clear form and fine). A row that is not that shape, or an
         * operator off the whitelist, is logged upstream and the binding
         * stays untouched. */
        outer: for (const group of groups.filter((g) => Array.isArray(g) && g.length)) {
          for (const row of group) {
            if (!Array.isArray(row) || typeof row[0] !== 'string') {
              report({
                type: 'invalid-action-payload', control: 'BINDING_CALL', member: 'filter row',
                value: JSON.stringify(row)?.slice(0, 40), offset: args[3].offset,
              });
              break outer;
            }
            if (!FILTER_OPERATORS.includes(row[1])) {
              report({
                type: 'invalid-frontend-action', control: 'BINDING_CALL', member: 'filter operator',
                value: String(row[1]).slice(0, 40), allowed: FILTER_OPERATORS, offset: args[3].offset,
              });
              break outer;
            }
          }
        }
      }
    }

    /* KEYBOARD_SHORTCUT: a combo that names no non-modifier key is logged
     * and never registered — `Ctrl+Shift` binds nothing. The scope (t_arg@2)
     * is a slot key or a declared control id; anything else makes the
     * registration permanently ineligible, silently. And the EVENT (t_arg@1)
     * is a backend event like any client->_event( ) one — collected for the
     * handler check below. */
    if (action === 'keyboard_shortcut') {
      const combo = args[0];
      if (combo && combo.value !== null) {
        const parts = String(combo.value).split('+')
          .map((p) => { const t = p.trim().toLowerCase(); return SHORTCUT_ALIASES[t] ?? t; })
          .filter((p) => p !== '');
        if (!parts.some((p) => !SHORTCUT_MODIFIERS.includes(p))) {
          report({ type: 'invalid-keyboard-shortcut', member: 'combo', value: String(combo.value).slice(0, 40), offset: combo.offset });
        }
      }
      const scope = args[2];
      if (staticIdOf(scope?.value) && !VIEW_SLOTS.includes(String(scope.value).toUpperCase())
          && viewIds && !viewIds.has(scope.value)) {
        report({
          type: 'frontend-action-unknown-id', control: 'KEYBOARD_SHORTCUT', member: 'scope',
          value: scope.value, allowed: [...VIEW_SLOTS, ...[...viewIds].sort()], offset: scope.offset,
        });
      }
    }
    if ((action === 'keyboard_shortcut' || action === 'start_timer')) {
      const ev = action === 'keyboard_shortcut' ? args[1] : args[0];
      if (ev?.value && /^[A-Za-z0-9_]+$/.test(ev.value)) {
        frontendRaised.push({ name: ev.value.toUpperCase(), offset: ev.offset });
      }
    }

    /* SET_SIZE_LIMIT's view key — `(limit)(viewKey)` to set, `(viewKey)` to
     * reset. A key outside the five slots addresses no view's model and the
     * limit lands nowhere. A bare numeric single argument is left alone (it
     * reads as a limit, which is its own confusion, not this rule's). */
    if (action === 'set_size_limit' && args.length) {
      const slotArg = args.length > 1 ? args[1] : args[0];
      if (slotArg?.value && !/^\d+$/.test(slotArg.value) && !VIEW_SLOTS.includes(slotArg.value)) {
        report({ type: 'unknown-view-slot', member: 'view', value: slotArg.value, offset: slotArg.offset });
      }
    }

    /* The other id-addressed actions, same trust condition as CONTROL_BY_ID
     * (see ACTION_ID_SLOTS for who fails how quietly). */
    const idSlots = ACTION_ID_SLOTS[action];
    if (idSlots && viewIds) {
      let miss = false;
      for (const at of idSlots) {
        const arg = args[at];
        if (staticIdOf(arg?.value) && !viewIds.has(arg.value)) {
          report({
            type: 'frontend-action-unknown-id', control: action.toUpperCase(), member: 'id',
            value: arg.value, allowed: [...viewIds].sort(), offset: arg.offset,
          });
          miss = true;
        }
      }
      if (miss) continue;
    }

    /* An imperative setter where the control has a bindable PROPERTY of that
     * name. Binding it two-way keeps the state in the model, where it survives
     * a view rebuild and a draft restore — an action does not — and it is the
     * project rule ("prefer a bindable property over a frontend action").
     * Only PROPERTIES qualify: an association (ObjectPageLayout.selectedSection)
     * and an aggregation cannot be data-bound, so driving those imperatively is
     * the only way and is never reported. */
    if (action === 'control_by_id' && data && controlIds) {
      const setter = String(args[1]?.value ?? '').match(/^set([A-Z]\w*)$/);
      const control = args[0]?.value ? controlIds[args[0].value] : null;
      if (setter && control) {
        const prop = setter[1][0].toLowerCase() + setter[1].slice(1);
        /* A property whose type is a live JS value (a callback, a DOM node)
         * cannot travel in a JSON model — sap.m.MessagePopover.asyncURLHandler
         * is exactly that, which is why the framework names a built-in policy
         * instead. Those stay imperative by nature, not by choice. */
        const decl = propertyDecl(data, control, prop);
        const bindable = decl && !['function', 'object', 'any'].includes(decl.type);
        if (bindable && memberSection(data, control, prop) === 'properties') {
          report({
            type: 'settable-property-via-action', control, member: prop,
            value: args[1].value, offset: args[1].offset,
          });
        }
      }
    }

    /* A method the frontend denylist refuses. CONTROL_BY_ID's ALLOWED set is
     * open (any public control method), so nothing can whitelist it - but the
     * DENIED set is closed, and a wire naming one of those never reaches the
     * control: FrontendAction logs "method not allowed" and returns. That is
     * the same silence as an unknown id, and the same reason this family of
     * rules exists. The named per-aggregation mutators (removeAllItems,
     * destroyContent) are NOT denied and are never reported - only the generic
     * reflection variants that take the member name as an argument. */
    if (action === 'control_by_id' && args[1]?.value) {
      const why = deniedControlMethod(args[1].value);
      if (why) {
        report({
          type: 'denied-control-method', control: 'CONTROL_BY_ID', member: why,
          value: args[1].value, offset: args[1].offset,
        });
        continue;
      }
    }

    if (action === 'control_by_id' && args[1]?.value === '') {
      report({
        type: 'invalid-frontend-action', control: 'CONTROL_BY_ID', member: 'view slot',
        value: '', offset: args[1].offset,
      });
      continue;
    }
    for (const slot of ACTION_ARGS[action] ?? []) {
      const arg = args[slot.at];
      if (!arg || arg.value === null) continue; // absent or not a literal
      const allowed = slot.allowed(args.map((a) => a?.value));
      if (!allowed) continue; // the earlier slot is already wrong - one finding is enough
      if (!allowed.includes(arg.value)) {
        report({
          type: 'invalid-frontend-action', control: action.toUpperCase(), member: slot.name,
          value: arg.value, allowed, offset: arg.offset,
        });
        break;
      }
    }
  }
  return frontendRaised;
}


/*
 * The t_arg values a backend `client->_event( )` sends, and the
 * `get_event_arg( )` calls that read them back: an unresolved brace on the way
 * out, a trailing empty entry that never arrives, and an index the raise site
 * never filled.
 *
 * One pass, because the arity it collects on the way out is what the read side
 * is judged against.
 */
function checkEventArgs({ src, report }) {
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
  for (const ev of src.matchAll(/client->_event\s*\(/g)) {
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    const nameMatch = evBody.match(/^\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/i);
    const tm = evBody.match(/\bt_arg\s*=\s*VALUE\s+#?\s*\(/);
    if (nameMatch) {
      let count = 0;
      if (tm) {
        const argOpen = evBody.indexOf('(', tm.index + tm[0].length - 1);
        count = countElements(parenRegion(evBody, argOpen).body);
      }
      const name = nameMatch[1].toUpperCase();
      arity.set(name, Math.max(arity.get(name) ?? 0, count));
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
        report({
          type: 'trailing-empty-event-arg',
          value: String(argEls.length),
          offset: m.index + last.index,
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
  for (const call of src.matchAll(/client->(?:_event_client|follow_up_action)\s*\(/g)) {
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

export function checkAbapRules(source, { data = null, controlIds = null, minUi5 = '1.71', rules = null } = {}) {
  const src = scrub(source);
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
  for (const m of src.matchAll(/client->(_bind_edit)\s*\(/g)) {
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

  /* The manual model pushes do NOTHING. The framework compares the model
   * state before main( ) with the state after it returned and, when they
   * differ, sends it to every open view slot by itself - so view_model_update
   * and its four siblings are deliberately EMPTY methods in
   * z2ui5_cl_ui5_client, kept in the interface only so existing apps keep
   * compiling. A leftover call is not just dead weight, it is misleading: it
   * reads as "the model is pushed here" at a place where nothing happens.
   * Deleting it is the whole correction, so it carries the fix. */
  for (const m of src.matchAll(/client->((?:nest2?_)?view_model_update|popup_model_update|popover_model_update)\s*\(/g)) {
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
  for (const m of src.matchAll(/client->(_event_client)\s*\(/g)) {
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
  for (const m of src.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?(\w+)\s*[)\s]/g)) {
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
    for (const m of src.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?\w+(?:-\w+)*)/g)) {
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
  for (const m of src.matchAll(/\bui5\.sap\.com\b|\bhana\.ondemand\.com\b/g)) {
    report({ type: 'commercial-ui5-host', value: m[0], offset: m.index });
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
    const length = line.replace(/\r$/, '').length;
    if (length > LINE_LIMIT) {
      /* Keyed by line number rather than by length, so twenty over-long lines
       * are twenty findings: each one needs its own split, and the dedupe key
       * would otherwise collapse two lines that happen to be equally long. */
      report({ type: 'source-line-too-long', member: String(i + 1), value: length, offset: lineStart + LINE_LIMIT });
    }
    lineStart += line.length + 1;
  });

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
  }

  /* A hand-rolled init flag where client->check_on_init( ) is the contract.
   * The framework already knows whether this is the first run of the app
   * instance — a boolean attribute that gates the first render duplicates
   * that knowledge as serialized state: it travels to the browser on every
   * roundtrip for nothing, and subtle ordering bugs grow around it (a popup
   * or JS loader initialized before the flag flips sees the wrong phase).
   * One mass migration replaced this pattern in 111 sample classes at once.
   * Only the unambiguous shape is judged: an IF on the attribute being
   * initial/false whose branch BOTH sets it true AND hands a view over — a
   * lazy-load guard that displays nothing is left alone. */
  for (const m of src.matchAll(/\bIF\s+(?:me->)?(\w+)\s*(?:=\s*abap_false|IS\s+INITIAL)\b/gi)) {
    const name = m[1].toUpperCase();
    if (!boolVars.has(name) && !attrs.has(name)) continue;
    if (locals.has(name)) continue;
    const end = ifBranchEnd(src, m.index + m[0].length);
    const branch = src.slice(m.index, end);
    if (!new RegExp(`\\b(?:me->)?${m[1]}\\s*=\\s*abap_true\\b`, 'i').test(branch)) continue;
    if (!/\b(?:view_display|nest2?_view_display|popup_display|popover_display)\s*\(/i.test(branch)) continue;
    report({ type: 'manual-init-flag', member: m[1], offset: m.index });
  }

  /* client->_bind( ) on a reference. The model serializer walks DATA, not
   * REF TO data — binding the reference itself (without dereferencing it as
   * ref->*) throws at runtime, and the two sample fixes that established
   * this pattern were both found by users hitting the exception. Judged on
   * the class's own declarations, so a plain data attribute never matches. */
  {
    const refVars = new Set();
    for (const d of src.matchAll(/\b(?:CLASS-)?DATA:?\s+(\w+)\s+TYPE\s+REF\s+TO\s+\w+/gi)) {
      refVars.add(d[1].toUpperCase());
    }
    if (refVars.size) {
      for (const m of src.matchAll(/client->_bind(?:_edit)?\s*\(\s*(?:val\s*=\s*)?((?:me->)?(\w+))\s*(?![-\w>])/g)) {
        if (refVars.has(m[2].toUpperCase())) {
          report({ type: 'binding-to-reference', member: m[2], offset: m.index });
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

  /* A view that is built but never handed to the client renders nothing -
   * an empty page with no error anywhere. Only reported when the class
   * builds a view itself and no display/handover call appears at all. The
   * display family is complete on purpose: a popover-only or nested-view
   * helper class is legitimate, and the rule reporting one was the false
   * positive the extension's snippet gate caught. */
  const factory = src.match(new RegExp(`${d.factory}\\s*\\(`));
  if (factory
      && !/((?:nest2?_)?view_display|popup_display|popover_display|nav_app_call|nav_app_leave)\s*\(/.test(src)) {
    report({ type: 'view-never-displayed', offset: factory.index });
  }

  checkEventArgs({ src, report });

  const frontendRaised = checkFrontendWires({ src, report, viewIds, data, controlIds });

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
    const count = (css.match(/(?<!\\)[{}]/g) || []).length;
    report({
      type: 'unescaped-brace-in-style',
      count,
      value: css.slice(Math.max(0, first - 15), first + 25).replace(/\s+/g, ' ').trim(),
      offset: from + first,
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
        report({
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
  for (const m of src.matchAll(/->get\s*\(\s*\)-viewname\b/gi)) {
    report({ type: 'get-viewname-removed', member: 'viewname', offset: m.index });
  }

  /* popover_display imports XML, not VAL — the one asymmetry in the display
   * family (popup_display takes val). A `val =` guessed by analogy does not
   * compile, but nothing in a systemless pipeline says so before activation:
   * abaplint has no signature knowledge of z2ui5_if_client, and the render
   * gate never sees the class fail. One of the most common first-try
   * mistakes in generated code (samples-controls hold-out probes 607/613/617). */
  for (const m of src.matchAll(/popover_display\s*\(\s*(val)\s*=/gd)) {
    const [start, end] = m.indices[1];
    report({
      type: 'popover-display-val', member: 'val', offset: m.index,
      fixes: [{ start, end, text: 'xml' }],
    });
  }

  /* The same FOR iterator name twice in one method. Fine on 7.50+, where the
   * iterator is local to its VALUE #( ) expression — but a 7.02 downport
   * (abaplint --fix, and the transpiler behind the e2e runtime) materializes
   * each one as `DATA <name> TYPE i` in the method body, and the second
   * declaration fails activation with "variable already defined". */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const iterators = new Set();
    for (const m of mm[0].matchAll(/\bFOR\s+(\w+)\s*=/g)) {
      if (iterators.has(m[1])) {
        report({ type: 'duplicate-for-iterator', member: m[1], offset: mm.index + m.index });
      } else {
        iterators.add(m[1]);
      }
    }
  }

  /* Lifecycle checks split into separate IF blocks instead of one IF/ELSEIF
   * chain. The lifecycle flags are not all mutually exclusive, so separate
   * blocks can execute more than one branch on a single roundtrip — the
   * classic symptom is work done twice after a navigation. An ELSEIF chain
   * makes the branches exclusive by construction (the spelling has no word
   * boundary before its IF, so it never counts here). The one other
   * exclusive form is the GUARD idiom — an IF block that leaves the method
   * (`IF client->check_on_event( \`GO\` ). … RETURN. ENDIF.`): control never
   * flows from it into the next block, so it does not count either. */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const open = [];
    for (const c of mm[0].matchAll(/\bIF\s+client->(check_on_\w+)\s*\(/gi)) {
      const end = ifBranchEnd(mm[0], c.index + c[0].length);
      if (!/\bRETURN\b|\bLEAVE\b/i.test(mm[0].slice(c.index, end))) open.push(c);
    }
    if (open.length >= 2) {
      report({
        type: 'separate-lifecycle-ifs', member: open[1][1],
        count: open.length, offset: mm.index + open[1].index,
      });
    }
  }

  /* A check_on_navigated( ) branch that never hands a view back. When the
   * called app leaves, the browser still shows ITS view — the caller has to
   * re-display its own with view_display( ). A branch that only reads the
   * result and returns leaves the screen showing the wrong app, with no error
   * anywhere. view_model_update( ) used to count here and no longer does: it
   * is an empty method now (obsolete-model-update), and the automatic push it
   * was replaced by reaches the MAIN SLOT — which is still holding the called
   * app's view. Only a display call puts this app's view back in it. */
  {
    const REDISPLAY = /\b(?:view_display|nest2?_view_display|popup_display|popover_display|nav_app_call|nav_app_leave)\s*\(/i;
    /* The branch usually does not display anything ITSELF - it calls
     * `set_view( )` or `on_navigation( )`, and that method displays. Reading
     * only the branch text called three correct samples broken and offered a
     * fix that would have displayed the view twice. So a call to a method of
     * this class is followed, a few levels deep: the promise is that the
     * branch hands a view back somewhere, not that it does so inline. */
    const bodies = new Map();
    for (const mm of src.matchAll(/\bMETHOD\s+([\w~]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
      bodies.set(mm[1].toLowerCase().replace(/^.*~/, ''), mm[2]);
    }
    const redisplays = (code, seen = new Set()) => {
      if (REDISPLAY.test(code)) return true;
      if (seen.size > 8) return false;
      for (const call of code.matchAll(/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g)) {
        const name = call[1].toLowerCase();
        if (seen.has(name) || !bodies.has(name)) continue;
        seen.add(name);
        if (redisplays(bodies.get(name), seen)) return true;
      }
      return false;
    };
    for (const m of src.matchAll(/\b(?:ELSE)?IF\s+client->check_on_navigated\s*\(/gi)) {
      const end = ifBranchEnd(src, m.index + m[0].length);
      if (!redisplays(src.slice(m.index, end))) {
        report({ type: 'missing-view-display-on-navigated', offset: m.index });
      }
    }

    /* The other half of the same defect: no check_on_navigated( ) branch AT
     * ALL. The rule above judges a branch that exists; this one judges its
     * absence, so the two can never both fire on one class.
     *
     * check_on_init( ) is "this app INSTANCE never ran", not "the app starts"
     * — abap2UI5 flips mv_check_initialized in db_save( ) after the very first
     * roundtrip. It is therefore false on three roundtrips that put this app
     * back on screen: a called app leaving through nav_app_leave( ), one of
     * the built-in z2ui5_cl_pop_* value helps returning (they run over
     * nav_app_call too), and a bookmarked draft being restored. All three
     * raise check_on_navigated( ) alone, and with no branch for it main( )
     * does nothing: the response carries no display, so the model is pushed
     * into a MAIN slot still holding the OTHER app's view. The screen stays
     * wrong with no error anywhere — which is why apps written this way work
     * perfectly until the day something navigates into them.
     *
     * Judged on the dispatcher, never on the mere absence of the word: an app
     * whose display is NOT gated by the lifecycle at all is correct without a
     * branch, and reading the text alone called one such sample broken. So
     * every lifecycle IF … ENDIF construct is cut out of main( ) and what
     * remains has to reach no display — a `view_display( )` after the chain,
     * or the `client->nav_app_leave( )` a popup helper ends on, both mean the
     * app is covered. The class must display SOMEWHERE too: one that never
     * builds a view is a helper, and `view-never-displayed` speaks for it. */
    const dispatcher = src.match(/(\bMETHOD\s+z2ui5_if_app~main\s*\.)([\s\S]*?)\bENDMETHOD\b/i);
    if (dispatcher && !/client->check_on_navigated\s*\(/i.test(src)) {
      const body = dispatcher[2];
      const init = body.match(/\b(?:ELSE)?IF\s+client->check_on_init\s*\(/i);
      let ungated = '';
      let at = 0;
      for (const m of body.matchAll(/\bIF\s+client->check_on_\w+\s*\(/gi)) {
        if (m.index < at) continue;   // an inner one, already inside a cut block
        ungated += body.slice(at, m.index);
        at = ifBlockEnd(body, m.index + m[0].length);
      }
      ungated += body.slice(at);
      if (init && redisplays(body) && !redisplays(ungated)) {
        report({
          type: 'missing-on-navigated-branch',
          offset: dispatcher.index + dispatcher[1].length + init.index,
        });
      }
    }
  }

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
    for (const segment of templates) {
      if (segment.end <= from || segment.start >= to) continue;
      const text = src.slice(Math.max(segment.start, from), Math.min(segment.end, to));
      const at = text.search(/(?<!\\)\\[{}]/);
      if (at === -1) continue;
      report({
        type: 'collapsed-brace-in-style',
        count: (text.match(/(?<!\\)\\[{}]/g) || []).length,
        value: text.slice(Math.max(0, at - 15), at + 25).replace(/\s+/g, ' ').trim(),
        offset: Math.max(segment.start, from) + at,
      });
      break; // one finding per stylesheet, as above
    }
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
    report({
      type: 'escaped-brace-in-backtick',
      value: value.slice(Math.max(0, at - 12), at + 28).replace(/\s+/g, ' ').trim(),
      offset: m.index + m[0].indexOf('`') + 1 + at,
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
