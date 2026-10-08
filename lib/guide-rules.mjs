/*
 * guide-rules — five sentences of the app guide and of z2ui5_if_client's
 * ABAP Doc, read as rules (2026-09-25).
 *
 * Each of these was a sentence a reader had to know before writing the call:
 * the guide (docs/agents/building-apps.md, §5 and §6) and the interface's own
 * ABAP Doc state them, and nothing in a systemless pipeline repeated them at
 * the line where they are broken. A probe of every one against linter 0.7.0
 * was silent.
 *
 *   frontend-action-as-backend-event   a cs_event- constant handed to
 *                                      `_event( )`: a backend event named
 *                                      POPUP_CLOSE that closes nothing
 *   popup-display-xml                  `popup_display( xml = )` - the popup
 *                                      takes `val`, the popover `xml`; the
 *                                      mirror of popover-display-val
 *   queue-last-without-no-busy         a per-keystroke wire that queues its
 *                                      last firing and still raises the
 *                                      busy overlay over the field
 *   nest-view-without-destroy          a nested display with no
 *                                      `method_destroy`: every call adds one
 *                                      more fragment
 *   omit-initial-drops-false           `omit_initial = abap_true` on a table
 *                                      whose row carries an abap_bool bound
 *                                      to a property that defaults to true
 *
 * One entry point, `checkGuideRules( )`, called from checkAbapRules( ) with
 * the same scrubbed/raw pair and the same `report( )` every other module
 * takes - the entry point's collector collapses repeats and the FIRST finding
 * of a shape wins, so these run after the rules they are neighbours of. The
 * readers are the shared ones (lib/abap.mjs, lib/abap-source.mjs); nothing
 * here imports a renderer or the entry point, so a consumer assembling the
 * pipeline from `./abap-rules` reaches every one of them.
 */
import { parenRegion, namedArgMarks, clientCalls, scrub, blankLiterals } from './abap.mjs';
import { isLiveEvent } from './abap-source.mjs';

/** The insert/destroy pairs z2ui5_if_client documents on nest_view_display( )
 *  - `addContent` for a Page or a VBox, `addItem` for a List, `addPage` for a
 *  NavContainer - with the `removeAll…` mutator UI5 generates for the same
 *  aggregation. Keyed lower-case (ABAP text, but the value is a UI5 method
 *  name and is written as UI5 spells it). Only these three carry a fix: any
 *  other mutator is reported without one, because the matching remover is a
 *  fact about the anchor control this reader does not resolve. */
export const NEST_DESTROY_BY_INSERT = Object.freeze({
  addcontent: 'removeAllContent',
  additem: 'removeAllItems',
  addpage: 'removeAllPages',
});

/** The ABAP types a boolean row component is declared with. A component of a
 *  DDIC type the class does not spell out is not judged - a rule that cannot
 *  see the type would be guessing. */
const BOOLEAN_TYPES = 'abap_bool|abap_boolean|xsdboolean|boolean|flag|xfeld|boole_d';

/** A `cs_event-<name>` constant, however the class reaches it:
 *  `client->cs_event-x`, `z2ui5_if_client=>cs_event-x`, `me->client->cs_event-x`
 *  or the bare `cs_event-x` of a class implementing the interface. */
const CS_EVENT = /^(?:\w+(?:->|=>))*cs_event-(\w+)$/i;

/* A `cs_event` DECLARED here: the structure a CONSTANTS/TYPES/DATA
 * statement opens, or a component typed after another. */
const OWN_CS_EVENT = /\b(?:BEGIN\s+OF\s+cs_event\b|cs_event\s+(?:TYPE|LIKE)\b)/i;

/** The first `CLASS … DEFINITION` of a scrubbed source (in a .clas.abap the
 *  global class): its name and the superclass it names in `INHERITING FROM`,
 *  both folded to lower case, and whether the source declares a `cs_event`
 *  of its own. null for a source that defines no class. */
function factsOf(src) {
  const m = src.match(/\bCLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD)\b)([^.]*)/i);
  if (!m) return null;
  return {
    name: m[1].toLowerCase(),
    superclass: m[2].match(/\bINHERITING\s+FROM\s+([\w/]+)/i)?.[1].toLowerCase() ?? null,
    csEvent: OWN_CS_EVENT.test(src),
  };
}

/* An attribute reached through a reference: `->name` not followed by a `(`
 * (that is a method call). Read on code with literals blanked. */
const ARROW_READ = /->\s*(\w+)\b(?!\s*\()/g;
/* A variable typed as a class: `x TYPE REF TO cls` (a DATA, a parameter),
 * or an inline declaration from `CAST cls( )`, `NEW cls( )` or a static
 * call of the class (`cls=>factory( )`, the popup idiom). */
const TYPED_VAR = /(?<![\w-])(\w+)\s+TYPE\s+REF\s+TO\s+([\w/]+)|\bDATA\(\s*(\w+)\s*\)\s*=\s*(?:(?:CAST|NEW)\s+([\w/]+)\s*\(|([\w/]+)=>\w+\s*\()/gi;
/* What stands in front of `)->`: the call the parenthesis closes. */
const CALL_HEAD = /(?:\b(?:CAST|NEW)\s+([\w/]+)|([\w/]+)=>\w+)\s*$/i;

/** The classes `code` (scrubbed, literals blanked) reaches attributes of,
 *  and which names: class (lower case) -> Set of attribute names, for the
 *  classes `known` holds other than `own`. A receiver counts when its class
 *  is written down - a variable declared `TYPE REF TO cls` or inline from a
 *  `CAST cls( )` / `NEW cls( )` / `cls=>…( )`, or that expression itself in
 *  front of the arrow. A reference whose type the source does not name is
 *  nobody's. */
function outsideAccesses(code, own, known) {
  const vars = new Map();
  for (const m of code.matchAll(TYPED_VAR)) {
    const v = (m[1] ?? m[3]).toLowerCase();
    const cls = (m[2] ?? m[4] ?? m[5]).toLowerCase();
    if (cls !== own && known.has(cls)) vars.set(v, cls);
  }
  const out = new Map();
  for (const m of code.matchAll(ARROW_READ)) {
    let cls = null;
    const before = code.slice(Math.max(0, m.index - 200), m.index);
    const recv = before.match(/(?:(?:^|[^\w>-])me\s*->\s*|^|[^\w>-])(\w+)\s*$/i);
    if (recv) cls = vars.get(recv[1].toLowerCase()) ?? null;
    else if (/\)\s*$/.test(before)) {
      // walk back to the parenthesis that opens the call
      let depth = 0;
      let i = before.length - 1;
      for (; i >= 0; i--) {
        if (before[i] === ')') depth++;
        else if (before[i] === '(' && --depth === 0) break;
      }
      const head = i > 0 ? before.slice(0, i).match(CALL_HEAD) : null;
      const c = head ? (head[1] ?? head[2]).toLowerCase() : null;
      if (c && c !== own && known.has(c)) cls = c;
    }
    if (!cls) continue;
    if (!out.has(cls)) out.set(cls, new Set());
    out.get(cls).add(m[1].toLowerCase());
  }
  return out;
}

/** What the rules that look past one class need to know about the OTHER
 *  classes of a run: class name (lower case) -> `{ superclass, csEvent,
 *  outsideReads }`, read from raw ABAP sources. `frontend-action-as-backend-
 *  event` walks the superclass chain; `unbound-public-attribute` and
 *  `unused-public-attribute` read `outsideReads` - the attribute names
 *  another class of the run reaches as `ref->name` through a reference it
 *  types as this class (`TYPE REF TO`, `CAST`, `NEW`, a static factory),
 *  which is how a caller takes a popup's `ms_result` back or sets a value
 *  on the app it calls. checkFiles( ) builds it over the files it is
 *  handed; a caller checking one source at a time passes it as
 *  `classIndex`. */
export function classIndexOf(sources) {
  const index = new Map();
  const readers = [];
  for (const source of sources) {
    const src = scrub(String(source));
    const facts = factsOf(src);
    if (facts && !index.has(facts.name)) index.set(facts.name, { superclass: facts.superclass, csEvent: facts.csEvent, outsideReads: new Set() });
    if (src.includes('->')) readers.push({ own: facts?.name ?? null, src });
  }
  for (const { own, src } of readers) {
    for (const [cls, names] of outsideAccesses(blankLiterals(src), own, index)) {
      for (const n of names) index.get(cls).outsideReads.add(n);
    }
  }
  return index;
}

/** What a check of `source` reads out of `classIndex`, as a stable string:
 *  the names other classes read of it (`outsideReads`), and the superclass
 *  chain `inheritsCsEvent( )` walks - each ancestor's facts in order, and the
 *  name where the walk leaves the index. Two runs that give a
 *  class the same string judge it the same way, whatever else the index
 *  holds; the CLI's `--cache` keys a stored result on it, so an edit to a
 *  superclass re-judges its subclasses. */
export function classIndexDeps(source, classIndex) {
  const chain = [];
  const seen = new Set();
  const own = factsOf(scrub(String(source)));
  // what the other classes read of this one (outsideReads), then the chain
  chain.push([...(classIndex?.get(own?.name)?.outsideReads ?? [])].sort());
  for (let name = own?.superclass; name && name !== 'object' && !seen.has(name);) {
    seen.add(name);
    const facts = classIndex?.get(name) ?? null;
    chain.push(facts ? [name, facts.superclass, facts.csEvent] : [name]);
    if (!facts) break;
    name = facts.superclass;
  }
  return JSON.stringify(chain);
}

/** Whether a class with this superclass inherits a `cs_event`: true when an
 *  ancestor in the index declares one, false when the chain ends (no
 *  superclass, or `object`) without one, null when it leaves the index. */
function inheritsCsEvent(superclass, classIndex) {
  const seen = new Set();
  for (let name = superclass; name && name !== 'object';) {
    const facts = classIndex?.get(name);
    if (!facts || seen.has(name)) return null;
    if (facts.csEvent) return true;
    seen.add(name);
    name = facts.superclass;
  }
  return false;
}

/**
 * @param {string} src     the scrubbed source (comments blanked, literals kept)
 * @param {string} source  the raw source, which every fix span addresses
 * @param {object} ctx     `code` (src with literals blanked too - where a call
 *                         IS), `report`, the builder dialect `d` and the
 *                         `boolFields` map the entry point derives from the
 *                         reconstructed views (table -> row fields bound to a
 *                         boolean property whose default is true), and the
 *                         `classIndex` of the other linted classes
 *                         (`classIndexOf( )`) a superclass is resolved in
 */
export function checkGuideRules(src, source, { code, report, d, boolFields = null, classIndex = null } = {}) {
  /* A class may declare a `cs_event` of its OWN - `CONSTANTS: BEGIN OF
   * cs_event, search TYPE string VALUE \`SEARCH\`, …` is a common way to
   * name an app's backend events (samples app 000, rap-ext). Then the bare
   * `cs_event-x` and `me->cs_event-x` are that constant, a backend event
   * name like any literal, and only a spelling through a client reference
   * (`client->`, `mo_client->`, `z2ui5_if_client=>`) is the frontend action
   * - the rename to follow_up_action( ) broke every wire of such a class.
   * The same holds for a `cs_event` INHERITED from a superclass (rap-ext's
   * worklist inherits the list report's), resolved through `classIndex`
   * when the superclass is among the linted files; a superclass the index
   * does not know might declare one, and a false wire is worse than a
   * missed one there, so such a class is read as owning it. */
  const own = factsOf(src);
  const inherited = inheritsCsEvent(own?.superclass, classIndex);
  const ownsCsEvent = own?.csEvent || inherited !== false;
  const clientConstant = (value) => {
    const prefix = value.slice(0, value.search(/cs_event-/i)).toLowerCase();
    /* `<class>=>cs_event-x` is that class's constant: the client's only
     * when the class is the client interface itself. */
    const qualifier = prefix.match(/([\w/]+)=>$/)?.[1];
    if (qualifier) return qualifier === 'z2ui5_if_client';
    return !ownsCsEvent || !['', 'me->'].includes(prefix);
  };
  /* A frontend action raised as a BACKEND event. `cs_event-popup_close` and
   * its siblings name actions the frontend handles on its own (the popup slot
   * is torn down without a roundtrip); `_event( )` is the backend wire, so a
   * constant passed to it is a backend event named POPUP_CLOSE like any
   * other: it reaches main( ), falls through every CASE and closes nothing.
   * The guide (§6): "Not `_event( cs_event-popup_close )`: that is a backend
   * event named `POPUP_CLOSE` like any other, it reaches `main( )` and closes
   * nothing by itself." `event-without-handler` cannot see it - the name is
   * not a literal - so this is the one rule that sees the dead wire. The fix
   * is the rename to follow_up_action( ), whose first parameter is the same
   * `val`; a positional argument is given its name on the way, the way the
   * guide writes the call. */
  // `/\w*client\s*->\s*(_event)\s*\(/gi`, read word by word (lib/abap.mjs)
  for (const m of clientCalls(code, (method) => method === '_event')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    const val = marks.length ? marks.find((a) => a.name === 'val') : null;
    const value = marks.length ? val?.value : body.trim();
    const token = value?.match(CS_EVENT);
    if (!token || !clientConstant(value)) continue;
    const at = m.index + m[0].indexOf(m[1]);
    const fixes = [{ start: at, end: at + m[1].length, text: 'follow_up_action' }];
    if (!marks.length) {
      const lead = body.length - body.trimStart().length;
      fixes.push({ start: open + 1 + lead, end: open + 1 + lead, text: 'val = ' });
    }
    report({
      type: 'frontend-action-as-backend-event', member: token[1].toUpperCase(),
      value: value, offset: m.index, fixes,
    });
  }

  /* The mirror of popover-display-val: popup_display( ) imports VAL and the
   * popover XML, so an `xml =` on the popup does not compile either - and
   * nothing in a systemless pipeline says so before activation. The guide
   * (§6): "Mind the asymmetry: the popup takes its XML as `val`, the popover
   * as `xml` - one of the most common first-try mistakes." */
  /* On the CLIENT's popup_display( ) only, read like every other client
   * call here - `\bpopup_display\s*\(\s*xml =` matched an app's own
   * `my_popup_display( xml = … )` too - and the `xml` argument wherever it
   * stands among the named ones. */
  for (const m of clientCalls(code, (method) => method === 'popup_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const xml = namedArgMarks(body).find((a) => a.name === 'xml');
    if (!xml) continue;
    const start = open + 1 + xml.nameStart;
    report({
      type: 'popup-display-xml', member: 'xml', offset: m.index,
      fixes: [{ start, end: start + 3, text: 'val' }],
    });
  }

  /* The other half of a per-keystroke wire. `check_queue_last` keeps the
   * keystrokes from being lost (live-event-roundtrip's remedy), and on its
   * own it leaves the OVERLAY: the first roundtrip raises the busy indicator
   * after the usual delay, and every keystroke that lands on a roundtrip
   * already in flight raises it with no delay at all, because a dropped
   * click needs that feedback at once - so a live search flashes the overlay
   * over the very field being typed into from the second character on. The
   * interface: "Pair it with check_queue_last: nothing is lost and nothing
   * blinks." The guide (§5): "without it every keystroke landing on a
   * roundtrip in flight raises the overlay at once, over the very field being
   * typed into." Read the way live-event-roundtrip reads the wire - the
   * `n =`/`v =` of an attribute call, the plain client->_event( ) only - and
   * judged on the `s_ctrl = VALUE …( )` the call already carries; the fix
   * writes the missing flag into that constructor. */
  for (const m of src.matchAll(new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'gi'))) {
    const attrOpen = m.index + m[0].length - 1;
    const marks = namedArgMarks(parenRegion(src, attrOpen).body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg) continue;
    const name = nArg.value.match(/^[`'|](\w+)[`'|]$/);
    if (!name || !isLiveEvent(name[1])) continue;
    const ev = vArg.value.match(/^(?:me->)?\w*client->_event\s*\(/i);
    if (!ev) continue;
    const evOpen = attrOpen + 1 + vArg.vstart + ev[0].length - 1;
    const { body } = parenRegion(src, evOpen);
    if (body === undefined) continue;
    const ctrl = namedArgMarks(body).find((a) => a.name === 's_ctrl');
    const ctor = ctrl?.value.match(/^VALUE\s+(?:#|[\w=>]+)\s*\(/i);
    if (!ctor) continue;
    const inner = parenRegion(ctrl.value, ctor[0].length - 1).body;
    if (!/\bcheck_queue_last\s*=\s*abap_true\b/i.test(inner) || /\bcheck_no_busy\b/i.test(inner)) continue;
    const at = evOpen + 1 + ctrl.vstart + ctor[0].length + inner.trimEnd().length;
    report({
      type: 'queue-last-without-no-busy', member: name[1], offset: m.index,
      fixes: [{ start: at, end: at, text: ' check_no_busy = abap_true' }],
    });
  }

  /* A nested display with nothing clearing the anchor first. The interface
   * on `method_destroy`: "the mutator that removes the previous content first
   * (`removeAllContent`, `removeAllItems`); without it every call adds one
   * more fragment." The parameter is OPTIONAL, so the class compiles and the
   * first display looks right; the second one stacks a copy under the first.
   * Fixable where `method_insert` is one of the three mutators the same ABAP
   * Doc names, whose remover is known (NEST_DESTROY_BY_INSERT); any other
   * insert - a FlexibleColumnLayout's `addMidColumnPage`, a runtime value -
   * is reported without a fix. */
  for (const m of clientCalls(code, (method) => method === 'nest_view_display' || method === 'nest2_view_display')) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    if (marks.some((a) => a.name === 'method_destroy')) continue;
    const insert = marks.find((a) => a.name === 'method_insert');
    const literal = insert?.value.match(/^([`'])(\w+)\1$/);
    const destroy = literal ? NEST_DESTROY_BY_INSERT[literal[2].toLowerCase()] : null;
    const at = open + 1 + (insert?.vend ?? 0);
    report({
      type: 'nest-view-without-destroy', member: m[1].toLowerCase(), value: literal?.[2], offset: m.index,
      ...(destroy ? { fixes: [{ start: at, end: at, text: ` method_destroy = ${literal[1]}${destroy}${literal[1]}` }] } : {}),
    });
  }

  /* `omit_initial = abap_true` over a row that carries a boolean the view
   * binds to a property defaulting to TRUE. The interface on
   * omit_initial_paths: "an abap_false that MUST reach the client is itself
   * initial, so omit_initial would drop it and the control would fall back to
   * its own default - list the numeric/enum columns instead and leave the
   * booleans." The blanket flag is right for the numeric and enum columns it
   * was written for; the boolean is the one field whose INITIAL value is a
   * value. Two signals, both from what the entry point already derived: the
   * field is bound to a default-true boolean property (`boolFields`, the map
   * absent-boolean-overrides-default reads), and the class declares it with a
   * boolean type - a component of a DDIC type the class does not spell out
   * is not judged. No fix: which columns to list in omit_initial_paths is
   * the author's decision. */
  if (boolFields?.size) {
    for (const m of clientCalls(code, (method) => method === '_bind' || method === '_bind_edit')) {
      const open = m.index + m[0].length - 1;
      const { body } = parenRegion(src, open);
      if (body === undefined) continue;
      const marks = namedArgMarks(body);
      if (!marks.some((a) => a.name === 'omit_initial' && /^abap_true$/i.test(a.value))) continue;
      const table = marks.find((a) => a.name === 'val')?.value.match(/(\w+)$/)?.[1];
      const fields = table ? boolFields.get(table.toUpperCase()) : null;
      if (!fields?.size) continue;
      for (const field of [...fields].sort()) {
        if (!new RegExp(`\\b${field}\\s+TYPE\\s+(?:${BOOLEAN_TYPES})\\b`, 'i').test(src)) continue;
        report({ type: 'omit-initial-drops-false', member: field, value: table, offset: m.index });
      }
    }
  }
}
