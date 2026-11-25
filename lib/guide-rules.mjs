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
 * Each of them is a rule file of its own now (lib/rules/<id>.mjs, scope
 * 'app'), run at its place in checkAbapRules( ) with the scrubbed/raw pair
 * and the same report( ) every other rule takes - the entry point's
 * collector collapses repeats and the FIRST finding of a shape wins, so they
 * run after the rules they are neighbours of. What stays here is what they
 * and the rest of the linter share: the class facts and the class index
 * (factsOf, classIndexOf, inheritsCsEvent), CS_EVENT, the destroy method for
 * each nested insert, BOOLEAN_TYPES. Nothing here imports a registry.
 */
import { scrub, blankLiterals } from './abap.mjs';
import { declaredTypesOf, builderHelpersOf } from './reconstruct.mjs';
import { raisedEventLiterals, handledEventLiterals, eventCaseRegions } from './abap-helpers.mjs';
import { DYNAMIC_CALL } from './lifecycle-rules.mjs';

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

/** The ABAP types a boolean is declared with - a row component here, an
 *  attribute or local in abap-rules.mjs's `checkAbapBooleans( )`, whose
 *  `boolVars` feed manual-init-flag and lifecycle-is-initial too. ONE list, so
 *  `boole_d` and `xsdboolean` are booleans to every rule or to none. A
 *  component of a DDIC type the class does not spell out is not judged - a
 *  rule that cannot see the type would be guessing. */
export const BOOLEAN_TYPES = 'abap_bool|abap_boolean|xsdboolean|boolean|flag|xfeld|boole_d';

/** A `cs_event-<name>` constant, however the class reaches it:
 *  `client->cs_event-x`, `z2ui5_if_client=>cs_event-x`, `me->client->cs_event-x`
 *  or the bare `cs_event-x` of a class implementing the interface. */
export const CS_EVENT = /^(?:\w+(?:->|=>))*cs_event-(\w+)$/i;

/* A `cs_event` DECLARED here: the structure a CONSTANTS/TYPES/DATA
 * statement opens, or a component typed after another. */
/* An `INTERFACES` statement naming z2ui5_if_app, chained or not - the same
 * test as declaresApp( ) in check.mjs, read on code with literals blanked. */
const DECLARES_APP = /^[^\S\r\n]*INTERFACES\b[^.]*\bz2ui5_if_app\b/im;
const OWN_CS_EVENT = /\b(?:BEGIN\s+OF\s+cs_event\b|cs_event\s+(?:TYPE|LIKE)\b)/i;

/** The first `CLASS … DEFINITION` of a scrubbed source (in a .clas.abap the
 *  global class): its name and the superclass it names in `INHERITING FROM`,
 *  both folded to lower case, and whether the source declares a `cs_event`
 *  of its own. null for a source that defines no class. */
/* What a called app does with the screen, for nav-target-never-displays:
 * 'yes' when the class displays something or hands control on (a display,
 * a leave, a further call), 'unknown' when it gives its client to another
 * object or is not an app at all (that object may display), 'no' when it is
 * an app that does neither - after `nav_app_call( )` the browser keeps the
 * caller's view. */
const SHOWS_CALL = /\bclient\s*->\s*(?:view_display|popup_display|popover_display|nest_view_display|nest2_view_display|nav_app_leave|nav_app_call|_event_nav_app_leave|message_box_display|message_toast_display)\s*\(/i;
const CLIENT_HANDED = /(?:\(\s*(?:me->)?client\s*\)|=\s*(?:me->)?client\s*(?:\)|\b\w+\s*=))|\bclient\s*=\s*(?:me->)?client\b/i;
function showsOf(src) {
  const code = blankLiterals(src);
  if (!DECLARES_APP.test(code)) return 'unknown';
  // a method called by a runtime name may display - not decidable
  if (DYNAMIC_CALL.test(code)) return 'unknown';
  if (SHOWS_CALL.test(code)) return 'yes';
  if (CLIENT_HANDED.test(code)) return 'unknown';
  return 'no';
}

export function factsOf(src) {
  const m = src.match(/\bCLASS\s+([\w/]+)\s+DEFINITION\b(?!\s+(?:DEFERRED|LOAD)\b)([^.]*)/i);
  if (!m) return null;
  return {
    name: m[1].toLowerCase(),
    superclass: m[2].match(/\bINHERITING\s+FROM\s+([\w/]+)/i)?.[1].toLowerCase() ?? null,
    csEvent: OWN_CS_EVENT.test(src),
    shows: showsOf(src),
    app: DECLARES_APP.test(blankLiterals(src)),
    dynamicCall: DYNAMIC_CALL.test(blankLiterals(src)),
    // displays a popup or popover somewhere (missing-view-display-on-navigated)
    popup: /->\s*(?:popup_display|popover_display)\s*\(/i.test(blankLiterals(src)),
  };
}

/* An attribute reached through a reference: `->name` not followed by a `(`
 * (that is a method call). Read on code with literals blanked. */
const ARROW_READ = /->\s*(\w+)\b(?!\s*\()/g;
/* A variable typed as a class: `x TYPE REF TO cls` (a DATA, a parameter),
 * or an inline declaration from `CAST cls( )`, `NEW cls( )` or a static
 * call of the class (`cls=>factory( )`, the popup idiom). */
const TYPE_REF_TO = /\bTYPE\s+REF\s+TO\s+([\w/]+)/gi;
const INLINE_TYPED = /\bDATA\(\s*(\w+)\s*\)\s*=\s*(?:(?:CAST|NEW)\s+([\w/]+)\s*\(|([\w/]+)=>\w+\s*\()/gi;
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
  /* Driven by the keyword, not by TYPED_VAR's leading `(\w+)`: that one is
   * tried at every word of the class and was most of what building the
   * index cost (a third of a second over samples-controls, serially, before
   * the first file is judged). The name in front is read back from the
   * keyword, with TYPED_VAR's own boundary. */
  for (const m of code.matchAll(TYPE_REF_TO)) {
    const v = /(?<![\w-])(\w+)\s+$/.exec(code.slice(Math.max(0, m.index - 200), m.index));
    const cls = m[1].toLowerCase();
    if (v && cls !== own && known.has(cls)) vars.set(v[1].toLowerCase(), cls);
  }
  for (const m of code.matchAll(INLINE_TYPED)) {
    const cls = (m[2] ?? m[3]).toLowerCase();
    if (cls !== own && known.has(cls)) vars.set(m[1].toLowerCase(), cls);
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
 *  outsideReads, types }`, read from raw ABAP sources. `types` are the
 *  TYPES the class declares (declaredTypesOf), which a class typing a
 *  component `zcl_x=>ty_s_row` is resolved against (prepareAbap); an
 *  interface is indexed for them alone (`interface: true`). `frontend-action-as-backend-
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
    /* the TYPES it declares, for a class that borrows one (`TYPE
     * zcl_x=>ty_s_row`, deriveModel in reconstruct.mjs) - an interface is
     * indexed for its types alone */
    const types = /\bTYPES\b/i.test(src) ? declaredTypesOf(src) : null;
    if (facts && !index.has(facts.name)) index.set(facts.name, { superclass: facts.superclass, csEvent: facts.csEvent, shows: facts.shows, app: facts.app, dynamicCall: facts.dynamicCall, popup: facts.popup, events: eventFactsOf(src), builderHelpers: builderHelpersOf(src), outsideReads: new Set(), types });
    else if (!facts && types?.kind === 'interface' && !index.has(types.name)) {
      index.set(types.name, { superclass: null, csEvent: false, shows: null, app: false, dynamicCall: false, outsideReads: new Set(), types, interface: true });
    }
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
  // what each class it navigates to does with the screen (nav-target-never-displays)
  chain.push(navTargetsOf(String(source)).map((t) => [t, classIndex?.get(t)?.shows ?? null]));
  // the types it borrows from another class or interface of the run
  chain.push(borrowedTypesOf(String(source), classIndex));
  // the builder helpers of other classes it calls (replayed by prepareAbap)
  chain.push(calledBuilderHelpersOf(String(source), classIndex));
  // the events its family raises and handles (event-without-handler, handler-without-event)
  const rel = own ? relatedEvents(own.name, classIndex) : null;
  chain.push(rel ? [[...rel.handled].sort(), [...rel.raised].sort(), rel.dynamic] : null);
  for (let name = own?.superclass; name && name !== 'object' && !seen.has(name);) {
    seen.add(name);
    const facts = classIndex?.get(name) ?? null;
    chain.push(facts ? [name, facts.superclass, facts.csEvent, facts.app, facts.dynamicCall, facts.popup] : [name]);
    if (!facts) break;
    name = facts.superclass;
  }
  return JSON.stringify(chain);
}

/* The builder helpers (builderHelpersOf( )) of other classes of the index
 * that `source` calls as `owner=>method(`, as a stable list. */
function calledBuilderHelpersOf(source, classIndex) {
  if (!classIndex) return [];
  const out = [];
  for (const m of blankLiterals(scrub(source)).matchAll(/(?<![\w/])([\w/]+)\s*=>\s*(\w+)\s*\(/g)) {
    const h = classIndex.get(m[1].toLowerCase())?.builderHelpers?.get(m[2].toLowerCase());
    const key = `${m[1].toLowerCase()}=>${m[2].toLowerCase()}`;
    if (h && !out.some((o) => o[0] === key)) out.push([key, h.kind, h.chain ?? null, h.def?.body ?? null]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/* The declared types of every class or interface of the index that `source`
 * names a type of (`owner=>type`), as a stable list - what deriveModel copies
 * in. A whole owner, not the one type: the type may be built from others of
 * the same owner. */
function borrowedTypesOf(source, classIndex) {
  if (!classIndex) return [];
  const owners = new Set();
  for (const m of blankLiterals(scrub(source)).matchAll(/(?<![\w/])([\w/]+)\s*=>\s*\w+/g)) {
    const owner = m[1].toLowerCase();
    if (classIndex.get(owner)?.types) owners.add(owner);
  }
  return [...owners].sort().map((owner) => {
    const t = classIndex.get(owner).types;
    return [owner, [...t.structs].sort(), [...t.tables].sort(), [...t.open].sort(), [...(t.scalars ?? [])].sort()];
  });
}

/** The classes `source` hands to `nav_app_call( )` by name - a
 *  `cls=>factory( … )`, `NEW cls( … )` or `CAST … ( NEW cls( ) )` written as
 *  the argument - lower case, in order, each once. */
export function navTargetsOf(source) {
  const code = blankLiterals(scrub(String(source)));
  const out = [];
  for (const m of code.matchAll(/\bnav_app_call\s*\(\s*(?:app\s*=\s*)?(?:NEW\s+([\w/]+)\s*\(|([\w/]+)\s*=>\s*\w+\s*\()/gi)) {
    const name = (m[1] || m[2]).toLowerCase();
    if (name !== '#' && !out.includes(name)) out.push(name);
  }
  return out;
}

/* Anything that could raise or handle an event - a class without it has no
 * event facts worth computing. */
const EVENT_WORD = /_event\b|\bget_event\b|\bcheck_on_event\b|-event\b|onclose/i;

/** The events a class raises and handles by LITERAL name (upper case), and
 *  whether its handling is dynamic (a `check_on_event( lv_x )`, a `WHEN
 *  OTHERS` in the event CASE) - the facts event-without-handler and
 *  handler-without-event read off the OTHER classes of its family
 *  (relatedEvents( )). Null for a class that mentions no event. */
function eventFactsOf(src) {
  if (!EVENT_WORD.test(src)) return null;
  const raised = new Set(raisedEventLiterals(src).map((r) => r.name.toUpperCase()));
  for (const m of src.matchAll(/\bonclose\s*=\s*[`'|]([A-Z0-9_]+)[`'|]/gi)) raised.add(m[1].toUpperCase());
  for (const m of src.matchAll(/"onClose"\s*:\s*"(\w+)"/g)) raised.add(m[1].toUpperCase());
  const handled = new Set(handledEventLiterals(src).map((n) => n.toUpperCase()));
  const dynamic = /check_on_event\s*\(\s*(?:val\s*=\s*)?[a-z_]\w*[-\s)]/i.test(src)
    || eventCaseRegions(src).some((c) => /\bWHEN\s+OTHERS\b/i.test(c.body));
  return { raised, handled, dynamic };
}

/* Whether the class of this index entry is an app, own or inherited. */
const entryIsApp = (facts, classIndex) => Boolean(facts?.app) || inheritsApp(facts?.superclass, classIndex) === true;

/** The events the rest of a class's FAMILY raises and handles, for the two
 *  event rules: an app's handler often sits in its base class (one
 *  `on_event( )` dispatching for every subclass) or in a subclass
 *  redefining the hook, and its view is often built by a helper class that
 *  raises the events on its behalf. So:
 *
 *    family    the ancestors in the index, and every class of the index
 *              whose chain passes through this one (its descendants)
 *    an app    sees the family's handlers and raises, plus the raises of
 *              every class of the run that is no app (a view helper)
 *    no app    a helper building views for apps: sees the handlers of
 *              every app of the run
 *
 *  `dynamic` is true when one of the classes whose handlers count handles
 *  dynamically - then no handled set is knowable. Null without an index or
 *  for a class it does not hold. */
export function relatedEvents(name, classIndex) {
  const own = classIndex?.get(name);
  if (!own) return null;
  const handled = new Set();
  const raised = new Set();
  let dynamic = false;
  const add = (facts, { handlers = true, raises = true } = {}) => {
    const e = facts?.events;
    if (!e) return;
    if (handlers) { for (const n of e.handled) handled.add(n); dynamic ||= e.dynamic; }
    if (raises) for (const n of e.raised) raised.add(n);
  };
  const ancestors = new Set();
  for (let n = own.superclass; n && n !== 'object' && !ancestors.has(n);) {
    const facts = classIndex.get(n);
    if (!facts) break;
    ancestors.add(n);
    add(facts);
    n = facts.superclass;
  }
  const isApp = entryIsApp(own, classIndex);
  for (const [other, facts] of classIndex) {
    if (other === name || ancestors.has(other) || facts.interface) continue;
    const seen = new Set();
    let descendant = false;
    for (let n = facts.superclass; n && n !== 'object' && !seen.has(n);) {
      if (n === name) { descendant = true; break; }
      seen.add(n);
      n = classIndex.get(n)?.superclass;
    }
    if (descendant) add(facts);
    else if (isApp && !entryIsApp(facts, classIndex)) add(facts, { handlers: false });
    else if (!isApp && entryIsApp(facts, classIndex)) add(facts, { raises: false });
  }
  return { handled, raised, dynamic };
}

/** Whether a class with this superclass is an app by inheritance: true when
 *  an ancestor in the index implements z2ui5_if_app (`INTERFACES
 *  z2ui5_if_app`), false when the chain ends without one, null when it
 *  leaves the index - a superclass the run does not hold is not judged. */
export function inheritsApp(superclass, classIndex) {
  const seen = new Set();
  for (let name = superclass; name && name !== 'object';) {
    const facts = classIndex?.get(name);
    if (!facts || seen.has(name)) return null;
    if (facts.app) return true;
    seen.add(name);
    name = facts.superclass;
  }
  return false;
}

/** Whether the class `name` of the index - or an ancestor of it - may
 *  display a popup or popover: the app a navigated branch returns from may
 *  then have shown a dialog over the caller's view instead of a view of its
 *  own. False for a class the index does not hold. */
export function mayShowPopup(name, classIndex) {
  const seen = new Set();
  for (let n = name; n && n !== 'object' && !seen.has(n);) {
    const facts = classIndex?.get(n);
    if (!facts) return false;
    if (facts.popup) return true;
    seen.add(n);
    n = facts.superclass;
  }
  return false;
}

/** Whether an ancestor in the index calls a method by a runtime name
 *  (`CALL METHOD obj->(name)`, `CREATE OBJECT … TYPE (name)`) - what a
 *  subclass's re-display may go through. */
export function inheritsDynamicCall(superclass, classIndex) {
  const seen = new Set();
  for (let name = superclass; name && name !== 'object' && !seen.has(name);) {
    const facts = classIndex?.get(name);
    if (!facts) return false;
    if (facts.dynamicCall) return true;
    seen.add(name);
    name = facts.superclass;
  }
  return false;
}

/** Whether a class with this superclass inherits a `cs_event`: true when an
 *  ancestor in the index declares one, false when the chain ends (no
 *  superclass, or `object`) without one, null when it leaves the index. */
export function inheritsCsEvent(superclass, classIndex) {
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

