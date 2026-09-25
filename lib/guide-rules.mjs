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
import { parenRegion, namedArgMarks } from './abap.mjs';
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

/**
 * @param {string} src     the scrubbed source (comments blanked, literals kept)
 * @param {string} source  the raw source, which every fix span addresses
 * @param {object} ctx     `code` (src with literals blanked too - where a call
 *                         IS), `report`, the builder dialect `d` and the
 *                         `boolFields` map the entry point derives from the
 *                         reconstructed views (table -> row fields bound to a
 *                         boolean property whose default is true)
 */
export function checkGuideRules(src, source, { code, report, d, boolFields = null } = {}) {
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
  for (const m of code.matchAll(/\w*client\s*->\s*(_event)\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    const marks = namedArgMarks(body);
    const val = marks.length ? marks.find((a) => a.name === 'val') : null;
    const value = marks.length ? val?.value : body.trim();
    const token = value?.match(CS_EVENT);
    if (!token) continue;
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
  for (const m of code.matchAll(/popup_display\s*\(\s*(xml)\s*=/gid)) {
    const [start, end] = m.indices[1];
    report({
      type: 'popup-display-xml', member: 'xml', offset: m.index,
      fixes: [{ start, end, text: 'val' }],
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
  for (const m of code.matchAll(/\w*client\s*->\s*(nest2?_view_display)\s*\(/gi)) {
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
    for (const m of code.matchAll(/\w*client\s*->\s*_bind(?:_edit)?\s*\(/gi)) {
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
