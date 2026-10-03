/*
 * portable — the opt-in `portable-app` rule: everything in an app that falls
 * outside the abap2UI5 protocol's PORTABLE PROFILE v1.
 *
 * The protocol (abap2UI5/protocol, profiles/portable.md) moves views as opaque
 * strings, and only the UI5 frontend understands every view an app can send.
 * The portable profile is the SUBSET of that vocabulary every non-UI5 frontend
 * renders - the UI5 Web Components frontend first, an Adaptive Cards renderer
 * or an agent later: 61 controls with their members, the binding forms, a
 * restricted expression grammar, the event wires and argument descriptors,
 * the frontend actions and the client API calls. An app that stays inside it
 * runs unchanged on all of them; an app that does not still runs on UI5, and a
 * portable renderer shows a placeholder for what it does not know.
 *
 * Off by default (OPT_IN in findings.mjs): portability is a goal an app author
 * chooses, not a defect, and most apps are written for the UI5 frontend alone.
 * A repository asks for it in its config:
 *
 *   "rules": { "portable-app": "error" }
 *
 * The profile is DATA, vendored verbatim from the protocol repository into
 * data/portable-v1.json (scripts/sync-portable-profile.mjs; its source commit
 * is recorded in data/portable-v1.source.json and pinned by npm test), so the
 * rule follows the normative list instead of restating it. Every finding is
 * ONE rule id with a `reason` saying which part of the profile it misses:
 *
 *   control          a control (namespace + name) the profile does not list
 *   custom-control   an abap2UI5 custom control (z2ui5.cc.*) - bound to the
 *                    UI5 runtime, each would need a portable spec of its own
 *   member           a property, aggregation, event or association of a
 *                    listed control that the profile does not list for it
 *   binding          a binding form outside the profile: a named model other
 *                    than device>, a type, formatter or binding-info key it
 *                    does not list
 *   expression       an expression binding using a construct outside the
 *                    restricted grammar (RegExp, odata.*, an unlisted call)
 *   event-wire       an event wire form outside the profile (prevent_default_expr,
 *                    a handler that is not a wire at all in raw XML)
 *   event-argument   an event-argument descriptor outside the profile ($event,
 *                    $controller, a method call on a UI5 object, an event
 *                    parameter or $source property the closed lists lack)
 *   frontend-action  a frontend action (client->follow_up_action( ) /
 *                    _event_client( )) the profile's client-API list lacks
 *   nested-view      nest_view_display( ) & co. - decision Q1 of the protocol:
 *                    portable renderers tolerate NEST/NEST2 without rendering
 *                    them, so a portable APP must not use them
 *   client-api       another client API call the profile excludes
 *                    (`view_display( switch_default_model_path = … )`)
 *
 * A leaf module (no fs at load time, nothing from index.mjs or render.mjs), so
 * a consumer assembling the pipeline itself - the VS Code extension's browser
 * host - reaches it through the `./portable` export and hands the profile in
 * as an object.
 */
import { parenRegion, scrub, clientCalls } from './abap.mjs';
import { literalElements } from './abap-source.mjs';
import { memberSection } from './properties.mjs';

export const PORTABLE_RULE = 'portable-app';

/** The reasons a `portable-app` finding carries, in the order the rule card
 *  lists them. */
export const PORTABLE_REASONS = Object.freeze([
  'control', 'custom-control', 'member', 'binding', 'expression',
  'event-wire', 'event-argument', 'frontend-action', 'nested-view', 'client-api',
]);

/* portable.md section 2: the two root attributes a document may carry beside
 * its namespace declarations. The JSON lists the document roots but not their
 * attributes, so these two are the one piece of the profile restated here. */
const ROOT_ATTRIBUTES = new Set(['displayBlock', 'height']);

/* The companion-control namespace: excluded as a family, reported under its
 * own reason because the remedy differs (a portable spec per control). */
const CC_NAMESPACE = 'z2ui5.cc';

/* The server formats both close constants as the CONTROL_GLOBAL
 * `VIEW_SLOTS destroy <slot>` action (FRONTEND_EVENT_ALIASES in
 * frontend-actions.mjs), so they are portable exactly when that wire is. */
const ALIAS_WIRE = { POPUP_CLOSE: ['VIEW_SLOTS', 'destroy'], POPOVER_CLOSE: ['VIEW_SLOTS', 'destroy'] };

// ---------------------------------------------------------------------------
// the profile
// ---------------------------------------------------------------------------

const asNames = (v) => {
  if (!Array.isArray(v)) return null;
  return v.map((x) => (typeof x === 'string' ? x : x?.name ?? x?.action ?? x?.clientApi ?? null))
    .filter((x) => typeof x === 'string');
};
const pick = (obj, keys) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const k of keys) {
    const names = asNames(obj[k]);
    if (names) return names;
  }
  return null;
};

/* Decision Q10 of the protocol separates the action NAMES an app writes
 * (client->cs_event-… - what this linter reads) from the actions the frontend
 * RECEIVES on the wire (ROUTER + HASH_BACK, VIEW_SLOTS destroy, …). Before
 * it, `frontendActions.allowed` was one mixed list. The loader reads either
 * shape: the client-API names from the first of these keys that holds a list
 * (beside `allowed`, inside an object-valued `allowed`, or under `clientApi`),
 * falling back to the one pre-Q10 list. */
const CLIENT_ACTION_KEYS = ['clientApi', 'clientApiNames', 'clientApiActions', 'client', 'abap', 'backend'];
const WIRE_ACTION_KEYS = ['wire', 'wireActions', 'onTheWire', 'frontend', 'received'];

/** The client-API action names a profile allows (the `cs_event` names an app
 *  hands to follow_up_action( ) / _event_client( )), read robustly from the
 *  pre-Q10 and the Q10 shape of `frontendActions`. */
export function clientApiActionsOf(raw) {
  const fa = raw?.frontendActions ?? {};
  return pick(fa, CLIENT_ACTION_KEYS)
    ?? pick(fa.allowed, CLIENT_ACTION_KEYS)
    ?? asNames(fa.allowed)
    ?? pick(raw?.clientApi, ['actions', 'frontendActions', 'followUpActions'])
    ?? [];
}

/** The action names a frontend receives on the wire - what a raw view's
 *  `.eF('…')` names. Before Q10 the same list as the client-API names. */
export function wireActionsOf(raw) {
  const fa = raw?.frontendActions ?? {};
  return pick(fa, WIRE_ACTION_KEYS) ?? pick(fa.allowed, WIRE_ACTION_KEYS) ?? asNames(fa.allowed) ?? [];
}

const normalized = new WeakMap();

/** The profile JSON (data/portable-v1.json's shape) turned into the sets the
 *  rule asks, once per object. */
export function normalizeProfile(raw) {
  if (normalized.has(raw)) return normalized.get(raw);
  const names = (list) => asNames(list) ?? [];
  const controls = new Map();
  const entries = Array.isArray(raw?.controls)
    ? raw.controls.map((c) => [c?.name, c])
    : Object.entries(raw?.controls ?? {});
  for (const [name, c] of entries) {
    if (!name) continue;
    const aggregations = new Set(names(c?.aggregations));
    if (c?.defaultAggregation) aggregations.add(c.defaultAggregation);
    controls.set(name, {
      properties: new Set(names(c?.properties)),
      aggregations,
      events: new Set(names(c?.events)),
      tolerated: Boolean(c?.tolerated),
    });
  }
  const forms = raw?.bindingForms ?? {};
  const form = (id) => (forms.allowed ?? []).find((f) => f?.form === id) ?? {};
  const grammar = forms.expressionGrammar ?? {};
  const fa = raw?.frontendActions ?? {};
  const globals = {};
  for (const [target, methods] of Object.entries(fa.allowedGlobals ?? {})) globals[target] = new Set(asNames(methods) ?? []);
  const clientApi = raw?.clientApi ?? {};
  const excludedCalls = [];
  for (const entry of names(clientApi.excluded)) {
    const m = /^\s*(\w+)\s*(?:\(\s*(\w+)\s*\))?\s*$/.exec(entry);
    if (m) excludedCalls.push({ method: m[1].toLowerCase(), param: m[2]?.toLowerCase() ?? null, entry });
  }
  const profile = {
    version: raw?.version ?? null,
    documentRoots: new Set(names(raw?.documentRoots)),
    namespaces: new Set(names(raw?.namespaces)),
    excludedNamespaces: names(raw?.excludedNamespaces),
    universal: new Set(names(raw?.universalAttributes)),
    controls,
    objectKeys: new Set(names(form('object-binding').keys)),
    types: new Set(names(form('typed').types)),
    formatters: new Set(names(form('formatter').formatters)),
    devicePaths: new Set(names(form('device-model').paths)),
    formatOptions: new Set(names(forms.formatOptions)),
    constraints: new Set(names(forms.constraints)),
    grammar: {
      operators: new Set(names(grammar.operators)),
      members: new Set(names(grammar.members)),
      functions: new Set(names(grammar.functions)),
      literals: new Set(names(grammar.literals)),
    },
    eventParameters: raw?.eventParameters ?? {},
    clientActions: new Set(clientApiActionsOf(raw)),
    wireActions: new Set(wireActionsOf(raw)),
    globals,
    excludedCalls,
  };
  normalized.set(raw, profile);
  return profile;
}

/** Where the vendored profile lives - data/portable-v1.json, a verbatim copy
 *  of abap2UI5/protocol profiles/portable-v1.json (its source commit is in
 *  data/portable-v1.source.json). A file: URL, so this module needs no fs;
 *  the entry points read it, a host without a filesystem passes `profile`. */
export const PORTABLE_PROFILE_URL = new URL('../data/portable-v1.json', import.meta.url);

// ---------------------------------------------------------------------------
// bindings and expressions
// ---------------------------------------------------------------------------

const decodeEntities = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The top-level `{…}` segments of an attribute value - escaped braces
 *  (`\{`) are text, quotes inside a segment are respected. */
export function bindingSegments(value) {
  const v = String(value ?? '');
  const out = [];
  let depth = 0;
  let start = -1;
  let quote = null;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '\\') { i++; continue; }
    if (depth > 0 && quote) { if (c === quote) quote = null; continue; }
    if (depth > 0 && (c === "'" || c === '"')) { quote = c; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0 && --depth === 0) {
      out.push(v.slice(start, i + 1));
    }
  }
  return out;
}

/* A tolerant reader of UI5's binding-info syntax: relaxed JSON (unquoted
 * keys, single-quoted strings) plus bare dotted names (`formatter:
 * .fmt`). Returns undefined where it cannot read the text - then nothing is
 * judged, rather than a guess. */
function parseLoose(text) {
  let i = 0;
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const fail = () => { throw new Error('unreadable'); };
  const value = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj = {};
      ws();
      if (text[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        let key;
        if (text[i] === "'" || text[i] === '"') key = string();
        else {
          const m = /^[\w$.]+/.exec(text.slice(i));
          if (!m) fail();
          key = m[0];
          i += key.length;
        }
        ws();
        if (text[i] !== ':') fail();
        i++;
        obj[key] = value();
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return obj; }
        fail();
      }
    }
    if (c === '[') {
      i++;
      const arr = [];
      ws();
      if (text[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return arr; }
        fail();
      }
    }
    if (c === "'" || c === '"') return string();
    const m = /^-?\d+(?:\.\d+)?|^[\w$.]+/.exec(text.slice(i));
    if (!m) fail();
    i += m[0].length;
    if (m[0] === 'true') return true;
    if (m[0] === 'false') return false;
    if (m[0] === 'null') return null;
    return /^-?\d/.test(m[0]) ? Number(m[0]) : m[0];
  };
  const string = () => {
    const q = text[i++];
    let s = '';
    while (i < text.length && text[i] !== q) {
      if (text[i] === '\\') i++;
      s += text[i++];
    }
    if (text[i] !== q) fail();
    i++;
    return s;
  };
  try {
    const v = value();
    ws();
    return i === text.length ? v : undefined;
  } catch {
    return undefined;
  }
}

/** What is outside the profile in a model PATH (`model>path`): a named model
 *  other than device>, or a device> path the profile does not provide. */
function pathViolation(path, profile) {
  const m = /^\s*([^>{}\s/]+)>(.*)$/.exec(String(path));
  if (!m) return null;
  if (m[1] !== 'device') return `the named model ${m[1]}>`;
  const p = m[2].trim();
  if (profile.devicePaths.size && !profile.devicePaths.has(p)) return `the device model path ${p}`;
  return null;
}

/* The formatter list names `Formatter.X`; the framework publishes the same
 * module as the `z2ui5.Formatter` global, so both spellings are one name. */
const formatterName = (f) => String(f).replace(/^z2ui5\./, '');

/** What is outside the profile in a binding-info OBJECT (or a `parts` entry). */
function objectViolations(info, profile, out) {
  if (info === null || typeof info !== 'object' || Array.isArray(info)) return;
  for (const key of Object.keys(info)) {
    if (profile.objectKeys.size && !profile.objectKeys.has(key)) out.push(`the binding key ${key}`);
  }
  if (typeof info.path === 'string') {
    const v = pathViolation(info.path, profile);
    if (v) out.push(v);
  }
  if (typeof info.type === 'string' && profile.types.size && !profile.types.has(info.type)) out.push(`the type ${info.type}`);
  if (info.formatter !== undefined && info.formatter !== null) {
    const f = formatterName(info.formatter);
    if (!profile.formatters.has(f)) out.push(`the formatter ${info.formatter}`);
  }
  if (info.formatOptions && typeof info.formatOptions === 'object' && profile.formatOptions.size) {
    for (const [k, v] of Object.entries(info.formatOptions)) {
      if (k === 'source' && v && typeof v === 'object') {
        for (const s of Object.keys(v)) if (!profile.formatOptions.has(`source.${s}`)) out.push(`the format option source.${s}`);
      } else if (!profile.formatOptions.has(k)) out.push(`the format option ${k}`);
    }
  }
  if (info.constraints && typeof info.constraints === 'object' && profile.constraints.size) {
    for (const k of Object.keys(info.constraints)) if (!profile.constraints.has(k)) out.push(`the constraint ${k}`);
  }
  if (Array.isArray(info.parts)) {
    for (const part of info.parts) {
      if (typeof part === 'string') {
        const v = pathViolation(part, profile);
        if (v) out.push(v);
      } else objectViolations(part, profile, out);
    }
  }
}

const OPERATORS = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '!', '<', '>', '+', '-', '*', '/', '%', '?', ':', '(', ')', ','];
/* how the grammar names the punctuation: the ternary as one operator, the
 * parentheses as a pair; a comma separates function arguments */
const GRAMMAR_NAME = { '?': '?:', ':': '?:', '(': '( )', ')': '( )' };

/** The constructs of an expression binding's body (`{= … }` without the
 *  braces) that the profile's restricted grammar does not have. */
export function expressionViolations(body, profile) {
  const text = decodeEntities(body);
  const g = profile.grammar;
  const out = [];
  const add = (x) => { if (!out.includes(x)) out.push(x); };
  let i = 0;
  let prevValue = false;
  const peekParen = (j) => {
    while (j < text.length && /\s/.test(text[j])) j++;
    return text[j] === '(';
  };
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    // ${…} / %{…}: a reference (or an embedded binding info)
    if ((c === '$' || c === '%') && text[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      let quote = null;
      for (; j < text.length; j++) {
        const d = text[j];
        if (quote) { if (d === '\\') j++; else if (d === quote) quote = null; continue; }
        if (d === "'" || d === '"') quote = d;
        else if (d === '{') depth++;
        else if (d === '}' && --depth === 0) break;
      }
      const inner = text.slice(i + 2, j);
      if (/^\s*['"]?[\w$]+['"]?\s*:/.test(inner)) {
        const info = parseLoose(`{${inner}}`);
        if (info !== undefined) {
          const found = [];
          objectViolations(info, profile, found);
          found.forEach(add);
        }
      } else {
        const v = pathViolation(inner, profile);
        if (v) add(v);
      }
      i = j + 1;
      prevValue = true;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      i = j + 1;
      prevValue = true;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && !prevValue && /\d/.test(text[i + 1] ?? ''))) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      i += m[0].length;
      prevValue = true;
      continue;
    }
    if (c === '.' && prevValue) {
      const m = /^\.\s*([A-Za-z_$][\w$]*)/.exec(text.slice(i));
      if (!m) { add('the operator .'); i++; continue; }
      const end = i + m[0].length;
      const call = peekParen(end);
      const name = call ? `.${m[1]}()` : `.${m[1]}`;
      if (!(call ? g.functions : g.members).has(name)) add(call ? `the method ${name}` : `the member ${name}`);
      i = end;
      prevValue = true;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/.exec(text.slice(i));
      const word = m[0].replace(/\s+/g, '');
      const end = i + m[0].length;
      const call = peekParen(end);
      if (['true', 'false'].includes(word)) {
        if (g.literals.size && !g.literals.has('boolean')) add(`the literal ${word}`);
      } else if (word === 'null') {
        if (g.literals.size && !g.literals.has('null')) add('the literal null');
      } else if (call && g.functions.has(word)) {
        // Math.max( … ) and its siblings
      } else {
        add(call ? `the call ${word}()` : `the name ${word}`);
      }
      i = end;
      prevValue = true;
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    if (op) {
      const named = GRAMMAR_NAME[op] ?? op;
      if (op !== ',' && g.operators.size && !g.operators.has(named)) add(`the operator ${named}`);
      i += op.length;
      prevValue = op === ')';
      continue;
    }
    add(c === '[' || c === ']' ? 'an array or index [ ]' : c === '{' || c === '}' ? 'an object literal { }' : `the operator ${c}`);
    i++;
    prevValue = c === ']' || c === '}';
  }
  return out;
}

/** Every construct of one attribute value outside the profile's binding forms:
 *  `[{ reason: 'binding' | 'expression', value }]`. */
export function bindingViolations(value, profile) {
  const out = [];
  for (const seg of bindingSegments(value)) {
    const expr = /^\{:?=/.exec(seg);
    if (expr) {
      for (const v of expressionViolations(seg.slice(expr[0].length, -1), profile)) out.push({ reason: 'expression', value: v });
      continue;
    }
    if (/^\{\s*['"]?[\w$]+['"]?\s*:/.test(seg)) {
      const info = parseLoose(decodeEntities(seg));
      if (info === undefined) continue;
      const found = [];
      objectViolations(info, profile, found);
      for (const v of found) out.push({ reason: 'binding', value: v });
      continue;
    }
    const v = pathViolation(seg.slice(1, -1), profile);
    if (v) out.push({ reason: 'binding', value: v });
  }
  return out;
}

/** What is outside the profile in ONE event-argument descriptor of a wire on
 *  `control`'s `event` (either may be unknown: then only the closed
 *  exclusions are judged). */
export function argumentViolations(arg, profile, control = null, event = null) {
  const a = String(arg ?? '');
  const out = [];
  if (/\$event\b/.test(a)) out.push('$event (the raw UI5 event)');
  if (/\$controller\b/.test(a)) out.push('$controller (a frontend controller helper)');
  const objectCall = /\$\{[^}]*\}\s*\.\s*[A-Za-z_$][\w$]*\s*\(/.test(a);
  if (objectCall) out.push(`a method call on a UI5 object (${a.slice(0, 60)})`);
  // the parameter of such a call is the object it is called on - one finding
  if (control && event && !objectCall) {
    const allowed = profile.eventParameters?.[control]?.[event] ?? [];
    for (const m of a.matchAll(/\$\{\s*\$parameters>\/([\w$]+)/g)) {
      if (!allowed.includes(m[1])) out.push(`the event parameter $parameters>/${m[1]}`);
    }
  }
  if (control) {
    const c = profile.controls.get(control);
    for (const m of a.matchAll(/\$\{\s*\$source>\/([\w$]+)/g)) {
      if (c && !c.properties.has(m[1]) && !profile.universal.has(m[1])) out.push(`the source property $source>/${m[1]}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the view
// ---------------------------------------------------------------------------

const KIND = { properties: 'property', aggregations: 'aggregation', associations: 'association', events: 'event' };

/* The `( )` region of the builder call an attribute offset points at - the
 * `->a( … )` - and the first client wire call in it, with its own region. */
function wireCallAt(src, offset) {
  if (src == null || offset == null) return null;
  const open = src.indexOf('(', offset);
  if (open < 0 || open - offset > 40) return null;
  const { body } = parenRegion(src, open);
  for (const call of clientCalls(body, (m) => m === '_event' || m === '_event_client')) {
    const at = open + 1 + call.index;
    const paren = open + 1 + call.index + call[0].length - 1;
    return { at, method: call[1].toLowerCase(), body: parenRegion(src, paren).body, base: paren + 1 };
  }
  return null;
}

/** The literal arguments of a wire call: the `t_arg` rows, or the one-value
 *  `arg = …` form. A non-literal row is kept as null, like literalElements. */
function wireArgs(call) {
  const tm = call.body.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
  if (tm) {
    const argOpen = call.body.indexOf('(', tm.index + tm[0].length - 1);
    return literalElements(parenRegion(call.body, argOpen).body, call.base + argOpen + 1);
  }
  const one = call.body.match(/\barg\s*=\s*(?:`((?:[^`]|``)*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|)/i);
  if (!one) return [];
  const value = one[3] !== undefined && /(?<!\\)\{/.test(one[3]) ? null : (one[1] ?? one[2] ?? one[3]);
  return [{ value, offset: call.base + one.index }];
}

/** The arguments of a raw view's `.eB(…)` / `.eF(…)` wire, split at the top
 *  level (quotes and brackets respected). */
function xmlWireArgs(value) {
  const v = String(value);
  const open = v.indexOf('(');
  if (open < 0) return [];
  const out = [];
  let depth = 0;
  let quote = null;
  let start = open + 1;
  for (let i = open + 1; i < v.length; i++) {
    const c = v[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) { out.push(v.slice(start, i).trim()); return out; }
      depth--;
    } else if (c === ',' && depth === 0) { out.push(v.slice(start, i).trim()); start = i + 1; }
  }
  return out;
}

const unquote = (s) => String(s ?? '').trim().replace(/^\[?\s*(['"])(.*)\1\s*\]?$/, '$2');

/**
 * Judge one source against the portable profile.
 *
 *   nodes    the reconstructed documents (prepareAbap( ).nodes, or
 *            [parseXml( xml )] for a raw view) - every element under each
 *   source   the text the offsets point into: the ABAP class (its client
 *            calls are read too) or the raw XML
 *   abap     true for an ABAP class - its event wires are client calls
 *   data     the metadata snapshot, optional: only used to say whether an
 *            unlisted member is a property, aggregation, event or association
 *   profile  the profile JSON - required; the entry points read the vendored
 *            data/portable-v1.json (PORTABLE_PROFILE_URL) unless handed one
 *
 * Returns raw findings (type `portable-app`, a `reason`, an `offset`), to be
 * annotated like every other rule's.
 */
export function checkPortable({ nodes = [], source = '', abap = false, data = null, profile: raw = null } = {}) {
  if (!raw) throw new Error('checkPortable: no profile - pass the portable profile JSON as `profile`');
  const profile = normalizeProfile(raw);
  const findings = [];
  const seen = new Set();
  const report = (f) => {
    const key = `${f.reason}|${f.control ?? ''}|${f.member ?? ''}|${f.value ?? ''}|${f.offset}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ type: PORTABLE_RULE, ...f });
  };
  const code = abap ? scrub(String(source)) : String(source);
  // the wire call an event attribute carries -> the control and event it fires
  const wireOwner = new Map();

  const kindOf = (control, member) => {
    const section = data ? memberSection(data, control, member) : null;
    return section ? KIND[section] : null;
  };

  const excludedNs = (ns) => profile.excludedNamespaces.find((x) => ns === x || ns.startsWith(`${x}.`)) ?? null;

  const judgeValue = (full, attr, value, offset, event) => {
    if (event) {
      if (abap) {
        const call = wireCallAt(code, offset);
        if (call) wireOwner.set(call.at, { control: full, event: attr, call });
        return;
      }
      const v = String(value).trim();
      const wire = /^\.(eB|eF|eBP)\s*\(/.exec(v);
      if (!wire) {
        report({ reason: 'event-wire', control: full, member: attr, value: v.slice(0, 60), offset });
        return;
      }
      const args = xmlWireArgs(v);
      if (wire[1] === 'eF') {
        const action = unquote(args[0]);
        if (!actionAllowed(action, args.slice(1).map(unquote), true)) {
          report({ reason: 'frontend-action', control: full, member: attr, value: actionLabel(action, args.slice(1).map(unquote)), offset });
        }
      }
      if (wire[1] === 'eBP' && args[1] !== undefined && !/^(?:true|false)$/.test(args[1])) {
        report({ reason: 'event-wire', control: full, member: attr, value: 'prevent_default_expr (an expression over control objects)', offset });
      }
      const descriptors = wire[1] === 'eBP' ? args.slice(3) : args.slice(1);
      for (const arg of descriptors) {
        for (const v2 of argumentViolations(arg, profile, full, attr)) report({ reason: 'event-argument', control: full, member: attr, value: v2, offset });
      }
      return;
    }
    for (const b of bindingViolations(value, profile)) report({ ...b, control: full, member: attr, offset });
  };

  const walk = (node, nsMap, parent, depth) => {
    if (!node) return;
    const map = { ...nsMap };
    for (const [n, v] of node.attrs ?? []) {
      if (n === 'xmlns') map[''] = v;
      else if (String(n).startsWith('xmlns:')) map[String(n).slice(6)] = v;
    }
    if (!node.name) {
      for (const c of node.children ?? []) walk(c, map, parent, depth);
      return;
    }
    const local = String(node.name);
    const ns = map[node.ns ?? ''] ?? '';
    if (/^[a-z]/.test(local) && parent && ns && parent.ns !== undefined && ns !== parent.ns && excludedNs(ns)) {
      /* a lower-case element in a FOREIGN, excluded namespace is not an
       * aggregation of the control around it: XML templating
       * (template:repeat / if / with) - reported once, its content judged as
       * if it stood in the enclosing control */
      report({ reason: 'control', control: `${node.ns ? `${node.ns}:` : ''}${local}`, namespace: ns, offset: node.offset });
      for (const c of node.children ?? []) walk(c, map, parent, depth + 1);
      return;
    }
    if (/^[a-z]/.test(local) && parent) {
      // an aggregation element of the enclosing control
      if (parent.entry && !parent.entry.aggregations.has(local) && !profile.universal.has(local)) {
        report({ reason: 'member', control: parent.full, member: local, kind: 'aggregation', offset: node.offset });
      }
      for (const c of node.children ?? []) walk(c, map, { ...parent, aggregation: local }, depth + 1);
      return;
    }
    const full = ns ? `${ns}.${local}` : local;
    if (depth === 0 && profile.documentRoots.has(full)) {
      for (const [n, , offset] of node.attrs ?? []) {
        if (n === 'xmlns' || String(n).startsWith('xmlns:') || ROOT_ATTRIBUTES.has(n)) continue;
        report({ reason: 'member', control: full, member: n, kind: 'attribute', offset: offset ?? node.offset });
      }
      for (const c of node.children ?? []) walk(c, map, { full, ns, entry: null }, depth + 1);
      return;
    }
    const entry = profile.controls.get(full) ?? null;
    if (!entry) {
      const cc = ns === CC_NAMESPACE || ns.startsWith(`${CC_NAMESPACE}.`);
      report({
        reason: cc ? 'custom-control' : 'control', control: full,
        ...(cc ? {} : { namespace: excludedNs(ns) ?? (profile.namespaces.has(ns) ? null : ns || null) }),
        offset: node.offset,
      });
      // its members and aggregations are not judged - one finding per control;
      // the controls inside it still are
      for (const c of node.children ?? []) walk(c, map, { full, ns, entry: null }, depth + 1);
      return;
    }
    for (const [n, value, offset] of node.attrs ?? []) {
      const name = String(n);
      if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
      const at = offset ?? node.offset;
      const allowed = entry.properties.has(name) || entry.aggregations.has(name) || entry.events.has(name)
        || profile.universal.has(name) || (full === 'sap.m.Label' && name === 'labelFor');
      if (!allowed) {
        report({ reason: 'member', control: full, member: name, kind: name.includes(':') ? 'attribute' : kindOf(full, name), offset: at });
        continue;
      }
      const event = entry.events.has(name) || (data && memberSection(data, full, name) === 'events');
      judgeValue(full, name, value, at, event);
    }
    for (const c of node.children ?? []) walk(c, map, { full, ns, entry }, depth + 1);
  };

  const actionLabel = (action, args) => (action === 'CONTROL_GLOBAL' && args[0] ? `CONTROL_GLOBAL ${args[0]}${args[1] ? `.${args[1]}` : ''}` : action);

  /* Whether the profile allows a frontend action. CONTROL_GLOBAL is judged
   * by its target and method (allowedGlobals); a target given at runtime is
   * not judged. `wire` says the name was read off a raw view's `.eF( )`,
   * which carries what the frontend receives. */
  function actionAllowed(action, args, wire = false) {
    if (action === 'CONTROL_GLOBAL') {
      const [target, method] = args;
      if (target == null) return true;
      return Boolean(profile.globals[target]?.has(method ?? ''));
    }
    if (profile.clientActions.has(action) || (wire && profile.wireActions.has(action))) return true;
    const alias = ALIAS_WIRE[action];
    return Boolean(alias && profile.globals[alias[0]]?.has(alias[1]));
  }

  for (const root of nodes ?? []) walk(root, {}, null, 0);

  if (abap) {
    // frontend actions: every follow_up_action( ) / _event_client( ) wire
    for (const call of clientCalls(code, (m) => m === '_event_client' || m === 'follow_up_action')) {
      const paren = call.index + call[0].length - 1;
      const { body } = parenRegion(code, paren);
      const base = paren + 1;
      const token = body.match(/cs_event-(\w+)/i);
      let action;
      let at = call.index;
      if (token) {
        action = token[1].toUpperCase();
        at = base + token.index;
      } else {
        const lit = body.match(/(?:^\s*|\bval\s*=\s*)(?:`((?:[^`]|``)*)`|'((?:[^']|'')*)'|\|((?:[^|\\]|\\.)*)\|)/i);
        if (!lit) continue; // a runtime value: not judged
        const text = lit[1] ?? lit[2] ?? lit[3];
        at = base + lit.index;
        if (!/^[A-Za-z0-9_]+$/.test(text)) {
          // follow_up_action( `<javascript>` ): the raw escape hatch
          report({ reason: 'frontend-action', member: call[1].toLowerCase(), value: 'custom JavaScript', offset: at });
          continue;
        }
        action = text;
      }
      // a nested _event_client( ) inside follow_up_action( ) is the same wire:
      // it is reported once, at its own token
      const tm = body.match(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/i);
      const args = tm ? literalElements(parenRegion(body, body.indexOf('(', tm.index + tm[0].length - 1)).body, 0).map((x) => x.value) : [];
      if (!actionAllowed(action, args)) {
        report({ reason: 'frontend-action', member: call[1].toLowerCase(), value: actionLabel(action, args), offset: at });
      }
    }
    // the client calls the profile excludes: the nested slots, a parameter
    const methods = new Set(profile.excludedCalls.map((x) => x.method));
    for (const call of clientCalls(code, (m) => methods.has(m))) {
      const method = call[1].toLowerCase();
      const paren = call.index + call[0].length - 1;
      const { body } = parenRegion(code, paren);
      for (const ex of profile.excludedCalls.filter((x) => x.method === method)) {
        if (ex.param && !new RegExp(`\\b${ex.param}\\s*=`, 'i').test(body)) continue;
        report({
          reason: /^nest2?_/.test(method) ? 'nested-view' : 'client-api',
          member: method, value: ex.param, offset: call.index,
        });
      }
    }
    // event wires and frontend actions: the form, and every literal argument
    // descriptor ($controller helpers travel in follow_up_action( ) rows too)
    for (const call of clientCalls(code, (m) => m === '_event' || m === '_event_client' || m === 'follow_up_action')) {
      const paren = call.index + call[0].length - 1;
      const { body } = parenRegion(code, paren);
      const owner = wireOwner.get(call.index) ?? null;
      if (/\bprevent_default_expr\s*=/i.test(body)) {
        report({ reason: 'event-wire', control: owner?.control, member: owner?.event, value: 'prevent_default_expr (an expression over control objects)', offset: call.index });
      }
      for (const arg of wireArgs({ body, base: paren + 1 })) {
        if (arg.value == null) continue;
        for (const v of argumentViolations(arg.value, profile, owner?.control ?? null, owner?.event ?? null)) {
          report({ reason: 'event-argument', control: owner?.control, member: owner?.event, value: v, offset: arg.offset });
        }
      }
    }
  }
  return findings;
}
