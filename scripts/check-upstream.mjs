#!/usr/bin/env node
/*
 * check-upstream — drift gate for the HAND-MAINTAINED knowledge files.
 *
 * Four files in lib/ mirror closed sets that live in the abap2UI5 repo:
 *
 *   lib/formatters.mjs        <- app/webapp/model/formatter.js
 *   lib/frontend-actions.mjs  <- src/01/03/z2ui5_cl_ui5f_*_js.clas.abap
 *                                (GLOBAL_TARGETS, CSS_PROPERTIES and the two
 *                                CONTROL_BY_ID deny lists in the embedded JS)
 *   lib/released-api.mjs      <- the abapGit object layout of src/
 *                                (the released package src/02, the frozen
 *                                package src/99, and the prefix families
 *                                everything else has to fall into)
 *   lib/cc-controls.mjs       <- app/webapp/cc/*.js (the metadata-only
 *                                mirrors the render harness boots with)
 *
 * Upstream is not a dependency here, so a change there is a SILENT breaking
 * change: a new CONTROL_GLOBAL target makes the linter report correct new
 * code as invalid-frontend-action (that is exactly how POPUP.setWithinArea
 * arrived), a removed formatter makes the render harness pass views that
 * break live, and a property added to a companion control makes every view
 * that uses it fail view CREATION here - not a property finding a downstream
 * deviation can carry, but a dead view (that is exactly how MultiInputExt's
 * TokenKeyCell arrived). This script compares the mirrors against the current upstream
 * sources and exits 1 on any drift — the scheduled workflow turns that into
 * an issue instead of waiting for a user to hit it.
 *
 *   node scripts/check-upstream.mjs                    fetch from GitHub main
 *   node scripts/check-upstream.mjs --local <dir>      read an abap2UI5 checkout
 *
 * Exit codes: 0 in sync, 1 drift, 2 sources unreachable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CURATED_FORMATTERS } from '../lib/formatters.mjs';
import {
  GLOBAL_TARGETS, CSS_PROPERTIES, BINDING_METHODS,
  CONTROL_METHOD_DENY_EXACT, CONTROL_METHOD_DENY_PREFIXES,
  FRONTEND_EVENTS, VIEW_SLOTS, FILTER_OPERATORS, URLHELPER_ACTIONS,
  CONTROL_METHOD_ID_ARG, OBJECT_ARG_METHODS, CONTROL_METHOD_KINDS, URL_POLICIES,
  SHORTCUT_MODIFIERS, SHORTCUT_ALIASES,
} from '../lib/frontend-actions.mjs';
import { RELEASED_OBJECTS, FROZEN_OBJECTS, apiVerdict } from '../lib/released-api.mjs';
import { CC_CONTROLS } from '../lib/cc-controls.mjs';

const RAW = 'https://raw.githubusercontent.com/abap2UI5/abap2UI5/main';
const TREE = 'https://api.github.com/repos/abap2UI5/abap2UI5/git/trees/main?recursive=1';
const FORMATTER_PATH = 'app/webapp/model/formatter.js';

/* The frontend action JS lives embedded in the generated ABAP classes under
 * src/01/03. It used to be ONE class (z2ui5_cl_ui5f_frontact_js) and upstream
 * has since split it per action group — GLOBAL_TARGETS, CSS_PROPERTIES and
 * BINDING_METHODS moved to z2ui5_cl_ui5f_ctrlcall_js, the shortcut sets to
 * z2ui5_cl_ui5f_shortcut_js — which left this script reading a file that no
 * longer defines any of them, and every frontend-actions mirror unchecked.
 *
 * So the whole family is read and concatenated rather than one named file:
 * WHICH class holds a given closed set is upstream's business, and the next
 * split must not blind the gate again. The parsers below each look for their
 * own `const NAME =`, so one blob is what they want. */
/* The companion controls the render harness mirrors. Plain ES modules, one
 * per control, each a `Control.extend` with a `metadata: { properties: {…} }`
 * object literal - so the property NAMES parse out of the source directly. */
const CC_DIR = 'app/webapp/cc';

const ACTION_DIR = 'src/01/03';
const ACTION_FILE_RE = /^z2ui5_cl_ui5f_\w+_js\.clas\.abap$/;

/** The embedded-JS classes, repo-relative, from a full file list. */
function actionPathsOf(paths) {
  return paths
    .filter((p) => p.startsWith(`${ACTION_DIR}/`) && ACTION_FILE_RE.test(p.slice(ACTION_DIR.length + 1)))
    .sort();
}

/** The abapGit file name of an object -> the object name, or null for
 *  anything that is not one (a `package.devc.xml`, a test include, a sidecar
 *  of an object its own `.clas.abap`/`.intf.abap` already names). */
export function objectNameOf(file) {
  if (file.includes('.testclasses.')) return null;
  const m = file.match(/^(z2ui5_\w+)\.(?:clas|intf)\.abap$/)
    || file.match(/^(z2ui5_\w+)\.(?:tabl|dtel|doma|ddls|enqu)\.xml$/);
  return m ? m[1].toLowerCase() : null;
}

/** Every abap2UI5 object under `src/`, as `package path -> [object names]`.
 *  `paths` is the repository-relative file list. */
export function objectsByPackage(paths) {
  const out = {};
  for (const p of paths) {
    if (!p.startsWith('src/')) continue;
    const at = p.lastIndexOf('/');
    const name = objectNameOf(p.slice(at + 1));
    if (!name) continue;
    (out[p.slice(0, at)] ??= []).push(name);
  }
  return out;
}

/** Export surface of the curated formatter module: the top-level method
 *  names of its returned object literal (4-space indent, `Name(args) {`). */
export function parseFormatterExports(src) {
  return [...src.matchAll(/^    (\w+)\((?:[^)]*)\)?\s*\{?/gm)]
    .map((m) => m[1])
    .filter((n) => !['function', 'if', 'for', 'while', 'return', 'switch'].includes(n));
}

/** The JS the ABAP class embeds: every backtick literal's content, joined —
 *  the class is one string concatenation with `&& |\n| &&` line glue, so the
 *  literals ARE the JS lines. */
export function embeddedJs(abapSrc) {
  return [...abapSrc.matchAll(/`((?:[^`]|``)*)`/g)]
    .map((m) => m[1].replace(/``/g, '`'))
    .join('\n');
}

/** The property names a companion control declares: the keys of the
 *  `metadata: { properties: { … } }` object literal. Nested `{ type: … }`
 *  values are skipped by taking only the keys at depth 1 of that region. */
export function parseCcProperties(src) {
  const at = src.search(/properties\s*:\s*\{/);
  if (at === -1) return [];
  const body = braceRegion(src, src.indexOf('{', at));
  const out = [];
  let depth = 0;
  // a `//` comment can carry `word:` pairs that are not properties
  const code = body.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const re = /([A-Za-z_$][\w$]*)\s*:|[{}]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth--;
    else if (depth === 0) out.push(m[1]);
  }
  return out;
}

/** Body of the balanced { … } starting at src[open] === '{'. The region holds
 *  object literals and arrow functions only — no braces inside strings. */
function braceRegion(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

/* WHERE a named constant's literal starts, tolerating whatever the declaration
 * is wrapped in.
 *
 * Upstream hardened its lookup maps against prototype pollution
 * (`const GLOBAL_TARGETS = {` became
 * `const GLOBAL_TARGETS = Object.assign(Object.create(null), {`), and every
 * parser here looked for the OLD spelling literally — so the gate stopped
 * finding three of the sets it exists to compare and exited 2 on "the
 * embedding changed" instead of reporting drift. The lesson is the one this
 * file already carries about WHICH class holds a set: the wrapper is
 * upstream's business, and the next hardening pass must not blind the gate
 * again. So the name is located and the first `{` or `[` after it is taken,
 * which reads both spellings and anything else of that shape.
 *
 * Returns the index of the opening brace/bracket, or -1. */
function declAt(js, name, opener) {
  const decl = js.indexOf(`const ${name} = `);
  if (decl === -1) return -1;
  const at = js.indexOf(opener, decl);
  if (at === -1) return -1;
  /* The opener has to belong to THIS declaration — a name that is only ever
   * mentioned (never declared) would otherwise adopt the next literal in the
   * file. Nothing but a wrapper call may stand in between. */
  return /^[\w.(),\s]*$/.test(js.slice(decl + `const ${name} = `.length, at)) ? at : -1;
}

/** GLOBAL_TARGETS of the embedded FrontendAction JS: name -> [methods].
 *  Entries span one line (MESSAGE_TOAST) or many (MESSAGE_BOX), so the map
 *  is parsed brace-aware from the reconstructed JS, not line by line. */
export function parseGlobalTargets(abapSrc) {
  const js = embeddedJs(abapSrc);
  const out = {};
  const at = declAt(js, 'GLOBAL_TARGETS', '{');
  if (at === -1) return out;
  const body = braceRegion(js, at);
  const entryRe = /([A-Z][A-Z0-9_]*)\s*:\s*\{/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const open = body.indexOf('{', m.index + m[0].length - 1);
    const entry = braceRegion(body, open);
    const methodsAt = entry.search(/methods\s*:\s*\{/);
    if (methodsAt !== -1) {
      const methods = braceRegion(entry, entry.indexOf('{', methodsAt));
      // a `//` comment documenting the payload shape ("{ CODE: { digits: n } }")
      // carries `word:` pairs that are not methods - drop the comments first
      // (`://` of a URL is not a comment start)
      const code = methods.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      out[m[1]] = [...code.matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
    }
    entryRe.lastIndex = open + entry.length + 2; // never match inside the entry
  }
  return out;
}

/** The CSS_PROPERTIES array literal of FrontendAction.js: the quoted entries
 *  between `const CSS_PROPERTIES = [` and its closing bracket. */
export function parseCssProperties(abapSrc) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, 'CSS_PROPERTIES', '[');
  if (at === -1) return [];
  const end = js.indexOf('];', at);
  if (end === -1) return [];
  return [...js.slice(at, end).matchAll(/["'`]([a-z-]+)["'`]/g)].map((m) => m[1]);
}

/** One of FrontendAction.js's two CONTROL_BY_ID deny arrays, by name — the
 *  quoted entries between `const <name> = [` and its closing bracket. An
 *  entry may carry a trailing `//` comment, which is stripped first. */
export function parseDenyList(abapSrc, name) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, name, '[');
  if (at === -1) return [];
  const end = js.indexOf('];', at);
  if (end === -1) return [];
  const body = js.slice(at, end).replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

/** The BINDING_CALL method map of FrontendAction.js: the function-valued
 *  entries of `const BINDING_METHODS = { … }`. Every one of them takes the
 *  binding as its first parameter, which is what the parse keys on — an
 *  indent change upstream must not silently empty this list. */
export function parseBindingMethods(abapSrc) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, 'BINDING_METHODS', '{');
  if (at === -1) return [];
  const body = braceRegion(js, at);
  // shorthand-method DEFINITIONS only (`filter(binding, …) {`) — a helper
  // CALLED with the binding (`buildFilterGroups(binding, path);`) is not an
  // entry, and the `) {` tail is what tells the two apart
  return [...body.matchAll(/(\w+)\s*\(\s*binding\b[^)]*\)\s*\{/g)].map((m) => m[1]);
}

/** The top-level dispatch table: the keys of `const handlers = { … }`. */
export function parseHandlers(abapSrc) {
  const js = embeddedJs(abapSrc);
  /* EVERY `const handlers = { … }`, not the first: upstream split the dispatch
   * table per action group (browser, ctrlcall, launchpd, shortcut, variants,
   * viewops each declare one), so reading a single table reports the other
   * five groups' events as removed upstream. */
  const out = [];
  const needle = 'const handlers = {';
  for (let at = js.indexOf(needle); at !== -1; at = js.indexOf(needle, at + needle.length)) {
    const body = braceRegion(js, js.indexOf('{', at));
    out.push(...[...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]));
  }
  return [...new Set(out)];
}

/** A `const NAME = new Set([ … ])` / `const NAME = [ … ]` of quoted strings. */
export function parseStringList(abapSrc, name) {
  const js = embeddedJs(abapSrc);
  const at = js.indexOf(`const ${name} = `);
  if (at === -1) return [];
  const end = js.indexOf(']', at);
  if (end === -1) return [];
  return [...js.slice(at, end).matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

/** URLHELPER's `actions` map keys, scoped to evUrlHelper so an `actions`
 *  variable elsewhere never leaks in. */
export function parseUrlHelperActions(abapSrc) {
  const js = embeddedJs(abapSrc);
  const fn = js.indexOf('function evUrlHelper');
  if (fn === -1) return [];
  const body = braceRegion(js, js.indexOf('{', fn));
  const at = body.indexOf('actions = {');
  if (at === -1) return [];
  const map = braceRegion(body, body.indexOf('{', at));
  return [...map.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
}

/** CONTROL_METHODS with its arg kinds: name -> [kinds]. The two mirrors that
 *  derive from it (id-arg methods, object-payload methods) are compared
 *  against THIS parse, so a kind change upstream surfaces here. */
export function parseControlMethodKinds(abapSrc) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, 'CONTROL_METHODS', '{');
  if (at === -1) return {};
  const body = braceRegion(js, at);
  const out = {};
  for (const m of body.matchAll(/^\s*(\w+)\s*:\s*\[([^\]]*)\]/gm)) {
    out[m[1]] = [...m[2].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
  }
  return out;
}

/** URL_POLICIES: the built-in policy names setAsyncURLHandler may be given.
 *  An object of `NAME: () => …` entries, so the KEYS are the closed set. */
export function parseUrlPolicies(abapSrc) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, 'URL_POLICIES', '{');
  if (at === -1) return [];
  const body = braceRegion(js, at);
  return [...body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
}

/** SHORTCUT_ALIASES: alias -> canonical spelling. */
export function parseShortcutAliases(abapSrc) {
  const js = embeddedJs(abapSrc);
  const at = declAt(js, 'SHORTCUT_ALIASES', '{');
  if (at === -1) return {};
  const body = braceRegion(js, at);
  const out = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*["'`]([^"'`]*)["'`]/g)) out[m[1]] = m[2];
  return out;
}

const setDiff = (a, b) => a.filter((x) => !b.includes(x));

/*
 * Every network read goes through this: a timeout and a bounded retry.
 *
 * This script's exit 2 ("cannot read the upstream sources") opens the same
 * issue drift does, so a transient blip published "the knowledge files drifted
 * from abap2UI5" once a week for no reason. A `fetch` with no signal waits on
 * the operating system's timeout, and a single 502 or a rate-limit refusal
 * ended the whole run. generate-dependents.mjs already had both; this is the
 * same shape, one retry deeper because the tree API is the rate-limited one.
 */
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

async function fetchRetrying(url, init = {}) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // a timeout, a DNS failure, a reset connection - none of them is drift
      if (attempt >= ATTEMPTS) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    if (res.ok) return res;
    // 429 is the rate limit, 5xx is GitHub having a moment; a 404 is real
    if ((res.status === 429 || res.status >= 500) && attempt < ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    throw new Error(`${url}: HTTP ${res.status}`);
  }
}

/** A token is used wherever the environment offers one, purely for the rate
 *  limit — every URL here is public. Unauthenticated, a shared Actions runner
 *  shares 60 requests an hour with every other job on that IP, and this script
 *  makes one request per mirrored file. */
const authHeaders = () => {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
};

/** Raw file content. Deliberately UNauthenticated: raw.githubusercontent.com
 *  serves public files without a token and rejects some tokens outright, so
 *  the header would trade one failure mode for another. */
async function fetchText(url) {
  return (await fetchRetrying(url)).text();
}

/** The repository's file list. Over the network that is the git tree API
 *  (one request for the whole repo). */
async function fetchTree(url) {
  const body = await (await fetchRetrying(url, { headers: authHeaders() })).json();
  if (body.truncated) throw new Error(`${url}: the tree came back truncated`);
  return (body.tree || []).filter((e) => e.type === 'blob').map((e) => e.path);
}

/** The same list from a checkout: every file under `dir`, repo-relative. */
function walkFiles(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkFiles(dir, rel));
    else out.push(rel);
  }
  return out;
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const localAt = process.argv.indexOf('--local');
  const LOCAL = localAt !== -1 ? process.argv[localAt + 1] : null;
  if (localAt !== -1 && !LOCAL) {
    console.error('check-upstream: --local needs the path of an abap2UI5 checkout');
    process.exit(2);
  }

  let formatterSrc;
  let actionSrc;
  let actionPaths = [];
  let srcPaths;
  const ccSrc = {};
  try {
    if (LOCAL) {
      formatterSrc = fs.readFileSync(path.join(LOCAL, FORMATTER_PATH), 'utf8');
      srcPaths = walkFiles(LOCAL);
      actionPaths = actionPathsOf(srcPaths);
      actionSrc = actionPaths.map((p) => fs.readFileSync(path.join(LOCAL, p), 'utf8')).join('\n');
      for (const name of Object.keys(CC_CONTROLS)) {
        const at = path.join(LOCAL, CC_DIR, `${name}.js`);
        if (fs.existsSync(at)) ccSrc[name] = fs.readFileSync(at, 'utf8');
      }
    } else {
      [formatterSrc, srcPaths] = await Promise.all([
        fetchText(`${RAW}/${FORMATTER_PATH}`),
        fetchTree(TREE),
      ]);
      actionPaths = actionPathsOf(srcPaths);
      actionSrc = (await Promise.all(actionPaths.map((p) => fetchText(`${RAW}/${p}`)))).join('\n');
      const names = Object.keys(CC_CONTROLS).filter((n) => srcPaths.includes(`${CC_DIR}/${n}.js`));
      const sources = await Promise.all(names.map((n) => fetchText(`${RAW}/${CC_DIR}/${n}.js`)));
      names.forEach((n, i) => { ccSrc[n] = sources[i]; });
    }
  } catch (e) {
    console.error(`check-upstream: cannot read the upstream sources — ${e.message}`);
    console.error(`(if a file moved upstream, update FORMATTER_PATH / ACTION_DIR here)`);
    process.exit(2);
  }
  if (!actionPaths.length) {
    console.error(`check-upstream: no ${ACTION_DIR}/${ACTION_FILE_RE.source} classes found — the embedded-JS layout changed, update ACTION_DIR/ACTION_FILE_RE`);
    process.exit(2);
  }

  let drift = 0;
  const report = (what, ours, theirs) => {
    const missingHere = setDiff(theirs, ours);
    const staleHere = setDiff(ours, theirs);
    if (!missingHere.length && !staleHere.length) {
      console.log(`ok    ${what}: in sync (${ours.length} entr${ours.length === 1 ? 'y' : 'ies'})`);
      return;
    }
    drift++;
    console.log(`DRIFT ${what}:`);
    for (const n of missingHere) console.log(`  + upstream has '${n}' — missing here (correct new code gets reported until it is added)`);
    for (const n of staleHere) console.log(`  - '${n}' is gone upstream — stale here (broken code passes until it is removed)`);
  };

  report('curated formatters (lib/formatters.mjs)', [...CURATED_FORMATTERS], parseFormatterExports(formatterSrc));

  /* The companion-control mirrors the render harness boots with. A property
   * upstream added and this file lacks is not a finding a downstream sidecar
   * can declare away - the view fails to CREATE, so the whole document is
   * dead. A property this file still has and upstream dropped is the other
   * half: a view naming it renders green here and breaks live. Both are
   * reported per control; a control whose source is GONE upstream is reported
   * too, because a mirror of nothing is worse than no mirror. */
  for (const name of Object.keys(CC_CONTROLS)) {
    if (!ccSrc[name]) {
      drift++;
      console.log(`DRIFT companion control ${name} (lib/cc-controls.mjs):`);
      console.log(`  ! ${CC_DIR}/${name}.js is gone upstream — the mirror has no source any more`);
      continue;
    }
    report(`companion control ${name} (lib/cc-controls.mjs)`,
      Object.keys(CC_CONTROLS[name].properties), parseCcProperties(ccSrc[name]));
  }

  /* The object layout of `src/` — the third mirror, and the one that decides
   * what `non-released-api` calls a violation. Three separate questions:
   * does the RELEASED list still match src/02 (a stale entry reports correct
   * code, a missing one lets a new released object be reported), does the
   * FROZEN list still match src/99 and its sub-packages, and does every
   * REMAINING object still fall into one of the internal prefix families
   * (one that does not is silently allowed, which is how a rule stops
   * seeing the layer it was written for). */
  {
    const packages = objectsByPackage(srcPaths);
    const inPackages = Object.entries(packages);
    if (!inPackages.length) {
      console.error('check-upstream: no abapGit objects found under src/ — the layout changed, update objectNameOf/objectsByPackage');
      process.exit(2);
    }
    report('released API objects (lib/released-api.mjs)', [...RELEASED_OBJECTS], packages['src/02'] ?? []);

    const frozenPackages = inPackages.filter(([p]) => p === 'src/99' || p.startsWith('src/99/'));
    report('frozen package objects (lib/released-api.mjs)',
      Object.keys(FROZEN_OBJECTS),
      frozenPackages.flatMap(([, names]) => names));
    // …and WHERE each of them sits: an object moving between 99/01 and 99/02
    // does not change the verdict but does change the advice the finding gives
    report('frozen package layout (lib/released-api.mjs)',
      Object.entries(FROZEN_OBJECTS).map(([n, o]) => `${n}@${o.area}`),
      frozenPackages.flatMap(([p, names]) => names.map((n) => `${n}@${p}`)));

    const strays = [];
    let classified = 0;
    for (const [pkg, names] of inPackages) {
      if (pkg === 'src/02' || pkg === 'src/99' || pkg.startsWith('src/99/')) continue;
      for (const name of names) {
        if (apiVerdict(name)) classified++;
        else strays.push(`${name} (${pkg})`);
      }
    }
    if (strays.length) {
      drift++;
      console.log('DRIFT internal object prefixes (lib/released-api.mjs):');
      for (const s of strays) console.log(`  ? '${s}' matches no internal prefix family — an app naming it is NOT reported`);
    } else {
      console.log(`ok    internal object prefixes: every internal object is classified (${classified} objects)`);
    }
  }

  const upstreamTargets = parseGlobalTargets(actionSrc);
  if (!Object.keys(upstreamTargets).length) {
    console.error('check-upstream: could not find GLOBAL_TARGETS in the frontendaction class — the embedding changed, update parseGlobalTargets');
    process.exit(2);
  }
  report('CONTROL_GLOBAL targets (lib/frontend-actions.mjs)', Object.keys(GLOBAL_TARGETS), Object.keys(upstreamTargets));
  // the css pseudo-method's property allowlist is a second closed set in the
  // same file - a property the frontend dropped silently is exactly what the
  // linter is here to catch, so the mirror must not drift either
  const upstreamCss = parseCssProperties(actionSrc);
  if (upstreamCss.length) report('CONTROL_BY_ID css properties (lib/frontend-actions.mjs)', CSS_PROPERTIES, upstreamCss);
  /* The CONTROL_BY_ID denylist is the third closed set in the same file. It
   * drifts in BOTH directions with consequences: a method that became denied
   * upstream is a wire the linter still calls fine, and a method that was
   * freed stays reported as broken. */
  for (const [what, ours] of [
    ['CONTROL_METHOD_DENY_EXACT', CONTROL_METHOD_DENY_EXACT],
    ['CONTROL_METHOD_DENY_PREFIXES', CONTROL_METHOD_DENY_PREFIXES],
  ]) {
    const theirs = parseDenyList(actionSrc, what);
    if (!theirs.length) {
      console.error(`check-upstream: could not find ${what} in the frontendaction class — the embedding changed, update parseDenyList`);
      process.exit(2);
    }
    report(`CONTROL_BY_ID ${what} (lib/frontend-actions.mjs)`, ours, theirs);
  }
  for (const name of Object.keys(GLOBAL_TARGETS)) {
    if (upstreamTargets[name]) {
      report(`CONTROL_GLOBAL ${name} methods`, GLOBAL_TARGETS[name], upstreamTargets[name]);
    }
  }
  /* BINDING_CALL's method map is the fourth closed set in the same file —
   * it was the one mirror check-upstream did NOT compare, which is exactly
   * how a mirror rots. */
  {
    const theirs = parseBindingMethods(actionSrc);
    if (!theirs.length) {
      console.error('check-upstream: could not find BINDING_METHODS in the frontendaction class — the embedding changed, update parseBindingMethods');
      process.exit(2);
    }
    report('BINDING_CALL methods (lib/frontend-actions.mjs)', [...BINDING_METHODS], theirs);
  }
  /* The 2026-08-11 round mirrored the REMAINING closed sets — each gated
   * here the moment it was added, so none of them can rot the way
   * BINDING_METHODS almost did. FRONTEND_EVENT_ALIASES is the one deliberate
   * exception: the five *_NAV_CONTAINER_TO names live in the SERVER's remap
   * (z2ui5_cl_ui5_srv_event), not in the frontend source this script
   * fetches, and are marked obsolete upstream. */
  {
    const theirs = parseHandlers(actionSrc);
    if (!theirs.length) {
      console.error('check-upstream: could not find the handlers dispatch table — the embedding changed, update parseHandlers');
      process.exit(2);
    }
    report('frontend action dispatch table (lib/frontend-actions.mjs)', [...FRONTEND_EVENTS], theirs);
  }
  {
    const theirs = parseStringList(actionSrc, 'FILTER_OPERATORS');
    if (!theirs.length) {
      console.error('check-upstream: could not find FILTER_OPERATORS — the embedding changed, update parseStringList');
      process.exit(2);
    }
    report('BINDING_CALL filter operators (lib/frontend-actions.mjs)', [...FILTER_OPERATORS], theirs);
  }
  {
    const theirs = parseStringList(actionSrc, 'SHORTCUT_SLOTS');
    if (theirs.length) report('view slots (lib/frontend-actions.mjs)', [...VIEW_SLOTS], theirs);
    const mods = parseStringList(actionSrc, 'SHORTCUT_MODIFIERS');
    if (mods.length) report('shortcut modifiers (lib/frontend-actions.mjs)', [...SHORTCUT_MODIFIERS], mods);
    const aliases = parseShortcutAliases(actionSrc);
    if (Object.keys(aliases).length) {
      report('shortcut aliases (lib/frontend-actions.mjs)',
        Object.entries(SHORTCUT_ALIASES).map(([k, v]) => `${k}>${v}`),
        Object.entries(aliases).map(([k, v]) => `${k}>${v}`));
    }
  }
  {
    const theirs = parseUrlHelperActions(actionSrc);
    if (!theirs.length) {
      console.error('check-upstream: could not find evUrlHelper\'s actions map — the embedding changed, update parseUrlHelperActions');
      process.exit(2);
    }
    report('URLHELPER actions (lib/frontend-actions.mjs)', [...URLHELPER_ACTIONS], theirs);
  }
  {
    const kinds = parseControlMethodKinds(actionSrc);
    if (!Object.keys(kinds).length) {
      console.error('check-upstream: could not find CONTROL_METHODS — the embedding changed, update parseControlMethodKinds');
      process.exit(2);
    }
    // `pageId` resolves a control id exactly as `controlId` does and only
    // differs in what it hands the container afterwards (the id, not the
    // control), so a method carrying it still takes an id argument.
    const ID_KINDS = ['controlId', 'pageId', 'anchor', 'controlIdOrNull'];
    const idArg = Object.keys(kinds).filter((k) => ID_KINDS.includes(kinds[k][0]));
    report('CONTROL_BY_ID id-argument methods (lib/frontend-actions.mjs)', [...CONTROL_METHOD_ID_ARG], idArg);
    const objArg = Object.keys(kinds).filter((k) => kinds[k][0] === 'object');
    report('CONTROL_BY_ID object-payload methods (lib/frontend-actions.mjs)', Object.keys(OBJECT_ARG_METHODS), objArg);

    /* The WHOLE map, not only the two projections above. Arity and the
     * int/bool kinds are what `control-call-arg-count` and
     * `control-call-arg-kind` judge, and a mirror nothing compares is a mirror
     * that rots — which is the lesson BINDING_METHODS already taught here. */
    report('CONTROL_BY_ID method names (lib/frontend-actions.mjs)',
      Object.keys(CONTROL_METHOD_KINDS), Object.keys(kinds));
    for (const name of Object.keys(CONTROL_METHOD_KINDS)) {
      if (kinds[name]) {
        report(`CONTROL_BY_ID ${name} argument kinds`, CONTROL_METHOD_KINDS[name], kinds[name]);
      }
    }
  }
  {
    const theirs = parseUrlPolicies(actionSrc);
    if (!theirs.length) {
      console.error('check-upstream: could not find URL_POLICIES — the embedding changed, update parseUrlPolicies');
      process.exit(2);
    }
    report('setAsyncURLHandler policies (lib/frontend-actions.mjs)', [...URL_POLICIES], theirs);
  }

  if (drift) {
    console.log('\ncheck-upstream: the hand-maintained mirrors drifted — update them (and their tests/fixtures) in one change.');
    process.exit(1);
  }
  console.log('\ncheck-upstream: all mirrors in sync.');
}
