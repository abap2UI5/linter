/*
 * properties — the UI5 version/deprecation gate over a view's node tree.
 *
 * Generalized from abap2UI5/samples-controls scripts/property-check.mjs (the corpus
 * 1.71 property gate). Checks every control and every written attribute of a
 * reconstructed (or raw XML) view against data/properties.json — per control:
 * parent class, class-level @since/@deprecated, and every member with a JSDoc
 * @since, walking the parent chain.
 *
 * Findings:
 *   control-too-new      the control itself is newer than the floor
 *   control-deprecated   the control is deprecated in current UI5
 *   member-too-new       a written property/aggregation/association/event is
 *                        newer than the floor
 *   obsolete-custom-control  one of the abap2UI5 companion controls marked
 *                        `// OBSOLETE:` upstream (lib/cc-controls.mjs)
 *
 * Members without @since are older than version tracking and count as
 * always-available; controls absent from the snapshot are skipped (the
 * snapshot covers the OpenUI5 libraries it was generated from).
 */
import unknownBindingPath from './rules/unknown-binding-path.mjs';
import relativeAggregationWithoutContext from './rules/relative-aggregation-without-context.mjs';
import relativeBindingWithoutContext from './rules/relative-binding-without-context.mjs';
import unresolvedAttributeValue from './rules/unresolved-attribute-value.mjs';
import eventParameterTooNew from './rules/event-parameter-too-new.mjs';
import unknownEventParameter from './rules/unknown-event-parameter.mjs';
import memberTooNew from './rules/member-too-new.mjs';
import unknownProperty from './rules/unknown-property.mjs';
import bindingForEvent from './rules/binding-for-event.mjs';
import eventForProperty from './rules/event-for-property.mjs';
import collectionBoundToProperty from './rules/collection-bound-to-property.mjs';
import bindingTypeMismatch from './rules/binding-type-mismatch.mjs';
import uncuratedFormatter from './rules/uncurated-formatter.mjs';
import invalidExpressionBinding from './rules/invalid-expression-binding.mjs';
import bindingOnAssociation from './rules/binding-on-association.mjs';
import boundAggregationWithoutTemplate from './rules/bound-aggregation-without-template.mjs';
import associationUnknownId from './rules/association-unknown-id.mjs';
import unknownModel from './rules/unknown-model.mjs';
import jsonLiteralInAttribute from './rules/json-literal-in-attribute.mjs';
import dateTypeWithoutSource from './rules/date-type-without-source.mjs';
import memberDeprecated from './rules/member-deprecated.mjs';
import validatingSetterOutOfRange from './rules/validating-setter-out-of-range.mjs';
import enumBoundToInitialField from './rules/enum-bound-to-initial-field.mjs';
import jsonBindOnScalarProperty from './rules/json-bind-on-scalar-property.mjs';
import htmlContentNotMarkup from './rules/html-content-not-markup.mjs';
import nativeHtmlInView from './rules/native-html-in-view.mjs';
import undeclaredNamespace from './rules/undeclared-namespace.mjs';
import deprecatedLibrary from './rules/deprecated-library.mjs';
import sapui5OnlyControl from './rules/sapui5-only-control.mjs';
import unknownControl from './rules/unknown-control.mjs';
import aggregationInAggregation from './rules/aggregation-in-aggregation.mjs';
import aggregationTooNew from './rules/aggregation-too-new.mjs';
import unknownAggregation from './rules/unknown-aggregation.mjs';
import { isHrefAttr } from './view-document.mjs';
import secondRoot from './rules/second-root.mjs';
import unusedNamespaceDeclaration from './rules/unused-namespace-declaration.mjs';
import undefinedCssClass from './rules/undefined-css-class.mjs';
import externalLinkWithoutTarget from './rules/external-link-without-target.mjs';
import { NATIVE_MARKUP, chain, isAggregationTag, isBinding, knownControl, lt, memberOf, parseVer, withinFloor } from './ui5-meta.mjs';
import { runRule } from './rule.mjs';
import boundAggregationOverSizeLimit from './rules/bound-aggregation-over-size-limit.mjs';
import columnCellCountMismatch from './rules/column-cell-count-mismatch.mjs';
import controlDeprecated from './rules/control-deprecated.mjs';
import controlTooNew from './rules/control-too-new.mjs';
import duplicateAggregation from './rules/duplicate-aggregation.mjs';
import duplicateId from './rules/duplicate-id.mjs';
import editableControlWithoutBinding from './rules/editable-control-without-binding.mjs';
import eventOnDisabledControl from './rules/event-on-disabled-control.mjs';
import invalidAggregationChild from './rules/invalid-aggregation-child.mjs';
import missingAccessibility from './rules/missing-accessibility.mjs';
import missingRequiredAggregation from './rules/missing-required-aggregation.mjs';
import pickerValueWithoutFormat from './rules/picker-value-without-format.mjs';
import rowsHiddenByVisible from './rules/rows-hidden-by-visible.mjs';
import tooManyChildren from './rules/too-many-children.mjs';
import toolbarControlInBar from './rules/toolbar-control-in-bar.mjs';
import unknownSourceProperty from './rules/unknown-source-property.mjs';
import fs from 'fs';
import { caseMatch } from './suggest.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FORMATTER_MODULE } from './formatters.mjs';
import { CC_NAMESPACE, CC_METADATA, OBSOLETE_CC_CONTROLS } from './cc-controls.mjs';
import { skipWs } from './abap.mjs';
import { aggregationPath, bindingPath, relativePath } from './binding-paths.mjs';
import { walkTree } from './tree.mjs';

const DEFAULT_SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'properties.json');

/* Parsed once per path, not once per checked file: the snapshot is a 497 KB
 * JSON document and checkAbapSource/checkXmlSource load it per call - on a
 * corpus of a few hundred files the repeated parse was the bulk of the
 * property gate's time. The data is treated as immutable by every consumer. */
const snapshotCache = new Map();

/**
 * The snapshot as the gate reads it, from data/properties.json's CONTENT -
 * its text or the parsed object - rather than from a path: what a host
 * without a file system hands over (a browser bundle reading the file through
 * its own API). loadSnapshot( ) is this plus the read and the cache.
 * Returns the `controls` map with the side tables riding along on it.
 */
export function snapshotFromJson(json) {
  const raw = typeof json === 'string' ? JSON.parse(json) : json;
  // handed what this returned: it already carries its side tables
  if (raw && typeof raw === 'object' && Object.hasOwn(raw, '__enums')) return raw;
  if (!raw || typeof raw !== 'object' || !raw.controls || typeof raw.controls !== 'object') {
    throw new TypeError('not a UI5 metadata snapshot: no `controls` object (data/properties.json is the shape)');
  }
  // the same file's object a second time
  if (Object.hasOwn(raw.controls, '__enums')) return raw.controls;
  // the enum table and the snapshot's own UI5 version ride along on the
  // controls object so the (public) checkNodes signature stays one argument
  Object.defineProperty(raw.controls, '__enums', { value: raw.enums || {}, enumerable: false });
  // per-value @since where the enum's JSDoc carries one (additive — an older
  // snapshot without the key simply never reports enum-value-too-new)
  Object.defineProperty(raw.controls, '__enumSince', { value: raw.enumSince || {}, enumerable: false });
  /* runtime value -> the KEY an XML view has to write for it, for the eight
   * enums where the two differ (additive in the same way: without the section
   * every enum is judged as if key and value were the same string, which is
   * what this gate did before it existed) */
  Object.defineProperty(raw.controls, '__enumKeys', { value: raw.enumKeys || {}, enumerable: false });
  /* the regex of every string-based DataType whose isValid( ) is one test
   * (invalid-css-value), and the model types a binding may name
   * (unknown-binding-type, binding-type-too-new) - additive like the two
   * above: an older snapshot without them leaves those three rules silent */
  Object.defineProperty(raw.controls, '__typePatterns', { value: raw.typePatterns || {}, enumerable: false });
  Object.defineProperty(raw.controls, '__modelTypes', { value: raw.modelTypes || {}, enumerable: false });
  Object.defineProperty(raw.controls, '__ui5Version', { value: raw.ui5Version || null, enumerable: false });
  return raw.controls;
}

export function loadSnapshot(file = DEFAULT_SNAPSHOT) {
  const cached = snapshotCache.get(file);
  if (cached) return cached;
  /* The snapshot is the property gate's whole knowledge, and the two ways it
   * goes missing are both environment problems with an answer: a library
   * caller's `snapshot` option pointing at nothing (there is no CLI flag for
   * it), and an install that lost `data/properties.json`
   * (it ships in package.json's files[], so this means a partial copy). The
   * render gate already answers its missing dependencies with one actionable
   * line instead of a stack trace — this one now does too. */
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (cause) {
    const why = cause.code === 'ENOENT' ? 'is missing' : `cannot be read — ${cause.message}`;
    const e = new Error(`the UI5 metadata snapshot ${why}: ${file}\n`
      + '(it ships with the package; regenerate it with `npm run generate-metadata`, '
      + 'or run with --no-properties to use the render gate alone)');
    e.code = 'ERR_SNAPSHOT_MISSING';
    e.cause = cause;
    throw e;
  }
  const controls = snapshotFromJson(raw);
  snapshotCache.set(file, controls);
  return controls;
}

/** The UI5 version the metadata snapshot was generated from. Anything the
 *  target version has but this one does not simply cannot be checked. */
export function snapshotVersion(file = DEFAULT_SNAPSHOT) {
  try {
    // '' rather than null when unreadable: the context line interpolates it,
    // and the published typing promises a string
    return loadSnapshot(file).__ui5Version || '';
  } catch {
    return '';
  }
}


/** The same verdict for a caller that has a `minUi5` STRING rather than the
 *  parsed floor the tree walk carries — the ABAP-side rules, which never parse
 *  one. Exported so the wire rules judge a version exactly as the view rules
 *  do; a second implementation of "is this release within the floor" is how
 *  two gates come to disagree about the same number. */
export function withinUi5Floor(since, minUi5 = '1.71') {
  return withinFloor(since, parseVer(minUi5) || [1, 71]);
}


/** Values UI5 accepts for a primitive property type, or null when the type
 *  is free-form (string, CSSSize, URI, ...). */
function primitiveValues(type) {
  if (type === 'boolean') return ['true', 'false'];
  return null;
}

const isNumericType = (t) => t === 'int' || t === 'float';
/* DataType's `int`/`float` parseValue: "" is NaN (valid for both), anything
 * else goes through Number( ) - an int has to come out an integer, a float a
 * number. */
const numericValueValid = (type, text) => {
  if (text === '') return true;
  const n = Number(text);
  return type === 'int' ? Number.isInteger(n) : !Number.isNaN(n);
};

/* The CSS-valued DataTypes invalid-css-value judges, each with the shape of
 * value it wants in the message. UI5 checks every one of them with ONE regex
 * (the snapshot's `typePatterns`, harvested from library.js), and the five
 * regexes are byte-identical from 1.71.81 to the pinned release - read in
 * both sap.ui.core packages - so a value they refuse is refused on every
 * release the floor allows. The other pattern types the snapshot carries
 * (GridSpan, Dock, …) are not CSS and not judged here. */
const CSS_TYPES = new Map([
  ['sap.ui.core.CSSSize', 'a number with a unit (100px, 6rem, 50%, 10vw), auto, inherit or a calc( ) with blanks around + and -'],
  ['sap.ui.core.AbsoluteCSSSize', 'a number with an absolute unit (100px, 6rem) or a calc( ) - no %, no auto'],
  ['sap.ui.core.CSSSizeShortHand', 'one to four sizes separated by single blanks (px, em, %, … - rem is not among them), auto or inherit'],
  ['sap.ui.core.CSSColor', 'a hex colour (#fff, #ffffff), rgb( )/rgba( )/hsl( )/hsla( ), transparent or a LOWER-CASE colour name'],
  ['sap.ui.core.Percentage', 'a number followed by % (50%)'],
]);

/* One compiled RegExp per pattern source, shared by every walk: the snapshot
 * is immutable and parsed once per path, so its patterns are too. */
const typePatternCache = new Map();
function typePattern(data, type) {
  const src = data?.__typePatterns?.[type];
  if (!src) return null;
  let re = typePatternCache.get(src);
  if (!re) {
    try { re = new RegExp(src); } catch { re = null; }
    typePatternCache.set(src, re);
  }
  return re;
}

/* The repairs of a refused CSS value that are mechanical rather than a guess,
 * tried in order; the first the type accepts is the suggestion. A bare number
 * has none on purpose - px, rem and % are three different layouts. */
function cssValueRepair(value, re) {
  const v = String(value);
  const candidates = [
    v.trim(),
    v.trim().replace(/(\d)\s+(?=[a-z%])/gi, '$1'),
    v.trim().toLowerCase(),
  ];
  return candidates.find((c) => c !== v && c !== '' && re.test(c)) ?? null;
}

/* The two namespaces whose model types the snapshot lists completely
 * (`modelTypes`, both directories of the sap.ui.core package). A type name
 * outside them - an app's own, a controller-relative `.MyType`, a
 * core:require alias - is somebody else's, and not judged. */
const MODEL_TYPE_NS = /^sap\.ui\.model\.(?:odata\.)?type\.[\w$]+$/;


/* The snapshot with the companion-control mirrors of lib/cc-controls.mjs
 * layered over it (CC_METADATA): `z2ui5.cc.InputExt` becomes a control whose
 * parent is sap.m.Input, so the walk judges its attributes exactly as it
 * judges an Input's. Built once per snapshot object and kept, like the
 * snapshot itself; the non-enumerable riders (`__enums` & co.) come along. A
 * snapshot that carries the entries already is returned as it is. */
const withCcCache = new WeakMap();
function withCompanionControls(data) {
  if (!data || typeof data !== 'object') return data;
  if (Object.keys(CC_METADATA).every((k) => data[k] === CC_METADATA[k])) return data;
  let out = withCcCache.get(data);
  if (out) return out;
  out = Object.assign({}, data, CC_METADATA);
  for (const key of Object.getOwnPropertyNames(data)) {
    if (!Object.prototype.propertyIsEnumerable.call(data, key)) {
      Object.defineProperty(out, key, { value: data[key], enumerable: false });
    }
  }
  withCcCache.set(data, out);
  return out;
}

/* The namespace map in scope at every node of a tree: an element's own xmlns
 * declarations over its parent's, the way XML scopes them - a declaration on
 * an inner element (`<VBox xmlns="sap.ui.layout.form">`, a fragment root
 * nested in a view) binds that element and its subtree, not its siblings or
 * the elements above it. Read from one document-wide map, an inner default
 * namespace re-resolved every unprefixed tag of the view (a Page above it
 * became sap.ui.layout.form.Page, an unknown control), and a prefix declared
 * in one subtree passed as declared in another, where the browser's parser
 * refuses it. A null-prototype chain, so `prefix in map` sees exactly the
 * declarations in scope. */
const NO_NAMESPACES = Object.freeze(Object.create(null));
function namespaceScopes(root) {
  const scopes = new Map();
  walkTree((walk, node, inScope) => {
    let map = inScope;
    if (node.name !== null) {
      const own = nsMapOf(node.attrs || []);
      if (Object.keys(own).length) map = Object.assign(Object.create(inScope), own);
    } else {
      /* The reconstruction's document wrapper. A second top-level element is
       * a split chain re-rooted (`second-root`, reported on its own), and it
       * is judged with what the first root declares - one scope for the
       * top level, as every declaration was before. */
      const top = {};
      for (const c of node.children || []) if (c.name !== null) Object.assign(top, nsMapOf(c.attrs || []));
      if (Object.keys(top).length) map = Object.assign(Object.create(inScope), top);
    }
    scopes.set(node, map);
    for (const c of node.children || []) walk(c, map);
  }, root, NO_NAMESPACES);
  return (node) => scopes.get(node) ?? NO_NAMESPACES;
}

// xmlns prefix map from the root node's attributes; '' = default namespace
function nsMapOf(rootAttrs) {
  const map = {};
  for (const [n, v] of rootAttrs) {
    /* An XML prefix is an NCName, so a dot and a hyphen are legal in it -
     * `xmlns:viz.data` / `xmlns:viz.feeds` are what the sap.viz controls are
     * written with, and \w alone read those declarations as absent and then
     * reported every use of them as undeclared-namespace. */
    const m = n.match(/^xmlns(?::([\w.-]+))?$/);
    if (m) map[m[1] || ''] = v;
  }
  return map;
}


/*
 * Walk one node tree (shape: { name, ns, attrs: [[n, v]], children }, root
 * name === null for the document wrapper). Returns findings.
 */
/* id -> resolved control name, for every control in the tree that carries a
 * literal id. The ABAP-side rules need it: a `CONTROL_BY_ID` wire names an id,
 * and what may be done to that control depends on its TYPE.
 * -> { messageView: 'sap.m.MessageView', … } */
/* Every literal `id` in the tree as a Set - or null the moment one id is a
 * binding or was dropped by the reconstructor, because a set with a hole in
 * it would report a correct association as unknown. */
function literalIdSet(root) {
  const ids = new Set();
  let trusted = true;
  walkTree((walk, node) => {
    if (node.name !== null) {
      if (node.unresolvedAttrs?.has('id')) trusted = false;
      const id = node.attrs.find(([n]) => n === 'id')?.[1];
      if (id !== undefined) {
        if (/[{}]/.test(String(id))) trusted = false;
        else ids.add(String(id));
      }
    }
    for (const c of node.children) walk(c);
  }, root);
  return trusted ? ids : null;
}

export function collectControlIds(root) {
  const nsOf = namespaceScopes(root);
  const out = {};
  walkTree((walk, node) => {
    if (node.name !== null && !isAggregationTag(node.name)) {
      let { ns, name } = node;
      const inName = String(name).indexOf(':');
      if (inName > 0) { ns = name.slice(0, inName); name = name.slice(inName + 1); }
      const lib = nsOf(node)[ns || ''] || null;
      const id = node.attrs.find(([n]) => n === 'id')?.[1];
      if (lib && id && !/[{}]/.test(id)) out[id] = `${lib}.${name}`;
    }
    for (const c of node.children) walk(c);
  }, root);
  return out;
}

/** The page ids of every container in one view tree: control id -> the
 *  literal ids of the CONTROLS directly inside it (through its aggregation
 *  tags, never deeper into a child control). What a navigation call on a
 *  NavContainer, a SplitApp or a FlexibleColumnLayout can move to - and what
 *  navigation-lost-on-rebuild holds a surviving bound field against. */
export function collectContainerPages(root) {
  const out = {};
  const idOf = (node) => {
    const id = node.attrs.find(([n]) => n === 'id')?.[1];
    return id && !/[{}]/.test(id) ? id : null;
  };
  walkTree((walk, node) => {
    const isControl = node.name !== null && !isAggregationTag(node.name);
    const own = isControl ? idOf(node) : null;
    if (own) {
      const pages = [];
      // through the aggregation tags, never into a child control
      walkTree((children, n, top) => {
        if (!top) {
          if (n.name === null) return;
          if (!isAggregationTag(n.name)) {
            if (idOf(n)) pages.push(idOf(n));
            return;
          }
        }
        for (const c of n.children) children(c, false);
      }, node, true);
      if (pages.length) out[own] = pages;
    }
    for (const c of node.children) walk(c);
  }, root);
  return out;
}

/*
 * The ABAP field names that feed an ENUM-typed property, from one view tree.
 *
 * An ABAP field is never absent: an unset one reaches the client as `""`,
 * which is not a member of any enum, so `validateProperty` throws and
 * `ManagedObjectBindingSupport` re-throws it — the binding update dies and
 * takes the view with it. Knowing which fields are exposed that way is what
 * lets the ABAP side judge a row built without them.
 *
 * Only a SIMPLE `{FIELD}` binding is collected. An expression binding carries
 * its own fallback (`{= ${X} || null }` is the documented escape) and a
 * composite has no single field to blame.
 *
 * Keyed on the bound aggregation's PATH, which is the ABAP field name of the
 * table behind it — absolute (`{/T_PAGES}`, what `_bind( )` writes) and
 * relative (`{path: 'T_APPOINTMENTS'}`, a table nested one row deeper) alike.
 * A nested aggregation is the norm in this corpus, not an edge: a
 * PlanningCalendarRow's `appointments`, a QuickViewPage's `groups`. Dropping
 * the relative ones left every `INSERT … INTO TABLE <row>-t_appointments`
 * resolving to a key that did not exist.
 *
 * Each key gets ONLY the fields of its OWN row template. Walking the whole
 * subtree under one bound aggregation and pooling it would hand a
 * PlanningCalendar's `specialDates` the `ariaHasPopup` of the
 * CalendarAppointment two levels below it, and then report every correct
 * DateTypeRange seed as missing an ARIA it has no business carrying.
 */
/** The predicate collectEnumBoundFields uses when the caller names none: a
 *  property whose type is one of the snapshot's enums. An ABAP field is never
 *  absent, so an unseeded one ships `""`, which is a member of no enum. */
export const ENUM_TYPED = (decl, enums) => Boolean(decl?.type && enums[decl.type]);

/** The BOOLEAN counterpart, and the reason it is a separate predicate rather
 *  than a widening of the one above: an unseeded boolean ships a real `false`,
 *  which is perfectly legal — it is only WRONG where the property's own
 *  default is `true`, because then the row silently renders the opposite of
 *  what it meant. `defaultValue` is in the snapshot for this one question. */
export const DEFAULT_TRUE_BOOLEAN = (decl) => decl?.type === 'boolean' && decl.defaultValue === true;

/* The path of an aggregation binding - `{/T_PAGES}` or `{ path: 'T_X', … }` -
 * as written, or null: what group 1 or 2 of
 * `/^\{\s*(?:path\s*:\s*'([^']*)'|([^{},:]*?))\s*(?:,[\s\S]*)?\}$/` held.
 * Read by hand, because that regex offered every blank after the path to both
 * the lazy path and the `\s*` behind it. After the path come blanks and then
 * the closing brace or the `,` of the rest of the binding info; a path that
 * is not `path: '…'` is the SHORTEST run without `{`, `}`, `,` or `:` that
 * reaches such an end. */
function aggregationBindingPath(v) {
  const last = v.length - 1;
  if (v[0] !== '{' || v[last] !== '}') return null;
  const endsAt = (at) => v[at] === ',' || at === last;
  const start = skipWs(v, 1);
  if (v.startsWith('path', start)) {
    const colon = skipWs(v, start + 4);
    const open = v[colon] === ':' ? skipWs(v, colon + 1) : -1;
    const close = open >= 0 && v[open] === "'" ? v.indexOf("'", open + 1) : -1;
    if (close >= 0 && endsAt(skipWs(v, close + 1))) return v.slice(open + 1, close);
  }
  for (let at = start; ;) {
    const next = skipWs(v, at);
    if (endsAt(next)) return v.slice(start, at);
    if (next > last || '{},:'.includes(v[next])) return null;
    at = next + 1;
  }
}

export function collectEnumBoundFields(root, data, select = ENUM_TYPED) {
  const enums = data?.__enums || {};
  const nsOf = namespaceScopes(root);

  const controlOf = (node) => {
    let { ns, name } = node;
    const inName = String(name).indexOf(':');
    if (inName > 0) { ns = name.slice(0, inName); name = name.slice(inName + 1); }
    const lib = nsOf(node)[ns || ''] || null;
    return lib ? `${lib}.${name}` : null;
  };

  /* The local aggregation name an aggregation TAG stands for - `<appointments>`
   * and `<f:content>` alike. */
  const aggTagName = (node) => {
    const name = String(node.name);
    const inName = name.indexOf(':');
    return (inName > 0 ? name.slice(inName + 1) : name).toLowerCase();
  };

  /* The table an aggregation binding names, or null. `{/T_PAGES}` and
   * `{ path: 'T_APPOINTMENTS', templateShareable: false }` both resolve to the
   * ABAP field; a NAMED model (`message>/`) is somebody else's data and a
   * multi-segment path keeps only its last segment, which is the table. */
  const aggPathOf = (value) => {
    const raw = (aggregationBindingPath(String(value).trim()) ?? '').trim();
    if (!raw || raw.includes('>') || raw.includes('$')) return null;
    const seg = raw.split('/').filter(Boolean).pop();
    return /^[A-Za-z_]\w*$/.test(seg || '') ? seg.toUpperCase() : null;
  };

  /* table name -> the enum-typed row fields ITS OWN template binds. Keyed on
   * the ABAP table so an INSERT into an unrelated table is not judged
   * against it. */
  const byTable = new Map();
  const add = (table, field) => {
    const prev = byTable.get(table) ?? new Set();
    prev.add(field);
    byTable.set(table, prev);
  };

  /* One walk, carrying the table whose ROW this node is part of. A control's
   * own properties belong to the scope it sits in; only the children filling
   * a BOUND aggregation open a new one. */
  walkTree((walk, node, scope) => {
    const control = node.name !== null && !isAggregationTag(node.name) ? controlOf(node) : null;
    /* aggregation (lowercased) -> the table it is bound to, for this node */
    const bound = new Map();
    if (control) {
      for (const [attr, value] of node.attrs) {
        if (typeof value !== 'string') continue;
        if (memberOf(data, control, attr, ['aggregations'])) {
          const table = aggPathOf(value);
          if (table) bound.set(attr.toLowerCase(), table);
          continue;
        }
        /* A relative {FIELD} on an enum-typed property is a ROW field of the
         * scope this node sits in. An absolute {/FIELD} is a root field,
         * seeded once in model_init and never built by an INSERT.
         *
         * UPPERCASE only, the same shape the aggregation paths are read in: an
         * abap2UI5 model carries the ABAP component names, and those arrive
         * uppercased. A mixed-case path is not a field of the row at all —
         * apps 012 and 094 port the demo kit's own `type="{Text}"` verbatim,
         * where the sample meant the literal enum value and wrote a binding.
         * That resolves to nothing, so UI5 falls back to the default and the
         * view is fine; reading it as a field would report the port for
         * omitting a key it never had. */
        if (!scope) continue;
        const m = value.trim().match(/^\{([A-Z_][A-Z0-9_]*)\}$/);
        if (!m) continue;
        const decl = propertyDecl(data, control, attr);
        if (select(decl, enums)) add(scope, m[1].toUpperCase());
      }
    }
    const defAgg = control
      ? [...chain(data, control)].map(([, m]) => m.defaultAggregation).find(Boolean)
      : null;
    for (const c of node.children) {
      /* which aggregation of THIS node the child fills - its own tag when it
       * is an aggregation tag, the default aggregation otherwise. An
       * aggregation tag's own children inherit the scope the tag opened. */
      const agg = c.name !== null && isAggregationTag(c.name)
        ? aggTagName(c)
        : String(defAgg || '').toLowerCase();
      walk(c, bound.get(agg) ?? scope);
    }
  }, root, null);
  return byTable;
}


/* A per-ROW template aggregation. UI5 clones the control inside it once per
 * row and gives the clone the row's binding context, which is set by the
 * parent's own rows/items binding in a SIBLING aggregation this walk never
 * descends into - so a relative path inside one is the normal, correct form
 * and none of the "no context here" rules may fire on it. In the 1.151
 * snapshot the whole set is `template`, `creationTemplate`,
 * `rowActionTemplate`, `rowSettingsTemplate` and the private `_template`. */
const ROW_TEMPLATE_AGG = /template$/i;

/* A binding context whose SHAPE is unknown - "a row is set here, and this gate
 * does not claim to know its fields". `pathProblem` already answers null for it
 * (the `__unknownShape` marker the reconstructor uses for a DDIC structure),
 * so the context rules go quiet and the existence rules do not start guessing. */
const OPAQUE_ROW = Object.defineProperty({}, '__unknownShape', { value: true });


/*
 * A structural profile of one view tree: what the run actually LOOKED at.
 *
 * Not a gate — no metadata is consulted, nothing can fail here, and the cost
 * is one walk over a tree the gate already built. It exists because a clean
 * corpus otherwise reports three lines: "148 files, no findings" says nothing
 * about whether 3 000 controls were judged or the reconstruction quietly
 * produced empty views. `types` carries the per-control-name counts, so the
 * run summary can name what a corpus is actually built from.
 */
export function profileTree(root) {
  const nsOf = namespaceScopes(root);
  const out = { controls: 0, aggregations: 0, attributes: 0, bindings: 0, icons: 0, depth: 0, types: {} };
  walkTree((walk, node, depth) => {
    if (node.name !== null) {
      if (isAggregationTag(node.name)) out.aggregations++;
      else {
        out.controls++;
        let { ns, name } = node;
        const inName = String(name).indexOf(':');
        if (inName > 0) { ns = name.slice(0, inName); name = name.slice(inName + 1); }
        const lib = nsOf(node)[ns || ''] || null;
        const full = lib ? `${lib}.${name}` : name;
        out.types[full] = (out.types[full] || 0) + 1;
      }
      out.attributes += node.attrs.length;
      for (const [, value] of node.attrs) {
        /* a `{` with a `}` after it on the same line - what `/\{.*\}/` asked,
         * which ran on to the end of the line from every `{` of it: the
         * nearest such pair has no brace between them */
        if (/\{[^{}\n\r\u2028\u2029]*\}/.test(value)) out.bindings++;
        if (value.includes('sap-icon://')) out.icons++;
      }
      if (depth > out.depth) out.depth = depth;
    }
    for (const c of node.children) walk(c, depth + 1);
  }, root, 0);
  return out;
}

/** The declaration of a PROPERTY across the parent chain, or null — the type
 *  decides whether a value can travel in a JSON model at all. */
export function propertyDecl(data, control, member) {
  return memberOf(data, control, member, ['properties'])?.decl || null;
}

/** Which metadata section declares `member` on `control` (walking the parent
 *  chain), or null: 'properties' | 'aggregations' | 'associations' | 'events'. */
export function memberSection(data, control, member) {
  return memberOf(data, control, member, ['properties', 'aggregations', 'associations', 'events'])?.set || null;
}

/* Libraries a snapshot actually covers, derived ONCE per snapshot object: the
 * key walk over ~1000 controls used to run again for every document checked.
 * Keyed on the data object itself, so a consumer loading a second snapshot
 * gets its own set and nothing here has to know about cache invalidation. */
const knownLibsCache = new WeakMap();
function knownLibsOf(data) {
  let libs = knownLibsCache.get(data);
  if (libs) return libs;
  libs = new Set();
  for (const key of Object.keys(data)) {
    // only real UI5 namespaces - JSDoc examples in the sources leave
    // artefacts like `sample.Foo`, and treating those as known libraries
    // would turn every other `sample.*` tag into a bogus finding
    if (key.startsWith('sap.')) libs.add(key.slice(0, key.lastIndexOf('.')));
  }
  knownLibsCache.set(data, libs);
  return libs;
}

/* Attributes the XML view framework itself handles, on every control -
 * they are not declared in any control's metadata. Plus namespace
 * declarations and anything in a foreign namespace (custom data,
 * core:require, template instructions). */
const SPECIAL_ATTRS = new Set([
  'id', 'class', 'binding', 'models', 'objectBindings', 'stashed', 'require',
]);
const isFrameworkAttr = (attr) =>
  /^xmlns(:|$)/.test(attr) || SPECIAL_ATTRS.has(attr) || attr.includes(':');

/* Scoped to the UI5 resource trees on purpose. A relative path is only
 * WRONG when it addresses something the app does not serve, and a project
 * that ships its own ICF resources may legitimately write one - so this
 * matches the two demo-kit shapes that are always broken and nothing else.
 * `sap-icon://`, `data:`, `http(s)://` and protocol-relative `//host/` all
 * fail it by construction. */
const RELATIVE_ASSET_RE = /^(?:\.\.?\/)*(?:test-resources|resources\/sap)\//;

/* Three reads of a binding string, by hand where a regex backtracked
 * polynomially (CodeQL js/polynomial-redos). Each says the regex it stands
 * for; blanks are skipped with abap.mjs's skipWs( ), as elsewhere. */

/* Every `name: 'module'` pair of a core:require value as [name, module] -
 * `/([\w$]+)\s*:\s*'([^']+)'/g`, whose name restarted inside every long run
 * of name characters that no `:` follows. A name is a whole run. */
function requireAliases(text) {
  const pairs = [];
  let from = 0;
  for (const name of text.matchAll(/[\w$]+/g)) {
    if (name.index < from) continue;
    const colon = skipWs(text, name.index + name[0].length);
    if (text[colon] !== ':') continue;
    const open = skipWs(text, colon + 1);
    if (text[open] !== "'") continue;
    const close = text.indexOf("'", open + 1);
    if (close <= open + 1) continue; // unterminated, or '' - the module needs a character
    pairs.push([name[0], text.slice(open + 1, close)]);
    from = close + 1;
  }
  return pairs;
}


/*
 * The rule ids ONLY the property walk (checkNodes) emits - the ones that do
 * not run at all when a caller switches the property gate off
 * (`properties: false`, `--no-properties`). A directive naming one of them is
 * then unjudged rather than unused. `npm test` keeps the list equal to the
 * ids this file emits and no other module does.
 */
export const WALK_ONLY_RULES = Object.freeze(new Set([
  'aggregation-in-aggregation', 'aggregation-too-new', 'association-unknown-id', 'binding-for-event',
  'binding-on-association', 'binding-type-mismatch', 'binding-type-too-new', 'bound-aggregation-over-size-limit', 'bound-aggregation-without-template',
  'collection-bound-to-property', 'column-cell-count-mismatch', 'control-deprecated', 'control-too-new',
  'date-type-without-source', 'deprecated-library', 'duplicate-aggregation', 'duplicate-id',
  'deprecated-after-target', 'editable-control-without-binding', 'enum-bound-to-initial-field', 'enum-value-too-new', 'event-for-property', 'event-on-disabled-control',
  'event-parameter-too-new', 'external-link-without-target', 'html-content-not-markup', 'insecure-asset-url', 'invalid-aggregation-child',
  'invalid-css-value', 'invalid-expression-binding', 'invalid-property-value', 'json-bind-on-scalar-property',
  'json-literal-in-attribute', 'malformed-xml', 'member-deprecated', 'member-too-new', 'missing-accessibility',
  'missing-required-aggregation', 'native-html-in-view', 'picker-value-without-format', 'relative-aggregation-without-context',
  'relative-asset-url', 'relative-binding-without-context', 'rows-hidden-by-visible', 'sapui5-only-control', 'second-root',
  'too-many-children', 'toolbar-control-in-bar', 'uncurated-formatter', 'undeclared-namespace',
  'undefined-css-class', 'unknown-aggregation', 'unknown-binding-path', 'unknown-control',
  'unknown-binding-type', 'unknown-event-parameter', 'unknown-model', 'unknown-property', 'unknown-source-property',
  'unresolved-attribute-value', 'unused-namespace-declaration', 'validating-setter-out-of-range',
]));

/** Whether a markup string carries an inline event handler: an `on…=`
 *  attribute inside one of its tags. Read tag by tag, so prose that merely
 *  says "onclick=" outside a tag is not one. */
function hasInlineHandler(text) {
  if (!text.includes('<')) return false;
  for (const tag of text.matchAll(/<[a-z][^<>]*>/gi)) {
    if (/\son[a-z]+\s*=/i.test(tag[0])) return true;
  }
  return false;
}

export function checkNodes(root, { data: snapshot, minUi5 = '1.71', deprecatedAt = null, allow = [], distribution = null, model = null, shape = null, rootFields = null, rootWrites = null, models = null, jsonPaths = null, initialFields = null, sizeLimitRaised = null, seededRows = null, fromAbap = false, boundElement = false, tally = null, timings = null } = {}) {
  // the companion controls lib/cc-controls.mjs mirrors are judged like any
  // control; every other tag in a foreign namespace stays out of scope
  const data = withCompanionControls(snapshot);
  /* Binding paths are judged against the SHAPE when the caller has one (all
   * declared fields), and against the render model otherwise. The two differ
   * exactly where a field is filled in code rather than by a literal seed. */
  const bindings = shape || model;
  const floor = parseVer(minUi5) || [1, 71];
  /* The deprecation horizon (`deprecatedAt`): a second bound for the ONE
   * question the floor answers badly. The floor decides what exists on the
   * target, and a deprecation counts there only once it is in effect - right
   * for "will this break", silent about "is this legacy". A horizon past the
   * floor reports what was deprecated between the two as
   * `deprecated-after-target`, and nothing else moves: the too-new rules keep
   * judging against the floor. A horizon at or below the floor adds nothing. */
  const horizon = deprecatedAt ? parseVer(deprecatedAt) : null;
  /* deprecated-after-target, with what it takes to act on it: the
   * replacement the deprecation names and whether the TARGET has it yet. A
   * replacement newer than the floor is the case the hint must not hide -
   * the deprecated code stays until the floor is raised. */
  const reportAfterTarget = (f, replacement) => report({
    type: 'deprecated-after-target', minUi5, deprecatedAt, ...f,
    ...(replacement ? {
      replacement: replacement.name,
      replacementSince: replacement.since,
      replacementAvailable: !replacement.since || withinFloor(replacement.since, floor),
    } : {}),
  });
  // native markup is judged once per island: its outermost element
  const insideNative = new WeakSet();
  const allowed = new Set(allow.map((a) => a.toLowerCase()));
  const findings = [];
  /* members already reported as member-too-new, by `offset:attr` - what a
   * value on them is too new for is the same finding said twice */
  const tooNewMembers = new Set();
  const seen = new Set(); // dedupe repeated identical findings (a helper replayed at several call sites)
  const idsSeen = new Set();
  // every literal id of the document, or null when one of them is not a
  // literal - the set an association value is judged against
  const literalIds = literalIdSet(root);

  /* The key used to be `type|control|member|value`, which collapsed two
   * DIFFERENT controls with the same wrong value into one finding: the count
   * understated, and `--fix` rewrote one of them and needed a second pass for
   * the other. The offset is part of the key now, so distinct nodes stay
   * distinct. What the dedupe exists for survives it: a void helper method
   * replayed at every call site (the render_toolbar( io_table ) idiom) builds
   * its nodes at the helper body's ABSOLUTE offsets, identical for every
   * replay, so its one defect is still one finding. */
  const report = (f) => {
    const key = `${f.type}|${f.control}|${f.member || ''}|${f.value || ''}|${f.offset ?? ''}`;
    if (seen.has(key)) return;
    if (allowed.has(`${f.control}.${f.member || ''}`.toLowerCase()) || allowed.has(f.control.toLowerCase())) return;
    seen.add(key);
    findings.push(f);
  };

  /* The document parseXml( ) could not read as XML at all - reported first,
   * and before any control is resolved: every other finding on such a
   * document is about a tree the browser never builds. */
  for (const m of root.malformed ?? []) {
    report({ type: 'malformed-xml', control: m.name, member: m.kind, value: m.other ?? '', offset: m.offset });
  }

  /* A templating instruction DECLARES a model name. `<template:repeat
   * list="{template>/MT_LAYOUT}" var="L0">` makes `{L0>FNAME}` resolvable for
   * everything inside it, and `template:with` does the same - the alias is a
   * model of the templating engine, created in the VIEW rather than wired from
   * ABAP, so the caller enumerating models from the source cannot know it.
   * Without this every templated view reported each of its own aliases as a
   * model nothing has: seven such findings across abap2UI5/samples, all on
   * correct code, and no fix a reader could apply.
   *
   * Collected document-wide rather than per subtree. An alias used outside the
   * instruction that declares it is a mistake this rule does not claim to
   * catch, and accepting one name too many beats reporting a correct view. */
  const declaredVars = new Set();
  walkTree((collectVars, node) => {
    if (node.ns === 'template') {
      for (const [n, v] of node.attrs || []) if (n === 'var' && v) declaredVars.add(String(v));
    }
    for (const c of node.children) collectVars(c);
  }, root);
  const knownModels = models && declaredVars.size ? new Set([...models, ...declaredVars]) : models;

  const nsOf = namespaceScopes(root);

  /* core:require aliases: `core:require="{DateType: 'sap/ui/model/type/Date'}"`
   * declares the short name a binding's `type:`/`formatter:` then uses. Read
   * from every node - a fragment may carry its own require on an inner root. */
  const requireMap = {};
  walkTree((collectRequire, node) => {
    for (const [n, v] of node.attrs || []) {
      if (n !== 'core:require' && n !== 'require') continue;
      for (const [alias, target] of requireAliases(String(v))) requireMap[alias] = target;
    }
    for (const c of node.children) collectRequire(c);
  }, root);

  /* The names a formatter of the curated module is written under: the
   * `z2ui5.Formatter` global, the conventional `Formatter` alias unless the
   * class points it at a module of its own, and EVERY alias a core:require
   * points at the module - `{Fmt: 'z2ui5/model/formatter'}` then
   * `formatter: 'Fmt.round2DP'` is the same unknown name, and was not read.
   * Each alias is escaped for every regex metacharacter, not only the `.`
   * and `$` the filter lets through: an escape that lists just those two is
   * one widened filter away from a broken pattern. */
  const formatterAliases = [...new Set([
    'z2ui5.Formatter',
    ...(requireMap.Formatter && requireMap.Formatter !== FORMATTER_MODULE ? [] : ['Formatter']),
    ...Object.entries(requireMap).filter(([, target]) => target === FORMATTER_MODULE).map(([alias]) => alias),
  ])].filter((a) => /^[\w.$]+$/.test(a)).map((a) => a.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'));
  const formatterRef = formatterAliases.length
    ? new RegExp(`(?<![\\w.$])(${formatterAliases.join('|')})\\.(\\w+)\\(|\\bformatter\\s*:\\s*'(${formatterAliases.join('|')})\\.(\\w+)'`, 'g')
    : null;

  /* The namespace prefix a node is written with, and its local name. The
   * builder can carry the prefix inside the name (`core:Icon`) instead of in
   * ns - then that prefix wins over the default namespace. Every place that
   * splits a name reads it through these two, so the two spellings cannot
   * drift apart again (the undeclared-namespace check read only `ns` for a
   * year, and the name form fell through it unjudged). */
  const prefixOf = (node) => {
    const name = String(node.name);
    const inName = name.indexOf(':');
    return inName > 0 ? name.slice(0, inName) : (node.ns || null);
  };
  const localName = (node) => {
    const name = String(node.name);
    const inName = name.indexOf(':');
    return inName > 0 ? name.slice(inName + 1) : name;
  };

  const resolve = (node) => {
    const lib = nsOf(node)[prefixOf(node) || ''] || null;
    return lib ? `${lib}.${localName(node)}` : null;
  };

  // libraries the snapshot actually covers - only inside those can a missing
  // control be called out (custom namespaces stay out of scope, no guessing)
  const knownLibs = knownLibsOf(data);

  /* A model type a binding names - `type: 'sap.ui.model.type.Date'` in a
   * binding info, or `sap/ui/model/type/Date` in a core:require - judged
   * against the snapshot's `modelTypes`, the complete list of both type
   * namespaces. A name that is in neither is no class at all: by global name
   * the binding runs WITHOUT a type (UI5 logs "Failed to resolve type", the
   * value is shown unformatted and the input is never parsed back), and as a
   * core:require the module 404s and the view is never created. A name that
   * is there but newer than the floor is the same thing on an older system.
   * `written`/`toWritten` spell the name the way the source does, so the
   * case did-you-mean can carry a fix. */
  const modelTypes = data.__modelTypes || {};
  const modelTypeNames = Object.keys(modelTypes);
  const judgeModelType = (name, { control, member, offset, toWritten = (n) => n }) => {
    if (!modelTypeNames.length || !MODEL_TYPE_NS.test(name)) return;
    const entry = modelTypes[name];
    if (!entry) {
      const ns = name.slice(0, name.lastIndexOf('.') + 1);
      const suggestion = caseMatch(name, modelTypeNames);
      report({
        type: 'unknown-binding-type', control, member, value: name, offset,
        allowed: modelTypeNames.filter((n) => n.startsWith(ns) && !n.slice(ns.length).includes('.')).map((n) => n.slice(ns.length)),
        snapshot: data.__ui5Version,
        ...(suggestion ? { written: toWritten(name), suggestion: toWritten(suggestion) } : {}),
      });
      return;
    }
    if (entry.since && !withinFloor(entry.since, floor)) {
      report({ type: 'binding-type-too-new', control, member, value: name, since: entry.since, minUi5, offset });
    }
  };

  /* The core:require half, judged where the require is written: an unknown
   * module there fails the view whether or not a binding ever uses the alias,
   * and the binding that does use it then names only the alias. */
  walkTree((judgeRequires, node) => {
    for (const [n, v, at] of node.attrs || []) {
      if (n !== 'core:require' && n !== 'require') continue;
      for (const [, target] of requireAliases(String(v))) {
        if (!/^sap\/ui\/model\//.test(target)) continue;
        judgeModelType(target.replace(/\//g, '.'), {
          control: resolve(node) || String(node.name), member: n, offset: at ?? node.offset,
          toWritten: (x) => x.replace(/\./g, '/'),
        });
      }
    }
    for (const c of node.children) judgeRequires(c);
  }, root);

  const enums = data.__enums || {};
  const enumSince = data.__enumSince || {};
  const enumKeys = data.__enumKeys || {};

  /* What an XML VIEW may write for a property of an enum type: the enum's
   * KEYS, not the runtime values `enums` holds.
   *
   * UI5 enums are `{ Key: "Value" }` maps and the two are the same string for
   * 227 of the snapshot's 235 enums, which is why this went unnoticed. Where
   * they differ the spellings are not interchangeable, and which one is right
   * depends on how the value reaches the control:
   *
   *   XMLTemplateProcessor   parseValue( ) first (KEY -> value), then isValid( )
   *   setProperty / binding  validateProperty -> isValid( ) alone, no parse
   *
   * and `isValid( )` is keyed by VALUE (DataType.createEnumType: `mValues[
   * sValue] = sName`). So in a view `intervalType="OneMonth"` parses to
   * "One Month" and validates - it is what the demo kit has shipped for years
   * - while `intervalType="One Month"` parses to undefined, logs an error and
   * leaves the property at its default. This gate judges views, so it judges
   * keys; the two ABAP-side checks that read `__enums` (an InvisibleMessage
   * announce mode, a setSticky payload) judge arguments that reach a SETTER,
   * and those stay on the values. */
  const viewSpellings = (type) => {
    const values = enums[type];
    if (!values) return null;
    const keys = enumKeys[type];
    return keys ? values.map((v) => keys[v] ?? v) : values;
  };

  /** Property value check: enum members and booleans are closed sets, ints
   *  must parse. Bindings and expressions are skipped - their value is only
   *  known at runtime. */
  function checkValue(control, attr, decl, value, offset, guessed = false) {
    if (value === undefined || isBinding(value)) return;
    const type = decl.type;
    if (!type) return;
    const spellings = viewSpellings(type);
    const allowed = spellings || primitiveValues(type);
    if (allowed) {
      const written = String(value);
      // a boolean's parseValue reads "" as false, and a guessed value is not
      // what runs - neither is a wrong spelling of true/false
      if (!spellings && (written === '' || guessed)) return;
      const at = allowed.indexOf(written);
      if (at === -1) {
        /* The one wrong spelling this gate can name outright: the RUNTIME
         * value of an enum whose key differs from it. It is not a typo and
         * caseMatch would never find it (`One Month` vs `OneMonth` differ by a
         * space, `sapIllus-NoData` vs `NoData` by a prefix) - it is the
         * spelling the API reference prints, written into the one place that
         * does not take it. Carried on the finding so the message can say so,
         * and as written/suggestion so --fix can repair it. */
        const key = spellings ? enumKeys[type]?.[written] : undefined;
        const suggestion = key || caseMatch(written, allowed);
        report({
          type: 'invalid-property-value',
          control, member: attr, value: written, allowed, memberType: type, offset,
          ...(key ? { enumValueForm: true } : {}),
          ...(suggestion ? { written, suggestion } : {}),
        });
      } else {
        /* The value exists — but since WHEN? An enum VALUE introduced after
         * the floor was invisible to every gate (the member-level @since sits
         * on the property, not the value) — samples-controls carried this as a
         * documented residual limit and a by-policy manual check. The
         * generator now keeps the per-value @since from the enum's JSDoc.
         * Keyed by the runtime VALUE, which is what the attribute parses to -
         * so the written key is translated back through the same index. */
        const since = enumSince[type]?.[enums[type]?.[at] ?? written];
        if (since && !withinFloor(since, floor) && !tooNewMembers.has(`${offset}:${attr}`)) {
          report({
            type: 'enum-value-too-new',
            control, member: attr, value: written, memberType: type, since, minUi5, offset,
          });
        }
      }
      return;
    }
    /* A CSS-valued property: the string-based DataTypes UI5 checks with one
     * regex. The XML parser only LOGS a value its type refuses (parseScalarType
     * in XMLTemplateProcessor); the control's constructor then hands it to
     * setProperty, whose validateProperty THROWS - `"100" is of type string,
     * expected sap.ui.core.CSSSize for property "width"` - and the view is
     * never created. `width = '100'` is the shape: a CSS size needs a unit. */
    if (CSS_TYPES.has(type)) {
      const re = typePattern(data, type);
      // a value the reconstruction GUESSED (a LOOP variable) is not what runs
      if (re && !guessed && !re.test(String(value))) {
        const suggestion = cssValueRepair(value, re);
        report({
          type: 'invalid-css-value', control, member: attr, value: String(value), memberType: type, offset,
          expected: CSS_TYPES.get(type),
          ...(suggestion ? { written: String(value), suggestion } : {}),
        });
      }
      return;
    }
    /* What DataType's parseValue/isValid accept, nothing narrower: `Number( )`
     * of the text (`.5`, `5.`, `1e3`, ` 10 ` are numbers), an int only when
     * that is an integer, and the empty string - NaN, which both types take.
     * `^[+-]?\d+(\.\d+)?$` reported those as invalid, and a value the
     * reconstruction GUESSED (a LOOP variable, which comes out empty) too. */
    if (isNumericType(type) && !guessed && !numericValueValid(type, String(value))) {
      report({ type: 'invalid-property-value', control, member: attr, value: String(value), memberType: type, offset });
    }
    /* A DOCUMENT-RELATIVE asset URL. A UI5 demo-kit sample is served from the
     * SDK page, so `./test-resources/sap/uxap/images/x.png` resolves there; an
     * abap2UI5 app is served from the ABAP ICF node and has no such document
     * root, so the request 404s and the control silently falls back to its
     * placeholder. The view renders, nothing is logged where anyone looks.
     * Typed through the metadata rather than matched on attribute names, so
     * src, icon, backgroundImage, objectImageURI and fontURI are all reached
     * by the same check. Bindings never get here - checkValue returns early on
     * them - which is deliberate: what a model holds is a runtime question. */
    /* A `javascript:` URL: code written into a URI-typed property - a link
     * that runs a script when pressed, an image source that runs one when it
     * loads. The fourth shape of raw-javascript-to-frontend, and as dead as
     * the inline handler: the default CSP refuses it. Judged for classes,
     * like the other view-side shapes of that rule. */
    if (type === 'sap.ui.core.URI' && fromAbap && /^javascript:/i.test(String(value).trim())) {
      report({ type: 'raw-javascript-to-frontend', control, member: attr, value: 'javascript: URL', offset });
      return;
    }
    if (type === 'sap.ui.core.URI' && RELATIVE_ASSET_RE.test(String(value).trim())) {
      report({ type: 'relative-asset-url', control, member: attr, value: String(value), offset });
    }
    /* A plain-http URL in the same typed slot. An abap2UI5 app is served over
     * HTTPS by every system that is not a developer's laptop, and a secure
     * page may not LOAD an insecure asset: the browser blocks the request as
     * mixed content (an image, a font, an icon URI never arrives — the
     * control shows its placeholder, and the block is logged only in the
     * console). A hyperlink is the one URI a page may still point at: the
     * browser NAVIGATES to it rather than loading it, and merely warns, so
     * `href` is reported as a hint while every loading property is an error.
     * The `severity` on the finding is the same override mechanism
     * sapui5-only-control uses; a `rules` entry still beats it. */
    if (type === 'sap.ui.core.URI' && /^http:\/\//i.test(String(value).trim())) {
      /* The fix, for the LOADED half only: the browser blocks the http load
       * outright, so https is the one scheme under which the asset can
       * arrive at all - and every host that serves an image to a UI5 app
       * serves it over https. A hyperlink (the hint) is left to its author. */
      const v = String(value).trim();
      report({
        type: 'insecure-asset-url', control, member: attr, value: String(value), offset,
        ...(isHrefAttr(attr) ? { severity: 'hint' } : { written: v, suggestion: v.replace(/^http:/i, 'https:') }),
      });
    }
  }


  const valueAt = (obj, p) => {
    let cur = obj;
    for (const seg of p.split('/').filter(Boolean)) {
      if (cur === null || typeof cur !== 'object') return undefined;
      if (Array.isArray(cur)) {
        cur = cur[0];
        // a NUMERIC segment is the row index itself (/T_ITEMS/9/TEXT): the
        // step into the array consumed it — which index exists is runtime
        if (/^\d+$/.test(seg)) continue;
      }
      if (!cur || !(seg in cur)) return undefined;
      cur = cur[seg];
    }
    return cur;
  };

  /* Why a path does NOT resolve, or null when it does.
   *
   *   {}                 a segment the shape does not have
   *   { table: '/T' }    a FIELD read straight off a table - `{/T/FIELD}`
   *
   * The second is its own answer because it used to be ACCEPTED: the walk
   * stepped into row 0 of every array it met and judged FIELD against that
   * row, so `{/T/FIELD}` passed whenever the row had the field. The JSONModel
   * does no such thing - `/T/FIELD` reads the property FIELD of the array
   * object, which is undefined, and the control renders blank. A table
   * segment has to be followed by a row index (`/T/0/FIELD`, as valueAt
   * reads it too), or the path has to end on the table (`{/T}` is what an
   * aggregation binds); `length` is the one property an array does have. */
  const pathProblem = (obj, p) => {
    let cur = obj;
    const segs = p.split('/').filter(Boolean);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (cur === null || typeof cur !== 'object') return {};
      if (Array.isArray(cur)) {
        // a numeric segment is the row index, consumed by the array step -
        // the fields after it are judged against the row's shape
        if (/^\d+$/.test(seg)) { cur = cur[0]; continue; }
        if (seg === 'length') { cur = cur.length; continue; }
        return { table: (p.trim().startsWith('/') ? '/' : '') + segs.slice(0, i).join('/') };
      }
      // a node whose shape the class does not declare (a DDIC structure, a
      // type from another class): we cannot know its fields, so we do not
      // claim a path under it is missing
      if (cur.__unknownShape) { opaqueHit = true; return null; }
      // the missing segment and the keys at that level: what a did-you-mean
      // is computed from (pathFinding), never carried into the finding itself
      if (!(seg in cur)) return { segment: seg, keys: Object.keys(cur) };
      cur = cur[seg];
    }
    return null;
  };

  /* pathProblem( ) for a path a VIEW writes, counted (`tally`): how many
   * binding paths were asked about, and how many of them ran into a node
   * whose shape the class does not declare. Those are not judged - correctly,
   * see the comment in pathProblem - and a run that judged nothing because
   * every table is typed by a DDIC structure used to look exactly like a run
   * in which every path was right. The run summary says the difference. */
  let opaqueHit = false;
  const judgePath = (obj, p) => {
    opaqueHit = false;
    const problem = pathProblem(obj, p);
    if (tally) {
      tally.paths = (tally.paths ?? 0) + 1;
      if (opaqueHit) tally.pathsOpaque = (tally.pathsOpaque ?? 0) + 1;
    }
    return problem;
  };

  /* What an unknown-binding-path finding carries of a pathProblem( ) answer:
   * the `table` verdict as is, and - where the missing segment is a key of
   * that level up to letter case (`{/mv_text}` for `MV_TEXT`, the commonest
   * way a hand-written path misses) - the did-you-mean pair the fix reads. */
  const pathFinding = (problem) => {
    const out = {};
    if (problem.table) out.table = problem.table;
    if (problem.segment && problem.keys) {
      const suggestion = caseMatch(problem.segment, problem.keys);
      if (suggestion) { out.written = problem.segment; out.suggestion = suggestion; }
    }
    return out;
  };

  /* The row a bound aggregation hands to its template, but only when the
   * derived model KNOWS the row's shape (a structure the class declares).
   * A row assembled from a VALUE #( ) seed alone carries just the fields
   * that seed happened to set - reporting a field missing from it would be
   * a guess, and the whole point of these rules is not to guess. */
  const templateRow = (bound) => {
    const row = Array.isArray(bound) ? bound[0] : bound;
    return row && typeof row === 'object' && row.__complete ? row : null;
  };

  /* The row an element binding (`binding="{/T_PRODUCTS/0}"`) points at, when
   * the path is one this walk can follow and the shape behind it is KNOWN:
   * a row of a declared table (`/TABLE/<index>`, judged by the table's row
   * type whatever the index, so a seed with fewer rows than the index does
   * not blind it) or a declared structure. Anything else - a named model, a
   * complex binding info, a table whose rows are not typed in the class -
   * answers null, and the caller keeps the opaque context. It used to be
   * opaque always (samples-controls app 072: six ObjectNumbers element-bound
   * to rows of T_PRODUCTS, every `{CURRENCYCODE}` under them unchecked). */
  const elementRow = (value, outer) => {
    const v = String(value).trim();
    const p = bindingPath(v) || relativePath(v);
    if (!p) return null;
    const at = (q) => (q.startsWith('/') ? valueAt(bindings, q) : outer?.row ? valueAt(outer.row, q) : undefined);
    const indexed = p.match(/^(.*)\/(\d+)$/);
    if (indexed) return templateRow(at(indexed[1]));
    const bound = at(p);
    return bound && !Array.isArray(bound) ? templateRow(bound) : null;
  };


  /* What the IMMEDIATE parent node is, independent of `ownerControl` - which
   * names the nearest KNOWN control and therefore looks straight through a
   * custom or typo'd tag in between. Only the immediate parent decides
   * whether an aggregation sits where an aggregation may sit.
   *
   * ITERATIVE, though it reads like a recursion (walkTree in tree.mjs):
   * every `walk( )` in the body hands a child to the loop rather than calling
   * into it - a view nested a thousand levels deep ran the recursive walk out
   * of stack. Each stands last in its branch, so the findings come out in
   * the order they always did. */
  walkTree((walk, node, ownerControl, ctx, parentKind) => {
    let owner = ownerControl;
    let childCtx = ctx;
    let childKind = node.name === null ? 'root' : 'control';
    /* A tag in a FOREIGN namespace - raw XHTML (html:iframe), a custom
     * control library, an in-house one - is outside what the UI5 metadata can
     * say anything about, whether it looks like a control or (being
     * lower-case) like an aggregation. Its subtree keeps no parent context: a
     * control inside it is not in some UI5 aggregation. The exception is the
     * abap2UI5 companion controls lib/cc-controls.mjs mirrors (below). */
    if (node.name !== null) {
      const lib = nsOf(node)[prefixOf(node) || ''];
      /* One thing is said about a companion control whatever the walk does
       * with it next: abap2UI5 marks eight of them `// OBSOLETE:` (Timer,
       * Focus, Scrolling, Title, LPTitle, Favicon, Info, History), each
       * replaced by a frontend action or a client method. Judged by the
       * namespace the prefix is BOUND to, never by the prefix - so
       * `<cc:Timer xmlns:cc="z2ui5.cc">` is one and `<core:Title>` or an
       * sap.m Title is not - and by the exact local name, since an XML tag is
       * case-sensitive and `title` is an aggregation. */
      if (lib === CC_NAMESPACE && Object.hasOwn(OBSOLETE_CC_CONTROLS, localName(node))) {
        const name = localName(node);
        report({
          type: 'obsolete-custom-control', control: `${CC_NAMESPACE}.${name}`, value: name,
          replacement: OBSOLETE_CC_CONTROLS[name].replacement, offset: node.offset,
        });
      }
      /* A companion control lib/cc-controls.mjs MIRRORS is not foreign any
       * more: its metadata is in `data` (withCompanionControls), with the
       * real base class as its parent, so the walk judges it like any control
       * - its attributes, its events, where it sits. One the mirror does not
       * know (a customer's own z2ui5.cc control) is still looked away from. */
      const mirrored = lib === CC_NAMESPACE && knownControl(data, `${lib}.${localName(node)}`);
      /* Native XHTML/SVG is deprecated in an XML view since 1.120. Judged
       * on the OUTERMOST native element of an island only: one `<html:div>`
       * holding twenty tags is one decision to make, not twenty. Its
       * subtree is still walked as before - a UI5 control nested inside
       * native markup is judged like any other. */
      const markup = NATIVE_MARKUP.get(lib);
      if (markup) {
        runRule(nativeHtmlInView, { node, markup, floor, horizon, data, insideNative, prefixOf, localName, reportAfterTarget, report }, { timings });
        for (const c of node.children) insideNative.add(c);
      }
      if (lib && !lib.startsWith('sap.') && !mirrored) {
        /* …with one thing carried across: whether this tag BINDS anything.
         *
         * "No parent context" is right about aggregations and wrong about
         * rows. A custom control extends a real one as often as not -
         * z2ui5.cc.CameraSelector extends sap.m.ComboBox and inherits its
         * `items`, which is how this was found, before the mirrors made it a
         * known control - so
         *
         *   <z2ui5:CameraSelector items="{path:'/DEVICES'}">
         *     <core:Item key="{KEY}" text="{TEXT}"/>
         *
         * is the ordinary bound-template form, and the children ARE rows.
         * Handing them nothing made `relative-binding-without-context` report
         * both attributes as resolving against nothing (abap2UI5/samples app
         * 306), which is the rule inventing a defect out of a namespace it
         * declined to look into.
         *
         * The owner stays opaque in every other respect - `control: null`,
         * empty `aggRows` - so nothing here guesses at an aggregation, which
         * is what the paragraph above is actually protecting.
         *
         * ANY binding counts, not only one that looks like an aggregation: on
         * a control the metadata does not carry, the two are indistinguishable,
         * and being wrong is asymmetric. Reading a property binding as if it
         * opened a context only makes the two "is there a context here" rules
         * go quiet on this subtree; reading a real aggregation binding as if
         * it did not invents a defect. */
        const foreignOwner = (node.attrs || []).some(([, v]) => isBinding(v))
          ? { control: null, aggregation: null, aggRows: {}, ctx: null, inTemplate: false, inBoundAgg: true }
          : null;
        for (const c of node.children) walk(c, foreignOwner, null, 'control');
        return;
      }
    }
    if (node.name !== null && !isAggregationTag(node.name)) {
      const full = resolve(node);
      /* `binding="{/SUPPLIERS/0}"` IS a binding context, and the walk used to
       * look straight past it. It is not a control property but a ManagedObject
       * SPECIAL SETTING: XMLTemplateProcessor hands it to `bindObject( )`, which
       * is `bindElement( )` under its general name, so the control and its whole
       * subtree resolve relative paths against that object. It is the
       * DECLARATIVE form of the cs_event-bind_element wire, and the corpus
       * writes it far more often - eleven ports keep their original's element
       * binding exactly this way, and widening the rule below reported all
       * seventy of their relative bindings before this was taught.
       *
       * The context is deliberately OPAQUE: it says "there is a row here", not
       * which fields it has. Resolving the object's shape would let
       * unknown-binding-path start judging the fields under it, which is a
       * different rule's widening and not this one's business - and getting it
       * wrong would report correct ports. An UNRESOLVED binding attribute (a
       * value the reconstructor could not follow) opens the same opaque
       * context, for the reason the unresolved-aggregation case already gives:
       * a blind spot is not a defect. */
      const objBind = node.attrs.find(([a]) => a === 'binding')?.[1];
      if ((objBind && isBinding(objBind)) || node.unresolvedAttrs?.has('binding')) {
        ctx = { row: (objBind && elementRow(objBind, ctx)) || OPAQUE_ROW, path: objBind ? String(objBind).trim() : '(unresolved)' };
        childCtx = ctx;
      }
      runRule(undeclaredNamespace, { node, control: localName(node), prefixOf, nsOf, report }, { timings });

      if (!runRule(deprecatedLibrary, { node, full, floor, report }, { timings })
          && !runRule(sapui5OnlyControl, { node, full, distribution, report }, { timings })) {
        runRule(unknownControl, { node, full, data, knownLibs, ownerControl, report }, { timings });
      }
      if (full && knownControl(data, full)) {
        const meta = data[full];
        runRule(controlTooNew, { floor, full, meta, minUi5, node, report }, { timings });
        runRule(controlDeprecated, { data, floor, full, horizon, meta, node, reportAfterTarget, report }, { timings });
        runRule(invalidAggregationChild, { data, full, node, ownerControl, report }, { timings });
        runRule(toolbarControlInBar, { floor, full, minUi5, node, ownerControl, report }, { timings });
        runRule(duplicateId, { full, idsSeen, node, report }, { timings });
        for (const [attr, value, at] of node.attrs) {
          if (isFrameworkAttr(attr)) continue;
          const offset = at ?? node.offset;

          /* A <script> tag written into an attribute value — the core:HTML
           * content route for shipping JavaScript inside the view. Same
           * verdict as the handler-string and follow_up_action forms: the
           * frontend is a renderer, code does not travel in the view. Judged
           * for reconstructed classes only; <style> stays fine. */
          if (fromAbap && /<script\b/i.test(String(value))) {
            report({ type: 'raw-javascript-to-frontend', control: full, member: attr, value: 'script tag', offset });
          } else if (fromAbap && hasInlineHandler(String(value))) {
            /* The same route without the tag: an `onclick=`/`onerror=` on an
             * element of the markup. The default CSP has no 'unsafe-inline',
             * so the browser refuses it and says so only in the console. */
            report({ type: 'raw-javascript-to-frontend', control: full, member: attr, value: 'inline handler', offset });
          }

          runRule(uncuratedFormatter, { attr, formatterRef, fromAbap, full, offset, value, report }, { timings });

          /* The binding-info half of the model-type check: every `type:` a
           * complex binding names by its GLOBAL name (`parts` may carry one
           * per part). An alias declared by core:require is judged at the
           * require instead, so it is skipped here. Both key quotes and both
           * value quotes are UI5's, as in date-type-without-source. */
          if (modelTypeNames.length && String(value).includes('type')) {
            for (const tm of String(value).matchAll(/(?:^|[\s{,])['"]?type['"]?\s*:\s*['"]([\w.$]+)['"]/g)) {
              if (requireMap[tm[1]]) continue;
              judgeModelType(tm[1], { control: full, member: attr, offset });
            }
          }

          if (runRule(memberTooNew, { attr, data, floor, full, minUi5, offset, report }, { timings })) {
            tooNewMembers.add(`${offset}:${attr}`);
            /* No `continue`: too new for the floor is one finding, and what
             * the attribute BINDS is another question. Skipping here left
             * every path written on a newer member unjudged - `initials` on
             * an AvatarGroupItem, `secondaryType` on a DateTypeRange, the
             * nested `items` of an IconTabFilter (samples-controls 662, 541,
             * 302) - on exactly the controls a port is least sure of. */
          }
          const member = memberOf(data, full, attr, ['properties', 'events', 'associations', 'aggregations']);
          if (!member) {
            runRule(unknownProperty, { attr, data, full, offset, report }, { timings });
            continue;
          }

          runRule(bindingForEvent, { attr, full, member, offset, value, report }, { timings });
          runRule(eventForProperty, { attr, full, member, offset, value, report }, { timings });
          const isHandler = String(value).trim().startsWith('.eB(');
          if (fromAbap && member.set === 'events' && !isHandler && !isBinding(value) && String(value).trim() !== '') {
            /* The cell of the matrix the two rules above leave: a LITERAL
             * on an event (a binding there is binding-for-event's). In an
             * abap2UI5 class that is a hand-written handler string — UI5's
             * XMLView evaluates it as JavaScript in the browser, code the
             * backend never sees. The frontend is a renderer: wire events
             * with client->_event*( ) so behaviour travels as data. (A raw
             * .view.xml has a controller whose handler names belong there,
             * which is why this only judges reconstructed classes.) */
            report({
              type: 'raw-javascript-to-frontend', control: full, member: attr,
              value: String(value).slice(0, 40), offset,
            });
          }

          runRule(invalidExpressionBinding, { attr, full, offset, value, report }, { timings });
          runRule(bindingOnAssociation, { attr, full, member, offset, value, report }, { timings });
          runRule(boundAggregationWithoutTemplate, { attr, data, full, member, node, offset, value, report }, { timings });
          runRule(associationUnknownId, { attr, full, literalIds, member, node, offset, value, report }, { timings });
          runRule(unknownModel, { attr, full, knownModels, offset, value, report }, { timings });
          runRule(jsonLiteralInAttribute, { attr, full, offset, value, report }, { timings });
          runRule(dateTypeWithoutSource, { attr, full, offset, requireMap, value, report }, { timings });

          runRule(unknownBindingPath, { attr, bindings, ctx, full, judgePath, member, node, offset, pathFinding, value, report }, { timings });
          runRule(relativeAggregationWithoutContext, { attr, bindings, boundElement, ctx, full, member, node, offset, ownerControl, value, report }, { timings });
          runRule(relativeBindingWithoutContext, { attr, bindings, boundElement, ctx, full, member, node, offset, ownerControl, rootFields, value, report }, { timings });

          runRule(memberDeprecated, { attr, data, floor, full, horizon, member, offset, reportAfterTarget, report }, { timings });
          runRule(validatingSetterOutOfRange, { attr, bindings, ctx, full, member, offset, value, report }, { timings });

          runRule(collectionBoundToProperty, { attr, bindings, full, member, offset, value, report }, { timings });
          runRule(bindingTypeMismatch, { attr, bindings, full, member, offset, value, report }, { timings });

          runRule(enumBoundToInitialField, { attr, enums, full, initialFields, member, model, offset, value, report }, { timings });
          runRule(jsonBindOnScalarProperty, { attr, full, jsonPaths, member, offset, value, report }, { timings });

          if (member.set === 'properties') checkValue(full, attr, member.decl, value, offset, node.guessedAttrs?.has(attr));

          runRule(htmlContentNotMarkup, { attr, fromAbap, full, node, offset, value, report }, { timings });
        }

        /* Attributes the reconstructor could not resolve — a `COND #( )` or a
         * `SWITCH #( )` value — are dropped from the document rather than
         * invented, so the loop above never sees them and every version rule
         * is blind to the member. That blind spot is not uniform: an attribute
         * is written conditionally when it is optional or feature-gated, which
         * correlates with being NEW, so it selects for exactly the members
         * worth checking (app 454 hid a 1.117 floor behind one). The NAME is
         * known even when the value is not, and that is all a version check
         * needs. Value rules stay out — there is no value to judge. */
        for (const attr of node.unresolvedAttrs ?? []) {
          if (isFrameworkAttr(attr)) continue;
          runRule(memberTooNew, { attr, data, floor, full, minUi5, offset: node.offset ?? 0, report }, { timings });
          // the value is gone; unresolved-attribute-value says so where that
          // lost a real check
          const decl = propertyDecl(data, full, attr);
          /* A conditional whose every value is a literal (`COND #( WHEN …
           * THEN \`Emphasized\` ELSE \`Default\` )`, the reconstructor's
           * `branchValues`) is not a blind spot: each value is judged the way
           * a literal is, and nothing is said when all of them pass. */
          const branches = node.branchValues?.get(attr);
          if (decl && branches) {
            for (const v of branches.values) checkValue(full, attr, decl, v, branches.offset ?? node.offset ?? 0);
            continue;
          }
          runRule(unresolvedAttributeValue, { attr, data, decl, full, node, report }, { timings });
        }

        runRule(eventOnDisabledControl, { data, full, node, report }, { timings });
        runRule(unknownSourceProperty, { data, full, node, report }, { timings });
        /* Event parameters the handler reads back ($parameters>/name): they
         * are members of the control like any other, so both the version
         * floor and EXISTENCE apply — a typo'd name arrives empty with no
         * error anywhere. Existence is only judged against an event the
         * control declares ITSELF: a subclass can widen an inherited event
         * without redeclaring it (sap.m.DateRangeSelection fires `change`
         * with from/to/valid, while the metadata-declared parameters sit on
         * sap.m.InputBase and know only `value` — the exact false positive
         * the first corpus run produced). And only when that declaration
         * carries a parameters block at all: an event whose metadata names
         * none may still fire computed ones, and a miss would be a guess. */
        for (const p of node.eventParams || []) {
          if (!runRule(eventParameterTooNew, { data, floor, full, minUi5, p, report }, { timings })) {
            runRule(unknownEventParameter, { data, full, p, report }, { timings });
          }
        }

        runRule(missingRequiredAggregation, { data, full, node, report }, { timings });
        runRule(editableControlWithoutBinding, { data, full, node, report }, { timings });
        runRule(columnCellCountMismatch, { data, full, node, report }, { timings });
        runRule(rowsHiddenByVisible, { data, full, node, sizeLimitRaised, report }, { timings });
        runRule(boundAggregationOverSizeLimit, { data, full, node, seededRows, sizeLimitRaised, report }, { timings });
        runRule(duplicateAggregation, { full, node, report }, { timings });
        runRule(missingAccessibility, { data, full, node, report }, { timings });
        runRule(pickerValueWithoutFormat, { data, full, node, rootWrites, report }, { timings });
        /* An aggregation binding opens a row context for the children of
         * THAT aggregation - and only of it: a {HEADER} under `columns` is
         * not addressing a row of `items`. */
        const aggRows = {};
        if (bindings) {
          for (const [attr, value] of node.attrs) {
            if (!isBinding(value)) continue;
            if (!memberOf(data, full, attr, ['aggregations'])) continue;
            /* A bound aggregation ALWAYS replaces the context for its
             * children, even when the row behind it cannot be resolved -
             * they are rows of something else now, and inheriting the
             * outer row here would report every field of the inner one as
             * missing. Unresolvable therefore means null, not "unchanged". */
            const p = aggregationPath(value);
            const bound = !p ? undefined
              : p.startsWith('/') ? valueAt(bindings, p)
                : ctx ? valueAt(ctx.row, p) : undefined;
            const row = templateRow(bound);
            aggRows[attr] = row ? { row, path: p } : null;
          }
        }
        /* `inBoundAgg` is NOT `inTemplate`. inTemplate means a literal
         * <template> tag; this means "the walk is under a bound aggregation",
         * which is the real question a row template asks. They differ exactly
         * where it matters: a bound aggregation whose ROW could not be
         * resolved from the data leaves `ctx` null while the children are
         * still rows of something - `{T_ITEMS}` under a tnt:NavigationList
         * bound through _bind( ) is the normal nested-tree form, not an
         * aggregation resolving against nothing. Kept separate from
         * inTemplate so it narrows THIS rule and not the relative-binding
         * one, whose promise about an unresolvable row is a different one. */
        // children written directly sit in the default aggregation
        const defAgg = [...chain(data, full)].map(([, m]) => m.defaultAggregation).find(Boolean);
        /* …and its cardinality applies to them. The explicit-tag check in the
         * aggregation branch never saw these: `<table:Column><Label/><Text/>`
         * fills `label`, a 0..1 aggregation, twice, and UI5 logs "multiple
         * aggregates defined for aggregation label with cardinality 0..1" and
         * keeps the LAST one. Same reading of `multiple` as there: only an
         * explicit `false` is 0..1. Only children that resolve to a UI5
         * library count - a templating instruction (`template:if`) or an XHTML
         * node is not a control, and a tag whose prefix is undeclared is
         * already reported on its own. */
        const defDecl = defAgg ? memberOf(data, full, defAgg, ['aggregations'])?.decl : null;
        runRule(tooManyChildren, { defAgg, defDecl, full, node, nsOf, prefixOf, report }, { timings });
        /* An aggregation whose value the reconstructor could not resolve -
         * a `client->_bind( )` handed in as a method parameter, the shape
         * app 585's shared nav_list( ) fragment uses - is recorded in
         * unresolvedAttrs and appears in NEITHER aggRows nor node.attrs. Its
         * children are a row template all the same, and calling them
         * contextless because the BINDING was unreadable is the rule
         * inventing a defect out of its own blind spot. */
        const unresolvedAgg = [...(node.unresolvedAttrs ?? [])]
          .some((a) => memberOf(data, full, a, ['aggregations']));
        const defBound = Boolean(defAgg && Object.hasOwn(aggRows, defAgg)) || unresolvedAgg;
        /* A sap.ui.table table hands its ROWS to templates that sit in a
         * sibling aggregation: Column.template (under `columns`) and the
         * table's own rowActionTemplate / rowSettingsTemplate are cloned per
         * row of the `rows` binding. Carried down to those templates, so the
         * fields written there are judged against the row like an items
         * template's are (samples app 070, samples-controls app 358: every
         * column cell unchecked). Only a resolved row is carried; an
         * unresolvable one leaves the templates as they were. */
        const rowsPath = aggRows.rows?.path;
        const rowsValue = !rowsPath ? undefined
          : rowsPath.startsWith('/') ? valueAt(bindings, rowsPath) : ctx?.row ? valueAt(ctx.row, rowsPath) : undefined;
        /* …but only where `rows` binds a TABLE. A TreeTable bound to a
         * structure (`arrayNames: ['CHILDREN']`) has its nodes as rows, not
         * the structure - judging the templates against the root reported
         * correct fields (samples-controls sapui5_013 and _014). */
        const tableRows = /^sap\.ui\.table\./.test(full) && aggRows.rows && Array.isArray(rowsValue)
          ? aggRows.rows
          : (ownerControl?.tableRows ?? null);
        owner = { control: full, aggregation: null, aggRows, ctx, inTemplate: ownerControl?.inTemplate || false,
          inBoundAgg: ownerControl?.inBoundAgg || defBound, tableRows };
        childCtx = defAgg && Object.hasOwn(aggRows, defAgg) ? aggRows[defAgg] : ctx;
      } else {
        /* A control the snapshot does not have - a SAPUI5-only library under
         * --distribution sapui5, a namespace the metadata never covered.
         * Its children belong to IT, and nothing here knows what it takes, so
         * the owner becomes opaque rather than staying the nearest KNOWN
         * ancestor. Leaving it inherited attributes a descendant aggregation
         * to a control several levels up: `vos` under `vbm:AnalyticMap` was
         * reported as "sap.m.Page has no aggregation vos", and the same
         * mechanism silently EXCUSED a wrong one whose name happened to exist
         * on that ancestor. Both are guesses, and this rule's promise is that
         * a chain leaving the snapshot is not guessed about. */
        owner = { control: null, aggregation: null, aggRows: {}, ctx, inTemplate: ownerControl?.inTemplate || false,
          inBoundAgg: ownerControl?.inBoundAgg || false };
      }
    } else if (node.name !== null && isAggregationTag(node.name)) {
      runRule(aggregationInAggregation, { node, parentKind, ownerControl, report }, { timings });
      childKind = 'aggregation';
      // the same undeclared-prefix defect as on a control tag - the browser's
      // XML parser refuses the document before UI5 sees it
      runRule(undeclaredNamespace, { node, control: node.name, prefixOf, nsOf, report }, { timings });
      if (!ownerControl?.control) {
        for (const c of node.children) walk(c, owner, childCtx, childKind);
        return;
      }
      const parent = ownerControl.control;

      const member = memberOf(data, parent, node.name, ['aggregations', 'associations']);
      if (!runRule(aggregationTooNew, { node, parent, data, floor, minUi5, report }, { timings })) {
        runRule(unknownAggregation, { node, parent, member, data, resolve, nsOf, prefixOf, report }, { timings });
        if (member && member.set !== 'associations') runRule(tooManyChildren, { node, parent, member, report }, { timings });
      }
      /* `template` is UI5's name for a per-instance template (a
       * sap.ui.table Column.template is cloned per ROW, exactly like an
       * items template). Its context is set at runtime by the table's own
       * rows binding, which this walk does not follow into a sibling
       * aggregation - so relative bindings under it are not contextless.
       * And `template` is not the only spelling: `rowActionTemplate` and
       * `rowSettingsTemplate` (sap.ui.table.Table) and `creationTemplate`
       * (Column's creation row) are cloned per row by the SAME mechanism, and
       * a port that writes one binds relatively inside it. Reading only the
       * bare name is a false positive waiting on any table carrying row
       * actions or row settings - see ROW_TEMPLATE_AGG. */
      owner = { control: parent, aggregation: node.name, aggRows: ownerControl.aggRows, ctx: ownerControl.ctx,
        inTemplate: ownerControl.inTemplate || ROW_TEMPLATE_AGG.test(node.name),
        inBoundAgg: ownerControl.inBoundAgg || Object.hasOwn(ownerControl.aggRows || {}, node.name),
        tableRows: ownerControl.tableRows ?? null };
      // an aggregation without its own binding stays in the context of the
      // CONTROL, never in that of a sibling aggregation's rows - except a
      // per-row template of a sap.ui.table table, whose rows ARE its context
      childCtx = Object.hasOwn(ownerControl.aggRows || {}, node.name)
        ? ownerControl.aggRows[node.name]
        : ROW_TEMPLATE_AGG.test(node.name) && ownerControl.tableRows
          ? ownerControl.tableRows
          : ownerControl.ctx ?? null;
    }
    for (const c of node.children) walk(c, owner, childCtx, childKind);
  }, root, null, null, 'root');

  // the rules of scope 'document': once per view, over the whole tree
  runRule(secondRoot, { root, prefixOf, resolve, localName, report }, { timings });
  runRule(unusedNamespaceDeclaration, { root, prefixOf, resolve, localName, report }, { timings });
  runRule(undefinedCssClass, { root, prefixOf, resolve, localName, report }, { timings });
  runRule(externalLinkWithoutTarget, { root, prefixOf, resolve, localName, report }, { timings });

  return findings;
}


/* The tag reader behind parseXml( ), by hand. It reads exactly what
 *
 *   /<\s*(\/)?\s*(?:([\w.-]+):)?([\w.]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?\s*>|<!--[\s\S]*?-->/g
 *
 * read, which backtracked polynomially (CodeQL js/polynomial-redos): its two
 * `\s*` around the `/` shared out every run of blanks after a `<`, its lazy
 * attributes and the `\s*>` behind them did the same before every `>`, and a
 * tag that never closed was searched to the end of the text again from every
 * `<` inside it - as was every `<!--` with no `-->` after it.
 *
 * The prefix is an NCName, so `viz.data:FlattenedDataset` is a legal tag
 * (nsMapOf reads the matching xmlns:viz.data declaration) - matched with \w
 * alone it parsed as an aggregation tag NAMED viz.data with the real name
 * swallowed into the attribute text, and every VizFrame view reported an
 * aggregation-in-aggregation at its root.
 *
 * The attributes run from the end of the name to the first `>` read OUTSIDE
 * a quoted value; a quote with no partner after it means no tag. Before that
 * `>`, its blanks, and a `/` in front of them, close the tag and are not
 * attribute text. */
const OUTSIDE = 0;
const IN_DOUBLE = 1;
const IN_SINGLE = 2;
const quoteStep = (state, c) => {
  if (state === IN_DOUBLE) return c === '"' ? OUTSIDE : IN_DOUBLE;
  if (state === IN_SINGLE) return c === "'" ? OUTSIDE : IN_SINGLE;
  return c === '"' ? IN_DOUBLE : c === "'" ? IN_SINGLE : OUTSIDE;
};

/* The `>` closing attributes that start at `from`, or -1. A section that
 * reaches the end of the text leaves its quote-state trace in `dead`: a later
 * section starting OUTSIDE where a trace is outside reads the same states from
 * there on, and fails the same way without reading them again. The quote
 * steps are one-to-one, so two traces never meet: at most three are left,
 * one per state, and from then on every section is decided by a lookup. */
function attributesEnd(text, from, dead) {
  for (const trace of dead) {
    if (from >= trace.from && trace.states[from - trace.from] === OUTSIDE) return -1;
  }
  let state = OUTSIDE;
  for (let at = from; at < text.length; at++) {
    if (state === OUTSIDE && text[at] === '>') return at;
    state = quoteStep(state, text[at]);
  }
  const states = new Uint8Array(text.length - from + 1);
  state = OUTSIDE;
  for (let at = from; at < text.length; at++) {
    states[at - from] = state;
    state = quoteStep(state, text[at]);
  }
  states[text.length - from] = state;
  dead.push({ from, states });
  return -1;
}

/* The tag starting at the `<` at `lt`, or null when none does. */
function readXmlTag(text, lt, dead) {
  const slash = skipWs(text, lt + 1);
  const close = text[slash] === '/';
  const start = close ? skipWs(text, slash + 1) : slash;
  let colon = start;
  while (colon < text.length && /[\w.-]/.test(text[colon])) colon++;
  const prefixed = colon > start && text[colon] === ':' && colon + 1 < text.length && /[\w.]/.test(text[colon + 1]);
  const nameStart = prefixed ? colon + 1 : start;
  let nameEnd = nameStart;
  while (nameEnd < text.length && /[\w.]/.test(text[nameEnd])) nameEnd++;
  if (nameEnd === nameStart) return null;
  const gt = attributesEnd(text, nameEnd, dead);
  if (gt < 0) return null;
  let tail = gt;
  while (tail > nameEnd && /\s/.test(text[tail - 1])) tail--;
  const selfClose = tail > nameEnd && text[tail - 1] === '/';
  return {
    index: lt,
    end: gt + 1,
    close,
    ns: prefixed ? text.slice(start, colon) : null,
    name: text.slice(nameStart, nameEnd),
    attrsStart: nameEnd,
    attrSrc: text.slice(nameEnd, selfClose ? tail - 1 : tail),
    selfClose,
  };
}

/* Every tag of `text` in document order; comments and CDATA sections are
 * skipped. A CDATA section is character data to its `]]>`, whatever it
 * holds: read as markup, a `<!--` inside one (script text testing for
 * `"<!--"`) opened a comment that swallowed the real tags behind the section
 * up to the next `-->`, and a `<b>` inside one became an element. */
function xmlTags(text) {
  const tags = [];
  const dead = [];
  let commentsClose = true; // false once a `<!--` has no `-->` after it: then none has
  let cdataClose = true; // the same for a `<![CDATA[` with no `]]>` after it
  for (let lt = text.indexOf('<'); lt >= 0;) {
    if (cdataClose && text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      if (end >= 0) {
        lt = text.indexOf('<', end + 3);
        continue;
      }
      cdataClose = false;
    }
    const tag = readXmlTag(text, lt, dead);
    if (tag) {
      tags.push(tag);
      lt = text.indexOf('<', tag.end);
      continue;
    }
    if (commentsClose && text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end >= 0) {
        lt = text.indexOf('<', end + 3);
        continue;
      }
      commentsClose = false;
    }
    lt = text.indexOf('<', lt + 1);
  }
  return tags;
}

/* The `name="value"` / `name='value'` pairs of an attribute section as
 * { name, value, index } - `/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g`, whose
 * name restarted inside every run of name characters that no `=` follows. */
function xmlAttributes(src) {
  const attrs = [];
  let from = 0;
  for (const name of src.matchAll(/[\w:.-]+/g)) {
    if (name.index < from) continue;
    const eq = skipWs(src, name.index + name[0].length);
    if (src[eq] !== '=') continue;
    const open = skipWs(src, eq + 1);
    const quote = src[open];
    if (quote !== '"' && quote !== "'") continue;
    const close = src.indexOf(quote, open + 1);
    if (close < 0) continue;
    attrs.push({ name: name[0], value: src.slice(open + 1, close), index: name.index });
    from = close + 1;
  }
  return attrs;
}

/* What an XML parser would refuse about the tag structure of `text`:
 * `{ kind, name, other, offset }` with kind one of
 *   duplicate-attribute  the same attribute twice on one tag (other: the attribute)
 *   mismatched-tag       a closing tag naming no open element (other: the element it closes)
 *   unclosed-tag         an element never closed, at the end of the document or
 *                        skipped by a closing tag of an element further out
 *   stray-close          a closing tag with no element open at all
 * A closing tag that names nothing open is taken as the (misspelt) close of
 * the innermost element, so one typo is one finding and not a cascade. Tags
 * inside a CDATA section are text, not structure - xmlTags( ) never returns
 * them. */
function wellFormedness(tags) {
  const out = [];
  const open = [];
  const qname = (t) => (t.ns ? `${t.ns}:${t.name}` : t.name);
  for (const tag of tags) {
    const name = qname(tag);
    if (tag.close) {
      if (!open.length) {
        out.push({ kind: 'stray-close', name, offset: tag.index });
        continue;
      }
      const at = open.map((o) => o.name).lastIndexOf(name);
      if (at < 0) {
        out.push({ kind: 'mismatched-tag', name, other: open[open.length - 1].name, offset: tag.index });
        open.pop();
        continue;
      }
      while (open.length - 1 > at) {
        const lost = open.pop();
        out.push({ kind: 'unclosed-tag', name: lost.name, other: name, offset: lost.offset });
      }
      open.pop();
      continue;
    }
    const names = new Set();
    for (const a of xmlAttributes(tag.attrSrc)) {
      if (names.has(a.name)) out.push({ kind: 'duplicate-attribute', name, other: a.name, offset: tag.attrsStart + a.index });
      names.add(a.name);
    }
    if (!tag.selfClose) open.push({ name, offset: tag.index });
  }
  for (const lost of open.reverse()) out.push({ kind: 'unclosed-tag', name: lost.name, offset: lost.offset });
  return out.sort((a, b) => a.offset - b.offset);
}

/*
 * Light XML -> node tree parser for raw .view.xml / .fragment.xml input.
 * Element + attribute nodes only (text nodes are ignored) — sufficient for
 * the property gate and for handing the ORIGINAL xml string to the renderer.
 */
export function parseXml(xml) {
  const root = { name: null, ns: null, attrs: [], children: [] };
  const stack = [root];
  const text = String(xml);
  const tags = xmlTags(text);
  /* Well-formedness, on the side. The tree below is built leniently - a
   * closing tag pops whatever is open, whatever its name - which is right for
   * judging the controls in a document with one typo, and was the whole
   * story: a view with a duplicate attribute, a `</contnt>` and no closing
   * root tag passed the property gate with "Success!" and exit 0, and only a
   * render gate (off for --no-render, for the VS Code extension, for
   * mcp-server) would have said the browser refuses the document outright.
   * What the XML parser would reject is recorded as `malformed`, and
   * checkNodes reports it as `malformed-xml`. */
  root.malformed = wellFormedness(tags);
  for (const tag of tags) {
    if (tag.close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    // every attribute keeps its offset in the document, so a reader can jump
    // to it: the attribute section starts where the tag name ends
    const attrs = [];
    for (const a of xmlAttributes(tag.attrSrc)) {
      attrs.push([
        a.name,
        a.value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
        tag.attrsStart + a.index,
      ]);
    }
    const node = { name: tag.name, ns: tag.ns, attrs, children: [], offset: tag.index };
    stack[stack.length - 1].children.push(node);
    if (!tag.selfClose) stack.push(node);
  }
  return root;
}
