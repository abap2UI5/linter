#!/usr/bin/env node
/*
 * abap2ui5lint — validate abap2UI5 views without an SAP system.
 *
 *   abap2ui5lint [paths...] [options]
 *   npx @abap2ui5/linter [paths...] [options]     (without an install)
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
 *                      Not under --advisory / --fail-on never, which promise
 *                      exit 0. Also settable as "maxWarnings" in the config
 *   --format <f>       stylish (default), json, markdown, sarif, checkstyle
 *                      or junit. --json is a shorthand for --format json.
 *                      sarif is the shape github/codeql-action/upload-sarif
 *                      ingests, so findings land in the repository's
 *                      code-scanning tab; checkstyle and junit are the two
 *                      XML shapes most CI systems (Jenkins, GitLab, Azure
 *                      DevOps) ingest natively.
 *   --fix              rewrite what can be corrected mechanically (an obsolete
 *                      binder, an unwrapped ABAP boolean, a t_arg missing its
 *                      $), then report what is left. Repeats the pass until
 *                      nothing changes (at most 10), so one run settles fixes
 *                      that overlap or that leave a shape another rule fixes.
 *                      ABAP2UI5LINT_FIX_DRY_RUN=true reports what it would
 *                      change without touching a file.
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
 *                      longer occurs fails too, as a stale entry - judged
 *                      for the files under the paths this run walked (and
 *                      for files that are gone), never for a file it did
 *                      not look at
 *   --update-baseline  write/refresh that file from this run and exit 0: the
 *                      entries of the files under the paths walked are
 *                      replaced, every other file's are kept
 *   --cache            store each file's result and replay it on the next run
 *                      while nothing relevant changed - the file's content,
 *                      the linter version, the metadata snapshot, every
 *                      setting that changes a verdict and, when rendering,
 *                      the UI5 release of the render runtime all key the
 *                      entry, so a hit skips both gates for that file. Also settable as
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
 *                      168 rules passed" green, "7 errors" red)
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
 *                      with --fix (there is no file to rewrite),
 *                      --screenshot and a path (which would not be read -
 *                      name the source with --stdin-filename). Exit codes
 *                      as usual
 *   --stdin-filename <name>
 *                      the name the piped source is reported under (default
 *                      <stdin>). It also decides the handling: a name ending
 *                      .view.xml/.fragment.xml is checked as a raw view,
 *                      anything else as an ABAP class - unless the content
 *                      itself starts with '<'
 *   --watch            run once, then keep running: every checked file (and
 *                      every new file under a checked directory), the config
 *                      file and the baseline are watched, and a change re-runs
 *                      the same run - the config is read again, so an edit to
 *                      it takes effect too. The loop for an editor that has no
 *                      linter of its own (Eclipse ADT, synced through abapGit):
 *                      save, pull, read. Reports go to stdout as usual, a
 *                      separator with the time and the changed file goes to
 *                      stderr between runs, and the render gate, when it is
 *                      configured, keeps one warm browser across the runs. The
 *                      process never fails while watching - Ctrl+C ends it
 *                      with exit 0. Refused with the single-run modes and
 *                      outputs (--stdin, --screenshot, --fix, --fix-dry-run,
 *                      --update-baseline, --badge, --badge-corpus, --sarif-out,
 *                      --json-out) and with any --format but stylish; a badge
 *                      the config names is not written either
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
 *   --jobs <n>         threads for the property gate (default: the machine's
 *                      cores, at most 4). The files are spread over worker
 *                      threads and the results put back in file order, so
 *                      the report is the same with any n; a thread pays off
 *                      only on a corpus, so one is started per 64 files and a
 *                      smaller run stays on one. --jobs 1 switches it off
 *   --no-properties    skip the property gate
 *   --all-classes      collect every .clas.abap; a class that builds no view is
 *                      judged by the source-side rules alone (config: allClasses)
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
 *   --explain [<rule-id>...]
 *                      the rule reference, in the terminal: for each id its
 *                      summary, the paragraph behind it, the before/after
 *                      pair and the card's URL - the same prose the rules
 *                      page is generated from, for the reader who has a log
 *                      and no browser (Eclipse ADT inside --watch, a CI log).
 *                      With no id, every rule id with its summary, one per
 *                      line, in the page's order. An unknown id is exit 2,
 *                      with the id it can only have meant where there is one.
 *                      A documentation command: refused with a path or any
 *                      other option, and nothing else in the run happens
 *   --version, -v      print version and script location
 *   --help, -h         print this text
 *
 * A single line can waive a rule where it stands, ui5lint-style:
 *   " abap2ui5lint-disable-next-line unknown-binding-path -- filled in a LOOP
 * A directive naming no rule, or one that suppressed nothing, is itself
 * reported (unknown-directive-rule, unused-directive).
 *
 * Two settings have no flag, because they describe the repository rather than
 * one run, and live in abap2ui5lint.jsonc only: "ignore" (regex patterns for
 * trees a directory walk must not read - generated ABAP, a vendored copy) and
 * the per-rule switches under "rules" (off, another severity, excluded files).
 * --init writes that file with every key explained.
 *
 * Exit codes: 0 clean, 1 findings at or above --fail-on, 2 bad usage/config.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkFiles, collectFiles, screenshotFiles, checkAbapSource, checkXmlSource } from './lib/index.mjs';
import { classIndexOf, classIndexDeps } from './lib/guide-rules.mjs';
import { findConfig, loadConfig, applyConfig, CONFIG_NAMES } from './lib/config.mjs';
import { snapshotVersion } from './lib/properties.mjs';
import { SEVERITIES, severityRank, severityOf } from './lib/findings.mjs';
import { applyFixes, MAX_FIX_PASSES } from './lib/fix.mjs';
import { missingRenderDeps, renderFallback, renderDepsError, openRenderer, runtimeSnapshotMismatch, renderRuntimeUi5Version } from './lib/render.mjs';
import { loadBaseline, applyBaseline, updateBaseline as mergeBaseline, writeBaseline, baselineBase } from './lib/baseline.mjs';
import { DEFAULT_CACHE_FILE, cacheContext, loadCache, saveCache, hashOf, cacheable } from './lib/cache.mjs';
import { FORMATS, summarize, contextLine, formatStylish, formatJson, formatMarkdown, formatSarif, formatCheckstyle, formatJunit, githubAnnotations, runStats, createProgress, badgeEndpoint, ruleIndex, formatExplain, formatRuleIndex, explainFooter, terminalSafe } from './lib/report.mjs';
import { RULES_PAGE } from './lib/rule-docs.mjs';
import { caseMatch } from './lib/suggest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: abap2ui5lint [paths...] [--ui5 1.71] [--distribution sapui5|openui5] '
  + '[--allow control[.member]] [--fail-on error|warning|hint|never] [--max-warnings <n>] [--format stylish|json|markdown|sarif|checkstyle|junit] '
  + '[--fix] [--fix-dry-run] [--baseline <file>] [--update-baseline] '
  + '[--cache] [--cache-location <file>] [--stdin] [--stdin-filename <name>] '
  + '[--sarif-out <file>] [--json-out <file>] '
  + '[--badge <file>] [--badge-corpus <file>] [--no-badge] '
  + '[--quiet] [--stats|--no-stats] [--progress|--no-progress] '
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

/* Bad usage or a bad config: one line on stderr and exit 2. Inside the watch
 * loop (`watching`, set once the first run is through) the same condition is
 * printed and the loop goes on waiting - a config edited into a syntax error
 * is exactly the kind of change the next save corrects, and a watcher that
 * dies on it has to be restarted by hand for every typo. */
class UsageError extends Error {
  constructor(message) { super(message); this.code = 'ERR_USAGE'; }
}
let watching = false;
const die = (message) => {
  if (watching) throw new UsageError(message);
  console.error(`abap2ui5lint: ${message}`);
  process.exit(2);
};

/* The way out of a run that has written its report. `process.exit( )` ends
 * the process NOW, and a write to a PIPE is asynchronous on POSIX: whatever
 * did not fit into the pipe's 64 KiB buffer is still queued in the process
 * and is dropped with it. So `abap2ui5lint src --json | jq` on a failing
 * corpus handed jq exactly 65,536 bytes of a 175 KB document - and the one
 * run whose report matters, the failing one, was the one that lost it (the
 * GitHub annotations printed last went first). A terminal and a file are
 * written synchronously, which is why nobody saw it there.
 *
 * Every exit after output therefore waits for stdout and stderr to drain.
 * The end of a normal run does not call this at all: it sets
 * `process.exitCode` and lets the event loop run dry, which flushes by
 * construction; this is for the early exits in the middle of the module
 * (--explain, --help), where returning is not an option. Awaited at the top
 * level, so nothing after it runs while the pipes drain. */
const exitFlushed = async (code) => {
  process.exitCode = code;
  await Promise.all([process.stdout, process.stderr].map((s) => new Promise((resolve) => {
    try { s.write('', () => resolve()); } catch { resolve(); }
  })));
  process.exit(code);
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
function schemaRef(target) {
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
  const { name, version } = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
  return `https://unpkg.com/${name}@${version}/data/abap2ui5lint.schema.json`;
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

/*
 * --explain: the rule reference, in the terminal.
 *
 * Every reported line ends in a rule id and the card's URL, and the block
 * under the count line lists both again - and the reader this CLI was given
 * --watch for (Eclipse ADT, abapGit, no editor linter) still had to leave the
 * terminal for the paragraph. RULE_DOCS is the same prose the page is
 * generated from and the same prose mcp-server hands an agent through
 * `validate_view`; this prints it for the third reader.
 *
 * Decided BEFORE the option loop, on the raw argument list, because it is a
 * documentation command and not a run: the loop's own early exits (--init,
 * --version, --help) would otherwise answer first for `--init --explain x`,
 * and the config, the paths and every run option are simply not its business.
 * The ids are the arguments behind the flag up to the next option; anything
 * else on the line is refused with exit 2, the way --watch refuses --stdin.
 */
{
  const at = args.indexOf('--explain');
  if (at >= 0) {
    let end = at + 1;
    while (end < args.length && !args[end].startsWith('-')) end++;
    const ids = [...new Set(args.slice(at + 1, end))];
    const rest = [...args.slice(0, at), ...args.slice(end)];
    if (rest.length) {
      die(`--explain is a documentation command and runs on its own - it takes rule ids only, not ${rest[0]}`
        + `${rest[0].startsWith('-') ? '' : ' (a path)'}`);
    }
    if (!ids.length) {
      console.log(formatRuleIndex());
      await exitFlushed(0);
    }
    const known = ruleIndex().flatMap((c) => c.ids);
    /* A path behind the ids (`--explain unknown-control src/`) used to be
     * answered as "no rule 'src/'" - true, and useless. A rule id is letters,
     * digits and dashes; anything else on the line is a path or an option. */
    // (an underscore is kept: `Duplicate_Property` is an id up to separators, and the did-you-mean below answers it)
    const notAnId = ids.find((id) => !/^[a-z0-9_-]+$/i.test(id) || fs.existsSync(id));
    if (notAnId) {
      die(`--explain takes rule ids only, no path and no other option ('${notAnId}' is not one)`
        + ' - it is a documentation command and runs on its own: abap2ui5lint --explain <rule-id>...');
    }
    for (const id of ids) {
      if (known.includes(id)) continue;
      // the one did-you-mean the linter makes (lib/suggest.mjs): the id this
      // can only be up to letter case and -/_; anything fuzzier is a guess
      const meant = caseMatch(id, known);
      die(`--explain: no rule '${id}'${meant
        ? ` - did you mean ${meant}?`
        : ` - \`abap2ui5lint --explain\` lists every id, and so does ${RULES_PAGE}`}`);
    }
    console.log(formatExplain(ids));
    await exitFlushed(0);
  }
}

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
  // the property gate's thread pool: the cores, at most 4 - measured on the
  // samples-controls corpus, three threads already halve the wall clock and
  // a fifth adds nothing (checkFiles sizes the pool down for a small run)
  jobs: Math.min(4, os.availableParallelism()),
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
// --watch: the same run, again on every change (see watchLoop below)
let watchMode = false;
/* A count as it is typed: digits and nothing else. `Number( )` reads '' and
 * '  ' as 0 and '0x10' as 16, so `--max-warnings "$MAX"` with the variable
 * unset was --max-warnings 0 - every warning failed the build, and the
 * message named a limit nobody had set. NaN for anything else. */
const wholeNumber = (text) => (/^\d+$/.test(String(text)) ? Number(text) : NaN);
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
    const n = wholeNumber(value());
    if (!(n >= 1)) die(`--render-pages takes a positive integer (got '${args[i]}')`);
    opt.renderPages = n;
    seen.add('renderPages');
  }
  else if (a === '--jobs') {
    const n = wholeNumber(value());
    if (!(n >= 1)) die(`--jobs takes a positive integer (got '${args[i]}')`);
    opt.jobs = n;
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
      // a byte-order mark is an encoding marker, not JSON (the config and
      // the baseline strip it for the same Notepad/Out-File reason)
      shot.model = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      die(`--screenshot-model ${file}: ${e.message}`);
    }
  }
  else if (a === '--no-properties') { opt.properties = false; seen.add('properties'); }
  else if (a === '--all-classes') { opt.allClasses = true; seen.add('allClasses'); }
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
  else if (a === '--watch') watchMode = true;
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
    const n = wholeNumber(value());
    if (!(n >= 0)) die(`--max-warnings takes a non-negative integer (got '${args[i]}')`);
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
    const target = path.resolve(CONFIG_NAMES[0]);
    /* Either spelling: discovery reads the .jsonc first, so a new one
     * written beside an abap2ui5lint.json would silently take over from the
     * config the repository already has. */
    for (const name of CONFIG_NAMES) {
      if (fs.existsSync(path.resolve(name))) die(`${name} already exists - delete it first, or edit it`);
    }
    fs.writeFileSync(target, `{
  // abap2UI5-linter settings for this repo. Precedence: CLI flag > this file
  // > built-in default. Every rule id has a page at
  // https://abap2ui5.github.io/linter/
  //
  // The $schema line gives an editor completion and validation for every key
  // and every rule id, from the version this project installed - not from
  // whatever main happens to hold.
  "$schema": ${JSON.stringify(schemaRef(target))},

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
  // gate steps aside when @abap2ui5/linter-render is missing and the run
  // stays green, which is how a gate quietly stops meaning anything.
  // Needs: npm i -D @abap2ui5/linter-render && npx playwright install chromium
  "render": false,

  // lowest severity that fails the run: error | warning | hint | never
  "failOn": "warning",

  "rules": {
    // one call per line, four spaces per level, the closing call in the
    // column of the element it closes - the layout abap2UI5, samples and
    // samples-controls are written in. Opt-in because it encodes ONE style;
    // \`--fix\` applies it. Drop the line if your project settles on another.
    // "chain-house-layout": "warning",

    // keep the views inside the abap2UI5 protocol's portable profile, so a
    // non-UI5 frontend (UI5 Web Components, Adaptive Cards, an agent)
    // renders the app too - reports the controls, bindings, frontend actions
    // and nested view slots outside it. Opt-in: an app outside it still runs
    // on UI5 exactly as written.
    // "portable-app": "error"
  }
}
`);
    console.log(`abap2ui5lint: wrote ${path.relative(process.cwd(), target)}`);
    console.log('             read it - every default in there is a choice you may want to make differently');
    await exitFlushed(0);
  }
  else if (a === '--version' || a === '-v') {
    const { version } = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
    console.log(`abap2ui5lint ${version} (${path.join(HERE, 'cli.mjs')})`);
    await exitFlushed(0);
  }
  else if (a === '--help' || a === '-h') {
    console.log(helpText());
    await exitFlushed(0);
  } else if (a.startsWith('-')) die(`unknown option '${a}'\n${usageBlock()}`);
  else paths.push(a);
}

/* --watch is a loop over the whole run, and the run's single-document modes
 * and outputs have no place in one: a SARIF or JSON document is a record of
 * ONE run, a badge is a verdict written to disk, --fix rewrites the files the
 * loop watches (its own edits would re-trigger it), --stdin has nothing to
 * watch and --screenshot/--update-baseline are modes that end. Refused rather
 * than silently ignored, the way --stdin refuses --fix. */
if (watchMode) {
  const clash = stdinMode ? '--stdin'
    : shot.out ? '--screenshot'
      : updateBaseline ? '--update-baseline'
        : opt.fixDryRun ? '--fix-dry-run'
          : opt.fix ? '--fix'
            : opt.badge?.some((b) => b.kind === 'corpus') ? '--badge-corpus'
              : opt.badge?.length ? '--badge'
                : opt.sarifOut ? '--sarif-out'
                  : opt.jsonOut ? '--json-out'
                    : null;
  if (clash) die(`--watch cannot be combined with ${clash} - a watch re-runs the report, and ${clash} is a single-run mode or output`);
  if (opt.format !== 'stylish') {
    die(`--watch prints the stylish report only - --format ${opt.format} is one document per run, not a loop`);
  }
}

/* The flags as parsed, kept apart from any run: a run starts from a COPY and
 * lays the config over it, so that under --watch an edited abap2ui5lint.jsonc
 * is read again and lands on the flags as they were typed - not on top of the
 * settings the previous config left behind. */
const parsed = { opt: structuredClone(opt), paths: [...paths], renderAsked };

/** The settings of one run: the parsed flags, the config file (found or
 *  named), the paths, and the render gate's fallback decided. */
function resolveRun() {
  const o = structuredClone(parsed.opt);
  const runPaths = [...parsed.paths];
  let asked = parsed.renderAsked;
  let configFile = null;
  // abap2ui5lint.jsonc - the committed settings of the checked repo
  if (!noConfig) {
    configFile = configFlag ?? findConfig(process.cwd(), runPaths);
    if (configFlag || configFile) {
      let cfg;
      try {
        cfg = loadConfig(configFile);
      } catch (e) {
        die(e.message);
      }
      applyConfig(o, seen, cfg);
      // a config that names the render gate is asking for it, the same way
      // --render does: from here on a missing runtime is an error, not a
      // fallback. `render: false` says property-only, which needs no runtime.
      if (cfg.render === true && !seen.has('render')) asked = true;
      if (!runPaths.length && cfg.paths) {
        const base = path.dirname(configFile);
        runPaths.push(...cfg.paths.map((p) => (path.isAbsolute(p) ? p : path.join(base, p))));
      }
      // a baseline named in the config lives next to the config, not the cwd
      if (!seen.has('baseline') && cfg.baseline) {
        o.baseline = path.resolve(path.dirname(configFile), cfg.baseline);
      }
      // ditto the badge files: the config says where in the REPO they belong
      if (!seen.has('badge') && cfg.badge) {
        o.badge = cfg.badge.map((b) => ({ ...b, file: path.resolve(path.dirname(configFile), b.file) }));
      }
    }
  }
  if (!runPaths.length) runPaths.push('src');
  // a badge is a verdict written to disk, and a watch is not one verdict -
  // the flags are refused above, the config's block is stood down here
  if (watchMode) o.badge = null;

  /* --stdin: the property gate over piped source. The render gate stays off -
   * it is built around a file corpus and a browser session, and a piped buffer
   * is the one-file editor/pre-commit case where the property gate is the
   * value. Asked-for render, --fix and --screenshot are refused rather than
   * silently ignored. */
  if (stdinMode) {
    /* A path beside --stdin was neither read nor linted - only (as a last
     * resort) searched for a config - and the run reported on the piped
     * source as if the path had been checked. */
    if (parsed.paths.length) {
      die(`--stdin lints the source piped to it, not ${parsed.paths.length === 1 ? `'${parsed.paths[0]}'` : 'the paths given'} - name the piped source with --stdin-filename <name>, the config with --config <file>, or drop --stdin to lint files`);
    }
    if (o.fix) die('--stdin cannot be combined with --fix - there is no file to rewrite');
    if (shot.out) die('--stdin cannot be combined with --screenshot');
    if (asked) die('--stdin runs the property gate only - write the source to a file to render it');
    o.render = false;
    o.cache = false;
  }

  /* The render gate is on by default and its ~118 MB runtime is deliberately
   * not, so a fresh `npx @abap2ui5/linter src` would refuse to run at all. A
   * gate nobody asked for therefore steps aside for the property gate and says
   * so - loudly, on stderr, so a piped --json stays parseable and the notice
   * still reaches a terminal. An ASKED-for gate keeps the hard refusal. */
  {
    const fallback = renderFallback({
      render: o.render, asked, missing: o.render ? missingRenderDeps() : [],
    });
    if (fallback) {
      o.render = false;
      warn(fallback);
    }
  }
  /* A runtime of another UI5 release than the snapshot renders a different
   * API than the property gate judges - said once per run, before the render
   * errors it explains (render-runtime 0.1-0.6 pinned 1.151, the snapshot is
   * 1.152, and "unknown setting" on a 1.152 member read as a broken view). */
  if (o.render) {
    const mismatch = runtimeSnapshotMismatch(snapshotVersion());
    if (mismatch) warn(mismatch);
  }
  return { opt: o, paths: runPaths, configFile, asked };
}

/** One notice on stderr - a workflow warning inside Actions, so it lands on
 *  the run page rather than in a collapsed log; stdout stays the report. */
function warn(message) {
  console.error(process.env.GITHUB_ACTIONS === 'true' ? `::warning::${message}` : `abap2ui5lint: ${message}`);
}

/* The environment errors of the render gate: its runtime is missing, its
 * browser will not start, its UI5 will not boot, or the metadata snapshot is
 * gone. Each is one actionable sentence and the tool-error exit (2) - never a
 * stack trace and never exit 1, which says the VIEWS have findings. */
const ENV_ERRORS = new Set(['ERR_RENDER_DEPS_MISSING', 'ERR_RENDER_BROWSER_MISSING', 'ERR_RENDER_RUNTIME_BROKEN', 'ERR_SNAPSHOT_MISSING']);

/* The watch loop's renderer: one browser and one UI5 boot for the whole
 * session instead of one per run. checkFiles takes an ALREADY-OPEN renderer
 * (`opt.renderer`, the contract mcp-server keeps a warm Chromium on) and then
 * never closes it, so the loop owns it: opened on the first run that renders,
 * dropped when a run fails through it (a browser that died is replaced by the
 * next run, not reported forever), closed on Ctrl+C. The pool size is the
 * run's --render-pages, decided at open time - a later change to it in the
 * config only takes effect on the next start. */
let warm = null;
const rendererFor = async (o) => {
  if (!watchMode || !o.render) return undefined;
  if (!warm) {
    const pages = Number.isInteger(o.renderPages) && o.renderPages > 0 ? o.renderPages : 4;
    // Ctrl+C is this loop's to answer (exit 0, see stop below), not
    // Playwright's, whose default handler would exit the process with 130
    warm = await openRenderer({ pages, handleSIGINT: false });
  }
  return warm;
};
const dropWarm = async () => {
  const r = warm;
  warm = null;
  if (r) await r.close().catch(() => {});
};

/**
 * One run over the resolved settings, returning the exit code instead of
 * exiting: 0 clean, 1 findings at or above --fail-on, 2 bad usage. The single
 * run exits with it; the watch loop reports it and waits for the next change.
 */
async function runOnce({ opt, paths, configFile = null, asked = false }) {
  let files;
  // checkable files the config's `ignore` kept out of the walk - said under
  // the count line, because "fewer findings than expected" is otherwise
  // indistinguishable from "fewer files than expected"
  let ignored = 0;
  if (stdinMode) {
    files = [stdinName]; // one virtual file - the source arrives below
  } else {
    try {
      // `ignore` is repo-level and config-only on purpose: it describes the tree,
      // which is a property of the repo rather than of one invocation
      // one walk: the ignored trees are walked for the count, never read twice
      files = collectFiles(paths, {
        ignore: opt.ignore ?? [], allClasses: opt.allClasses === true, onIgnored: () => { ignored++; },
      });
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
    let shots;
    try {
      shots = await screenshotFiles(files, shot);
    } catch (e) {
      if (ENV_ERRORS.has(e.code)) die(e.message);
      throw e;
    }
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
    return taken.length ? 0 : 1;
  }

  /* The badges: shields.io endpoint files, so the README of a checked repo can
   * carry what its corpus IS and what the gate said about it. Written on every
   * run that got as far as a verdict - including a failing one and including
   * the one below that found NOTHING, which is the state a stale "148 apps"
   * and "clean" would hide longest - and always before the exit code is
   * decided. */
  /* A file written BESIDE the report - a badge, --sarif-out, --json-out.
   * One that cannot be written is the tool-error exit 2 and one line on
   * stderr, and it is RETURNED, never exited on: all of them are written
   * after the report, and process.exit( ) there (die( )) cut a piped report
   * off at the pipe buffer - the defect the first round removed from the
   * report path - while a sidecar that threw ended a clean run with a stack
   * trace and exit 1, the findings code. */
  let outputFailed = false;
  const writeBeside = (what, file, text) => {
    try {
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, text);
      return true;
    } catch (e) {
      console.error(`abap2ui5lint: could not write ${what} ${file}: ${e.message}`);
      outputFailed = true;
      return false;
    }
  };
  const emitBadge = (summary, stats) => {
    if (!opt.badge) return;
    for (const badge of opt.badge) {
      const text = `${JSON.stringify(badgeEndpoint(summary, stats, { ...badge, rules: opt.rules }), null, 2)}\n`;
      if (!writeBeside('the badge file', badge.file, text)) continue;
      if (opt.format === 'stylish' && !opt.quiet) {
        console.log(`badge: wrote ${path.relative(process.cwd(), path.resolve(badge.file))}`);
      }
    }
  };

  if (!files.length) {
    const empty = { ...summarize([]), failing: 0 };
    const nothing = opt.allClasses
      ? `abap2ui5lint: no ABAP classes or views under ${paths.join(', ')} (*.clas.abap, *.view.xml / *.fragment.xml)`
      : `abap2ui5lint: no checkable app classes under ${paths.join(', ')} (ABAP classes building a view with z2ui5_cl_ui5_view_builder, or *.view.xml / *.fragment.xml; --all-classes collects every class)`;
    /* Every machine format prints its EMPTY document - built by the one
     * formatter, so a contract cannot drift between the two paths - and the
     * sentence goes to stderr. The XML formats and SARIF printed the sentence
     * on stdout, which no parser reads as checkstyle or SARIF. */
    const machine = {
      json: () => formatJson([], empty, opt), sarif: () => formatSarif([]),
      checkstyle: () => formatCheckstyle([]), junit: () => formatJunit([]),
    }[opt.format];
    if (machine) {
      console.log(machine());
      if (!opt.quiet) console.error(nothing);
    } else {
      console.log(nothing);
    }
    /* The files written beside the report are written for an empty run too:
     * a workflow's upload-sarif step after the Action's `sarif` input failed
     * on a file that was never there, for a repository that has nothing to
     * check (yet). */
    if (opt.sarifOut) writeBeside('the SARIF file', opt.sarifOut, `${formatSarif([])}\n`);
    if (opt.jsonOut) writeBeside('the JSON file', opt.jsonOut, `${formatJson([], empty, opt)}\n`);
    emitBadge(empty, runStats([]));
    return outputFailed ? 2 : 0;
  }

  /* --fix is a pass of its own: the property gate alone (a fix never depends on
   * the render result), rewrite, then the normal run reports what is left -
   * which is what makes `--fix` safe to put in front of any other flag.
   *
   * It runs to a FIXED POINT, as ESLint's does: two fixes whose spans overlap
   * cannot both be applied to one text, and a fix can leave a shape another
   * rule fixes (chain-house-layout re-lays a chain an attribute fix sat in),
   * so one pass left "N deferred to the next run" and the reader ran --fix
   * two or three times. The passes after the first are in memory: a file is
   * re-checked when the previous pass changed it, or when the superclass
   * facts its check reads (classIndexDeps) moved - every other file would
   * produce the same findings, and with them the same no-op. The output is
   * the one repeated runs reached, written once. Bounded: a pair of rules
   * that undo each other cannot loop forever, and a run that stops at the
   * bound says so. */
  if (opt.fix) {
    const dryRun = opt.fixDryRun === true || process.env.ABAP2UI5LINT_FIX_DRY_RUN === 'true';
    const checkOpt = { ...opt, render: false };
    const isXml = (file, src) => /\.(view|fragment)\.xml$/.test(file) || /^\s*</.test(src);
    const indexOf = (texts) => classIndexOf([...texts.entries()].filter(([file, src]) => !isXml(file, src)).map(([, src]) => src));
    let results = await checkFiles(files, checkOpt);
    const original = new Map(results.map((r) => [r.file, fs.readFileSync(r.file, 'utf8')]));
    const current = new Map(original);
    let index = indexOf(current);
    let fixed = 0;
    let deferred = 0;
    let passes = 0;
    let settled = false;
    const droppedBy = new Map(); // file -> spans the latest check of it could not use
    // what a dry run WOULD settle, one `path:line:col rule-id` per finding -
    // the count alone left the reader with the findings that remain and no
    // way to tell which ones the pass had picked
    const wouldFix = [];
    while (passes < MAX_FIX_PASSES) {
      passes++;
      const changed = [];
      deferred = 0;
      for (const r of results) {
        const source = current.get(r.file);
        const result = applyFixes(source, r.findings);
        // PROBLEMS, not edits: one crlf-line-ending finding carries an edit per
        // line, and "would fix 216 problem(s)" stood over a list of six
        deferred += result.deferredFindings.length;
        droppedBy.set(r.file, result.dropped);
        if (!result.applied || result.output === source) continue;
        fixed += result.findings.length;
        if (dryRun) {
          const rel = path.relative(process.cwd(), r.file);
          for (const f of result.findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0))) {
            wouldFix.push(`${terminalSafe(rel)}:${f.line ?? 0}:${f.column ?? 0} ${f.type}${passes > 1 ? ` (pass ${passes})` : ''}`);
          }
        }
        current.set(r.file, result.output);
        changed.push(r.file);
      }
      if (!changed.length) { settled = true; break; }
      const next = indexOf(current);
      const touched = new Set(changed);
      const recheck = [...current.keys()].filter((file) => touched.has(file)
        || (!isXml(file, current.get(file)) && classIndexDeps(current.get(file), next) !== classIndexDeps(current.get(file), index)));
      index = next;
      results = recheck.map((file) => {
        const src = current.get(file);
        const r = isXml(file, src)
          ? checkXmlSource(src, { ...checkOpt, file })
          : checkAbapSource(src, { ...checkOpt, file, classIndex: index });
        r.file = file;
        return r;
      });
    }
    let files_ = 0;
    for (const [file, text] of current) {
      if (text === original.get(file)) continue;
      files_++;
      if (!dryRun) fs.writeFileSync(file, text);
    }
    if (fixed && opt.format === 'stylish') {
      if (wouldFix.length) console.log(wouldFix.join('\n'));
      console.log(`${dryRun ? 'would fix' : 'fixed'} ${fixed} problem(s) in ${files_} file(s)`
        + `${passes - (settled ? 1 : 0) > 1 ? ` in ${passes - (settled ? 1 : 0)} passes` : ''}`
        + `${settled ? '' : `, stopped after ${MAX_FIX_PASSES} passes - run --fix again`}`
        + `${deferred ? `, ${deferred} deferred (overlapping)` : ''}\n`);
    }
    /* A dropped span is a defect in a RULE, not in the checked repo, and it is
     * the one outcome `--fix` used to keep to itself: the finding survives every
     * pass and the summary says "fixed 0 problems". Said out loud, on stderr, so
     * a piped --json run stays parseable. */
    const droppedIn = [...droppedBy].filter(([, n]) => n).map(([file]) => file);
    const dropped = [...droppedBy.values()].reduce((a, n) => a + n, 0);
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
    // the runtime's UI5 release keys a RENDERED result too (lib/cache.mjs)
    const context = cacheContext({
      version, snapshot: snapshotVersion(), runtime: opt.render ? renderRuntimeUi5Version() : null, options: opt,
    });
    cache = { file, context, entries: loadCache(file, context) };
  }

  // what checkFiles( ) reads as a raw view rather than a class
  const isXmlSource = (file, src) => /\.(view|fragment)\.xml$/.test(file) || /^\s*</.test(src);
  const compute = async () => {
    // the watch loop's warm browser, or nothing: checkFiles opens its own then
    opt.renderer = await rendererFor(opt);
    if (stdinMode) {
      const src = fs.readFileSync(0, 'utf8');
      // the filename decides the handling, exactly as collectFiles decides it
      // for a named path: the XML spellings, else content sniff, else ABAP
      const isXml = /\.(view|fragment)\.xml$/.test(stdinName) || /^\s*</.test(src);
      const r = isXml
        ? checkXmlSource(src, { ...opt, file: stdinName })
        : checkAbapSource(src, { ...opt, file: stdinName });
      r.file = stdinName;
      return [r];
    }
    if (cache) {
      const sources = files.map((file) => fs.readFileSync(file, 'utf8'));
      /* The class index is built over EVERY file of the run, not only the
       * ones the cache misses: a class is judged against what its
       * superclass declares, and checkFiles( ) would otherwise build the
       * index out of the misses alone. Each entry is keyed on the part of
       * the index its check reads too (`deps`), so an edited superclass
       * re-judges its subclasses. */
      const classIndex = classIndexOf(sources.filter((src, i) => !isXmlSource(files[i], src)));
      const slots = files.map((file, i) => {
        const hash = hashOf(sources[i]);
        const deps = hashOf(isXmlSource(file, sources[i]) ? '' : classIndexDeps(sources[i], classIndex));
        const hit = cache.entries[path.resolve(file)];
        /* An entry that parses but does not hold a result (result: null, a
         * truncated write, a hand-edited file) is a MISS, not a crash - the
         * cache is expendable by contract, so nothing read from it may be
         * trusted to have a shape. */
        const valid = hit && hit.hash === hash && hit.deps === deps
          && hit.result && typeof hit.result === 'object'
          && Array.isArray(hit.result.findings);
        return { file, hash, deps, result: valid ? { ...hit.result, file } : null };
      });
      const missing = slots.filter((s) => !s.result).map((s) => s.file);
      const fresh = missing.length ? await checkFiles(missing, { ...opt, classIndex }) : [];
      const byFile = new Map(fresh.map((r) => [r.file, r]));
      for (const s of slots) if (!s.result) s.result = byFile.get(s.file);
      const entries = {};
      for (const s of slots) entries[path.resolve(s.file)] = { hash: s.hash, deps: s.deps, result: cacheable(s.result) };
      /* Written BEFORE the baseline mutates the findings, and tolerantly: a
       * cache that cannot be written costs the next run time, not correctness.
       * The entries of files this run did not look at are kept (saveCache). */
      try { saveCache(cache.file, cache.context, entries, cache.entries); }
      catch (e) { console.error(`abap2ui5lint: could not write the cache file ${cache.file}: ${e.message}`); }
      return slots.map((s) => s.result);
    }
    return checkFiles(files, opt);
  };

  let results;
  try {
    try {
      results = await compute();
    } catch (e) {
      // a run that failed through the warm browser does not keep it: the next
      // run opens a fresh one instead of failing the same way forever
      if (opt.renderer) await dropWarm();
      /* Chromium missing is a missing runtime by another name, and a
       * default-on gate steps aside for it the same way (renderFallback): the
       * property gate runs again without it and the notice says why. An
       * asked-for gate keeps the refusal below. The cache sits this run out -
       * its key says the render gate ran. */
      if (e.code !== 'ERR_RENDER_BROWSER_MISSING' || asked) throw e;
      warn(`the render gate is OFF for this run - ${e.message.replace(/^the render gate /, 'it ')}`
        + ' To make this an ERROR instead: --render, or "render": true in abap2ui5lint.jsonc.');
      opt.render = false;
      cache = null;
      results = await compute();
    }
    progress.finish();
  } catch (e) {
    progress.finish();
    if (opt.renderer) await dropWarm();
    // the render gate's runtime and browser and the metadata snapshot are all
    // environment problems worth one actionable line, not a stack trace
    if (ENV_ERRORS.has(e.code)) die(e.message);
    throw e;
  }

  /* The baseline: adopt the linter on a repo that already has findings.
   * --update-baseline freezes the CURRENT findings as accepted debt;
   * a configured baseline suppresses exactly those on every later run, new
   * findings fail normally, and a STALE entry (its finding is gone) fails
   * too — a suppression can never quietly outlive what it suppressed. */
  if (updateBaseline) {
    const file = opt.baseline ?? 'abap2ui5lint-baseline.json';
    /* The files this run looked at get their entries replaced; every other
     * file's entries stay. Rebuilding from this run alone shrank a baseline
     * over `src` to the one file an update happened to be run on. */
    let previous = null;
    if (fs.existsSync(file)) {
      try { previous = loadBaseline(file); } catch (e) { die(`${e.message} - fix or delete it before --update-baseline`); }
    }
    // keys are relative to the baseline file's own directory, so every runner
    // (CLI from any cwd, the Action, the VS Code extension) computes the same
    // scope: the paths the run walked - an entry of a file under them that
    // was not collected (it builds no view any more) is dropped, not kept
    const map = mergeBaseline(previous, results, baselineBase(file), { scope: stdinMode ? [] : paths });
    // nothing is printed yet, so die( ) cuts nothing off here
    try { writeBaseline(file, map); } catch (e) { die(`could not write the baseline file ${file}: ${e.message}`); }
    const n = [...map.values()].reduce((s, c) => s + c, 0);
    /* The one line is the report of a stylish run. Beside a machine format it
     * is prose, and stdout is the document a caller parses - so it goes to
     * stderr there, like every other note. */
    (opt.format === 'stylish' ? console.log : console.error)(`baseline: wrote ${n} finding(s) as ${map.size} entr${map.size === 1 ? 'y' : 'ies'} to ${path.relative(process.cwd(), file)}`);
    return 0;
  }
  let baselineNote = null;
  let baselineStale = [];
  let baselineStats = null;
  if (opt.baseline && fs.existsSync(opt.baseline)) {
    let map;
    try { map = loadBaseline(opt.baseline); } catch (e) { die(e.message); }
    const { suppressed, byRule, stale } = applyBaseline(results, map, baselineBase(opt.baseline), { scope: stdinMode ? [] : paths });
    baselineStale = stale;
    baselineStats = { suppressed, byRule, stale: stale.length, staleEntries: stale, file: path.relative(process.cwd(), opt.baseline) };
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
  // the config path as the reader knows it: relative where that is shorter
  const configShown = configFile && (() => {
    const rel = path.relative(process.cwd(), configFile);
    return rel && !rel.startsWith('..') ? rel : configFile;
  })();
  const reportOpt = {
    ...opt,
    context,
    stats: showStats ? stats : null,
    times: progress.times,
    baseline: baselineStats,
    /* the config the verdict was reached under, and what its `ignore` dropped
     * - stylish only (the formatter prints it under the count line), quiet
     * like the run summary, never as prose inside a machine format */
    config: configShown && !opt.quiet ? { file: configShown, ignored } : null,
  };

  if (opt.format === 'json') console.log(formatJson(results, summary, { ...reportOpt, stats }));
  else if (opt.format === 'sarif') console.log(formatSarif(results));
  else if (opt.format === 'checkstyle') console.log(formatCheckstyle(results));
  else if (opt.format === 'junit') console.log(formatJunit(results));
  else if (opt.format === 'markdown') console.log(formatMarkdown(results, summary, reportOpt));
  else console.log(formatStylish(results, summary, reportOpt));

  /* Two things the run summary says and a one-file run, which prints none,
   * used to keep to itself - each the one line that stops a green report
   * from reading as approval: a class that opened a builder and produced no
   * view (the gate judged nothing of it), and an app class whose view is
   * built elsewhere (the gate judged the class, not a view). Always, when
   * the count is non-zero; the summary carries the same numbers when it
   * prints. */
  if (opt.format === 'stylish' && !showStats) {
    if (stats.emptyViews) console.log(`abap2ui5lint: ${stats.emptyViews} class${stats.emptyViews === 1 ? '' : 'es'} opened a builder and produced no view`);
    if (stats.appsWithoutView) {
      console.log(`abap2ui5lint: ${stats.appsWithoutView} app class${stats.appsWithoutView === 1 ? ' builds' : 'es build'} no view here (the view comes from another class)`
        + ' - judged by the source-side and lifecycle rules only, no view was checked');
    }
  }

  /* A machine report written BESIDE the human one, in the same run.
   *
   * Without this a workflow that wants both - the annotated stylish report in
   * the log AND a SARIF file for code scanning, or the counts for a later step -
   * has to run the whole thing twice, and the second run pays the render gate
   * again. The formatters are pure functions of `results`, so the sidecar costs
   * a serialization and nothing else. */
  for (const [what, file, text] of [
    ['the SARIF file', opt.sarifOut, () => formatSarif(results)],
    ['the JSON file', opt.jsonOut, () => formatJson(results, summary, { ...reportOpt, stats })],
  ]) {
    if (file) writeBeside(what, file, `${text()}\n`);
  }

  emitBadge(summary, stats);

  /* Baseline prose rides alongside the HUMAN report only — `--json`/`--sarif`
   * exist to be piped, and a prose line after the document breaks the parse
   * (the same rule the annotations follow). The stale entries still decide
   * the exit code in every format. The note itself is redundant once the run
   * summary carries the same count, so there it shrinks to the stale entries. */
  if (baselineNote && opt.format === 'stylish') {
    if (!showStats) console.log(baselineNote);
    for (const s of baselineStale) console.log(`  ! stale: ${terminalSafe(s.key)} (${s.count})`);
  }

  if (opt.verbose && opt.format === 'stylish') {
    for (const r of results) {
      for (const n of r.notes) console.log(`note: ${terminalSafe(path.relative(process.cwd(), r.file))}: ${terminalSafe(n)}`);
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
   * machine format stays parseable. The one exception is the stale entry's:
   * --advisory / --fail-on never promise exit 0 whatever the report says,
   * and a cap from the config used to break that promise - the excess is
   * still said, it just does not fail. */
  const overWarningCap = opt.maxWarnings !== undefined && summary.totals.warning > opt.maxWarnings;
  if (overWarningCap) {
    console.error(`abap2ui5lint: ${summary.totals.warning} warning(s) exceed --max-warnings ${opt.maxWarnings}`
      + (threshold === Infinity ? ' (not failing: --fail-on never / --advisory)' : ''));
  }

  /* …and where a PERSON is reading, the command that explains the ids just
   * printed. Decided the way the progress line is - stderr is a terminal -
   * and on stderr like it, so a redirected stdout stays the report; never in
   * --quiet and never beside a machine format (explainFooter returns null). */
  const footer = explainFooter(results, { quiet: opt.quiet, format: opt.format, tty: process.stderr.isTTY === true });
  if (footer) console.error(footer);

  /* A stale entry fails like a finding at the threshold - and like one, not
   * under --advisory / --fail-on never, which promise exit 0 whatever the
   * report says. It is still reported. */
  const staleFails = baselineStale.length > 0 && threshold !== Infinity;
  // an output the run was asked for and could not write is a tool error (2)
  if (outputFailed) return 2;
  return summary.failing > 0 || staleFails || (overWarningCap && threshold !== Infinity) ? 1 : 0;
}

/*
 * --watch: the run above, again on every change.
 *
 * The audience is the developer whose editor has no linter in it - Eclipse
 * ADT, with abapGit pulling the classes into a checkout - for whom the loop
 * is save, pull, read. Everything given on the command line is watched: a
 * directory recursively (fs.watch's own recursion where the platform has it,
 * one watcher per subdirectory where it does not - there a directory created
 * later is not seen until the next start), a named file through its parent
 * directory (an editor that saves by rename replaces the inode a watcher on
 * the file itself would keep following), plus the config file and the
 * baseline, each by name. Events are debounced (a save is often two or three
 * of them), a change during a run queues one more run rather than a parallel
 * one, and the settings are resolved again on every run so an edited config
 * takes effect without a restart.
 *
 * A watch never fails: the exit code of each run is what the report says
 * about the corpus, not what the process says about itself, and the only way
 * out is Ctrl+C, which is exit 0.
 */
const WATCH_DEBOUNCE_MS = 250;
// what a directory walk collects (collectFiles): the rest is noise - the
// cache file, a badge, an editor's swap file
const WATCHED_IN_DIR = /\.(clas\.abap|view\.xml|fragment\.xml)$/i;
const SKIPPED_SEGMENT = (name) => name === 'node_modules' || name.startsWith('.');

async function watchLoop() {
  const first = resolveRun();
  const watchers = [];
  const changed = new Set();
  let timer = null;
  let running = false;

  const hasFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  const stamp = () => new Date().toTimeString().slice(0, 8);
  // a path as the reader knows it: relative to the cwd where that is shorter,
  // as given otherwise (an absolute /tmp path is not `../../../tmp`)
  const nice = (p) => {
    const rel = path.relative(process.cwd(), p);
    return rel && !rel.startsWith('..') ? rel : p;
  };
  const announce = () => {
    console.error(`abap2ui5lint: watching ${first.paths.join(', ')}`
      + `${first.configFile ? ` and ${nice(first.configFile)}` : ''}`
      + `${first.opt.baseline && hasFile(first.opt.baseline) ? ` and ${nice(first.opt.baseline)}` : ''}`
      + ' - Ctrl+C stops');
  };

  const rerun = async () => {
    if (running) return;
    running = true;
    const names = [...changed];
    changed.clear();
    console.error(`\n${'-'.repeat(8)} ${stamp()}  changed: ${names.join(', ')} ${'-'.repeat(8)}`);
    try {
      await runOnce(resolveRun());
    } catch (e) {
      // a config error, a bad path or a crashed gate is one line and the
      // loop goes on: the next save is the fix
      console.error(`abap2ui5lint: ${e.code === 'ERR_USAGE' ? e.message : (e.stack ?? e.message)}`);
    }
    announce();
    running = false;
    // what arrived while the run was busy is one more run, not a lost one
    if (changed.size) timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);
  };
  const schedule = (name) => {
    changed.add(name);
    if (running) return;
    clearTimeout(timer);
    timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);
  };

  const watch = (dir, opts, onEvent) => {
    const w = fs.watch(dir, opts, onEvent);
    // a watcher that dies (the directory removed under it) is reported, not fatal
    w.on('error', (e) => console.error(`abap2ui5lint: watch on ${dir}: ${e.message}`));
    watchers.push(w);
    return w;
  };
  /* A file by name: its directory, filtered to the one basename. */
  const watchFile = (file) => {
    const abs = path.resolve(file);
    watch(path.dirname(abs), {}, (_, filename) => {
      if (filename === path.basename(abs)) schedule(nice(file));
    });
  };
  /* A tree: recursive where the platform offers it, else one watcher per
   * subdirectory (node_modules and dot-directories skipped, as in the walk). */
  const relevant = (rel) => {
    const segments = rel.split(/[\\/]/);
    return WATCHED_IN_DIR.test(rel) && !segments.some(SKIPPED_SEGMENT);
  };
  const watchTree = (dir) => {
    const abs = path.resolve(dir);
    const shown = nice(dir);
    const onEvent = (base) => (_, filename) => {
      if (!filename) return;
      const rel = base ? path.join(base, filename) : filename;
      if (relevant(rel)) schedule(path.join(shown, rel));
    };
    try {
      watch(abs, { recursive: true }, onEvent(''));
      return;
    } catch (e) {
      if (e.code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') throw e;
    }
    const walk = (at, rel) => {
      watch(at, {}, onEvent(rel));
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        if (entry.isDirectory() && !SKIPPED_SEGMENT(entry.name)) walk(path.join(at, entry.name), path.join(rel, entry.name));
      }
    };
    walk(abs, '');
  };

  /* The watchers go up BEFORE the first run, and that run counts as a
   * running one: with the render gate it is seconds of browser launch and UI5
   * boot, and a file saved in that window - after the run had collected, with
   * nothing watching yet - was never seen; the loop then reported the old
   * state until the next save. What arrives during the first run is one more
   * run after it, exactly as during any other. A path that is not there is
   * left to the first run, which says so and exits 2. */
  running = true;
  for (const p of first.paths) {
    let isDir;
    try { isDir = fs.statSync(p).isDirectory(); } catch { continue; }
    if (isDir) watchTree(p); else watchFile(p);
  }
  if (first.configFile) watchFile(first.configFile);
  if (first.opt.baseline && hasFile(first.opt.baseline)) watchFile(first.opt.baseline);

  // the first run is an ordinary one: bad usage still exits 2, because the
  // loop has not started yet and a wrong path is not something a save corrects
  await runOnce(first);
  watching = true;
  announce();
  running = false;
  if (changed.size) timer = setTimeout(rerun, WATCH_DEBOUNCE_MS);

  const stop = async () => {
    for (const w of watchers) w.close();
    await dropWarm();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (watchMode) {
  await watchLoop();
} else {
  /* exitCode, never exit( ): the report may still be queued for a pipe (see
   * exitFlushed), and a run leaves nothing behind that would keep the event
   * loop alive - checkFiles closes the renderer it opened, the renderer
   * closes its browser and its server - so the process ends the moment the
   * last byte is out. */
  process.exitCode = await runOnce(resolveRun());
}
