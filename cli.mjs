#!/usr/bin/env node
/*
 * abap2ui5lint — validate abap2UI5 views without an SAP system.
 *
 *   npx abap2ui5lint [paths...] [options]
 *
 * Paths are files or directories (default: ./src). Checked are ABAP classes
 * building views with z2ui5_cl_ui5_view_builder, plus raw *.view.xml /
 * *.fragment.xml.
 *
 * Gates:
 *   properties  every control/member written in the view against the UI5
 *               metadata snapshot (@since floor + deprecation)
 *   render      headless XMLView.create against the local OpenUI5 runtime
 *               with a typed mock model derived from the class
 *
 * Options:
 *   --ui5 <ver>        the UI5 version to check against - the version your
 *                      system runs (default 1.71, alias --min-ui5). Controls and
 *                      members introduced later are reported, as are
 *                      deprecations already in effect at that version.
 *   --distribution <d>  sapui5 or openui5 - which distribution the target
 *                      system serves. On openui5, controls from SAPUI5-only
 *                      libraries (sap.ui.comp, sap.suite.*, ...) are reported
 *                      as errors: they are simply not there. On sapui5 they
 *                      are not reported at all. Unset (the default) is neither
 *                      answer, so they are reported as HINTS - the fact is
 *                      worth knowing and the run cannot tell whether it
 *                      matters. --openui5 is a shorthand.
 *   --allow <name>     allow a control or control.member despite the floor
 *                      (repeatable, e.g. --allow sap.m.Avatar.displaySize)
 *   --fail-on <level>  lowest severity that fails the build: error, warning
 *                      (default), hint, or never. Every finding is always
 *                      reported - this only decides the exit code.
 *   --max-warnings <n> more than n warnings fail the run, whatever --fail-on
 *                      says (ui5lint's flag) - the way to keep failing on
 *                      errors only while still capping the warning debt.
 *                      Also settable as "maxWarnings" in the config
 *   --format <f>       stylish (default), json, markdown, sarif, checkstyle
 *                      or junit. --json is a shorthand for --format json.
 *                      sarif is the shape github/codeql-action/upload-sarif
 *                      ingests, so findings land in the repository's
 *                      code-scanning tab; checkstyle and junit are the two
 *                      XML shapes most CI systems (Jenkins, GitLab, Azure
 *                      DevOps) ingest natively.
 *   --fix              rewrite what can be corrected mechanically (an obsolete
 *                      binder, an unwrapped ABAP boolean, a t_arg missing its
 *                      $), then report what is left. ABAP2UI5LINT_FIX_DRY_RUN=true
 *                      reports what it would change without touching a file.
 *   --sarif-out <file>  ALSO write the SARIF document to this file, whatever
 *                      --format prints on stdout. The way to keep the
 *                      annotated human report in the log and still hand a
 *                      file to github/codeql-action/upload-sarif, without
 *                      running the (expensive) render gate a second time
 *   --json-out <file>  the same for the --json document, e.g. for a later
 *                      workflow step that wants the counts
 *   --fix-dry-run      the same pass, reporting what it would change and
 *                      writing nothing (the flag form of that env variable)
 *   --baseline <file>  suppress the findings recorded in this file - the way
 *                      to adopt the linter on a codebase that already exists.
 *                      A NEW finding still fails; a recorded one that no
 *                      longer occurs fails too, as a stale entry
 *   --update-baseline  write/refresh that file from this run and exit 0
 *   --cache            store each file's result and replay it on the next run
 *                      while nothing relevant changed - the file's content,
 *                      the linter version, the metadata snapshot and every
 *                      setting that changes a verdict all key the entry, so a
 *                      hit skips both gates for that file. Also settable as
 *                      "cache": true in the config. The cache file is
 *                      expendable: corrupt or stale means recompute, and
 *                      deleting it is always safe
 *   --cache-location <file>
 *                      where the cache lives (default .abap2ui5lintcache in
 *                      the current directory)
 *   --quiet            report errors only - the counts still show everything,
 *                      and the run summary and progress go quiet too
 *   --stats            print the run summary: what was checked (files, views,
 *                      controls, bindings, icons), which gates ran, what the
 *                      baseline swallowed and how long it took. On by default
 *                      for more than one file, --no-stats switches it off
 *   --progress         report the gates while they run, on stderr (stdout stays
 *                      pipeable). Default: on a terminal and inside GitHub
 *                      Actions, where it becomes one collapsed log group;
 *                      --no-progress switches it off
 *   --badge <file>     write a shields.io endpoint JSON for the verdict, so a
 *                      repo can show it in the README ("check-abap2UI5 |
 *                      119 rules passed" green, "7 errors" red)
 *   --badge-corpus <file>
 *                      the same for what the corpus IS, blue and without a
 *                      verdict in it ("abap2UI5 | 148 apps · 172 views ·
 *                      2,176 controls"). Both are also settable as "badge" in
 *                      the config; --no-badge suppresses every configured
 *                      badge for this run
 *   --annotate         emit GitHub workflow commands so findings show up on
 *                      the pull request diff (default inside GitHub Actions;
 *                      --no-annotate switches it off). Alongside the stylish
 *                      report only - json and markdown stay parseable.
 *   --screenshot <file>
 *                      photograph the view instead of judging it: every view
 *                      the given file builds is rendered against the local
 *                      OpenUI5 runtime and written as a PNG, and the written
 *                      paths are printed one per line. No system, no
 *                      activation - the same reconstruction the gate renders,
 *                      kept on the page long enough to be seen. Several views
 *                      (or several files) number the name. Needs the render
 *                      runtime; nothing else in the run happens
 *   --screenshot-theme <name>
 *                      the UI5 theme to photograph in (default sap_horizon)
 *   --screenshot-size <WxH[,WxH...]>
 *                      the viewport(s), e.g. 390x844 for a phone (default
 *                      1280x900). Several are rendered in ONE browser session
 *                      and written side by side - the device matrix a
 *                      responsive view needs. The picture is full-page, so a
 *                      view taller than the viewport is photographed whole
 *   --screenshot-model <file.json>
 *                      the model to render with, merged over the one derived
 *                      from the class. Without it, a `<class>.mock.json` next
 *                      to the source is used when there is one - which is how
 *                      a table bound to a SELECT stops photographing empty
 *   --stdin            lint source read from standard input instead of files.
 *                      Property gate only - the render gate needs a file
 *                      corpus and stays off for piped source. Incompatible
 *                      with --fix (there is no file to rewrite) and
 *                      --screenshot. Exit codes as usual
 *   --stdin-filename <name>
 *                      the name the piped source is reported under (default
 *                      <stdin>). It also decides the handling: a name ending
 *                      .view.xml/.fragment.xml is checked as a raw view,
 *                      anything else as an ABAP class - unless the content
 *                      itself starts with '<'
 *   --no-render        skip the render gate (no browser/@openui5 needed)
 *   --render           require the render gate: without its runtime the run
 *                      fails instead of falling back to the property gate.
 *                      The gate is on by default, but a DEFAULT-on gate whose
 *                      runtime is not installed steps aside with a warning -
 *                      this flag (or "render": true in the config) is how a
 *                      job says the gate has to have run
 *   --render-pages <n> size of the render gate's page pool (default 4). Each
 *                      page carries its own UI5 boot; on a corpus the render
 *                      wall clock divides by roughly the pool size. Also
 *                      settable as "render": { "pages": n } in the config
 *   --no-properties    skip the property gate
 *   --advisory         report only, always exit 0 (same as --fail-on never)
 *   --verbose          print reconstruction notes
 *   --config <file>    read settings from this abap2ui5lint.jsonc; without the
 *                      flag the file is searched upward from the current
 *                      directory and from each given path (eslint-style).
 *                      Precedence: explicit CLI flag > config file > default.
 *   --no-config        ignore any config file
 *   --init             write a commented abap2ui5lint.jsonc into the current
 *                      directory, with $schema resolved against the version
 *                      actually installed, and exit
 *   --version, -v      print version and script location
 *   --help, -h         print this text
 *
 * A single line can waive a rule where it stands, ui5lint-style:
 *   " abap2ui5lint-disable-next-line unknown-binding-path -- filled in a LOOP
 *
 * Exit codes: 0 clean, 1 findings at or above --fail-on, 2 bad usage/config.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkFiles, collectFiles, screenshotFiles, checkAbapSource, checkXmlSource } from './lib/index.mjs';
import { findConfig, loadConfig, applyConfig } from './lib/config.mjs';
import { snapshotVersion } from './lib/properties.mjs';
import { SEVERITIES, severityRank, severityOf } from './lib/findings.mjs';
import { applyFixes } from './lib/fix.mjs';
import { missingRenderDeps, renderFallback, renderDepsError } from './lib/render.mjs';
import { loadBaseline, applyBaseline, buildBaseline, writeBaseline, baselineBase } from './lib/baseline.mjs';
import { DEFAULT_CACHE_FILE, cacheContext, loadCache, saveCache, hashOf } from './lib/cache.mjs';
import { FORMATS, summarize, contextLine, formatStylish, formatJson, formatMarkdown, formatSarif, formatCheckstyle, formatJunit, githubAnnotations, runStats, createProgress, badgeEndpoint } from './lib/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: abap2ui5lint [paths...] [--ui5 1.71] [--distribution sapui5|openui5] '
  + '[--allow control[.member]] [--fail-on error|warning|hint|never] [--max-warnings <n>] [--format stylish|json|markdown|sarif|checkstyle|junit] '
  + '[--fix] [--fix-dry-run] [--baseline <file>] [--update-baseline] '
  + '[--cache] [--cache-location <file>] [--stdin] [--stdin-filename <name>] '
  + '[--sarif-out <file>] [--json-out <file>] '
  + '[--badge <file>] [--badge-corpus <file>] [--no-badge] '
  + '[--quiet] [--stats|--no-stats] [--progress|--no-progress] '
  + '[--annotate|--no-annotate] [--render|--no-render] [--render-pages <n>] [--no-properties] [--advisory] [--verbose] '
  + '[--screenshot <file>] [--screenshot-theme sap_horizon] [--screenshot-size 1280x900] '
  + '[--screenshot-model <file.json>] '
  + '[--config abap2ui5lint.jsonc] [--no-config] [--init] [--version] [--help]';

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
const wrapUsage = (text, width = 78) => {
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

const usageBlock = () =>
  `${wrapUsage(USAGE)}\ntry \`abap2ui5lint --help\` for what each flag does.`;

const die = (message) => {
  console.error(`abap2ui5lint: ${message}`);
  process.exit(2);
};

/*
 * `--help` prints the header block of this file.
 *
 * It was the one-line USAGE string above - 800 characters of bracketed flag
 * names on a single line - while the man page describing every one of them sat
 * at the top of this file and was never printed anywhere. Both peers this tool
 * is modelled on (ui5lint, abaplint) print structured help, and the structured
 * help already existed here.
 *
 * Reading the source rather than duplicating it is the point: a second copy of
 * the option list is a third place to forget, and this file has already been
 * the place that drifted. USAGE stays as the one-line reminder a bad flag gets.
 */
function helpText() {
  const self = fileURLToPath(import.meta.url);
  const block = fs.readFileSync(self, 'utf8').match(/^#![^\n]*\n\/\*\n([\s\S]*?)\n \*\//);
  if (!block) return USAGE; // a stripped/bundled copy still answers --help
  return block[1].split('\n').map((l) => l.replace(/^ \* ?/, '').replace(/^ \*$/, '')).join('\n');
}

/* The two value flags whose wrong value would otherwise be SILENT. Both name
 * a closed set the run is judged against, and a value outside it does not
 * fail anywhere downstream - it just falls back to the default, so
 * `--ui5 1,130` (a comma is one keystroke away on a German layout) reports
 * every control added after 1.71 as too new, and `--distribution openui` runs
 * none of the checks the user asked for. abap2ui5lint.jsonc already refuses
 * both loudly; the flags say the same thing now. */
const UI5_VERSION_RE = /^\d+\.\d+(\.\d+)?$/;
const DISTRIBUTIONS = ['sapui5', 'openui5'];
/* A theme name is a resource path inside the runtime, so it is a plain
 * identifier or it is not a theme; a viewport is two numbers. Both are
 * checked here for the same reason --ui5 is: a wrong value would fall back
 * silently and the picture would simply be of something else. */
const THEME_RE = /^[a-z][a-z0-9_]*$/i;
const SIZE_RE = /^(\d{2,5})x(\d{2,5})$/i;

const args = process.argv.slice(2);
const opt = {
  minUi5: '1.71', distribution: null, allow: [], render: true, properties: true,
  failOn: 'warning', rules: {}, verbose: false,
  format: 'stylish', quiet: false, fix: false,
  // inside a workflow the annotations are the point of running the linter at
  // all: they put a finding on the diff instead of into a collapsed log
  annotate: process.env.GITHUB_ACTIONS === 'true',
  // stats: null means "decide by corpus size" - a single file needs no summary
  stats: null,
  // progress is worth its noise where someone is waiting for the run (a
  // terminal) or where the log IS the record (a workflow). Piped into a file
  // it would only be noise, so there it stays off unless asked for
  progress: process.stderr.isTTY === true || process.env.GITHUB_ACTIONS === 'true',
};
const seen = new Set(); // options the CLI set explicitly - they beat the config
// whether the render gate was ASKED for (--render, or "render": true in the
// config) rather than merely left on - see renderFallback below
let renderAsked = false;
const paths = [];
let configFlag = null;
let noConfig = false;
let updateBaseline = false;
// --stdin: lint piped source instead of files (property gate only)
let stdinMode = false;
let stdinName = '<stdin>';
// --screenshot and its two dials: a MODE, not a gate (see the run below)
const shot = { out: null, theme: 'sap_horizon', sizes: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  // a flag that takes a value must actually have one - `--allow` as the last
  // argument would otherwise push undefined and crash deep in the gate
  const value = () => {
    if (i + 1 >= args.length) die(`${a} needs a value\n${usageBlock()}`);
    return args[++i];
  };
  if (a === '--min-ui5' || a === '--ui5') {
    const version = value();
    if (!UI5_VERSION_RE.test(version)) die(`${a} takes a version like 1.71 (got '${version}')`);
    opt.minUi5 = version;
    seen.add('minUi5');
  }
  else if (a === '--distribution') {
    const distribution = value().toLowerCase();
    if (!DISTRIBUTIONS.includes(distribution)) die(`--distribution takes ${DISTRIBUTIONS.join(' or ')} (got '${distribution}')`);
    opt.distribution = distribution;
    seen.add('distribution');
  }
  else if (a === '--openui5') { opt.distribution = 'openui5'; seen.add('distribution'); }
  else if (a === '--allow') opt.allow.push(value());
  else if (a === '--no-render') { opt.render = false; seen.add('render'); }
  // Asking for the gate is what turns a missing runtime back into an error -
  // the default-on gate falls back to the property gate instead (renderFallback)
  else if (a === '--render') { opt.render = true; seen.add('render'); renderAsked = true; }
  /* Tuning the pool IS asking for the gate - the config's object form
   * ("render": { pages: N }) asks the same way, and a tuned gate that
   * silently stepped aside for a missing runtime would be the one thing
   * renderFallback exists to prevent. A later --no-render still wins. */
  else if (a === '--render-pages') {
    opt.render = true;
    seen.add('render');
    renderAsked = true;
    const n = Number(value());
    if (!Number.isInteger(n) || n < 1) die(`--render-pages takes a positive integer (got '${args[i]}')`);
    opt.renderPages = n;
    seen.add('renderPages');
  }
  else if (a === '--screenshot') shot.out = value();
  else if (a === '--screenshot-theme') {
    const theme = value();
    if (!THEME_RE.test(theme)) die(`--screenshot-theme takes a theme name like sap_horizon (got '${theme}')`);
    shot.theme = theme;
  }
  else if (a === '--screenshot-size') {
    /* A LIST: one browser launch and one UI5 boot serve every viewport, so
     * asking for phone, tablet and desktop together costs barely more than
     * asking for one - and responsive layout is exactly what nobody has in
     * their head. */
    const raw = value();
    for (const part of raw.split(',')) {
      const size = SIZE_RE.exec(part.trim());
      if (!size) die(`--screenshot-size takes viewports like 1280x900 or 390x844,1280x900 (got '${raw}')`);
      shot.sizes.push({ width: Number(size[1]), height: Number(size[2]) });
    }
  }
  else if (a === '--screenshot-model') {
    const file = value();
    try {
      shot.model = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      die(`--screenshot-model ${file}: ${e.message}`);
    }
  }
  else if (a === '--no-properties') { opt.properties = false; seen.add('properties'); }
  else if (a === '--advisory') { opt.failOn = 'never'; seen.add('failOn'); }
  else if (a === '--config') configFlag = value();
  else if (a === '--no-config') noConfig = true;
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--fix') opt.fix = true;
  else if (a === '--fix-dry-run') { opt.fix = true; opt.fixDryRun = true; }
  else if (a === '--baseline') { opt.baseline = value(); seen.add('baseline'); }
  else if (a === '--cache') { opt.cache = true; seen.add('cache'); }
  else if (a === '--cache-location') { opt.cacheLocation = value(); }
  else if (a === '--stdin') stdinMode = true;
  else if (a === '--stdin-filename') stdinName = value();
  else if (a === '--update-baseline') updateBaseline = true;
  else if (a === '--annotate') opt.annotate = true;
  else if (a === '--no-annotate') opt.annotate = false;
  else if (a === '--stats') opt.stats = true;
  else if (a === '--no-stats') opt.stats = false;
  else if (a === '--progress') opt.progress = true;
  else if (a === '--no-progress') opt.progress = false;
  // the two badges accumulate: a run that wants both names both files, and
  // naming either one on the command line takes the config's block out
  else if (a === '--badge') { opt.badge = [...(opt.badge ?? []), { kind: 'checks', file: value() }]; seen.add('badge'); }
  else if (a === '--badge-corpus') { opt.badge = [...(opt.badge ?? []), { kind: 'corpus', file: value() }]; seen.add('badge'); }
  // a second pass over the same corpus (a job summary, a piped --json) must
  // not overwrite the badges the real run wrote - it saw fewer gates
  else if (a === '--no-badge') { opt.badge = null; seen.add('badge'); }
  else if (a === '--json') opt.format = 'json';
  else if (a === '--format') {
    const format = value().toLowerCase();
    if (!FORMATS.includes(format)) die(`--format takes ${FORMATS.join(', ')} (got '${format}')`);
    opt.format = format;
  }
  else if (a === '--fail-on') {
    const level = value().toLowerCase();
    if (![...SEVERITIES, 'never'].includes(level)) die(`--fail-on takes ${SEVERITIES.join(', ')} or never (got '${level}')`);
    opt.failOn = level;
    seen.add('failOn');
  }
  else if (a === '--max-warnings') {
    const n = Number(value());
    if (!Number.isInteger(n) || n < 0) die(`--max-warnings takes a non-negative integer (got '${args[i]}')`);
    opt.maxWarnings = n;
    seen.add('maxWarnings');
  }
  else if (a === '--sarif-out') opt.sarifOut = value();
  else if (a === '--json-out') opt.jsonOut = value();
  else if (a === '--verbose') opt.verbose = true;
  else if (a === '--init') {
    /* The documented way to a config was: read the README, copy the block,
     * fix the $schema path by hand. Three steps and one of them silently
     * wrong - the README's $schema pointed at main, so an editor validated
     * against rules the pinned CLI does not have. This writes the file, with
     * the schema resolved against the version actually installed. */
    const target = path.resolve('abap2ui5lint.jsonc');
    if (fs.existsSync(target)) {
      die(`${path.relative(process.cwd(), target)} already exists - delete it first, or edit it`);
    }
    fs.writeFileSync(target, `{
  // abap2UI5-linter settings for this repo. Precedence: CLI flag > this file
  // > built-in default. Every rule id has a page at
  // https://abap2ui5.github.io/linter/
  //
  // The $schema line gives an editor completion and validation for every key
  // and every rule id, from the version this project installed - not from
  // whatever main happens to hold.
  "$schema": "./node_modules/@abap2ui5/linter/data/abap2ui5lint.schema.json",

  // where the app classes and views are
  "paths": ["src"],

  // trees under those paths that are not yours to fix: generated ABAP,
  // vendored copies, a frozen legacy package. Regex, matched against the path.
  // This is the repo-level counterpart of rules[id].exclude - a generated
  // directory is not a rule to waive, it is a tree not to read.
  // "ignore": ["/generated/", "/vendor/"],

  // the UI5 version your system serves. 1.71 is abap2UI5's own floor and the
  // safe default: anything that arrived later is reported here instead of
  // failing in a browser. Raise it once you know the system.
  "ui5": "1.71",

  // "sapui5" allows the libraries only SAPUI5 ships (sap.ui.comp, sap.suite.*,
  // sap.ushell, sap.fe). "openui5" turns those into errors. Leave the line out
  // entirely and they are hints instead - the linter says what it sees without
  // claiming to know which system you deploy to.
  "distribution": "sapui5",

  // load every view in a headless browser as well - the check no static rule
  // can make. Saying so here makes it a REQUIREMENT: an unasked-for render
  // gate steps aside when @abap2ui5/render-runtime is missing and the run
  // stays green, which is how a gate quietly stops meaning anything.
  // Needs: npm i -D @abap2ui5/render-runtime && npx playwright install chromium
  "render": false,

  // lowest severity that fails the run: error | warning | hint | never
  "failOn": "warning",

  "rules": {
    // one call per line, four spaces per level, the closing call in the
    // column of the element it closes - the layout abap2UI5, samples and
    // samples-controls are written in. Opt-in because it encodes ONE style;
    // \`--fix\` applies it. Drop the line if your project settles on another.
    // "chain-house-layout": "warning"
  }
}
`);
    console.log(`abap2ui5lint: wrote ${path.relative(process.cwd(), target)}`);
    console.log('             read it - every default in there is a choice you may want to make differently');
    process.exit(0);
  }
  else if (a === '--version' || a === '-v') {
    const { version } = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
    console.log(`abap2ui5lint ${version} (${path.join(HERE, 'cli.mjs')})`);
    process.exit(0);
  }
  else if (a === '--help' || a === '-h') {
    console.log(helpText());
    process.exit(0);
  } else if (a.startsWith('-')) die(`unknown option '${a}'\n${usageBlock()}`);
  else paths.push(a);
}

// abap2ui5lint.jsonc - the committed settings of the checked repo
if (!noConfig) {
  const configFile = configFlag ?? findConfig(process.cwd(), paths);
  if (configFlag || configFile) {
    let cfg;
    try {
      cfg = loadConfig(configFile);
    } catch (e) {
      die(e.message);
    }
    applyConfig(opt, seen, cfg);
    // a config that names the render gate is asking for it, the same way
    // --render does: from here on a missing runtime is an error, not a
    // fallback. `render: false` says property-only, which needs no runtime.
    if (cfg.render === true && !seen.has('render')) renderAsked = true;
    if (!paths.length && cfg.paths) {
      const base = path.dirname(configFile);
      paths.push(...cfg.paths.map((p) => (path.isAbsolute(p) ? p : path.join(base, p))));
    }
    // a baseline named in the config lives next to the config, not the cwd
    if (!seen.has('baseline') && cfg.baseline) {
      opt.baseline = path.resolve(path.dirname(configFile), cfg.baseline);
    }
    // ditto the badge files: the config says where in the REPO they belong
    if (!seen.has('badge') && cfg.badge) {
      opt.badge = cfg.badge.map((b) => ({ ...b, file: path.resolve(path.dirname(configFile), b.file) }));
    }
  }
}
if (!paths.length) paths.push('src');

/* --stdin: the property gate over piped source. The render gate stays off -
 * it is built around a file corpus and a browser session, and a piped buffer
 * is the one-file editor/pre-commit case where the property gate is the
 * value. Asked-for render, --fix and --screenshot are refused rather than
 * silently ignored. */
if (stdinMode) {
  if (opt.fix) die('--stdin cannot be combined with --fix - there is no file to rewrite');
  if (shot.out) die('--stdin cannot be combined with --screenshot');
  if (renderAsked) die('--stdin runs the property gate only - write the source to a file to render it');
  opt.render = false;
  opt.cache = false;
}

/* The render gate is on by default and its ~118 MB runtime is deliberately
 * not, so a fresh `npx @abap2ui5/linter src` would refuse to run at all. A
 * gate nobody asked for therefore steps aside for the property gate and says
 * so - loudly, on stderr, so a piped --json stays parseable and the notice
 * still reaches a terminal. An ASKED-for gate keeps the hard refusal. */
{
  const fallback = renderFallback({
    render: opt.render, asked: renderAsked, missing: opt.render ? missingRenderDeps() : [],
  });
  if (fallback) {
    opt.render = false;
    console.error(process.env.GITHUB_ACTIONS === 'true'
      ? `::warning::${fallback}` : `abap2ui5lint: ${fallback}`);
  }
}

let files;
if (stdinMode) {
  files = [stdinName]; // one virtual file - the source arrives below
} else {
  try {
    // `ignore` is repo-level and config-only on purpose: it describes the tree,
    // which is a property of the repo rather than of one invocation
    files = collectFiles(paths, { ignore: opt.ignore ?? [] });
  } catch (e) {
    // a mistyped path is bad usage, not a crash - exit 2 with one clean line
    die(e.code === 'ENOENT' ? `no such file or directory: ${e.path}` : e.message);
  }
}
/*
 * --screenshot: the render gate turned around. Instead of asking whether the
 * view survives creation, it keeps the view standing and photographs it - the
 * only way to SEE an abap2UI5 view without activating the class on a system
 * and launching the app.
 *
 * A mode, not an additional gate: nothing else runs, and stdout carries the
 * written paths and nothing else, one per line, so a caller (an editor, a
 * workflow uploading screenshots as artefacts) can just read them. Everything
 * a human wants to know beyond that goes to stderr.
 */
if (shot.out) {
  const missing = missingRenderDeps();
  if (missing.length) die(renderDepsError(missing).message);
  if (!files.length) die('no view to photograph in the given path(s)');
  const shots = await screenshotFiles(files, shot);
  const taken = shots.filter((s) => s.png);
  /* One picture keeps the name it was given; several have to be told apart,
   * and by the CLASS they came from rather than by a counter - a directory
   * full of shot-1.png says nothing about which app broke. */
  const base = shot.out.replace(/\.png$/i, '');
  const nameOf = (s) => {
    if (taken.length === 1) return shot.out.endsWith('.png') ? shot.out : `${shot.out}.png`;
    const stem = path.basename(s.file).replace(/\.(clas\.abap|abap|view\.xml|fragment\.xml|xml)$/i, '');
    // the viewport belongs in the name as soon as there is more than one:
    // three files called zcl_app.png would be a device matrix nobody can read
    const size = shot.sizes.length > 1 ? `-${s.size.width}x${s.size.height}` : '';
    return `${base}-${stem}${s.index ? `-${s.index + 1}` : ''}${size}.png`;
  };
  for (const s of shots) {
    const where = path.relative(process.cwd(), s.file) || s.file;
    if (!s.png) {
      console.error(`abap2ui5lint: ${where} - ${s.errors[0] ?? 'no picture'}`);
      continue;
    }
    const target = path.resolve(nameOf(s));
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, s.png);
    } catch (e) {
      die(`could not write ${target}: ${e.message}`);
    }
    console.log(target);
    /* Render errors do NOT suppress the picture: a view with one broken
     * binding still comes up, and the half that rendered is exactly what the
     * author needs to look at. They are said out loud all the same. */
    for (const e of s.errors) console.error(`abap2ui5lint: ${where} - ${e}`);
  }
  process.exit(taken.length ? 0 : 1);
}

/* The badges: shields.io endpoint files, so the README of a checked repo can
 * carry what its corpus IS and what the gate said about it. Written on every
 * run that got as far as a verdict - including a failing one and including
 * the one below that found NOTHING, which is the state a stale "148 apps"
 * and "clean" would hide longest - and always before the exit code is
 * decided. */
const emitBadge = (summary, stats) => {
  if (!opt.badge) return;
  for (const badge of opt.badge) {
    try {
      fs.mkdirSync(path.dirname(path.resolve(badge.file)), { recursive: true });
      fs.writeFileSync(badge.file, `${JSON.stringify(badgeEndpoint(summary, stats, { ...badge, rules: opt.rules }), null, 2)}\n`);
    } catch (e) {
      die(`could not write the badge file ${badge.file}: ${e.message}`);
    }
    if (opt.format === 'stylish' && !opt.quiet) {
      console.log(`badge: wrote ${path.relative(process.cwd(), path.resolve(badge.file))}`);
    }
  }
};

if (!files.length) {
  const empty = { ...summarize([]), failing: 0 };
  if (opt.format === 'json') {
    // the same shape a real run prints - built by the one formatter, so the
    // frozen --json contract cannot drift between the two paths
    console.log(formatJson([], empty, opt));
  } else {
    console.log(`abap2ui5lint: no checkable app classes under ${paths.join(', ')} (ABAP classes building a view with z2ui5_cl_ui5_view_builder, or *.view.xml / *.fragment.xml)`);
  }
  emitBadge(empty, runStats([]));
  process.exit(0);
}

/* --fix is a pass of its own: the property gate alone (a fix never depends on
 * the render result), rewrite, then the normal run reports what is left -
 * which is what makes `--fix` safe to put in front of any other flag. */
if (opt.fix) {
  const dryRun = opt.fixDryRun === true || process.env.ABAP2UI5LINT_FIX_DRY_RUN === 'true';
  let files_ = 0;
  let fixed = 0;
  let deferred = 0;
  let dropped = 0;
  const droppedIn = [];
  for (const r of await checkFiles(files, { ...opt, render: false })) {
    const source = fs.readFileSync(r.file, 'utf8');
    const result = applyFixes(source, r.findings);
    deferred += result.deferred;
    if (result.dropped) { dropped += result.dropped; droppedIn.push(r.file); }
    if (!result.applied) continue;
    files_++;
    fixed += result.applied;
    if (!dryRun) fs.writeFileSync(r.file, result.output);
  }
  if (fixed && opt.format === 'stylish') {
    console.log(`${dryRun ? 'would fix' : 'fixed'} ${fixed} problem(s) in ${files_} file(s)` +
      `${deferred ? `, ${deferred} deferred to the next run (overlapping)` : ''}\n`);
  }
  /* A dropped span is a defect in a RULE, not in the checked repo, and it is
   * the one outcome `--fix` used to keep to itself: the finding survives every
   * pass and the summary says "fixed 0 problems". Said out loud, on stderr, so
   * a piped --json run stays parseable. */
  if (dropped) {
    console.error(`abap2ui5lint: ${dropped} fix(es) were discarded - their spans do not address the file they were computed for`
      + ` (${droppedIn.slice(0, 3).join(', ')}${droppedIn.length > 3 ? `, +${droppedIn.length - 3} more` : ''}).`
      + ' This is a linter bug, not a defect in your source - please report it at'
      + ' https://github.com/abap2UI5/linter/issues');
  }
}

/* The gates report themselves while they run — on stderr, so a `--json` run
 * piped into something stays exactly as parseable as before. The reporter
 * keeps the phase timings either way: the run summary wants them even when
 * nothing was printed. */
const progress = createProgress({
  enabled: opt.progress && !opt.quiet,
  github: process.env.GITHUB_ACTIONS === 'true',
});
opt.onProgress = (ev) => progress.update(ev);

/* The cross-run cache (--cache / "cache": true). Everything a verdict depends
 * on keys the entry — the file's content hash per file, and one context hash
 * over the linter version, the snapshot's ui5Version and the resolved
 * settings — so a hit can safely skip BOTH gates and replay the stored result.
 * The stored result is the full pre-baseline result: the baseline and the
 * exit code are decided per RUN, on replayed findings like on fresh ones. */
let cache = null;
if (opt.cache) {
  const { version } = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
  const file = path.resolve(opt.cacheLocation ?? DEFAULT_CACHE_FILE);
  const context = cacheContext({ version, snapshot: snapshotVersion(), options: opt });
  cache = { file, context, entries: loadCache(file, context) };
}

let results;
try {
  if (stdinMode) {
    const src = fs.readFileSync(0, 'utf8');
    // the filename decides the handling, exactly as collectFiles decides it
    // for a named path: the XML spellings, else content sniff, else ABAP
    const isXml = /\.(view|fragment)\.xml$/.test(stdinName) || /^\s*</.test(src);
    const r = isXml
      ? checkXmlSource(src, { ...opt, file: stdinName })
      : checkAbapSource(src, { ...opt, file: stdinName });
    r.file = stdinName;
    results = [r];
  } else if (cache) {
    const slots = files.map((file) => {
      const hash = hashOf(fs.readFileSync(file, 'utf8'));
      const hit = cache.entries[path.resolve(file)];
      /* An entry that parses but does not hold a result (result: null, a
       * truncated write, a hand-edited file) is a MISS, not a crash - the
       * cache is expendable by contract, so nothing read from it may be
       * trusted to have a shape. */
      const valid = hit && hit.hash === hash
        && hit.result && typeof hit.result === 'object'
        && Array.isArray(hit.result.findings);
      return { file, hash, result: valid ? { ...hit.result, file } : null };
    });
    const missing = slots.filter((s) => !s.result).map((s) => s.file);
    const fresh = missing.length ? await checkFiles(missing, opt) : [];
    const byFile = new Map(fresh.map((r) => [r.file, r]));
    for (const s of slots) if (!s.result) s.result = byFile.get(s.file);
    results = slots.map((s) => s.result);
    const entries = {};
    for (const s of slots) entries[path.resolve(s.file)] = { hash: s.hash, result: s.result };
    /* Written BEFORE the baseline mutates the findings, and tolerantly: a
     * cache that cannot be written costs the next run time, not correctness. */
    try { saveCache(cache.file, cache.context, entries); }
    catch (e) { console.error(`abap2ui5lint: could not write the cache file ${cache.file}: ${e.message}`); }
  } else {
    results = await checkFiles(files, opt);
  }
  progress.finish();
} catch (e) {
  progress.finish();
  // the render gate's optional deps and the metadata snapshot are both
  // environment problems worth one actionable line, not a stack trace
  if (e.code === 'ERR_RENDER_DEPS_MISSING' || e.code === 'ERR_SNAPSHOT_MISSING') die(e.message);
  throw e;
}

/* The baseline: adopt the linter on a repo that already has findings.
 * --update-baseline freezes the CURRENT findings as accepted debt;
 * a configured baseline suppresses exactly those on every later run, new
 * findings fail normally, and a STALE entry (its finding is gone) fails
 * too — a suppression can never quietly outlive what it suppressed. */
if (updateBaseline) {
  const file = opt.baseline ?? 'abap2ui5lint-baseline.json';
  // keys are relative to the baseline file's own directory, so every runner
  // (CLI from any cwd, the Action, the VS Code extension) computes the same
  const map = buildBaseline(results, baselineBase(file));
  writeBaseline(file, map);
  const n = [...map.values()].reduce((s, c) => s + c, 0);
  console.log(`baseline: wrote ${n} finding(s) as ${map.size} entr${map.size === 1 ? 'y' : 'ies'} to ${path.relative(process.cwd(), file)}`);
  process.exit(0);
}
let baselineNote = null;
let baselineStale = [];
let baselineStats = null;
if (opt.baseline && fs.existsSync(opt.baseline)) {
  let map;
  try { map = loadBaseline(opt.baseline); } catch (e) { die(e.message); }
  const { suppressed, byRule, stale } = applyBaseline(results, map, baselineBase(opt.baseline));
  baselineStale = stale;
  baselineStats = { suppressed, byRule, stale: stale.length, file: path.relative(process.cwd(), opt.baseline) };
  baselineNote = `baseline: ${suppressed} finding(s) suppressed by ${path.relative(process.cwd(), opt.baseline)}`
    + (stale.length ? `, ${stale.length} STALE entr${stale.length === 1 ? 'y' : 'ies'} — the finding is gone, remove the entry or run --update-baseline` : '');
} else if (opt.baseline && !updateBaseline) {
  die(`baseline file not found: ${opt.baseline} (create it with --update-baseline)`);
}

const threshold = opt.failOn === 'never' ? Infinity : severityRank(opt.failOn);
/** Findings at or above the threshold decide the exit code - a hint never
 *  breaks a build unless it was asked to. Render errors count as errors (the
 *  view demonstrably did not load) unless the config's rules['render-error']
 *  says they weigh less. */
const failsBuild = (r) =>
  (r.renderErrors.length > 0 && severityRank(r.renderSeverity ?? 'error') >= threshold)
  || r.findings.some((f) => severityRank(severityOf(f)) >= threshold);

const summary = summarize(results);
summary.failing = results.filter(failsBuild).length;
const context = contextLine(opt, summary, snapshotVersion());
const stats = runStats(results);

/* The run summary answers what the findings cannot: WHAT was checked. A clean
 * corpus is otherwise three lines that read the same whether four thousand
 * controls were judged or the reconstruction produced nothing at all. One
 * file needs none of that, so the default is by corpus size. */
const showStats = (opt.stats ?? files.length > 1) && !opt.quiet;
const reportOpt = {
  ...opt,
  context,
  stats: showStats ? stats : null,
  times: progress.times,
  baseline: baselineStats,
};

if (opt.format === 'json') console.log(formatJson(results, summary, { ...reportOpt, stats }));
else if (opt.format === 'sarif') console.log(formatSarif(results));
else if (opt.format === 'checkstyle') console.log(formatCheckstyle(results));
else if (opt.format === 'junit') console.log(formatJunit(results));
else if (opt.format === 'markdown') console.log(formatMarkdown(results, summary, reportOpt));
else console.log(formatStylish(results, summary, reportOpt));

/* A machine report written BESIDE the human one, in the same run.
 *
 * Without this a workflow that wants both - the annotated stylish report in
 * the log AND a SARIF file for code scanning, or the counts for a later step -
 * has to run the whole thing twice, and the second run pays the render gate
 * again. The formatters are pure functions of `results`, so the sidecar costs
 * a serialization and nothing else. */
for (const [file, text] of [
  [opt.sarifOut, () => formatSarif(results)],
  [opt.jsonOut, () => formatJson(results, summary, { ...reportOpt, stats })],
]) {
  if (!file) continue;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${text()}\n`);
}

emitBadge(summary, stats);

/* Baseline prose rides alongside the HUMAN report only — `--json`/`--sarif`
 * exist to be piped, and a prose line after the document breaks the parse
 * (the same rule the annotations follow). The stale entries still decide
 * the exit code in every format. The note itself is redundant once the run
 * summary carries the same count, so there it shrinks to the stale entries. */
if (baselineNote && opt.format === 'stylish') {
  if (!showStats) console.log(baselineNote);
  for (const s of baselineStale) console.log(`  ! stale: ${s.key} (${s.count})`);
}

if (opt.verbose && opt.format === 'stylish') {
  for (const r of results) {
    for (const n of r.notes) console.log(`note: ${path.relative(process.cwd(), r.file)}: ${n}`);
  }
}

/* Annotations ride ALONGSIDE the human report, never inside a machine-readable
 * one: `--format json` exists to be piped into something, and a workflow
 * command appended after the document turns that document into a parse error.
 * Inside Actions the default is on, so `--json | jq` in a workflow would have
 * broken without this - which is exactly how CI found it. */
if (opt.annotate && opt.format === 'stylish') {
  for (const line of githubAnnotations(results, opt)) console.log(line);
}

/* --max-warnings / "maxWarnings": exceeding the cap fails the run whatever
 * --fail-on says — ui5lint's flag, and the way a repo fails on errors only
 * while still holding the line on warning debt. Said on stderr, so a piped
 * machine format stays parseable. */
const overWarningCap = opt.maxWarnings !== undefined && summary.totals.warning > opt.maxWarnings;
if (overWarningCap) {
  console.error(`abap2ui5lint: ${summary.totals.warning} warning(s) exceed --max-warnings ${opt.maxWarnings}`);
}

if (summary.failing > 0 || baselineStale.length > 0 || overWarningCap) process.exit(1);
