/*
 * test/sections/cli-output - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, f, FIX, assert, section, tempDir, results, by, good, broken, has, rules, dumps, nested, view, bad, xml } = H;


// ----------------------------------------------------------------- stdin ----
// --stdin: the property gate over piped source - the editor/pre-commit case.
// The render gate stays off (a piped buffer has no file corpus), exit codes
// and formats behave exactly as for a file
section('stdin', async () => {
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const run = (args, input) => {
      try {
        return { out: cp.execFileSync('node', [CLI, ...args], { input, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } }), code: 0, err: '' };
      } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
    };
    const abap = fs.readFileSync(f('broken.clas.abap'), 'utf8');

    const plain = run(['--stdin', '--no-config'], abap);
    assert(plain.code === 1 && /unknown-control/.test(plain.out) && /^<stdin>$/m.test(plain.out),
      `stdin: piped ABAP is judged by the property gate and reported under <stdin> (exit ${plain.code})`);

    const named = run(['--stdin', '--stdin-filename', 'zcl_my.clas.abap', '--no-config', '--json'], abap);
    const doc = JSON.parse(named.out);
    assert(doc.results[0].file === 'zcl_my.clas.abap' && doc.problems > 0,
      'stdin: --stdin-filename names the source in the report');

    // the filename decides the handling: a .view.xml name goes down the XML path
    const xml = fs.readFileSync(f('badvalue.view.xml'), 'utf8');
    const asXml = run(['--stdin', '--stdin-filename', 'bad.view.xml', '--no-config'], xml);
    assert(asXml.code === 1 && /invalid-property-value/.test(asXml.out),
      'stdin: a .view.xml filename is checked as a raw view');

    const clean = run(['--stdin', '--stdin-filename', 'ok.view.xml', '--no-config'], fs.readFileSync(f('sample.view.xml'), 'utf8'));
    assert(clean.code === 0 && /Success!/.test(clean.out), 'stdin: a clean pipe exits 0');

    // incompatible modes are refused rather than silently ignored
    // --render-pages counts as ASKING for the render gate (like the config's
    // object form), which is also what keeps a missing runtime a hard refusal
    // instead of a silent property-only fallback on a tuned gate
    for (const [extra, why] of [[['--fix'], 'no file to rewrite'], [['--render'], 'property gate only'], [['--render-pages', '2'], 'tuning the pool asks for the gate'], [['--screenshot', 'x.png'], 'screenshot needs files']]) {
      const r = run(['--stdin', '--no-config', ...extra], abap);
      assert(r.code === 2, `stdin: --stdin with ${extra[0]} is refused (${why}; exit ${r.code})`);
    }
});

// ------------------------------------------------------------ ci formats ----
// checkstyle and junit: the two XML shapes most CI systems ingest natively.
// Thin renderers over the same problemsOf() walk - asserted on shape,
// escaping and the severity mapping
section('ci formats', async () => {
    const cp = await import('node:child_process');
    const { FORMATS, formatCheckstyle, formatJunit } = await import('../../lib/report.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const run = (args) => {
      try {
        return cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } });
      } catch (e) { return e.stdout ?? ''; }
    };
    assert(FORMATS.includes('checkstyle') && FORMATS.includes('junit'),
      'ci formats: both are offered by --format');

    const cs = run([f('dumps.clas.abap'), '--no-render', '--format', 'checkstyle']);
    assert(/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(cs) && /<checkstyle version="4\.3">/.test(cs),
      'checkstyle: the document opens with the declaration and the checkstyle root');
    assert(/<file name="[^"]*dumps\.clas\.abap">/.test(cs),
      'checkstyle: one <file> element per result');
    assert(/<error line="\d+" column="\d+" severity="error" message="[^"]+" source="duplicate-property"\/>/.test(cs),
      'checkstyle: a problem is an <error> with line, column, severity, message and rule id');
    assert(!/severity="hint"/.test(formatCheckstyle([{ file: 'x', findings: [{ type: 'missing-accessibility', severity: 'hint', message: 'm', line: 1, column: 1 }], renderErrors: [], notes: [] }]))
      && /severity="info"/.test(formatCheckstyle([{ file: 'x', findings: [{ type: 'missing-accessibility', severity: 'hint', message: 'm', line: 1, column: 1 }], renderErrors: [], notes: [] }])),
      'checkstyle: our hint maps to checkstyle\'s info');
    // escaping: a message carrying every XML-hostile character survives as text
    const hostile = formatCheckstyle([{ file: 'a<b>&"\'.abap', findings: [{ type: 'unknown-control', severity: 'error', message: 'x < y & "z" \'w\'', line: 1, column: 2 }], renderErrors: [], notes: [] }]);
    assert(/name="a&lt;b&gt;&amp;&quot;&apos;\.abap"/.test(hostile) && /message="x &lt; y &amp; &quot;z&quot; &apos;w&apos;"/.test(hostile),
      'checkstyle: names and messages are XML-escaped');

    const ju = run([f('dumps.clas.abap'), '--no-render', '--format', 'junit']);
    assert(/<testsuites name="abap2ui5-linter" tests="2" failures="2">/.test(ju),
      `junit: the root carries the totals (got ${ju.split('\n')[1]})`);
    assert(/<testsuite name="[^"]*dumps\.clas\.abap" tests="2" failures="2" errors="0">/.test(ju),
      'junit: one <testsuite> per file with its own counts');
    assert(/<testcase name="duplicate-property at \d+:\d+" classname="[^"]*dumps\.clas\.abap">/.test(ju)
      && /<failure message="[^"]+" type="error">/.test(ju),
      'junit: a problem is a failing <testcase> naming the rule and position');
    // a clean file is a PASSING testcase, so the test tab shows it was seen
    const clean = formatJunit([{ file: 'ok.clas.abap', findings: [], renderErrors: [], notes: [] }]);
    assert(/<testsuite name="ok\.clas\.abap" tests="1" failures="0" errors="0">/.test(clean)
      && /<testcase name="clean" classname="ok\.clas\.abap"\/>/.test(clean),
      'junit: a clean file is one passing testcase, not an empty document');
});

// ---------------------------------------------------------------- report ----
section('report', async () => {
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    // GITHUB_ACTIONS is pinned OFF: inherited from the runner it turns the
    // annotations on for every case below, and the assertions would then be
    // testing a different program in CI than they test locally
    const run = (args, env = {}) => {
      try {
        return cp.execFileSync('node', [CLI, ...args], {
          encoding: 'utf8',
          env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env },
        });
      } catch (e) { return e.stdout ?? ''; }
    };
    const dumps = f('dumps.clas.abap');

    const stylish = run([dumps, '--no-render']);
    assert(/duplicate-property\s+https:\/\/abap2ui5\.github\.io\/linter\/#duplicate-property\s*$/m.test(stylish),
      'report: every line ends in its rule id and the link to its card');
    const asJson = JSON.parse(run([dumps, '--no-render', '--format', 'json']));
    assert(asJson.results.every((r) => r.findings.every((x) => x.url === `https://abap2ui5.github.io/linter/#${x.type}`)),
      'report: every finding carries its url in --format json');
    assert(/^2 problems \(2 errors, 0 warnings, 0 hints\)$/m.test(stylish), 'report: the problem count reads like ui5lint');
    assert(!/\bpass\b/.test(run([f('viewbuilder.clas.abap'), '--no-render'])) &&
      /Success! No findings detected\./.test(run([f('viewbuilder.clas.abap'), '--no-render'])),
      'report: a clean file is not printed, only the success line');

    const quiet = run([f('viewrules.clas.abap'), '--no-render', '--quiet']);
    assert(!/\bhint\b.*missing-accessibility/.test(quiet) && /2 hints\)/.test(quiet),
      'report: --quiet hides the non-errors but still counts them');

    const json = JSON.parse(run([dumps, '--no-render', '--json']));
    assert(json.problems === 2 && json.totals.error === 2 && json.results[0].findings[0].type,
      'report: --json carries totals, problems and the annotated findings');
    assert(JSON.parse(run([dumps, '--no-render', '--format', 'json'])).problems === 2,
      'report: --format json is the same thing');

    /* ruleHits: rule id -> what the gate PRODUCED, before the rules block,
     * directives or a baseline suppressed anything. The additive stats key
     * that tells a fully suppressed corpus apart from one nothing fired on. */
    assert(json.stats.ruleHits && json.stats.ruleHits['duplicate-property'] === json.stats.rules['duplicate-property'],
      'report: stats.ruleHits mirrors the reported counts when nothing is suppressed');
    {
      const dir = tempDir('a2ui5-hits-');
      fs.writeFileSync(path.join(dir, 'off.jsonc'), '{"rules": {"duplicate-property": false}}');
      const offJson = JSON.parse(run([dumps, '--no-render', '--json', '--config', path.join(dir, 'off.jsonc')]));
      assert(offJson.stats.rules['duplicate-property'] === undefined,
        'report: the switched-off rule reports nothing');
      assert(offJson.stats.ruleHits['duplicate-property'] >= 1,
        'report: ...but ruleHits still says it fired - the instrumentation survives suppression');
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const md = run([dumps, '--no-render', '--format', 'markdown']);
    assert(/\| Location \| Severity \| Message \| Rule \|/.test(md) && /`duplicate-property`/.test(md),
      'report: --format markdown emits a table per file');

    const annotated = run([dumps, '--no-render'], { GITHUB_ACTIONS: 'true' });
    assert(/^::error file=.*dumps\.clas\.abap,line=32,col=18,title=abap2ui5-linter\(duplicate-property\)::/m.test(annotated),
      'report: inside GitHub Actions the findings are annotated onto the diff');
    assert(!/^::/m.test(run([dumps, '--no-render', '--no-annotate'], { GITHUB_ACTIONS: 'true' })),
      'report: --no-annotate switches that off again');
    assert(!/^::/m.test(run([dumps, '--no-render'])), 'report: no annotations outside a workflow');
    // a workflow command appended after the document would make it a parse
    // error - `--json | jq` inside Actions is the case that found this
    const inWorkflow = run([dumps, '--no-render', '--json'], { GITHUB_ACTIONS: 'true' });
    assert(JSON.parse(inWorkflow).problems === 2 && !/^::/m.test(inWorkflow),
      'report: --json stays parseable inside GitHub Actions, annotations do not join it');
    assert(!/^::/m.test(run([dumps, '--no-render', '--format', 'markdown'], { GITHUB_ACTIONS: 'true' })),
      'report: markdown stays clean too');

    /* A message that carries a backslash right before a pipe. Escaping only
     * the pipe leaves `\\|` - an escaped backslash followed by a LIVE column
     * separator - so the row the escaping exists to keep intact is the one it
     * breaks, in markdown that goes into a pull request comment. */
    const { formatMarkdown } = await import('../../lib/report.mjs');
    const row = formatMarkdown(
      [{
        file: 'x.clas.abap',
        findings: [{ line: 1, column: 1, severity: 'error', message: String.raw`path \|foo| is odd`, rule: 'r' }],
        renderErrors: [],
      }],
      { totals: { error: 1, warning: 0, hint: 0 } },
    ).split('\n').find((l) => l.includes('is odd'));
    /* Parsed the way a renderer parses it: a backslash escapes the character
     * after it, so only an UNESCAPED pipe ends a cell. */
    const cellsOf = (line) => {
      const out = [];
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') { cur += line[++i] ?? ''; continue; }
        if (line[i] === '|') { out.push(cur); cur = ''; continue; }
        cur += line[i];
      }
      out.push(cur);
      return out.slice(1, -1).map((c) => c.trim());
    };
    assert(row && cellsOf(row).length === 4 && cellsOf(row)[2] === String.raw`path \|foo| is odd`,
      'report: a backslash in a message cannot open a column of its own');

    /* The machine report written BESIDE the human one. Without it a workflow
     * that wants the annotated log AND a SARIF file for code scanning has to run
     * the whole gate twice, paying the render half again - which is why the
     * composite action reads its outputs from --json-out. */
    {
      const os = await import('node:os');
      const dir = tempDir('a2ui5-out-');
      const sarifAt = path.join(dir, 'nested', 'report.sarif');
      const jsonAt = path.join(dir, 'report.json');
      const human = run([dumps, '--no-render', '--sarif-out', sarifAt, '--json-out', jsonAt]);
      assert(/^2 problems /m.test(human),
        'report: --sarif-out leaves stdout the human report it always was');
      const sarif = JSON.parse(fs.readFileSync(sarifAt, 'utf8'));
      assert(sarif.version === '2.1.0' && sarif.runs[0].results.length === 2,
        `report: --sarif-out writes the SARIF document, creating the directory (${sarif.runs?.[0]?.results?.length})`);
      const asJson = JSON.parse(fs.readFileSync(jsonAt, 'utf8'));
      assert(asJson.problems === 2 && asJson.totals.error === 2 && asJson.files === 1,
        'report: --json-out writes the same document --json prints, counts and all');
      assert(JSON.parse(run([dumps, '--no-render', '--json'])).problems === asJson.problems,
        'report: and it is the same document, not a second opinion');
      fs.rmSync(dir, { recursive: true, force: true });
    }

    assert(/^abap2ui5lint \d+\.\d+\.\d+ \(.*cli\.mjs\)$/m.test(run(['--version'])),
      'report: --version prints version and script location');

    /* --help prints the man page, and the man page documents every flag.
     *
     * It used to print the 800-character single-line USAGE while the structured
     * 100-line header sat unread at the top of cli.mjs - and because nothing
     * compared the two, the header had gone stale: no --baseline, no --init, no
     * --help, and --format still offering three of the four formats. The two
     * lists are gated against each other now, in both directions. */
    const help = run(['--help']);
    assert(help.split('\n').length > 40 && /^Options:$/m.test(help) && /^Gates:$/m.test(help),
      `report: --help prints the structured man page, not the one-line usage (${help.split('\n').length} lines)`);
    let usage = '';
    try { cp.execFileSync('node', [CLI, '--nope'], { encoding: 'utf8' }); }
    catch (e) { usage = e.stderr ?? ''; }
    assert(/^abap2ui5lint: unknown option '--nope'/.test(usage) && /\[paths\.\.\.\]/.test(usage),
      'report: a bad flag still gets the usage reminder');

    /* …wrapped, and pointing at the help that says what the flags DO.
     *
     * The reminder is one 679-character string. Printed as one line it reached
     * the reader as nine ragged terminal-wrapped lines with bracketed groups
     * split down the middle - and that reader has just mistyped a flag, so it
     * is the worst moment for a wall. `--help` was moved off this same string
     * for the same reason; the error path had kept it.
     *
     * Wrapped rather than shortened on purpose: the full list is what the two
     * assertions below compare against `--help`, in both directions, and that
     * gate has already caught a stale header once. A short usage line would
     * leave them nothing to compare. */
    const usageLines = usage.split('\n').filter((l) => /^(usage:|\s+\[)/.test(l));
    assert(usageLines.length > 1 && usageLines.every((l) => l.length <= 78),
      `report: the usage reminder is wrapped, not one long line (longest ${Math.max(0, ...usageLines.map((l) => l.length))})`);
    assert(usageLines.every((l) => (l.match(/\[/g) || []).length === (l.match(/\]/g) || []).length),
      'report: and no bracketed group is split across a line boundary');
    assert(/try `abap2ui5lint --help`/.test(usage),
      'report: the reminder points at --help, which is where the flags are explained');
    const flagsIn = (text) => new Set([...text.matchAll(/--[a-z][a-z0-9-]+/g)].map((m) => m[0]));
    const inUsage = [...flagsIn(usage)].filter((x) => x !== '--nope');
    const undocumented = inUsage.filter((flag) => !help.includes(flag));
    assert(!undocumented.length,
      `report: every flag the usage line offers is documented in --help (missing: ${undocumented.join(', ') || 'none'})`);
    // …and the other way: a flag the header describes and the usage line forgot
    const NOT_IN_USAGE = new Set(['--min-ui5', '--openui5', '--json', '--no-config', '--fix-dry-run']);
    const missingFromUsage = [...flagsIn(help)]
      .filter((flag) => !usage.includes(flag) && !NOT_IN_USAGE.has(flag));
    assert(!missingFromUsage.length,
      `report: every documented flag is offered by the usage line too (missing: ${missingFromUsage.join(', ') || 'none'})`);

    // --init: the config a new project starts from. It has to parse with the
    // linter's OWN loader (it is jsonc with comments), point $schema at the
    // installed copy rather than at main, and refuse to overwrite.
    {
      const { loadConfig } = await import('../../lib/config.mjs');
      const os = await import('node:os');
      const dir = tempDir('a2ui5-init-');
      cp.execFileSync('node', [CLI, '--init'], { cwd: dir, encoding: 'utf8' });
      const written = path.join(dir, 'abap2ui5lint.jsonc');
      assert(fs.existsSync(written), 'init: writes abap2ui5lint.jsonc into the working directory');
      const cfg = loadConfig(written);
      assert(cfg.minUi5 === '1.71' && cfg.failOn === 'warning' && Array.isArray(cfg.paths),
        'init: the file the linter writes is one the linter reads back');
      const raw = fs.readFileSync(written, 'utf8');
      // a directory with no node_modules holding this linter: the published
      // schema of exactly this version (test/review/published-0.8.3-defects.mjs has
      // the installed layouts)
      assert(/"\$schema": "https:\/\/unpkg\.com\/@abap2ui5\/linter@\d+\.\d+\.\d+\/data\/abap2ui5lint\.schema\.json"/.test(raw),
        'init: $schema points at the running version, not at main');
      let refused = '';
      try { cp.execFileSync('node', [CLI, '--init'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }); }
      catch (e) { refused = e.status === 2 ? String(e.stderr) : ''; }
      assert(/already exists/.test(refused), 'init: a second run refuses instead of overwriting');
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const fails = (args) => {
      try { cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' }); return ''; }
      catch (e) { return e.status === 2 ? (e.stderr ?? '') : ''; }
    };
    assert(/unknown option '--nope'/.test(fails(['--nope'])), 'report: an unknown flag is refused, not read as a path');
    assert(/--allow needs a value/.test(fails([dumps, '--no-render', '--allow'])),
      'report: a flag missing its value is refused instead of crashing the gate');
    assert(/no such file or directory: .*no-such-path/.test(fails(['no-such-path', '--no-render'])),
      'report: a mistyped path is one clean line and exit 2, not a stack trace');
});

// ---------------------------------------- run summary, progress and badge ----
// What a CLEAN corpus run says about itself. Without these three, a run over
// a few hundred classes prints "148 files, no findings" and a reader cannot
// tell a gate that judged thousands of controls from one that judged nothing
section('run summary, progress and badge', async () => {
    const cp = await import('node:child_process');
    const os = await import('node:os');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const run = (args, env = {}) => {
      try {
        return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env } }), code: 0 };
      } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
    };
    const one = [f('good.clas.abap'), '--no-render'];
    // two fixtures that are clean on both gates - a corpus summary must be
    // readable exactly where there is no finding list to read instead
    const two = [f('good.clas.abap'), f('viewbuilder.clas.abap'), '--no-render'];

    const corpus = run(two).out;
    assert(/^sources +2 app classes$/m.test(corpus) && /^views +\d+ documents reconstructed, nested \d+ deep/m.test(corpus),
      'stats: the run summary names what was read and what was rebuilt from it');
    assert(/^judged +\d+ controls of \d+ types, \d+ bindings, \d+ icons, \d+ attributes$/m.test(corpus),
      'stats: and what the gate actually judged - the half no finding list can show');
    assert(/^most used +sap\.m\./m.test(corpus) && /^gates +properties 2 files, render off$/m.test(corpus),
      'stats: the control histogram and which gates ran');
    assert(/^time +properties \d+\.\d+s, total \d+\.\d+s$/m.test(corpus),
      'stats: with the phase timings the progress reporter collected');

    assert(!/^sources/m.test(run(one).out), 'stats: one file gets no run summary - it is the report');
    assert(/^sources +1 app class$/m.test(run([...one, '--stats']).out), 'stats: --stats asks for it anyway');
    assert(!/^sources/m.test(run([...two, '--no-stats']).out), 'stats: --no-stats switches it off');
    assert(!/^sources/m.test(run([...two, '--quiet']).out), 'stats: --quiet means quiet here too');

    const md = run([...two, '--format', 'markdown']).out;
    assert(/^### Run summary$/m.test(md) && /^- \*\*judged\*\* — \d+ controls/m.test(md),
      'stats: the markdown report carries the same summary (that is the $GITHUB_STEP_SUMMARY shape)');

    const json = JSON.parse(run([...two, '--json']).out);
    assert(json.stats.controls > 0 && json.stats.types['sap.m.Button'] > 0 && json.stats.documents >= 2,
      'stats: --json carries the aggregate, control histogram included');
    assert(json.results.every((r) => r.stats.documents >= 0) && json.results[0].stats.types === undefined,
      'stats: per result the counts, without repeating the histogram for every file');

    // --- progress -------------------------------------------------------------
    const { createProgress } = await import('../../lib/report.mjs');
    const spy = () => { const lines = []; return { lines, write: (s) => lines.push(s) }; };
    const inActions = spy();
    const p = createProgress({ enabled: true, stream: inActions, github: true });
    p.update({ phase: 'properties', done: 0, total: 2 });
    p.update({ phase: 'properties', done: 1, total: 2, file: 'a.clas.abap' });
    p.update({ phase: 'render', done: 0, total: 2, pages: 4 });
    p.update({ phase: 'render', done: 1, total: 2, file: 'b.clas.abap', skipped: true });
    p.finish();
    const log = inActions.lines.join('');
    assert(/::group::abap2ui5-linter: properties gate, 2 files\n/.test(log)
      && /\[1\/2\] a\.clas\.abap\n/.test(log) && /::group::abap2ui5-linter: render gate, 2 files on 4 browser pages/.test(log),
      'progress: inside Actions every file is logged, wrapped in a collapsed group per gate');
    assert((log.match(/::group::/g) || []).length === (log.match(/::endgroup::/g) || []).length
      && /::endgroup::\nabap2ui5-linter: properties gate — 2 files in \d/.test(log),
      'progress: the groups are balanced and the timing line stays outside, visible while collapsed');
    assert(/render skipped \(built in helper methods\)/.test(log),
      'progress: a file the render gate steps over says so where it happens');
    assert(typeof p.times.properties === 'number' && typeof p.times.render === 'number',
      'progress: both phases are timed');

    const single = spy();
    const p2 = createProgress({ enabled: true, stream: single, github: true });
    p2.update({ phase: 'properties', done: 0, total: 1 });
    p2.update({ phase: 'properties', done: 1, total: 1, file: 'a.clas.abap' });
    p2.finish();
    assert(!single.lines.length && typeof p2.times.properties === 'number',
      'progress: a one-file run reports nothing and is still timed');

    const off = spy();
    const p3 = createProgress({ enabled: false, stream: off, github: true });
    p3.update({ phase: 'properties', done: 0, total: 9 });
    p3.finish();
    assert(!off.lines.length && typeof p3.times.properties === 'number',
      'progress: --no-progress prints nothing and keeps the timings');

    // --- badges ---------------------------------------------------------------
    const dir = tempDir('a2ui5badge-');
    const badgeFile = path.join(dir, 'badges', 'check-abap2ui5.json');
    const corpusFile = path.join(dir, 'badges', 'abap2ui5.json');
    const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
    const clean = run([...two, '--badge', badgeFile, '--badge-corpus', corpusFile]);
    const badge = read(badgeFile);
    const facts = read(corpusFile);
    assert(clean.code === 0 && badge.schemaVersion === 1 && badge.color === '4c1'
      && badge.label === 'check-abap2UI5' && /^\d+ rules passed$/.test(badge.message),
      `badge: the verdict badge counts the rules that ran, the way a test badge counts tests (${badge.label} | ${badge.message})`);
    assert(facts.color === '007ec6' && facts.label === 'abap2UI5'
      && /^2 apps · 2 views · \d+ controls$/.test(facts.message),
      `badge: the corpus badge is a fact, blue, with no verdict in it (${facts.label} | ${facts.message})`);
    const shieldsKeys = ['schemaVersion', 'label', 'message', 'color', 'labelColor', 'cacheSeconds'];
    assert([badge, facts].every((b) => b.labelColor === '555' && b.namedLogo === undefined
      && Object.keys(b).every((k) => shieldsKeys.includes(k))),
      'badge: only keys the shields endpoint schema defines - an extra one renders as "invalid"');

    const dirty = run([f('structure.clas.abap'), f('good.clas.abap'), '--no-render', '--badge', badgeFile, '--badge-corpus', corpusFile]);
    const red = read(badgeFile);
    assert(dirty.code === 1 && red.color === 'e05d44' && /^\d+ errors$/.test(red.message)
      && /^2 apps/.test(read(corpusFile).message),
      `badge: the failing run - the one whose badge matters - is written too, and the corpus badge stays a count (${red.message})`);

    const xmlOnly = run([f('sample.view.xml'), '--no-render', '--badge-corpus', corpusFile]);
    const xml = read(corpusFile);
    assert(xmlOnly.code === 0 && /^1 view · \d+ controls$/.test(xml.message),
      `badge: a corpus of raw views has no app classes to count, and says nothing instead of "0 apps" (${xml.message})`);

    const nothing = path.join(dir, 'nothing');
    fs.mkdirSync(nothing);
    run([nothing, '--no-render', '--badge', badgeFile, '--badge-corpus', corpusFile]);
    assert([read(badgeFile), read(corpusFile)].every((b) => b.message === 'nothing checkable' && b.color === '9f9f9f'),
      'badge: a run that finds NOTHING to check says so on BOTH badges instead of leaving the last good ones standing');

    // the config form: the badges belong to the repo, not to the command line
    const { loadConfig } = await import('../../lib/config.mjs');
    const cfgFile = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfgFile, '{ "badge": "badges/from-config.json" }');
    const fromConfig = loadConfig(cfgFile).badge;
    assert(fromConfig.length === 1 && fromConfig[0].file === 'badges/from-config.json' && fromConfig[0].kind === 'checks',
      'badge: a plain path in the config is the file, and one badge alone is the verdict - what it has always meant');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile]);
    assert(fs.existsSync(path.join(dir, 'badges', 'from-config.json')),
      'badge: written relative to the config file, not to whatever cwd the run had');
    fs.rmSync(path.join(dir, 'badges', 'from-config.json'));
    run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile, '--no-badge']);
    assert(!fs.existsSync(path.join(dir, 'badges', 'from-config.json')),
      'badge: --no-badge keeps a second pass (a job summary, a piped --json) from overwriting the real run\'s badges');

    // both badges from the config, each with its own file and label
    fs.writeFileSync(cfgFile, JSON.stringify({ badge: [
      { kind: 'corpus', file: 'badges/corpus.json', label: 'samples' },
      { kind: 'checks', file: 'badges/checks.json' },
    ] }));
    run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile]);
    assert(read(path.join(dir, 'badges', 'corpus.json')).label === 'samples'
      && read(path.join(dir, 'badges', 'checks.json')).label === 'check-abap2UI5',
      'badge: a list writes one file per kind, and a label given there beats the default name');

    const rejects = (json, pattern, what) => {
      fs.writeFileSync(cfgFile, json);
      let threw = '';
      try { loadConfig(cfgFile); } catch (e) { threw = e.message; }
      assert(pattern.test(threw), `badge: ${what} (${threw || 'accepted'})`);
    };
    rejects('{ "badge": { "file": "b.json", "colour": "green" } }', /unknown key 'colour'/,
      'a typo in the badge block fails loudly, like every other config key');
    rejects('{ "badge": { "file": "b.json", "kind": "corpse" } }', /'kind' must be corpus or checks/,
      'an unknown kind names the two that exist instead of silently writing neither');
    rejects('{ "badge": [{ "file": "a.json" }, { "file": "b.json" }] }', /lists kind 'checks' twice/,
      'the same badge written to two files is a copy-paste, and says so');

    // a config is repository content: what it names to WRITE stays in its tree
    rejects('{ "badge": "../../outside.json" }', /'badge' names \.\.\/\.\.\/outside\.json, which is outside this config's directory/,
      'a badge path out of the config\'s directory is refused - a cloned repository chose it, not the user');
    rejects(JSON.stringify({ badge: { file: path.join(os.tmpdir(), 'abs.json') } }), /outside this config's directory.*--badge/,
      'an absolute badge path is refused, and the message names the command-line flag that still writes anywhere');
    rejects('{ "baseline": "../baseline.json" }', /'baseline' names \.\.\/baseline\.json, which is outside/,
      'a baseline path out of the config\'s directory is refused too (--update-baseline writes it)');
    // ... and a link the repository ships is not followed out of it at write time
    const away = tempDir('a2ui5badge-away-');
    fs.symlinkSync(away, path.join(dir, 'linked'), 'dir');
    fs.writeFileSync(cfgFile, '{ "badge": "linked/badge.json" }');
    const linked = run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile]);
    assert(linked.code === 2 && !fs.existsSync(path.join(away, 'badge.json')),
      `badge: a config-named badge that resolves through a symbolic link out of the config's tree is not written (exit ${linked.code})`);
    const flagged = run([path.join(dir, 'good.clas.abap'), '--no-render', '--badge', path.join(dir, 'linked', 'badge.json')]);
    assert(flagged.code === 0 && fs.existsSync(path.join(away, 'badge.json')),
      'badge: one named on the command line is the user\'s own choice and is written where it points');
    fs.writeFileSync(cfgFile, '{ "baseline": "linked/baseline.json" }');
    const based = run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile, '--update-baseline']);
    assert(based.code === 2 && !fs.existsSync(path.join(away, 'baseline.json')),
      `baseline: --update-baseline does not write a config-named baseline through a link out of the tree (exit ${based.code})`);
    fs.rmSync(away, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------- peer render runtime ----
/* The render runtime is an OPTIONAL PEER of this package, and the two are
 * released from one tag by `npm version --workspaces`. That bump moves both
 * versions and touches no dependency range, so the peer range is the one thing
 * in the release that nothing moves and nothing reads back - and it rotted at
 * `^0.1.0` across three releases while the workspace went to 0.2.1.
 *
 * The consequence is not a missing warning, it is the opposite of the
 * documented guarantee: npm rejects an optional peer that is present and out of
 * range, so `npm i @abap2ui5/linter@0.2.1 @abap2ui5/render-runtime@0.2.1` - the
 * pairing the runtime's README tells everyone to install - failed with
 * ERESOLVE, while the stale 0.1 line was the only one npm accepted.
 *
 * So the range is gated against the workspace it ships with: a release that
 * bumps the workspace and forgets the range fails here instead of on a user's
 * install.
 *
 * It is also GENERATED now (`npm run sync-peer-range`). The old union grew a
 * `|| ^0.N.0` clause per minor and had to be extended by hand at every
 * release, which is the step the three misses were; the bounded form
 * `>=FLOOR <breakingAfter(runtime)` has one moving part and a script that
 * moves it. Only the lower bound stays a judgement - dropping a supported line
 * is an ERESOLVE for everybody still on it, so FLOOR needs a reason (a runtime
 * the linter cannot work without), not a tidy-up. */
section('peer range', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const rt = JSON.parse(fs.readFileSync(path.join(ROOT, 'linter-render', 'package.json'), 'utf8'));
    const range = pkg.peerDependencies[rt.name];
    const { satisfies, expectedRange, breakingAfter } = await import('../../scripts/peer-range.mjs');

    assert(satisfies(range, rt.version) === true,
      `peer range: '${range}' admits the render runtime this repo releases with it (${rt.version})`
      + ' - npm refuses an out-of-range optional peer outright (ERESOLVE), so a stale range forbids'
      + ' exactly the pairing the READMEs tell everyone to install');
    assert(range === expectedRange(rt.version),
      `peer range: the committed range is the generated one (npm run sync-peer-range) - '${range}' vs '${expectedRange(rt.version)}'`);
    assert(satisfies(range, breakingAfter(rt.version)) === false,
      `peer range: and it STOPS at the next breaking runtime line (${breakingAfter(rt.version)})`);
    assert(pkg.peerDependenciesMeta[rt.name].optional === true,
      'peer range: the render runtime stays OPTIONAL - the property gate is the small install');
    // renamed after 0.7.0: the old name stays an optional peer with the range of
    // the lines it has, so an existing install upgrades the linter without ERESOLVE
    const { LEGACY } = await import('../../scripts/peer-range.mjs');
    assert(LEGACY.name !== rt.name && pkg.peerDependencies[LEGACY.name] === LEGACY.range
      && pkg.peerDependenciesMeta[LEGACY.name]?.optional === true,
    `peer range: the pre-rename name ${LEGACY.name} stays an optional peer at its frozen range '${LEGACY.range}'`);
    assert(satisfies(LEGACY.range, '0.7.0') === true,
      'peer range: the frozen range admits the last line published under the old name');

    // the reader itself, since two gates and one CI script now trust it
    assert(satisfies('^0.2.1', '0.2.9') === true && satisfies('^0.2.1', '0.3.0') === false
      && satisfies('^0.2.1', '0.2.0') === false,
    'peer range: the caret reader treats the minor as the 0.x compatibility boundary');
    assert(satisfies('^1.2.0', '1.9.0') === true && satisfies('^1.2.0', '2.0.0') === false,
      'peer range: …and the major from 1.0.0 on');
    assert(satisfies('>=0.1.0 <0.6.0', '0.5.1') === true
      && satisfies('>=0.1.0 <0.6.0', '0.6.0') === false,
    'peer range: a two-term range is an AND');
    assert(satisfies('^0.2.0 || ^0.5.0', '0.5.1') === true,
      'peer range: alternatives are an OR, so an older union still reads correctly');
    assert(satisfies('workspace:*', '0.5.1') === null && satisfies('~0.5.0', '0.5.1') === null,
      'peer range: a shape the reader does not know answers null, never a confident false');
});
}
