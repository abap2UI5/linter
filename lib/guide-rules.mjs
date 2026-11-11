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
const OWN_CS_EVENT = /\b(?:BEGIN\s+OF\s+cs_event\b|cs_event\s+(?:TYPE|LIKE)\b)/i;

/** The first `CLASS … DEFINITION` of a scrubbed source (in a .clas.abap the
 *  global class): its name and the superclass it names in `INHERITING FROM`,
 *  both folded to lower case, and whether the source declares a `cs_event`
 *  of its own. null for a source that defines no class. */
export function factsOf(src) {
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

