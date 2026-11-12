/*
 * lib/cli/support - the pure helpers of the CLI (cli.mjs): where a path is
 * shown from, the linter's own package, the usage line, the schema --init
 * writes. Moved out of cli.mjs unchanged; nothing here reads argv or exits.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** Whether `target` - every symbolic link on its path resolved - lies outside
 *  the directory `root`. For a path not written yet the nearest existing
 *  ancestor is resolved; a dangling link on the way is outside (writing
 *  through it creates its target, wherever that is). True on any error. The
 *  write-time half of `ownTree` in lib/config.mjs: a repository can ship
 *  `.github/badges` as a link out of itself. */
export function outsideTree(root, target) {
  try {
    const realRoot = fs.realpathSync(root);
    let at = path.resolve(target);
    const rest = [];
    for (;;) {
      let st = null;
      try { st = fs.lstatSync(at); } catch { /* not there - go up */ }
      if (st) {
        if (st.isSymbolicLink() && !fs.existsSync(at)) return true;
        break;
      }
      const up = path.dirname(at);
      if (up === at) return true;
      rest.unshift(path.basename(at));
      at = up;
    }
    const real = path.join(fs.realpathSync(at), ...rest);
    return !(real === realRoot || real.startsWith(realRoot + path.sep));
  } catch {
    return true;
  }
}

// the package root: this file is lib/cli/support.mjs
export const HERE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* The linter's own package.json - the version keys the cache, names the
 * published schema and answers --version. It was parsed in each of those
 * three places; one read, once. */
let ownPackageJson = null;
export const ownPackage = () => {
  ownPackageJson ??= JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
  return ownPackageJson;
};
export const ownVersion = () => ownPackage().version;

/* A path as the reader knows it: relative to the cwd where that is shorter,
 * as given otherwise (an absolute /tmp path is not `../../../tmp`). The
 * report's config line, the watch announcements and the baseline lines all
 * print paths this way. */
export const shownPath = (p) => {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel : p;
};

/* The baseline file --update-baseline writes when neither --baseline nor the
 * config's "baseline" names one. It used to be written and never read: no
 * later run looked for it, so the adopted debt was in a file nobody opened.
 * The read side picks it up where the write side put it - next to the config
 * when there is one, else in the current directory - when it exists. */
export const DEFAULT_BASELINE_FILE = 'abap2ui5lint-baseline.json';
export const defaultBaselineDir = (configFile) => (configFile ? path.dirname(configFile) : process.cwd());

export const USAGE ='usage: abap2ui5lint [paths...] [--ui5 1.71] [--deprecated-at 1.136] [--distribution sapui5|openui5] '
  + '[--allow control[.member]] [--fail-on error|warning|hint|never] [--max-warnings <n>] [--format stylish|json|markdown|sarif|checkstyle|junit] '
  + '[--fix] [--fix-dry-run] [--baseline <file>] [--update-baseline] [--report-false-positives] '
  + '[--cache] [--cache-location <file>] [--stdin] [--stdin-filename <name>] '
  + '[--sarif-out <file>] [--json-out <file>] '
  + '[--badge <file>] [--badge-corpus <file>] [--no-badge] '
  + '[--quiet] [--stats|--no-stats] [--timing] [--progress|--no-progress] '
  + '[--annotate|--no-annotate] [--render|--no-render] [--render-pages <n>] [--jobs <n>] [--no-properties] [--all-classes] [--advisory] [--verbose] '
  + '[--screenshot <file>] [--screenshot-theme sap_horizon] [--screenshot-size 1280x900] '
  + '[--screenshot-model <file.json>] [--watch] '
  + '[--config abap2ui5lint.jsonc] [--no-config] [--init] [--explain rule-id...] [--version] [--help]';

/* USAGE is one 679-character string, and it was printed as one line. `--help`
 * was moved off it for exactly that reason ("800 characters of bracketed flag
 * names on a single line"), but the error path kept it — so the reader who has
 * just mistyped a flag is the one who gets the wall, ragged-wrapped by their
 * terminal across nine lines with brackets split down the middle.
 *
 * Wrapped rather than shortened, deliberately. The full list is what the
 * two-way sync gate in the suite compares against `--help`, and that gate has
 * already caught a stale header once; a short usage line would leave nothing to
 * compare. So the content stays exactly as it is and only its shape changes,
 * with a pointer to the structured help that lists what each flag does.
 *
 * 78 columns, breaking between bracketed groups only, so no `[--fail-on
 * error|warning|hint|never]` is ever split across a line boundary. */
export const wrapUsage = (text, width = 78) => {
  const [head, ...groups] = text.split(/ (?=\[)/);
  const lines = [head];
  const indent = ' '.repeat('usage: '.length);
  for (const g of groups) {
    const last = lines[lines.length - 1];
    if (`${last} ${g}`.length <= width) lines[lines.length - 1] = `${last} ${g}`;
    else lines.push(indent + g);
  }
  return lines.join('\n');
};

export const usageBlock = () =>
  `${wrapUsage(USAGE)}\ntry \`abap2ui5lint --help\` for what each flag does.`;

/* The $schema --init writes: the schema of the linter RUNNING, addressed
 * the way the new file can reach it. It was hard-coded to
 * `./node_modules/@abap2ui5/linter/…`, which is right for exactly one layout
 * - a linter installed in the directory the file is written to. In a
 * monorepo package the node_modules is further up, and under
 * `npx --yes @abap2ui5/linter --init` or a global install there is none at
 * all, so an editor validated against a file that does not exist.
 *
 * So: the nearest node_modules/@abap2ui5/linter above the file that IS this
 * linter (a relative path, stable across upgrades), else the schema file
 * itself when it sits under that directory (a checkout of this repository,
 * a vendored copy) - but never through a node_modules, which at that point
 * is an install nobody commits: `npx … --init` in the home directory, or
 * with npm's cache inside the project as CI sets it up, found its own copy
 * under `.npm/_npx/<hash>/node_modules/` and wrote that path - else the
 * published schema of exactly this version. */
export function schemaRef(target) {
  const own = path.join(HERE, 'data', 'abap2ui5lint.schema.json');
  const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  const ownReal = real(own);
  const posix = (p) => {
    const rel = p.split(path.sep).join('/');
    return /^\.\.?\//.test(rel) ? rel : `./${rel}`;
  };
  const from = path.dirname(target);
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', '@abap2ui5', 'linter', 'data', 'abap2ui5lint.schema.json');
    if (ownReal && real(candidate) === ownReal) return posix(path.relative(from, candidate));
    if (path.dirname(dir) === dir) break;
  }
  const rel = path.relative(from, own);
  if (!rel.startsWith('..') && !path.isAbsolute(rel) && !rel.split(path.sep).includes('node_modules')) return posix(rel);
  const { name, version } = ownPackage();
  return `https://unpkg.com/${name}@${version}/data/abap2ui5lint.schema.json`;
}
