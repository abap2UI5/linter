/*
 * cache — the opt-in cross-run result cache behind `--cache`, eslint-style.
 *
 * A corpus run pays both gates for every file on every invocation, even when
 * nothing changed since the last one. With `--cache` the CLI stores each
 * file's RESULT (the findings, not just pass/fail — a baselined corpus needs
 * the findings again on replay) keyed by a hash of the file's content, and a
 * later run replays the stored result instead of running either gate.
 *
 * The entry is only trusted when the WHOLE context still holds: the linter
 * version AND its code (a fingerprint of cli.mjs, lib/*.mjs and data/*.json -
 * an unreleased checkout, a hotfix or a regenerated data file does not move
 * the version), the metadata snapshot's ui5Version, every resolved setting that
 * can change a verdict (the floor, the distribution, the allow list, which
 * gates run, the rules block) and - for a run that renders - the UI5 release
 * the render runtime serves, which moves on its own when
 * @abap2ui5/linter-render is upgraded without the linter. Any of those
 * moving drops the entire cache — cheaper to recompute than to reason per
 * key about what a setting touches.
 *
 * One input is not the file's own: what the class index (`classIndexOf( )`)
 * says about the classes it inherits from, and what the other classes of the
 * run read of it from outside (`outsideReads`). Each entry therefore carries
 * a second hash, `deps` - of those facts as its check read them
 * (`classIndexDeps( )`) - so editing a superclass re-judges its subclasses,
 * and a caller that starts or stops reading a popup's `ms_result` re-judges
 * the popup, without dropping anybody else's entry.
 *
 * The cache file is JSON and expendable by design: unreadable, corrupt or
 * from another context all mean "empty", never an error. Deleting it is
 * always safe. `--fix` needs no special handling here — it rewrites the file,
 * the content hash moves, and the stale entry simply never matches again.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const CACHE_VERSION = 2;
export const DEFAULT_CACHE_FILE = '.abap2ui5lintcache';

export const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

/* The code a verdict comes out of: cli.mjs, every lib/*.mjs and every
 * data/*.json of THIS installation, hashed once per process. The version
 * alone is not enough - a checkout between two releases, a patched
 * node_modules or a regenerated snapshot all keep it - and a cache that
 * outlives the code that wrote it replays the old verdicts. */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fingerprint = null;
export function linterFingerprint() {
  if (fingerprint) return fingerprint;
  const h = crypto.createHash('sha256');
  const add = (rel) => {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, rel)); } catch { return; }
    h.update(`${rel}\0`).update(text).update('\0');
  };
  add('cli.mjs');
  for (const dir of ['lib', 'data']) {
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, dir)); } catch { /* not shipped */ }
    for (const name of names.filter((n) => /\.(?:mjs|json)$/.test(n)).sort()) add(`${dir}/${name}`);
  }
  fingerprint = h.digest('hex');
  return fingerprint;
}

/** The context hash everything in the cache is conditional on. `options` is
 *  the RESOLVED option set (CLI over config over default), read after every
 *  precedence decision has been made. `runtime` is the UI5 release the render
 *  runtime serves (renderRuntimeUi5Version( ) in render.mjs): a render
 *  verdict belongs to it - an upgraded runtime replayed the render errors of
 *  the one before - while a property-only run does not depend on it and
 *  keeps its cache across the upgrade. */
export function cacheContext({ version, snapshot, runtime = null, options = {} }) {
  const relevant = {
    minUi5: options.minUi5,
    distribution: options.distribution ?? null,
    allow: [...(options.allow ?? [])].sort(),
    render: options.render === true,
    properties: options.properties !== false,
    allClasses: options.allClasses === true,
    rules: options.rules ?? {},
  };
  if (options.render === true) relevant.runtime = runtime ?? null;
  return hashOf(JSON.stringify({ version, code: linterFingerprint(), snapshot, relevant }));
}

/** The stored per-file entries, or {} — for a missing file, a corrupt one,
 *  a foreign shape, another linter version or another context. */
export function loadCache(file, context) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || raw.version !== CACHE_VERSION) return {};
  if (raw.context !== context) return {};
  return typeof raw.files === 'object' && raw.files !== null ? raw.files : {};
}

/* What of a result the cache keeps: everything a replay reads - the findings,
 * the render errors, the stats, the notes, the flags - and not the
 * reconstructed documents or the mock models (the class-wide one and the
 * per-document `docModels`), which no formatter and no baseline ever looks
 * at. They were stored all the same, and on the samples
 * corpus they were more than half of the cache file (168 KB of documents and
 * 27 KB of model in a 350 KB file). `formatJson` leaves both out for the same
 * reason; the cache now does too. */
export function cacheable(result) {
  const { docs, model, docModels, docKinds, ...kept } = result ?? {};
  return kept;
}

/** Write the cache for the next run. Entries: { [resolvedPath]: { hash, deps, result } }.
 *  `previous` (what loadCache( ) returned for the same context) is merged
 *  under them: a run over part of a tree - one file named, a pre-commit
 *  hook's changed files - keeps the entries of every other file, so the next
 *  full run still hits. An entry whose file is gone from disk is dropped, or
 *  the cache would grow with every rename. */
export function saveCache(file, context, entries, previous = {}) {
  const files = {};
  for (const [key, entry] of Object.entries(previous ?? {})) {
    if (!(key in entries) && fs.existsSync(key)) files[key] = entry;
  }
  Object.assign(files, entries);
  fs.writeFileSync(file, JSON.stringify({ version: CACHE_VERSION, context, files }));
}
