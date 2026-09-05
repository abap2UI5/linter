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
 * version, the metadata snapshot's ui5Version and every resolved setting that
 * can change a verdict (the floor, the distribution, the allow list, which
 * gates run, the rules block). Any of those moving drops the entire cache —
 * cheaper to recompute than to reason per key about what a setting touches.
 *
 * The cache file is JSON and expendable by design: unreadable, corrupt or
 * from another context all mean "empty", never an error. Deleting it is
 * always safe. `--fix` needs no special handling here — it rewrites the file,
 * the content hash moves, and the stale entry simply never matches again.
 */
import crypto from 'crypto';
import fs from 'fs';

export const CACHE_VERSION = 1;
export const DEFAULT_CACHE_FILE = '.abap2ui5lintcache';

export const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** The context hash everything in the cache is conditional on. `options` is
 *  the RESOLVED option set (CLI over config over default), read after every
 *  precedence decision has been made. */
export function cacheContext({ version, snapshot, options = {} }) {
  const relevant = {
    minUi5: options.minUi5,
    distribution: options.distribution ?? null,
    allow: [...(options.allow ?? [])].sort(),
    render: options.render === true,
    properties: options.properties !== false,
    rules: options.rules ?? {},
  };
  return hashOf(JSON.stringify({ version, snapshot, relevant }));
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
 * reconstructed documents or the mock model, which no formatter and no
 * baseline ever looks at. They were stored all the same, and on the samples
 * corpus they were more than half of the cache file (168 KB of documents and
 * 27 KB of model in a 350 KB file). `formatJson` leaves both out for the same
 * reason; the cache now does too. */
export function cacheable(result) {
  const { docs, model, docKinds, ...kept } = result ?? {};
  return kept;
}

/** Write the cache for the next run. Entries: { [resolvedPath]: { hash, result } }. */
export function saveCache(file, context, entries) {
  fs.writeFileSync(file, JSON.stringify({ version: CACHE_VERSION, context, files: entries }));
}
