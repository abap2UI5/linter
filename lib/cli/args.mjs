/*
 * lib/cli/args - the CLI's option loop (cli.mjs), moved out of it unchanged:
 * every flag, its value check, the early exits (--init, --version, --help)
 * and the combinations refused before any run. What the loop needs from the
 * CLI is handed in (`die`, `exitFlushed`, `helpText`); what it decided comes
 * back as one object.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CONFIG_NAMES } from '../config.mjs';
import { SEVERITIES } from '../findings.mjs';
import { FORMATS } from '../report.mjs';
import { HERE, ownVersion, usageBlock, schemaRef } from './support.mjs';

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

export async function parseArgs(args, { die, exitFlushed, helpText }) {
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
  let reportFalsePositives = false; // --report-false-positives: print the issue for each marked baseline entry
  // --stdin: lint piped source instead of files (property gate only)
  let stdinMode = false;
  let stdinName = '<stdin>';
  let stdinNamed = false; // --stdin-filename was given (it is refused without --stdin)
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
    /* A flag that takes a value must actually have one - `--allow` as the last
     * argument would otherwise push undefined and crash deep in the gate. And
     * the value must not be the NEXT FLAG: `--allow --no-render` read
     * `--no-render` as the allowed control name and ran the render gate, and
     * `--sarif-out --json` wrote a file literally named `--json` and printed
     * the stylish report. A value of this tool's never starts like an option
     * (a control name, a version, a path, a format, a count), so a token that
     * does is the flag the user meant to type next, with the value forgotten. */
    const value = () => {
      if (i + 1 >= args.length) die(`${a} needs a value\n${usageBlock()}`);
      const next = args[i + 1];
      if (/^--?[a-zA-Z]/.test(next)) die(`${a} needs a value, but got the option '${next}' - the value is missing\n${usageBlock()}`);
      return args[++i];
    };
    if (a === '--min-ui5' || a === '--ui5') {
      const version = value();
      if (!UI5_VERSION_RE.test(version)) die(`${a} takes a version like 1.71 (got '${version}')`);
      opt.minUi5 = version;
      seen.add('minUi5');
    }
    else if (a === '--deprecated-at') {
      const version = value();
      if (!UI5_VERSION_RE.test(version)) die(`${a} takes a version like 1.136 (got '${version}')`);
      opt.deprecatedAt = version;
      seen.add('deprecatedAt');
    }
    else if (a === '--abap2ui5') {
      const version = value();
      if (!/^\d+\.\d+\.\d+$/.test(version)) die(`${a} takes an abap2UI5 release like 1.140.0 (got '${version}')`);
      opt.abap2ui5 = version;
      seen.add('abap2ui5');
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
    else if (a === '--stdin-filename') { stdinName = value(); stdinNamed = true; }
    else if (a === '--watch') watchMode = true;
    else if (a === '--update-baseline') updateBaseline = true;
    else if (a === '--report-false-positives') { reportFalsePositives = true; opt.render = false; seen.add('render'); }
    else if (a === '--annotate') opt.annotate = true;
    else if (a === '--no-annotate') opt.annotate = false;
    else if (a === '--stats') opt.stats = true;
    else if (a === '--timing') { opt.timing = true; opt.stats ??= true; }
    else if (a === '--no-stats') opt.stats = false;
    else if (a === '--progress') opt.progress = true;
    else if (a === '--no-progress') opt.progress = false;
    // the two badges accumulate: a run that wants both names both files, and
    // naming either one on the command line takes the config's block out.
    // The same kind twice is the same badge written to two files, and only
    // the second name survived here - the config refuses it (loadBadge), so
    // the flags do too
    else if (a === '--badge' || a === '--badge-corpus') {
      const kind = a === '--badge' ? 'checks' : 'corpus';
      const file = value();
      if (opt.badge?.some((b) => b.kind === kind)) die(`${a} given twice - one file per badge kind (--badge for the verdict, --badge-corpus for the corpus)`);
      opt.badge = [...(opt.badge ?? []), { kind, file }];
      seen.add('badge');
    }
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

    // the deprecation horizon: what UI5 deprecated after your target and up
    // to this version is reported as a hint (deprecated-after-target), with
    // the replacement and whether your target has it yet. 1.136 is the
    // legacy-free baseline SAP measures best-practice code against.
    // "deprecatedAt": "1.136",

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
      console.log(`abap2ui5lint ${ownVersion()} (${path.join(HERE, 'cli.mjs')})`);
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
          : reportFalsePositives ? '--report-false-positives'
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

  /* The combinations that did SOMETHING ELSE than what was typed, each refused
   * the way --watch refuses its clashes: a flag that silently changes nothing
   * is the typo this tool refuses everywhere else.
   *
   * --no-config beside --config <file> read no config at all - the file named
   * was simply ignored. --stdin-filename without --stdin names a source that
   * is not there to name. --update-baseline ends the run after writing the
   * file, so a --sarif-out / --json-out / badge beside it was never written
   * (the Action always adds --json-out for its outputs, which then stayed
   * empty). --cache-location is judged in resolveRun, after the config: the
   * config's "cache": true is the other way to switch the cache on. */
  if (noConfig && configFlag) die(`--no-config and --config ${configFlag} contradict each other - drop one of them`);
  if (stdinNamed && !stdinMode) die(`--stdin-filename has no effect without --stdin - it names the source piped to --stdin`);
  /* --report-false-positives prints issues, not a report: it is a mode that
   * ends, refused beside the other modes and outputs that are one too. */
  if (reportFalsePositives) {
    const clash = updateBaseline ? '--update-baseline'
      : opt.fix ? '--fix'
        : shot.out ? '--screenshot'
          : opt.sarifOut ? '--sarif-out'
            : opt.jsonOut ? '--json-out'
              : opt.badge?.length ? '--badge'
                : opt.format !== 'stylish' ? `--format ${opt.format}`
                  : null;
    if (clash) die(`--report-false-positives cannot be combined with ${clash} - it prints the issue for each baseline entry marked as a false positive and nothing else`);
  }
  if (updateBaseline) {
    const clash = opt.sarifOut ? '--sarif-out'
      : opt.jsonOut ? '--json-out'
        : opt.badge?.some((b) => b.kind === 'corpus') ? '--badge-corpus'
          : opt.badge?.length ? '--badge'
            : null;
    if (clash) {
      die(`--update-baseline cannot be combined with ${clash} - an update writes the baseline and prints one line about it, `
        + `so ${clash} would be written empty or not at all; run the update on its own, then the report`);
    }
  }

  return {
    opt, seen, renderAsked, paths, configFlag, noConfig, updateBaseline, reportFalsePositives,
    stdinMode, stdinName, stdinNamed, shot, watchMode,
  };
}
