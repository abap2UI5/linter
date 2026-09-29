/*
 * baseline — adopt the linter on a repo that already has findings.
 *
 * Switching a linter on over an existing codebase produces everything at
 * once, and the only escapes so far lost information: `rules: false` switches
 * a rule off wholesale, a directive touches every line. The baseline is the
 * third way, the one abaplint and this ecosystem's own pattern-lint use: a
 * committed file that says "these findings existed when we adopted the
 * linter". Baselined findings are suppressed (counted, never listed), NEW
 * findings fail normally — so the debt is frozen, not ignored.
 *
 * The key is deliberately line-free (`file|rule|control|member|value` with a
 * COUNT per key): moving code around does not invalidate the baseline, only
 * fixing or adding a finding changes it. File paths in the keys are relative
 * to the BASELINE FILE's directory, not to whatever cwd a run happens to
 * have — so the CLI from any directory, the Action and the VS Code extension
 * all compute identical keys. A STALE entry — one no current finding matches
 * — FAILS the run, the same contract every declared skip in this ecosystem
 * has: a suppression can never quietly outlive what it was suppressing.
 * `--update-baseline` rewrites the file from the current state.
 *
 * "Stale" and "current state" are both about the files THIS RUN LINTED. An
 * entry for a file the run never looked at is not stale - its finding was not
 * looked for - and linting one file out of a baselined `src` used to call
 * every other file's entry stale (56 of 57, exit 1, `--advisory` and
 * `--stdin` included). Likewise `--update-baseline` over one file replaces
 * that file's entries and keeps the rest; it used to shrink the baseline to
 * the one file. The exception both ways is an entry whose file is GONE from
 * disk: nothing will ever match it again, so it is stale in any run and an
 * update drops it.
 *
 * Render errors are not baselineable: their message text is unstable and
 * `rules['render-error']` already waives them per file.
 */
import fs from 'fs';
import path from 'path';

/** The stable identity of a finding — no line, so moved code stays matched. */
export function findingKey(relativeFile, f) {
  return [relativeFile, f.type, f.control || '', f.member || '', f.value || ''].join('|');
}

const relOf = (baseDir, file) => path.relative(baseDir, file || '').split(path.sep).join('/');

/** The directory keys are computed against: where the baseline file lives. */
export const baselineBase = (file) => path.dirname(path.resolve(file));

/** The file part of a baseline key - the segment before the first `|`. */
export const keyFile = (key) => String(key).split('|')[0];

/* Whether an entry's file is one this run can speak for: linted in it, or no
 * longer there at all. */
const decidable = (baseDir, linted) => (key) => {
  const file = keyFile(key);
  return linted.has(file) || !fs.existsSync(path.resolve(baseDir, file));
};

/** Parse a baseline file into key -> count. Throws with a precise message. */
export function loadBaseline(file) {
  let raw;
  try {
    // a byte-order mark (Notepad, PowerShell's Out-File) is an encoding
    // marker, not JSON: it failed as "Unexpected token" on a file that
    // looks fine in every editor
    raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`${file}: not a valid baseline file - ${e.message}`);
  }
  if (typeof raw.findings !== 'object' || raw.findings === null || Array.isArray(raw.findings)) {
    throw new Error(`${file}: 'findings' must be an object of finding-key -> count`);
  }
  const map = new Map();
  for (const [k, n] of Object.entries(raw.findings)) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`${file}: findings['${k}'] must be a positive integer count`);
    map.set(k, n);
  }
  return map;
}

/**
 * Drop the findings the baseline covers (mutates each result's findings).
 * Returns { suppressed, byRule, stale } — stale entries are the caller's to
 * fail on. `byRule` is what the accepted debt is MADE of: a suppressed count
 * alone says how much was swallowed, never what, and the shape of the debt is
 * what tells a reader which rule to work off next.
 */
export function applyBaseline(results, baseline, baseDir = process.cwd()) {
  const remaining = new Map(baseline);
  const byRule = {};
  let suppressed = 0;
  const linted = new Set();
  for (const r of results) {
    const rel = relOf(baseDir, r.file);
    linted.add(rel);
    r.findings = r.findings.filter((f) => {
      const key = findingKey(rel, f);
      const n = remaining.get(key) || 0;
      if (n > 0) {
        remaining.set(key, n - 1);
        suppressed++;
        byRule[f.type] = (byRule[f.type] || 0) + 1;
        return false;
      }
      return true;
    });
  }
  const inRun = decidable(baseDir, linted);
  const stale = [...remaining.entries()]
    .filter(([key, n]) => n > 0 && inRun(key))
    .map(([key, count]) => ({ key, count }));
  return { suppressed, byRule, stale };
}

/** The current findings as a baseline map (post-settle, pre-baseline). */
export function buildBaseline(results, baseDir = process.cwd()) {
  const map = new Map();
  for (const r of results) {
    const rel = relOf(baseDir, r.file);
    for (const f of r.findings) {
      const key = findingKey(rel, f);
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

/**
 * `--update-baseline` over an existing file: the entries of every file this
 * run linted are replaced by what the run found, the entries of every other
 * file are kept - except where that file is gone from disk. Without a
 * previous map this is buildBaseline( ).
 */
export function updateBaseline(previous, results, baseDir = process.cwd()) {
  const fresh = buildBaseline(results, baseDir);
  if (!previous?.size) return fresh;
  const linted = new Set(results.map((r) => relOf(baseDir, r.file)));
  const replaced = decidable(baseDir, linted);
  const map = new Map();
  for (const [key, n] of previous) if (!replaced(key)) map.set(key, n);
  for (const [key, n] of fresh) map.set(key, n);
  return map;
}

/** Write a baseline map, keys sorted so the diff of an update stays readable. */
export function writeBaseline(file, map) {
  const findings = {};
  for (const key of [...map.keys()].sort()) findings[key] = map.get(key);
  fs.writeFileSync(file, `${JSON.stringify({
    note: 'abap2ui5-linter baseline: findings that existed when the linter was adopted. Suppressed on every run; NEW findings still fail, a STALE entry fails too. Regenerate with --update-baseline.',
    findings,
  }, null, 2)}\n`);
}
