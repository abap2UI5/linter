/*
 * ui5-meta — reading the UI5 metadata snapshot: whether a control is known,
 * what it is a kind of, which member it has, since when, whether a
 * deprecation applies at the target release. Moved out of properties.mjs so
 * the rules of scope 'node' (lib/rules/) can use the same readers the walk
 * does - an INTERNAL module: not in the package's exports map, so none of
 * this is public API. Nothing here imports a registry.
 */
import { majorMinor } from './abap.mjs';
import { CC_NAMESPACE } from './cc-controls.mjs';

export const parseVer = (s) => majorMinor(String(s));

/** Strictly older than: the form the layout rules need, where the boundary
 *  release is the first one that is FIXED rather than the last broken one. */
export const lt = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/* Controls that render a block-level <div> and are laid out only by a flex
 * parent — see toolbar-control-in-bar. Both live in sap.m and have no
 * subclasses; a list, not an inheritance test, for exactly that reason. */
export const TOOLBAR_ONLY = new Set(['sap.m.ToolbarSpacer', 'sap.m.ToolbarSeparator']);

export const withinFloor = (since, floor) => {
  const v = parseVer(since);
  if (!v) return true; // no/unparsable @since -> predates version tracking
  return v[0] < floor[0] || (v[0] === floor[0] && v[1] <= floor[1]);
};

// member since via the parent chain; null = unknown/old
export const MEMBER_SETS = ['properties', 'aggregations', 'associations', 'events'];

export function sinceOf(data, control, member) {
  // the control's OWN release: the ceiling every inherited verdict is held to
  // below; null when the control predates version tracking
  const own = parseVer(data[control]?.since);
  let c = control;
  for (let depth = 0; c && data[c] && depth < 15; depth++) {
    const meta = data[c];
    let since;
    if (meta.members[member] !== undefined) since = meta.members[member];
    /* No member-level @since here. That reads as "base version" only if the
     * class DECLARING the member is itself base — a member cannot predate the
     * class it is declared on. UI5 tags a member added LATER than its class
     * and leaves one that shipped WITH the class untagged. */
    else if (MEMBER_SETS.some((set) => meta[set] && member in meta[set])) since = meta.since ?? null;
    if (since === undefined) { c = meta.parent; continue; }
    /* …and the converse holds as well: a member cannot be YOUNGER than a
     * subclass that already carried it. UI5 extracts base classes out of
     * existing controls - sap.m.ListItemActionBase (@1.137) was cut out of the
     * @1.52 sap.m.FeedListItemAction, sap.f.cards.BaseHeader (@1.86) out of the
     * @1.64 Header, sap.m.Avatar (@1.73) took over the @1.46 sap.f.Avatar - and
     * the members that MOVE UP arrive untagged or tagged with the new class's
     * release, so a scan reads them as new. FeedListItemAction had `text` and
     * `icon` at 1.52 and Header had `press` at 1.64 (both checked in the
     * tagged sources), and 13 samples-controls sidecars carry this shape as a
     * by-policy declaration. So where the declaring class is younger than the
     * control, a member that SHIPPED with that class (no own @since, or one no
     * later than the class's) is clamped to the control's own release. A
     * member tagged later than the class it sits on was really added later and
     * keeps its date: it is new for the subclass too. */
    if (c !== control) {
      const declared = parseVer(meta.since);
      const found = parseVer(since);
      if (declared && (!own || lt(own, declared)) // the declaring class is younger than the control
          && (!found || !lt(declared, found)) // the member shipped with that class
          && (!own || (found && lt(own, found)))) { // and reads later than the control itself
        return data[control].since ?? null;
      }
    }
    return since;
  }
  return null;
}

/** Walk control + ancestors, yielding each entry that exists in the snapshot. */
export function* chain(data, control) {
  let c = control;
  for (let depth = 0; c && data[c] && depth < 15; depth++) {
    yield [c, data[c]];
    c = data[c].parent;
  }
}

/** Every member name the control and its parents declare in `sets` — the
 *  candidate list a did-you-mean is drawn from. */
export function memberNames(data, control, sets) {
  const names = new Set();
  for (const [, meta] of chain(data, control)) {
    for (const set of sets) for (const name of Object.keys(meta[set] || {})) names.add(name);
  }
  return names;
}

/** The declaration of a member across the parent chain, or null. `sets` names
 *  the metadata sections to look in. */
export function memberOf(data, control, member, sets) {
  for (const [, meta] of chain(data, control)) {
    for (const set of sets) {
      const decl = meta[set]?.[member];
      if (decl) return { set, decl };
    }
  }
  return null;
}

/* UI5's own root class - it declares no members, so a chain reaching it is
 * fully known even though the snapshot carries no entry for it. */
export const ROOT_CLASSES = new Set(['sap.ui.base.Object']);

/** Whether the control chain is fully known - only then can a missing member
 *  be reported. A chain ending in a control outside the snapshot (a custom
 *  base class, an unported library) might declare anything. */
export function chainComplete(data, control) {
  let c = control;
  for (let depth = 0; depth < 15; depth++) {
    if (ROOT_CLASSES.has(c)) return true;
    const meta = data[c];
    if (!meta) return false;
    if (!meta.parent) return true; // reached a root class
    c = meta.parent;
  }
  return false;
}

/** true when `control` is (or inherits/implements) `type`. */
export function isA(data, control, type) {
  for (const [name, meta] of chain(data, control)) {
    if (name === type) return true;
    if (meta.interfaces?.includes(type)) return true;
  }
  return false;
}

/** Whether the control (or an ancestor - a subclass inherits the method)
 *  overrides addAggregation( ): the harvest's `widensAggregation` flag, which
 *  says its declared aggregation types are not the whole truth about what it
 *  accepts. */
export function widensAggregation(data, control) {
  for (const [name, meta] of chain(data, control)) {
    /* ManagedObject is where addAggregation( ) is DEFINED, so a harvest that
     * reads its `prototype.addAggregation = function` records the flag on the
     * root of every chain - a definition is not an override, and honouring it
     * there would switch the check off for every control in UI5. */
    if (meta.widensAggregation && name !== 'sap.ui.base.ManagedObject') return true;
  }
  return false;
}

export const isBinding = (v) => /[{}]/.test(String(v));

/** A control whose `value` is a date/time string with a declarable pattern:
 *  it declares (or inherits) BOTH `value` and `valueFormat`. Derived from the
 *  snapshot rather than named, so the set is exactly sap.m.DateTimeField and
 *  its subclasses plus the TimePicker internals - and grows with them. */
export function isDateValueControl(data, control) {
  const declares = (m) => {
    for (const [, meta] of chain(data, control)) if (meta.properties?.[m]) return true;
    return false;
  };
  return declares('value') && declares('valueFormat');
}

/** The type named by a binding info, or null. Both key spellings occur in the
 *  corpus - `type: '…'` and the fully quoted `'type': '…'` - and a binding
 *  carrying either has a type object that owns the pattern. */
export const boundType = (value) => String(value)
  .match(/(?:^|[{,\s])'?type'?\s*:\s*'([^']+)'/)?.[1] ?? null;

/** The single ROOT field a binding addresses (`{/NAME}`, or a complex info
 *  whose only path is '/NAME'), uppercase and without the slash - or null.
 *  A nested path (`/MS_X/FIELD`), a relative one, a composite and an
 *  expression all return null: what the ABAP writes can only be attributed to
 *  a field the binding names outright. */
export function rootBindingPath(value) {
  const v = String(value).trim();
  const simple = v.match(/^\{\s*\/(\w+)\s*\}$/);
  if (simple) return simple[1].toUpperCase();
  const paths = [...v.matchAll(/'?path'?\s*:\s*'\/(\w+)'/g)].map((m) => m[1]);
  return paths.length === 1 ? paths[0].toUpperCase() : null;
}

/* Aggregations without which the control cannot render what it is asked to.
 * Deliberately tiny and certain: a sap.m.Table bound to rows but given no
 * columns shows an empty table, no error. */
/* The input families editable-control-without-binding judges, each with the
 * property (or properties) a binding has to reach for the value to travel.
 * Ordered most specific first, since a control is judged by its first base. */
export const INPUT_FAMILIES = [
  { base: 'sap.m.ComboBoxBase', props: ['selectedKey', 'selectedKeys', 'selectedItem', 'value'] },
  { base: 'sap.m.SearchField', props: ['value'] },
  { base: 'sap.m.InputBase', props: ['value', 'dateValue', 'selectedKey'] },
  { base: 'sap.m.CheckBox', props: ['selected'] },
  { base: 'sap.m.RadioButton', props: ['selected'] },
  { base: 'sap.m.Switch', props: ['state'] },
  { base: 'sap.m.Select', props: ['selectedKey', 'selectedItem'] },
  { base: 'sap.m.SegmentedButton', props: ['selectedKey', 'selectedItem'] },
  { base: 'sap.m.Slider', props: ['value', 'value2'] },
  { base: 'sap.m.RatingIndicator', props: ['value'] },
];

export const REQUIRED_WITH = [
  { control: 'sap.m.Table', when: 'items', needs: 'columns' },
  { control: 'sap.ui.table.Table', when: 'rows', needs: 'columns' },
];

/** Whether a deprecation is already in effect at the target version. The
 *  version usually sits in `since`; older entries only say it in the text
 *  ("since version 1.16, replaced by ..."). Without any version the
 *  deprecation predates version tracking and always applies. */
export function deprecationApplies(deprecated, floor) {
  const since = deprecationSince(deprecated);
  if (!since) return true;
  return withinFloor(since, floor);
}

/** The release a deprecation took effect, or undefined when the entry does
 *  not say - in `since`, or only in the text of the older entries. */
export function deprecationSince(deprecated) {
  return typeof deprecated === 'object'
    ? deprecated.since ?? String(deprecated.text || '').match(/since\s+version\s+([\d.]+)/i)?.[1]
    : String(deprecated).match(/since\s+version\s+([\d.]+)/i)?.[1];
}

/** Whether a deprecation that is NOT yet in effect at the target falls
 *  within the deprecation horizon (`deprecatedAt`) - the second, optional
 *  bound `deprecated-after-target` reports against. A deprecation with no
 *  version always applies at the target, so it never reaches this. */
export function deprecationWithinHorizon(deprecated, horizon) {
  if (!horizon) return false;
  const since = deprecationSince(deprecated);
  return Boolean(since) && withinFloor(since, horizon);
}

/** The replacement a deprecation text names, when the snapshot can date it:
 *  `{@link sap.m.IllustratedMessage}` (a control) or `{@link #event:press}` /
 *  `{@link #setEnableExport}` (a member of the same control). What it answers
 *  is the one question the finding cannot leave open on an old target: can
 *  the code move there NOW, or does the replacement need a newer release
 *  first? null when the text names nothing the snapshot knows - a namespace
 *  (`sap.m.p13n`), prose, or no replacement at all. */
export function replacementOf(data, control, deprecated) {
  const text = typeof deprecated === 'object' ? String(deprecated.text || '') : String(deprecated || '');
  for (const [, target] of text.matchAll(/\{@link\s+([^\s}]+)[^}]*\}/g)) {
    if (target.startsWith('#')) {
      const raw = target.slice(1).replace(/^(?:event|property|aggregation|association):/, '');
      const name = /^(?:set|get)[A-Z]/.test(raw) ? raw[3].toLowerCase() + raw.slice(4) : raw;
      if (!control || !memberOf(data, control, name, MEMBER_SETS)) continue;
      return { name: `${control}.${name}`, since: sinceOf(data, control, name) ?? null };
    }
    if (knownControl(data, target)) return { name: target, since: data[target].since ?? null };
  }
  return null;
}

export const knownControl = (data, control) => Boolean(data[control]);

/* Aggregation tags start lower-case; a name carrying its own prefix
 * (`core:Icon`, written that way by the builder instead of via ns) is a
 * control, never an aggregation. */
export const isAggregationTag = (name) => /^[a-z]/.test(name) && !name.includes(':');

/* The other reading of "no such member", and the one a typo hides.
 *
 * The snapshot is a PIN, so a member released after it does not exist here —
 * and it then reports in exactly the shape a typo has, which is what pushes a
 * consumer to switch the whole rule off (`DateTypeRange.ariaHasPopup` is
 * @since 1.152 against a 1.151 pin). The verdict cannot be split without
 * demoting every real typo with it, so the MESSAGE carries the second reading
 * instead, together with the surgical way out: `allow` already suppresses any
 * finding on one `Control.member`, which is the escape hatch this case wants
 * and the one nobody had been pointed at. */
export const snapshotHint = (f) => {
  if (!f.snapshot) return '';
  const allow = `"allow": ["${f.control}.${f.member}"] states that`;
  /* a companion control's metadata is the lib/cc-controls.mjs copy of the
   * abap2UI5 control over its UI5 base class: two pins, not one */
  return String(f.control).startsWith(`${CC_NAMESPACE}.`)
    ? ` (metadata: the linter's copy of the abap2UI5 control, over UI5 ${f.snapshot} — a member added after either reads exactly like this — ${allow})`
    : ` (metadata pinned at ${f.snapshot}: a member released after it reads exactly like this — ${allow})`;
};

/* The UI5 namespaces of native markup in an XML view. UI5 1.120 deprecated
 * both (XMLTemplateProcessor: "Using native HTML content in XMLViews is
 * deprecated", logged as a [FUTURE FATAL]); sap.ui.core.HTML, which exists
 * in every release this linter knows, is the replacement for markup. */
export const NATIVE_MARKUP = new Map([
  ['http://www.w3.org/1999/xhtml', 'XHTML'],
  ['http://www.w3.org/2000/svg', 'SVG'],
]);
export const NATIVE_MARKUP_DEPRECATED = '1.120';
