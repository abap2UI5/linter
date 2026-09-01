/*
 * config — the abap2ui5lint.jsonc config file.
 *
 * The same idea as abaplint.jsonc next door: a repo pins its lint settings in
 * a committed file instead of every caller repeating CLI flags. Discovery is
 * eslint-style: an explicit --config wins, otherwise the file is searched
 * upward from the current directory and from each given path. Precedence per
 * option: explicit CLI flag > config file > built-in default.
 *
 * Recognized keys (all optional):
 *   $schema      string - JSON-schema URL, for editor completion only
 *   extends      string - path to another abap2ui5lint.jsonc/.json whose
 *                         settings are the base; this file wins per key, the
 *                         two `rules` blocks merge per rule id. Resolved
 *                         against this file; chains follow, cycles refuse
 *   paths        array  - files/directories to check (used only when the CLI
 *                         got no positional paths)
 *   ignore       array  - regex patterns; a path a directory WALK reaches and
 *                         one of these matches is not collected at all. The
 *                         repo-level counterpart of `rules[id].exclude`, which
 *                         is per rule: generated or vendored ABAP under src/
 *                         is not a rule to waive, it is a tree not to read.
 *                         A path named explicitly on the command line is still
 *                         checked - `ignore` filters a scan, not an argument.
 *   ui5          string - UI5 floor for the property gate (alias: minUi5)
 *   distribution string - "sapui5" | "openui5". Absent is its own answer,
 *                         not a synonym for "sapui5": a SAPUI5-only control
 *                         is then a hint instead of an error or nothing
 *   allow        array  - allowed control[.member] names despite the floor
 *   render       bool or { pages } - false skips the render gate (= --no-render);
 *                         { "pages": N } asks for the gate AND sizes its page
 *                         pool (default 4, = --render-pages)
 *   properties   bool   - false skips the property gate
 *   cache        bool   - true stores each file's result across runs and
 *                         replays it while nothing relevant changed (= --cache;
 *                         the file location is --cache-location, per invocation)
 *   failOn       string - "error" | "warning" | "hint" | "never"
 *   maxWarnings  number - more warnings than this fail the run, whatever
 *                         failOn says (= --max-warnings, ui5lint's flag)
 *   rules        object - per rule id: false to switch it off, a severity
 *                         string, or { severity, exclude } (see findings.mjs)
 *   badge        string, { kind, file, label, logo, labelColor }, or a list
 *                         of those - where to write the shields.io endpoint
 *                         JSON for the run, one file per badge kind
 *
 * An unknown key - or an unknown rule id - fails loudly: a typo in a config
 * that silently changes nothing is worse than an error.
 */
import fs from 'fs';
import path from 'path';
import { RULES, SEVERITIES, RENDER_RULE } from './findings.mjs';
import { BADGE_KINDS } from './report.mjs';

/** Both spellings are discovered, jsonc first - the same courtesy
 *  abaplint.json / abaplint.jsonc extend next door. */
export const CONFIG_NAMES = ['abap2ui5lint.jsonc', 'abap2ui5lint.json'];
export const CONFIG_NAME = CONFIG_NAMES[0];

/** JSONC -> JSON: strips // and block comments (string-aware) + trailing commas. */
export function stripJsonc(text) {
  let out = '';
  let inStr = false;
  let inLine = false;
  let inBlock = false;
  /* Where the STRUCTURAL commas landed in `out`. Trailing-comma removal has to
   * know which commas are punctuation and which are text: a regex over the
   * finished output cannot tell them apart, and an exclude pattern like
   * `app[,]x` would come out as `app[]x` - a character class matching nothing,
   * so the suppression silently stops suppressing. */
  const commas = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
    } else if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      }
    } else if (inStr) {
      out += c;
      if (c === '\\') {
        out += n;
        i++;
      } else if (c === '"') {
        inStr = false;
      }
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      inLine = true;
    } else if (c === '/' && n === '*') {
      inBlock = true;
      i++;
    } else {
      if (c === ',') commas.push(out.length);
      out += c;
    }
  }
  // comments are gone from `out` by now, so "trailing" is decided by the next
  // non-whitespace character alone
  const drop = new Set();
  for (const at of commas) {
    let j = at + 1;
    while (j < out.length && /\s/.test(out[j])) j++;
    if (out[j] === '}' || out[j] === ']') drop.add(at);
  }
  if (!drop.size) return out;
  /* Rebuild by CODE UNIT, not by code point. The offsets in `drop` were
   * recorded as `out.length`, which counts UTF-16 code units - so the spread
   * form (`[...out]`, which iterates code POINTS) shifts every index after the
   * first astral character and deletes the wrong one. A config carrying an
   * emoji in a path came back with a space removed and the trailing comma
   * still there, then failed to parse. */
  let kept = '';
  for (let i = 0; i < out.length; i++) if (!drop.has(i)) kept += out[i];
  return kept;
}

/** Walk from dir upward to the filesystem root, return the first config found. */
export function findConfigFrom(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(cur, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

/** Discovery order: cwd upward, then each given path's directory upward. */
export function findConfig(cwd, paths = []) {
  const found = findConfigFrom(cwd);
  if (found) return found;
  for (const p of paths) {
    const abs = path.resolve(cwd, p);
    const dir = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
    const hit = findConfigFrom(dir);
    if (hit) return hit;
  }
  return null;
}

/** Every key `abap2ui5lint.jsonc` recognizes. Exported so the schema gate can
 *  compare it against what the editor is offered - a key the loader accepts
 *  and the schema does not is a red squiggle over a working config. */
export const KNOWN = new Set(['$schema', 'extends', 'paths', 'ignore', 'ui5', 'minUi5', 'distribution', 'allow', 'render', 'properties', 'cache', 'failOn', 'maxWarnings', 'rules', 'baseline', 'badge']);

const BADGE_KEYS = ['kind', 'file', 'label', 'logo', 'labelColor'];

/** One badge: which of the two it is, where it goes, and how it should look. */
function loadOneBadge(file, raw) {
  const badge = typeof raw === 'string' ? { file: raw } : raw;
  if (typeof badge !== 'object' || badge === null || Array.isArray(badge)) {
    throw new Error(`${file}: 'badge' must be a file path, { ${BADGE_KEYS.join(', ')} }, or an array of those`);
  }
  for (const k of Object.keys(badge)) {
    if (!BADGE_KEYS.includes(k)) throw new Error(`${file}: badge has unknown key '${k}' (known: ${BADGE_KEYS.join(', ')})`);
  }
  if (typeof badge.file !== 'string' || !badge.file) {
    throw new Error(`${file}: badge needs a 'file' - where to write the endpoint JSON (relative to this config)`);
  }
  // kind: the verdict badge is what a single `badge` entry has always meant,
  // so it stays the default and an old config keeps writing the same file
  if (badge.kind !== undefined && !BADGE_KINDS.includes(badge.kind)) {
    throw new Error(`${file}: badge 'kind' must be ${BADGE_KINDS.join(' or ')} (got '${badge.kind}')`);
  }
  for (const k of ['label', 'labelColor']) {
    if (badge[k] !== undefined && typeof badge[k] !== 'string') throw new Error(`${file}: badge '${k}' must be a string`);
  }
  // logo: a simple-icons name, or null for a badge without one
  if (badge.logo !== undefined && badge.logo !== null && typeof badge.logo !== 'string') {
    throw new Error(`${file}: badge 'logo' must be a simple-icons name or null`);
  }
  return { kind: 'checks', ...badge };
}

/** `badge` is a path, that path plus how the badge should look, or a list of
 *  both - a repo that wants the corpus badge next to the verdict one names
 *  two files. Every spelling normalizes to the array the CLI writes from. */
function loadBadge(file, raw) {
  const badges = (Array.isArray(raw) ? raw : [raw]).map((b) => loadOneBadge(file, b));
  if (!badges.length) throw new Error(`${file}: 'badge' is an empty list - drop the key instead, or name a file`);
  // two entries of the same kind would be the same badge written twice: real
  // as a copy-paste, never as an intention
  const kinds = badges.map((b) => b.kind);
  const twice = kinds.find((k, i) => kinds.indexOf(k) !== i);
  if (twice) throw new Error(`${file}: badge lists kind '${twice}' twice - one file per kind (${BADGE_KINDS.join(', ')})`);
  return badges;
}

/** Validate the `rules` block against the rule registry. Returns it as given -
 *  findings.mjs is what interprets it, this only refuses nonsense early. */
function loadRules(file, raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${file}: 'rules' must be an object keyed by rule id`);
  }
  const bad = (id, what) => new Error(`${file}: rules['${id}'] ${what}`);
  for (const [id, value] of Object.entries(raw)) {
    // render-error is the render gate's pseudo-rule: not in RULES (no emit
    // site classifies it), but a repo may waive or downgrade the gate per
    // file here instead of switching it off wholesale with `render: false`
    if (!RULES.includes(id) && id !== RENDER_RULE) {
      throw new Error(`${file}: unknown rule '${id}' in 'rules' (see the rule table in the README)`);
    }
    if (typeof value === 'boolean') continue;
    if (typeof value === 'string') {
      if (!SEVERITIES.includes(value.toLowerCase())) throw bad(id, `must be a severity (${SEVERITIES.join(', ')}), false, or an object`);
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw bad(id, `must be false, a severity string, or an object`);
    }
    for (const k of Object.keys(value)) {
      if (!['severity', 'exclude'].includes(k)) throw bad(id, `has unknown key '${k}' (known: severity, exclude)`);
    }
    if (value.severity !== undefined && !SEVERITIES.includes(String(value.severity).toLowerCase())) {
      throw bad(id, `severity must be one of ${SEVERITIES.join(', ')}`);
    }
    if (value.exclude !== undefined) {
      if (!Array.isArray(value.exclude) || value.exclude.some((p) => typeof p !== 'string')) {
        throw bad(id, `exclude must be an array of file regex patterns`);
      }
      for (const p of value.exclude) {
        try { new RegExp(p); } catch (e) { throw bad(id, `exclude pattern '${p}' is not a valid regex - ${e.message}`); }
      }
    }
  }
  return raw;
}

/** Parse + validate config TEXT. Split out of loadConfig because not every
 *  consumer has a file: the GitHub App prototype fetches `abap2ui5lint.jsonc`
 *  over the API and has to reach the same verdict the CLI would. It used to
 *  run `JSON.parse(stripJsonc(raw))` by itself, which skipped every check
 *  below - so an unknown key that fails loudly in the CLI was silently ignored
 *  by the App, contradicting its one promise: to agree with the CLI.
 *  `name` only ever appears in the error messages. */
export function parseConfig(name, text) {
  let raw;
  try {
    raw = JSON.parse(stripJsonc(text));
  } catch (e) {
    throw new Error(`${name}: not valid JSONC - ${e.message}`);
  }
  return validate(name, raw);
}

/** Follow a config's `extends` chain: the named file is the BASE, the
 *  extending file wins per key, and the two `rules` blocks merge per rule id.
 *  The base's own path-carrying keys (paths, baseline, badge files) are
 *  resolved against the BASE file first — a consumer later resolves relative
 *  paths against the file it DISCOVERED, which is the extending one. */
function resolveExtends(file, cfg, seen) {
  if (!cfg.extends) return cfg;
  const self = path.resolve(file);
  seen.add(self);
  const target = path.resolve(path.dirname(self), cfg.extends);
  if (seen.has(target)) {
    throw new Error(`${file}: 'extends' cycle — ${cfg.extends} is already part of this chain`);
  }
  const base = loadConfig(target, seen);
  const baseDir = path.dirname(target);
  const rebased = { ...base };
  if (base.paths) rebased.paths = base.paths.map((p) => (path.isAbsolute(p) ? p : path.join(baseDir, p)));
  if (base.baseline && !path.isAbsolute(base.baseline)) rebased.baseline = path.resolve(baseDir, base.baseline);
  if (base.badge) {
    rebased.badge = base.badge.map((b) => ({ ...b, file: path.isAbsolute(b.file) ? b.file : path.resolve(baseDir, b.file) }));
  }
  const merged = { ...rebased, ...cfg };
  delete merged.extends;
  if (rebased.rules || cfg.rules) merged.rules = { ...(rebased.rules ?? {}), ...(cfg.rules ?? {}) };
  return merged;
}

/** Parse + validate a config file. Throws with a precise message on bad input.
 *  `_seen` carries the resolved files of an `extends` chain, for the cycle
 *  refusal — callers never pass it. */
export function loadConfig(file, _seen = new Set()) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    /* Every other message this file produces is written for the person who has
     * to act on it; this one used to be node's, verbatim:
     *
     *   abap2ui5lint: ENOENT: no such file or directory, open '/nope/x.jsonc'
     *
     * which spells an errno and a syscall at somebody who mistyped a path. And
     * it can only BE a mistyped path: `findConfig` returns a file it has
     * already seen, so a config that is not there was named by hand on the
     * command line. The message may as well say which flag to look at. */
    if (e.code === 'ENOENT') throw new Error(`${file}: no such file — check the --config path`);
    if (e.code === 'EISDIR') throw new Error(`${file}: is a directory, not a config file — check the --config path`);
    throw new Error(`${file}: cannot be read - ${e.message}`);
  }
  return resolveExtends(file, parseConfig(file, text), _seen);
}

function validate(file, raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${file}: the config must be a JSON object`);
  }
  for (const k of Object.keys(raw)) {
    if (!KNOWN.has(k)) throw new Error(`${file}: unknown key '${k}' (known: ${[...KNOWN].join(', ')})`);
  }
  const cfg = {};
  if (raw.paths !== undefined) {
    if (!Array.isArray(raw.paths) || raw.paths.some((p) => typeof p !== 'string')) {
      throw new Error(`${file}: 'paths' must be an array of strings`);
    }
    cfg.paths = raw.paths;
  }
  if (raw.ignore !== undefined) {
    if (!Array.isArray(raw.ignore) || raw.ignore.some((p) => typeof p !== 'string')) {
      throw new Error(`${file}: 'ignore' must be an array of file regex patterns`);
    }
    // the same courtesy `rules[id].exclude` gets: a pattern that cannot
    // compile is a suppression that silently suppresses nothing
    for (const p of raw.ignore) {
      try { new RegExp(p); } catch (e) { throw new Error(`${file}: ignore pattern '${p}' is not a valid regex - ${e.message}`); }
    }
    cfg.ignore = raw.ignore;
  }
  const ui5 = raw.ui5 ?? raw.minUi5;
  if (ui5 !== undefined) {
    if (!/^\d+\.\d+(\.\d+)?$/.test(String(ui5))) throw new Error(`${file}: 'ui5' must be a version like "1.71"`);
    cfg.minUi5 = String(ui5);
  }
  if (raw.distribution !== undefined) {
    const d = String(raw.distribution).toLowerCase();
    if (!['sapui5', 'openui5'].includes(d)) throw new Error(`${file}: 'distribution' must be "sapui5" or "openui5"`);
    cfg.distribution = d;
  }
  if (raw.allow !== undefined) {
    if (!Array.isArray(raw.allow) || raw.allow.some((p) => typeof p !== 'string')) {
      throw new Error(`${file}: 'allow' must be an array of control[.member] strings`);
    }
    cfg.allow = raw.allow;
  }
  if (raw.render !== undefined) {
    /* `render` grew an object form: { "pages": N } both asks for the gate and
     * sizes its page pool. Normalized here so every consumer keeps reading a
     * boolean `render` - the pool size travels as its own key. */
    if (typeof raw.render === 'boolean') {
      cfg.render = raw.render;
    } else if (typeof raw.render === 'object' && raw.render !== null && !Array.isArray(raw.render)) {
      for (const k of Object.keys(raw.render)) {
        if (k !== 'pages') throw new Error(`${file}: render has unknown key '${k}' (known: pages)`);
      }
      if (!Number.isInteger(raw.render.pages) || raw.render.pages < 1) {
        throw new Error(`${file}: render 'pages' must be a positive integer (got '${raw.render.pages}')`);
      }
      cfg.render = true;
      cfg.renderPages = raw.render.pages;
    } else {
      throw new Error(`${file}: 'render' must be true, false, or { "pages": <n> }`);
    }
  }
  if (raw.properties !== undefined) {
    if (typeof raw.properties !== 'boolean') throw new Error(`${file}: 'properties' must be true or false`);
    cfg.properties = raw.properties;
  }
  if (raw.cache !== undefined) {
    if (typeof raw.cache !== 'boolean') throw new Error(`${file}: 'cache' must be true or false`);
    cfg.cache = raw.cache;
  }
  if (raw.failOn !== undefined) {
    const level = String(raw.failOn).toLowerCase();
    if (![...SEVERITIES, 'never'].includes(level)) {
      throw new Error(`${file}: 'failOn' must be ${SEVERITIES.join(', ')} or never`);
    }
    cfg.failOn = level;
  }
  if (raw.maxWarnings !== undefined) {
    if (!Number.isInteger(raw.maxWarnings) || raw.maxWarnings < 0) {
      throw new Error(`${file}: 'maxWarnings' must be a non-negative integer`);
    }
    cfg.maxWarnings = raw.maxWarnings;
  }
  if (raw.extends !== undefined) {
    if (typeof raw.extends !== 'string' || !raw.extends) {
      throw new Error(`${file}: 'extends' must be a path to another config file (relative to this one)`);
    }
    cfg.extends = raw.extends;
  }
  if (raw.rules !== undefined) cfg.rules = loadRules(file, raw.rules);
  if (raw.baseline !== undefined) {
    if (typeof raw.baseline !== 'string' || !raw.baseline) {
      throw new Error(`${file}: 'baseline' must be a file path (relative to this config)`);
    }
    cfg.baseline = raw.baseline;
  }
  if (raw.badge !== undefined) cfg.badge = loadBadge(file, raw.badge);
  return cfg;
}

/** config under explicit CLI choices: only fills options the CLI did not set. */
export function applyConfig(opt, seen, cfg) {
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'paths') continue; // handled by the caller (positional args win)
    if (k === 'allow') {
      // allow lists merge - a config allowance and a CLI allowance are both meant
      opt.allow = [...new Set([...(cfg.allow || []), ...opt.allow])];
      continue;
    }
    if (!seen.has(k)) opt[k] = v;
  }
  return opt;
}
