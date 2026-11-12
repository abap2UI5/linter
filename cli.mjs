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
 *   --deprecated-at <ver>  the deprecation horizon past --ui5 (e.g. 1.136, the
 *                      legacy-free baseline): deprecations that take effect
 *                      after the target and up to this version are reported
 *                      as deprecated-after-target hints, naming the
 *                      replacement and whether the target has it yet.
 *                      Nothing else changes. Also "deprecatedAt" in the config
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
 *                      not look at. Without the flag (and without "baseline"
 *                      in the config) an abap2ui5lint-baseline.json next to
 *                      the config, else in the current directory, is read
 *                      when it exists - the file --update-baseline writes
 *                      when nothing names one
 *   --report-false-positives
 *                      print, for every baseline entry marked in the
 *                      baseline's "falsePositives" block (key -> why the code
 *                      is correct), the issue to file against the linter:
 *                      rule, finding, source around it, the reason, the
 *                      versions - and a link that opens it prefilled. Sends
 *                      nothing; exit 0. Needs a baseline
 *   --update-baseline  write/refresh that file from this run and exit 0: the
 *                      entries of the files under the paths walked are
 *                      replaced, every other file's are kept - including
 *                      when the walk collects nothing, which prunes the
 *                      entries of files that are gone. The one line it
 *                      prints is the run's report (on stderr beside a
 *                      machine --format, whose stdout stays empty: an update
 *                      produces no document), so it is refused together
 *                      with --sarif-out, --json-out, --badge and
 *                      --badge-corpus, which would be written empty or not
 *                      at all. With --stdin it needs --stdin-filename
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
 *                      the current directory). Refused without --cache (or
 *                      "cache": true in the config): it would change nothing
 *   --quiet            report errors only - the counts still show everything,
 *                      and the run summary and progress go quiet too
 *   --stats            print the run summary: what was checked (files, views,
 *                      controls, bindings, icons), which gates ran, what the
 *                      baseline swallowed and how long it took. On by default
 *                      for more than one file, --no-stats switches it off
 *   --timing           measure where the check spends its time and add a
 *                      `slowest` line to the run summary (and `stats.timings`
 *                      to --format json): each rule written as one unit on
 *                      its own (`rule:<id>`), the rules that still share a
 *                      function by the pass they run in (`pass:<name>`), the
 *                      reconstruction and the property gate. Implies --stats
 *   --progress         report the gates while they run, on stderr (stdout stays
 *                      pipeable). Default: on a terminal and inside GitHub
 *                      Actions, where it becomes one collapsed log group;
 *                      --no-progress switches it off
 *   --badge <file>     write a shields.io endpoint JSON for the verdict, so a
 *                      repo can show it in the README ("check-abap2UI5 |
 *                      175 rules passed" green, "7 errors" red)
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
 *                      itself starts with '<'. Refused without --stdin: a
 *                      name for a source that is not piped names nothing
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
 *   --no-config        ignore any config file (contradicts --config <file>,
 *                      so the two together are refused)
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
import { checkFiles, collectFiles, screenshotFiles, checkAbapSource, checkXmlSource, isXmlSource } from './lib/index.mjs';
import { classIndexOf, classIndexDeps } from './lib/guide-rules.mjs';
import { ownObjectsOf, objectNameOf } from './lib/project-index.mjs';
import { findConfig, loadConfig, applyConfig, CONFIG_NAMES } from './lib/config.mjs';
import { snapshotVersion, withinUi5Floor } from './lib/properties.mjs';
import { SEVERITIES, severityRank, severityOf } from './lib/findings.mjs';
import { applyFixes, MAX_FIX_PASSES } from './lib/fix.mjs';
import { missingRenderDeps, renderFallback, renderDepsError, openRenderer, runtimeSnapshotMismatch, renderRuntimeUi5Version } from './lib/render.mjs';
import { loadBaseline, loadFalsePositives, applyBaseline, updateBaseline as mergeBaseline, writeBaseline, baselineBase } from './lib/baseline.mjs';
import { falsePositiveIssue } from './lib/false-positive.mjs';
import { DEFAULT_CACHE_FILE, cacheContext, loadCache, saveCache, hashOf, cacheable } from './lib/cache.mjs';
import { FORMATS, summarize, contextLine, formatStylish, formatJson, formatMarkdown, formatSarif, formatCheckstyle, formatJunit, githubAnnotations, runStats, createProgress, badgeEndpoint, ruleIndex, formatExplain, formatRuleIndex, explainFooter, terminalSafe } from './lib/report.mjs';
import { RULES_PAGE } from './lib/rule-docs.mjs';
import { caseMatch } from './lib/suggest.mjs';
import { outsideTree, HERE, ownPackage, ownVersion, shownPath, DEFAULT_BASELINE_FILE, defaultBaselineDir, USAGE, wrapUsage, usageBlock, schemaRef } from './lib/cli/support.mjs';
import { watchLoop } from './lib/cli/watch.mjs';
import { parseArgs } from './lib/cli/args.mjs';

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

const {
  opt, seen, renderAsked, paths, configFlag, noConfig, updateBaseline, reportFalsePositives,
  stdinMode, stdinName, stdinNamed, shot, watchMode,
} = await parseArgs(args, { die, exitFlushed, helpText });

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
  // where the class index is read from (see indexOnlySources) - the config's
  // `paths` when it names them, whatever the run itself was handed
  let indexPaths = null;
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
      if (cfg.paths) {
        const base = path.dirname(configFile);
        indexPaths = cfg.paths.map((p) => (path.isAbsolute(p) ? p : path.join(base, p)));
        if (!runPaths.length) runPaths.push(...indexPaths);
      }
      // a baseline named in the config lives next to the config, not the cwd
      // - and is written only inside the config's tree (outsideTree); one
      // named on the command line is the user's and goes anywhere
      o.baselineRoot = undefined;
      if (!seen.has('baseline') && cfg.baseline) {
        o.baseline = path.resolve(path.dirname(configFile), cfg.baseline);
        o.baselineRoot = cfg.baselineRoot ?? path.dirname(configFile);
      }
      // ditto the badge files: the config says where in the REPO they belong
      if (!seen.has('badge') && cfg.badge) {
        o.badge = cfg.badge.map((b) => ({ ...b, file: path.resolve(path.dirname(configFile), b.file), root: b.root ?? path.dirname(configFile) }));
      }
    }
  }
  /* Nothing names a baseline: the default file is read when it is where
   * --update-baseline without --baseline puts it (DEFAULT_BASELINE_FILE). A
   * file that is not there is not an error here - only a NAMED baseline that
   * is missing is one (runOnce); the default's absence is the common case. */
  if (!o.baseline) {
    const candidate = path.join(defaultBaselineDir(configFile), DEFAULT_BASELINE_FILE);
    if (fs.existsSync(candidate)) {
      o.baseline = candidate;
      o.baselineDefault = true;
    }
  }
  /* A horizon BELOW the floor would report nothing - every deprecation up to
   * it is already in effect and reported as control-/member-deprecated. One
   * EQUAL to it reports nothing either: deprecated-after-target covers the
   * versions after the target and up to the horizon, and that range is
   * empty. A setting that silently does nothing is the typo this tool
   * refuses. Judged here, after the config: the two halves may come from
   * different places. (withinUi5Floor(a, b) is a <= b on major.minor.) */
  if (o.deprecatedAt && withinUi5Floor(o.deprecatedAt, o.minUi5)) {
    const equal = withinUi5Floor(o.minUi5, o.deprecatedAt);
    die(`deprecatedAt ${o.deprecatedAt} is ${equal ? 'equal to' : 'below'} the ui5 target ${o.minUi5} - the horizon has to lie past the target (e.g. --ui5 1.71 --deprecated-at 1.136)`);
  }
  /* The cache file's location is a setting OF the cache; without one it did
   * nothing, silently. Judged after the config, whose "cache": true is the
   * other way to switch it on, and before --stdin stands the cache down. */
  if (o.cacheLocation && !o.cache) die('--cache-location has no effect without --cache (or "cache": true in the config)');
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
    /* A baseline entry is keyed on the file's path; an update over a source
     * called <stdin> writes `<stdin>|rule|...` entries no later run - over the
     * file, or over the same source piped with its name - can ever match. */
    if (updateBaseline && !stdinNamed) {
      die('--stdin --update-baseline needs --stdin-filename <path> - an entry keyed on <stdin> can never match a file');
    }
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
  return { opt: o, paths: runPaths, indexPaths: indexPaths ?? runPaths, configFile, asked };
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

/*
 * The classes the CLASS INDEX reads (classIndexOf, lib/guide-rules.mjs) that
 * the run does not check: every ABAP class under the configured `paths`
 * (the run's own paths without a config), minus `ignore` - a helper class
 * that builds no view, a superclass, a caller - however few files the run
 * was handed.
 *
 * The index is the one input a class's verdict takes from OTHER classes: a
 * `cs_event` it inherits (frontend-action-as-backend-event), a public
 * attribute another class reads back (unused-/unbound-public-attribute).
 * Built over the checked files only, it changed with what the run was
 * handed: a run without --all-classes never saw the superclass that builds
 * no view, a one-file run (a pre-commit hook) saw no other class at all, and
 * both reported what the full run - and the editor, which indexes the whole
 * workspace - silences. The answer is the same for every way in now.
 *
 * Sources, not files: the caller builds the index over these plus the
 * checked files' current text. Empty when the walk would find nothing the run
 * does not already hold: `--all-classes` collected `files` from the very
 * same paths (`collectedFrom`; null for a piped source, which collected
 * nothing).
 */
function indexOnlySources(indexPaths, files, opt, collectedFrom) {
  const same = (a, b) => a.length === b.length && a.every((p, i) => path.resolve(p) === path.resolve(b[i]));
  if (opt.allClasses === true && collectedFrom && same(indexPaths, collectedFrom)) return [];
  const roots = indexPaths.filter((p) => fs.existsSync(p));
  if (!roots.length) return [];
  const checked = new Set(files.map((f) => path.resolve(f)));
  const out = [];
  for (const file of collectFiles(roots, { ignore: opt.ignore ?? [], allClasses: true })) {
    if (checked.has(path.resolve(file)) || !/\.abap$/i.test(file)) continue;
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!isXmlSource(file, src)) out.push(src);
  }
  return out;
}

/**
 * One run over the resolved settings, returning the exit code instead of
 * exiting: 0 clean, 1 findings at or above --fail-on, 2 bad usage. The single
 * run exits with it; the watch loop reports it and waits for the next change.
 */
async function runOnce({ opt, paths, indexPaths = paths, configFile = null, asked = false }) {
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
      if (badge.root && outsideTree(badge.root, badge.file)) {
        console.error(`abap2ui5lint: could not write the badge file ${badge.file}: it resolves, through a symbolic link, `
          + `outside ${badge.root}, the directory of the config that names it`);
        outputFailed = true;
        continue;
      }
      const text = `${JSON.stringify(badgeEndpoint(summary, stats, { ...badge, rules: opt.rules }), null, 2)}\n`;
      if (!writeBeside('the badge file', badge.file, text)) continue;
      if (opt.format === 'stylish' && !opt.quiet) {
        console.log(`badge: wrote ${path.relative(process.cwd(), path.resolve(badge.file))}`);
      }
    }
  };

  const threshold = opt.failOn === 'never' ? Infinity : severityRank(opt.failOn);

  /* The baseline: adopt the linter on a repo that already has findings.
   * --update-baseline freezes the CURRENT findings as accepted debt;
   * a configured baseline suppresses exactly those on every later run, new
   * findings fail normally, and a STALE entry (its finding is gone) fails
   * too — a suppression can never quietly outlive what it suppressed.
   *
   * One step for both shapes of a run - the normal one and the one whose
   * walk collected NOTHING. The empty walk used to return before the baseline
   * had its say, and that is exactly the run in which every entry is stale:
   * the classes were deleted, or moved under `ignore`, and the run was green
   * (exit 0), --update-baseline kept the entries and a named baseline that
   * was not there was no error. applyBaseline( ) over no results judges the
   * entries of the files under the walked paths as stale; mergeBaseline( )
   * over no results prunes them.
   *
   * Returns { done: true } when the file was written (the run's report is the
   * one line, exit 0), { note, stale, stats } for an applied baseline, null
   * for a run without one. */
  const baselineStep = (results) => {
    if (updateBaseline) {
      const file = opt.baseline ?? path.join(defaultBaselineDir(configFile), DEFAULT_BASELINE_FILE);
      if (opt.baselineRoot && outsideTree(opt.baselineRoot, file)) {
        die(`refusing to write the baseline file ${file}: it resolves, through a symbolic link, outside ${opt.baselineRoot}, `
          + 'the directory of the config that names it (name a file elsewhere with --baseline)');
      }
      /* The DEFAULT file is not the user's choice either: it lands next to a
       * discovered config - in a cloned repository, possibly not the cwd at
       * all - and a link the repository ships under that name (dangling, so
       * there is nothing to parse first) wrote the baseline wherever it
       * pointed, a shell start-up file included. Only a file named with
       * --baseline is written where it points. */
      const defaultDir = !opt.baseline || opt.baselineDefault ? path.dirname(file) : null;
      if (!opt.baselineRoot && defaultDir && outsideTree(defaultDir, file)) {
        die(`refusing to write the baseline file ${file}: it resolves, through a symbolic link, outside ${defaultDir}, `
          + 'where the default baseline is written (name a file elsewhere with --baseline)');
      }
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
      // a mark lives as long as its entry: the update keeps the reasons of
      // the keys it keeps (writeBaseline drops the rest)
      let marks = null;
      if (previous) { try { marks = loadFalsePositives(file); } catch { marks = null; } }
      try { writeBaseline(file, map, { falsePositives: marks }); } catch (e) { die(`could not write the baseline file ${file}: ${e.message}`); }
      const n = [...map.values()].reduce((s, c) => s + c, 0);
      /* The one line is the report of a stylish run. Beside a machine format it
       * is prose, and stdout is the document a caller parses - so it goes to
       * stderr there, like every other note. */
      const say = opt.format === 'stylish' ? console.log : console.error;
      say(`baseline: wrote ${n} finding(s) as ${map.size} entr${map.size === 1 ? 'y' : 'ies'} to ${shownPath(file)}`);
      /* Written to the default name: say where the next run finds it, because
       * for a long time it did not - the file was written and never read. */
      if (!opt.baseline || opt.baselineDefault) {
        say(`baseline: the next run reads it from there (${configFile ? 'next to the config' : 'the current directory'}) - `
          + `to pin it, add --baseline ${shownPath(file)} or "baseline": ${JSON.stringify(path.basename(file))} to ${configFile ? shownPath(configFile) : 'abap2ui5lint.jsonc'}`);
      }
      return { done: true };
    }
    if (!opt.baseline) return null;
    if (!fs.existsSync(opt.baseline)) die(`baseline file not found: ${opt.baseline} (create it with --update-baseline)`);
    let map;
    let marks;
    try { map = loadBaseline(opt.baseline); marks = loadFalsePositives(opt.baseline); } catch (e) { die(e.message); }
    const { suppressed, byRule, stale, falsePositives } = applyBaseline(results, map, baselineBase(opt.baseline), {
      scope: stdinMode ? [] : paths, falsePositives: marks,
    });
    const shown = shownPath(opt.baseline);
    return {
      stale,
      falsePositives,
      stats: { suppressed, byRule, stale: stale.length, staleEntries: stale, file: shown, falsePositives: falsePositives.length },
      /* The marked ones are named apart: they are not debt of this
       * repository but a rule that misfired, and the only way the rule gets
       * fixed is that somebody is told. */
      note: `baseline: ${suppressed} finding(s) suppressed by ${shown}`
        + (falsePositives.length ? `, ${falsePositives.length} of them marked as false positives - \`abap2ui5lint --report-false-positives\` prints the issue to file for each` : '')
        + (stale.length ? `, ${stale.length} STALE entr${stale.length === 1 ? 'y' : 'ies'} — the finding is gone, remove the entry or run --update-baseline` : ''),
    };
  };
  /* A stale entry fails like a finding at the threshold - and like one, not
   * under --advisory / --fail-on never, which promise exit 0 whatever the
   * report says. It is still reported. */
  const staleFails = (stale) => stale.length > 0 && threshold !== Infinity;

  if (!files.length) {
    const baselined = baselineStep([]);
    if (baselined?.done) return 0;
    const stale = baselined?.stale ?? [];
    const empty = { ...summarize([]), failing: 0 };
    const nothing = opt.allClasses
      ? `abap2ui5lint: no ABAP classes or views under ${paths.join(', ')} (*.clas.abap, *.view.xml / *.fragment.xml)`
      : `abap2ui5lint: no checkable app classes under ${paths.join(', ')} (ABAP classes building a view with z2ui5_cl_ui5_view_builder, or *.view.xml / *.fragment.xml; --all-classes collects every class)`;
    /* Every machine format prints its EMPTY document - built by the one
     * formatter, so a contract cannot drift between the two paths - and the
     * sentence goes to stderr. The XML formats and SARIF printed the sentence
     * on stdout, which no parser reads as checkstyle or SARIF. The json
     * document carries the baseline block like a full run's does: the stale
     * entries are the one thing this run can report. */
    const jsonOpt = { ...opt, baseline: baselined?.stats ?? null };
    const machine = {
      json: () => formatJson([], empty, jsonOpt), sarif: () => formatSarif([]),
      checkstyle: () => formatCheckstyle([]), junit: () => formatJunit([]),
    }[opt.format];
    if (machine) {
      console.log(machine());
      if (!opt.quiet) console.error(nothing);
    } else {
      console.log(nothing);
      // the baseline prose, where the stylish report has it: on stdout, the
      // stale entries one per line (they are what fails this run)
      if (baselined) {
        console.log(baselined.note);
        for (const s of stale) console.log(`  ! stale: ${terminalSafe(s.key)} (${s.count})`);
      }
    }
    /* The files written beside the report are written for an empty run too:
     * a workflow's upload-sarif step after the Action's `sarif` input failed
     * on a file that was never there, for a repository that has nothing to
     * check (yet). */
    if (opt.sarifOut) writeBeside('the SARIF file', opt.sarifOut, `${formatSarif([])}\n`);
    if (opt.jsonOut) writeBeside('the JSON file', opt.jsonOut, `${formatJson([], empty, jsonOpt)}\n`);
    emitBadge(empty, runStats([]));
    if (outputFailed) return 2;
    return staleFails(stale) ? 1 : 0;
  }

  /* The classes the class index reads beyond the ones this run checks - see
   * indexOnlySources. Read once per run; every index below is built over
   * the run's own sources (as they are at that moment) plus these. */
  const indexExtra = indexOnlySources(indexPaths, files, opt, stdinMode ? null : paths);
  const indexOver = (abapSources) => classIndexOf([...abapSources, ...indexExtra]);
  /* The objects the repository defines (lib/project-index.mjs) - every
   * abapGit object under the configured paths, tables and interfaces
   * included, plus whatever this run was handed by name. Read off file
   * names, so the walk opens nothing. */
  opt.ownObjects = [...new Set([
    ...ownObjectsOf(indexPaths.filter((p) => fs.existsSync(p))),
    ...files.map(objectNameOf).filter(Boolean),
    ...(stdinMode && stdinName ? [objectNameOf(stdinName)].filter(Boolean) : []),
  ])].sort();

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
    const indexOf = (texts) => indexOver([...texts.entries()].filter(([file, src]) => !isXmlSource(file, src)).map(([, src]) => src));
    const original = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
    const current = new Map(original);
    let index = indexOf(current);
    let results = await checkFiles(files, { ...checkOpt, classIndex: index });
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
        || (!isXmlSource(file, current.get(file)) && classIndexDeps(current.get(file), next) !== classIndexDeps(current.get(file), index)));
      index = next;
      results = recheck.map((file) => {
        const src = current.get(file);
        const r = isXmlSource(file, src)
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
  /* A verdict replayed from the cache took no time to reach, so --timing
   * measures a run without it - neither read nor written. */
  if (opt.cache && !opt.timing) {
    const version = ownVersion();
    const file = path.resolve(opt.cacheLocation ?? DEFAULT_CACHE_FILE);
    // the runtime's UI5 release keys a RENDERED result too (lib/cache.mjs)
    const context = cacheContext({
      version, snapshot: snapshotVersion(), runtime: opt.render ? renderRuntimeUi5Version() : null, options: opt,
    });
    cache = { file, context, entries: loadCache(file, context) };
  }

  const compute = async () => {
    // the watch loop's warm browser, or nothing: checkFiles opens its own then
    opt.renderer = await rendererFor(opt);
    if (stdinMode) {
      const src = fs.readFileSync(0, 'utf8');
      // the filename decides the handling, exactly as collectFiles decides it
      // for a named path: the XML spellings, else content sniff, else ABAP
      const xml = isXmlSource(stdinName, src);
      /* the piped source is judged against the repo's other classes, as a
       * saved file would be - the index holds it in place of the file of
       * that name, which may be stale or absent */
      const r = xml
        ? checkXmlSource(src, { ...opt, file: stdinName })
        : checkAbapSource(src, { ...opt, file: stdinName, ...(indexExtra.length ? { classIndex: indexOver([src]) } : {}) });
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
      const classIndex = indexOver(sources.filter((src, i) => !isXmlSource(files[i], src)));
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
    /* checkFiles builds the index over the files it is handed; one that
     * reaches beyond them is built here, over the same sources plus the rest */
    if (!indexExtra.length) return checkFiles(files, opt);
    const own = files.map((file) => fs.readFileSync(file, 'utf8')).filter((src, i) => !isXmlSource(files[i], src));
    return checkFiles(files, { ...opt, classIndex: indexOver(own) });
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

  // the baseline, over what the run found - see baselineStep above
  const baselined = baselineStep(results);
  if (baselined?.done) return 0;
  /* --report-false-positives: the marked entries as issues, and nothing of
   * the report. One issue per KEY - nine findings of one shape are one
   * defect of the rule - built from the first finding the key suppressed. */
  if (reportFalsePositives) {
    if (!baselined) die('--report-false-positives needs a baseline - name one with --baseline, or mark entries in abap2ui5lint-baseline.json ("falsePositives": { "<finding-key>": "<why the code is correct>" })');
    const byKey = new Map();
    for (const m of baselined.falsePositives) {
      if (!byKey.has(m.key)) byKey.set(m.key, { ...m, count: 0 });
      byKey.get(m.key).count++;
    }
    if (!byKey.size) {
      console.log(`no baseline entry in ${shownPath(opt.baseline)} is marked as a false positive - add "falsePositives": { "<finding-key>": "<why the code is correct>" } beside "findings"`);
      return 0;
    }
    const sourceOf = { get: (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } } };
    for (const m of byKey.values()) {
      const issue = falsePositiveIssue({
        finding: m.finding, file: shownPath(m.file), reason: m.reason, source: sourceOf.get(m.file) ?? null,
        version: ownVersion(), ui5: opt.minUi5, distribution: opt.distribution ?? null,
      });
      console.log(`# ${terminalSafe(issue.title)}${m.count > 1 ? `  (${m.count} findings)` : ''}\n`);
      // per line: terminalSafe( ) folds a line break like any other control character
      console.log(`${issue.body.split('\n').map(terminalSafe).join('\n')}\n`);
      console.log(`file it: ${issue.url}\n`);
    }
    console.log(`${byKey.size} false positive(s) to report - open a link to file one; nothing has been sent`);
    return 0;
  }
  const baselineNote = baselined?.note ?? null;
  const baselineStale = baselined?.stale ?? [];
  const baselineStats = baselined?.stats ?? null;

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
  const configShown = configFile && shownPath(configFile);
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

  // an output the run was asked for and could not write is a tool error (2)
  if (outputFailed) return 2;
  return summary.failing > 0 || staleFails(baselineStale) || (overWarningCap && threshold !== Infinity) ? 1 : 0;
}

if (watchMode) {
  await watchLoop({ resolveRun, runOnce, dropWarm, started: () => { watching = true; } });
} else {
  /* exitCode, never exit( ): the report may still be queued for a pipe (see
   * exitFlushed), and a run leaves nothing behind that would keep the event
   * loop alive - checkFiles closes the renderer it opened, the renderer
   * closes its browser and its server - so the process ends the moment the
   * last byte is out. */
  process.exitCode = await runOnce(resolveRun());
}
