/*
 * The 2026-09-29 second pass: a review of the first round's own fixes and of
 * the modules that round did not reach (the reconstructor, --fix, the
 * formatters, the cache, the config). Every defect was reproduced before it
 * was fixed, and each section below fails on the code as it was. See
 * test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function ({ section, assert, f, FIX, tempDir, checkXmlSource, checkAbapSource, prepareAbap }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, { cwd, input, env = {} } = {}) => {
    const r = cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...ENV, ...env }, cwd, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. a baseline entry of a file the run walked past is stale ──────── */

  /* The first round scoped staleness to the files a run LINTED, so that one
   * file checked out of a baselined `src` no longer called every other entry
   * stale. It scoped it one step too far: a class under the walked directory
   * that is no longer collected - it stopped building a view - was not
   * "linted" either, so its entries were kept forever, and --update-baseline
   * over the whole directory kept them too. A suppression outliving what it
   * suppressed, with no command left that could remove it. */
  section('round 2026-09-29b: an entry of a class the walk no longer collects is stale, and an update drops it', () => {
    const dir = tempDir('a2l-scope-');
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.copyFileSync(f('wires.clas.abap'), path.join(src, 'zcl_a.clas.abap'));
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(src, 'zcl_b.clas.abap'));
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    const base = ['--no-render', '--no-config', '--no-progress', '--baseline', bl];
    const entries = () => Object.keys(JSON.parse(fs.readFileSync(bl, 'utf8')).findings);
    assert(run(['src', ...base, '--update-baseline'], { cwd: dir }).code === 0, 'the directory is baselined');
    const bEntries = entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|'));
    assert(bEntries.length > 0, `with entries for zcl_b (${bEntries.length})`);

    // zcl_b becomes a plain helper: no builder, no app interface - not collected
    fs.writeFileSync(path.join(src, 'zcl_b.clas.abap'),
      'CLASS zcl_b DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\n\n'
      + 'CLASS zcl_b IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n');
    const whole = run(['src', ...base], { cwd: dir });
    const staleLines = whole.out.split('\n').filter((l) => /! stale:/.test(l));
    assert(whole.code === 1 && staleLines.length === bEntries.length && staleLines.every((l) => l.includes('src/zcl_b.clas.abap|')),
      `a run over src calls zcl_b's entries stale - it walked past the class (${whole.code}: ${staleLines.length} of ${bEntries.length})`);

    const one = run([path.join('src', 'zcl_a.clas.abap'), ...base], { cwd: dir });
    assert(one.code === 0 && !/STALE/.test(one.out), `a run over zcl_a alone still does not judge zcl_b (${one.code})`);

    assert(run([path.join('src', 'zcl_a.clas.abap'), ...base, '--update-baseline'], { cwd: dir }).code === 0, 'an update over zcl_a alone');
    assert(entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|')).length === bEntries.length,
      'keeps zcl_b\'s entries - that run did not look at it');
    assert(run(['src', ...base, '--update-baseline'], { cwd: dir }).code === 0, 'an update over src');
    assert(!entries().some((k) => k.startsWith('src/zcl_b.clas.abap|')),
      `drops them (${entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|')).length} left)`);
    assert(entries().some((k) => k.startsWith('src/zcl_a.clas.abap|')), 'and keeps zcl_a\'s');
    assert(run(['src', ...base], { cwd: dir }).code === 0, 'the directory is green against the updated baseline');
  });

  /* ── 2. malformed-xml: a CDATA section is text all the way through ──── */

  /* The tag reader skipped comments but not CDATA sections, so a `<!--`
   * inside one - a string in script text, `s.indexOf("<!--")` - opened a
   * "comment" that swallowed the real tags behind the section up to the next
   * `-->`. A view xmllint accepts came out with three unclosed-tag ERRORS,
   * and the lenient tree lost the elements after the section, so nothing in
   * them was judged either. */
  section('round 2026-09-29b: malformed-xml - a CDATA section never hides the tags after it', () => {
    const head = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:html="http://www.w3.org/1999/xhtml">';
    const script = '<html:script><![CDATA[ if (s.indexOf("<!--") >= 0) { x(); } ]]></html:script>';
    const ok = checkXmlSource(`${head}<Page><content>${script}<Text text="after"/></content></Page><!-- end --></mvc:View>`, { file: 'cdata.view.xml' });
    const malformed = ok.findings.filter((x) => x.type === 'malformed-xml');
    assert(!malformed.length, `a well-formed view is not malformed-xml (${malformed.map((x) => x.message.slice(0, 60)).join(' | ')})`);
    const later = checkXmlSource(`${head}<Page><content>${script}<Txt text="after"/></content></Page><!-- end --></mvc:View>`, { file: 'cdata.view.xml' });
    assert(later.findings.some((x) => x.type === 'unknown-control' && /Txt/.test(x.control ?? '')),
      `the element behind the section is in the tree and judged (${later.findings.map((x) => `${x.type}:${x.control}`).join(', ')})`);
    const inside = checkXmlSource(`${head}<Page><content><Text><![CDATA[ a <Txt> b ]]></Text></content></Page></mvc:View>`, { file: 'cdata.view.xml' });
    assert(!inside.findings.some((x) => /Txt/.test(x.control ?? '')),
      `a tag INSIDE the section is text, not a control (${inside.findings.map((x) => `${x.type}:${x.control}`).join(', ')})`);
    const broken = checkXmlSource(`${head}<Page><content><![CDATA[x]]></contnt></Page></mvc:View>`, { file: 'cdata.view.xml' });
    assert(broken.findings.filter((x) => x.type === 'malformed-xml').length === 1,
      `a misspelt close next to a CDATA section is still reported, once (${broken.findings.filter((x) => x.type === 'malformed-xml').length})`);
  });

  /* ── 3. `ignore` and the render-error `exclude` mean one thing ───────── */

  /* abap2UI5/linter#35 made a `rules[id].exclude` pattern match however the
   * run was started - absolute (a config's `paths`, joined onto its
   * directory) or relative (`abap2ui5lint src`, `--config x`). Two other
   * path patterns of the same config kept the old reading: `ignore`, tested
   * against the path as the walk reached it, and `rules['render-error']
   * .exclude`, tested against `result.file`. abap2UI5's own config
   * (`"ignore": ["/src/99/"]`) therefore dropped the frozen package from
   * `abap2ui5lint` and not from `abap2ui5lint src`, where its 17 classes
   * came back with 86 findings and exit 1. */
  section('round 2026-09-29b: ignore and the render-error exclude match a relative run as they match an absolute one', () => {
    const dir = tempDir('a2l-forms-');
    fs.mkdirSync(path.join(dir, 'src', '99'), { recursive: true });
    fs.copyFileSync(f('broken.clas.abap'), path.join(dir, 'src', 'zcl_broken.clas.abap'));
    fs.copyFileSync(f('wires.clas.abap'), path.join(dir, 'src', '99', 'zcl_frozen.clas.abap'));
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), JSON.stringify({
      paths: ['src'],
      ignore: ['/src/99/'],
      rules: { 'render-error': { exclude: ['/src/zcl_broken\\.'] } },
      failOn: 'error',
    }));
    const report = (args) => {
      const r = run([...args, '--render', '--no-progress', '--json'], { cwd: dir });
      let doc = null;
      try { doc = JSON.parse(r.out); } catch { /* not json */ }
      return {
        code: r.code,
        files: (doc?.results ?? []).map((x) => path.relative(dir, path.resolve(dir, x.file)).split(path.sep).join('/')).sort(),
        renderErrors: (doc?.results ?? []).reduce((n, x) => n + (x.renderErrors?.length ?? 0), 0),
        waived: (doc?.results ?? []).some((x) => (x.notes ?? []).some((n) => /waived by rules\['render-error'\]/.test(n))),
        err: r.err,
      };
    };
    const absolute = report([]);
    assert(absolute.files.join() === 'src/zcl_broken.clas.abap' && absolute.renderErrors === 0 && absolute.waived,
      `the config's own paths: src/99 ignored, the render errors waived (${absolute.files.join()} / ${absolute.renderErrors} / ${absolute.waived} ${absolute.err.slice(0, 200)})`);
    for (const args of [['src'], ['./src'], [path.join(dir, 'src')]]) {
      const r = report(args);
      assert(r.files.join() === absolute.files.join(), `abap2ui5lint ${args[0]}: the same files (${r.files.join()})`);
      assert(r.renderErrors === 0 && r.waived && r.code === absolute.code,
        `abap2ui5lint ${args[0]}: the same waived render errors and exit code (${r.renderErrors} / ${r.waived} / ${r.code} vs ${absolute.code})`);
    }
  });

  /* ── 4. the cache belongs to one render runtime ──────────────────────── */

  /* `--cache` replays a stored result while the linter version, the snapshot
   * and the settings hold - and the render gate's verdicts depend on a
   * fourth thing, the UI5 release @abap2ui5/linter-render serves, which moves
   * on its own (`npm i -D @abap2ui5/linter-render@latest`, exactly what the
   * first round's runtime-mismatch warning tells a reader to run). The
   * upgraded runtime then replayed the old runtime's render errors. The
   * runtime's UI5 version is part of the context now - for a run that
   * renders; a property-only run does not care which runtime is installed. */
  section('round 2026-09-29b: a render-runtime upgrade misses the cache, a property-only run keeps it', async () => {
    const { cacheContext } = await import('../../lib/cache.mjs');
    const at = (runtime, render) => cacheContext({ version: '1', snapshot: '1.152.0', runtime, options: { render } });
    assert(at('1.151.0', true) !== at('1.152.0', true), 'the render runtime\'s UI5 release is part of the context of a rendering run');
    assert(at('1.151.0', false) === at('1.152.0', false), 'and no part of a property-only run\'s');

    // the real CLI, with a runtime in the project whose version can move
    const ROOT = path.join(FIX, '..', '..');
    const T = tempDir('a2l-cachert-');
    const L = path.join(T, 'linter');
    fs.mkdirSync(L);
    for (const x of ['cli.mjs', 'package.json']) fs.copyFileSync(path.join(ROOT, x), path.join(L, x));
    for (const d of ['lib', 'data']) fs.cpSync(path.join(ROOT, d), path.join(L, d), { recursive: true });
    const P = path.join(T, 'project');
    const nm = path.join(P, 'node_modules');
    fs.mkdirSync(path.join(nm, '@abap2ui5', 'linter-render'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'linter-render', 'package.json'), path.join(nm, '@abap2ui5', 'linter-render', 'package.json'));
    fs.mkdirSync(path.join(nm, '@openui5'));
    const real = path.join(ROOT, 'node_modules', '@openui5');
    for (const lib of fs.readdirSync(real)) {
      fs.mkdirSync(path.join(nm, '@openui5', lib));
      fs.copyFileSync(path.join(real, lib, 'package.json'), path.join(nm, '@openui5', lib, 'package.json'));
      fs.symlinkSync(path.join(real, lib, 'src'), path.join(nm, '@openui5', lib, 'src'));
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules', 'playwright'), path.join(nm, 'playwright'));
    fs.symlinkSync(path.join(ROOT, 'node_modules', 'playwright-core'), path.join(nm, 'playwright-core'));
    fs.copyFileSync(f('good.clas.abap'), path.join(P, 'good.clas.abap'));
    const cacheFile = path.join(P, '.abap2ui5lintcache');
    const cli = (args) => cp.spawnSync('node', [path.join(L, 'cli.mjs'), ...args], { encoding: 'utf8', cwd: P, env: ENV, timeout: 180_000 });
    const context = () => JSON.parse(fs.readFileSync(cacheFile, 'utf8')).context;
    const first = cli(['good.clas.abap', '--render', '--cache', '--no-config', '--no-progress']);
    assert(first.status === 0 && fs.existsSync(cacheFile), `a rendering run with --cache writes the cache (${first.status}: ${(first.stderr ?? '').slice(0, 200)})`);
    const before = fs.existsSync(cacheFile) ? context() : null;
    const corePkg = path.join(nm, '@openui5', 'sap.ui.core', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(corePkg, 'utf8'));
    fs.writeFileSync(corePkg, JSON.stringify({ ...pkg, version: '1.151.9' }));
    cli(['good.clas.abap', '--render', '--cache', '--no-config', '--no-progress']);
    assert(before !== null && context() !== before, 'the same run after the runtime moved to another release stores a new context - nothing was replayed');
    const propsBefore = (cli(['good.clas.abap', '--no-render', '--cache', '--no-config', '--no-progress']), context());
    fs.writeFileSync(corePkg, JSON.stringify(pkg));
    cli(['good.clas.abap', '--no-render', '--cache', '--no-config', '--no-progress']);
    assert(context() === propsBefore, 'a property-only run keeps its cache across the same move');
  });

  /* ── 5. the markdown report keeps the tag names it quotes ────────────── */

  /* The markdown format is written for a PR comment and $GITHUB_STEP_SUMMARY,
   * and its messages quote markup: `<Page> carries the attribute title
   * twice`, `close <content> with </content>`, `a <style> block`. A table
   * cell passed them through as RAW HTML - GitHub's sanitizer drops an
   * unknown element, so the rendered comment read " carries the attribute
   * title twice" and "close  with ", and `<mvc:View>` became an autolink to
   * `mvc:View`. A cell escapes `&`, `<` and `>` now, which every markdown
   * renderer turns back into the characters. */
  section('round 2026-09-29b: --format markdown escapes the markup its messages quote', async () => {
    const { formatMarkdown, summarize } = await import('../../lib/report.mjs');
    const results = [{
      file: 'v.view.xml', renderErrors: [], notes: [],
      findings: [
        { type: 'malformed-xml', line: 3, column: 5, severity: 'error', message: '</contnt> closes nothing that is open — <content> is; close <content> with </content>' },
        { type: 'malformed-xml', line: 1, column: 1, severity: 'error', message: '<mvc:View> is never closed' },
        { type: 'undefined-css-class', line: 2, column: 1, severity: 'hint', message: 'a <style> block & a pipe | and a \\| backslash' },
      ],
    }];
    const md = formatMarkdown(results, summarize(results), {});
    const rows = md.split('\n').filter((l) => /^\| \d+:\d+ \|/.test(l));
    assert(rows.length === 3, `three rows (${rows.length})`);
    const cells = rows.map((r) => r.split(' | ')[2] ?? '');
    const cell = (word) => cells.find((c) => c.includes(word)) ?? '';
    assert(cells.every((c) => !/[<>]/.test(c)), `no raw < or > in a message cell (${cells.join(' // ')})`);
    assert(cell('contnt').includes('&lt;/contnt&gt;') && cell('contnt').includes('&lt;content&gt;') && cell('never closed').includes('&lt;mvc:View&gt;'),
      'the tags arrive as entities a renderer shows as <content>');
    assert(cell('style').includes('&lt;style&gt;') && cell('style').includes('&amp;') && cell('style').includes('\\|') && cell('style').includes('\\\\\\|'),
      `an ampersand is escaped first, the pipe and the backslash still are (${cell('style')})`);
  });

  /* ── 6. a SARIF location is a URI ────────────────────────────────────── */

  /* abapGit writes a namespaced object's file with `#` for the slashes of its
   * namespace - `/ABC/CL_APP` is `#abc#cl_app.clas.abap`, the everyday name
   * in a customer repository. SARIF's artifactLocation.uri is a URI
   * reference, where `#` starts the FRAGMENT: `src/#abc#cl_app.clas.abap`
   * named the directory `src/`, and code scanning had no file to put the
   * alert on. A blank is not a URI character at all. Each segment is
   * percent-encoded now. */
  section('round 2026-09-29b: --format sarif percent-encodes the artifact URI', async () => {
    const { formatSarif } = await import('../../lib/report.mjs');
    const finding = { type: 'unknown-control', line: 1, column: 1, severity: 'error', message: 'x' };
    const files = ['src/#abc#cl_app.clas.abap', 'src/my app/zcl_app.clas.abap', 'src/100%/zcl_pct.clas.abap', 'src/zcl_plain.clas.abap'];
    const doc = JSON.parse(formatSarif(files.map((file) => ({ file, findings: [{ ...finding }], renderErrors: [] }))));
    const uris = doc.runs[0].results.map((r) => r.locations[0].physicalLocation.artifactLocation.uri);
    assert(uris.join() === 'src/%23abc%23cl_app.clas.abap,src/my%20app/zcl_app.clas.abap,src/100%25/zcl_pct.clas.abap,src/zcl_plain.clas.abap',
      `each path segment is percent-encoded, the separators are not (${uris.join(', ')})`);
    const back = uris.map((u) => decodeURIComponent(new URL(u, 'file:///repo/').pathname).replace(/^\/repo\//, ''));
    assert(back.join() === files.join(), `and every URI resolves back to its file, no fragment cut off (${back.join(', ')})`);
  });

  /* ── 7. a class is split into statements once ────────────────────────── */

  /* Profiling a --no-render run over samples-controls (642 classes, ~13 s)
   * found splitStatements( ) called 8,106 times from declarationElements
   * alone - three parseData calls and two staticAttributes calls of two
   * keywords each per class, all over the same scrubbed source: 121 MB split
   * for 12 MB of classes, a quarter of the run. It is memoized now (the
   * findings over both corpora are byte-identical, the run takes ~10 s), and
   * the shared result is frozen so no caller can change it for the next. */
  section('round 2026-09-29b: splitStatements is memoized and hands out a frozen result', async () => {
    const { splitStatements } = await import('../../lib/abap.mjs');
    const src = fs.readFileSync(f('good.clas.abap'), 'utf8');
    const a = splitStatements(src);
    const b = splitStatements(`${src}`);
    assert(a === b, 'the same source is split once - the second call is the first result');
    assert(Object.isFrozen(a) && a.every((st) => Object.isFrozen(st)), 'the shared result and its statements are frozen');
    let threw = false;
    try { a[0].text = 'x'; } catch { threw = true; }
    assert(threw && a[0].text !== 'x', 'a caller writing into it throws instead of corrupting the next caller\'s statements');
    assert(a.map((st) => src.slice(st.offset, st.offset + st.text.length) === st.text).every(Boolean), 'and every statement still addresses the source');
  });

  /* ── 8. a byte-order mark is not JSON anywhere a user writes JSON ─────── */

  /* The first round stripped the BOM Notepad and PowerShell's Out-File write
   * from the config and the baseline. The two other JSON files a user writes
   * by hand kept failing on it: the preview data `--screenshot-model` names
   * (exit 2, "Unexpected token '﻿'") and the `<class>.mock.json` the
   * screenshot picks up by convention (the picture silently came back with
   * empty tables and the parse error beside it). */
  section('round 2026-09-29b: a byte-order mark in a screenshot model or a mock file is not an error', async () => {
    const { mockModelFor } = await import('../../lib/index.mjs');
    const dir = tempDir('a2l-bommodel-');
    const app = path.join(dir, 'zcl_app.clas.abap');
    fs.copyFileSync(f('good.clas.abap'), app);
    fs.writeFileSync(path.join(dir, 'zcl_app.mock.json'), '﻿{"NAME": "from the mock"}');
    let mock = null;
    try { mock = mockModelFor(app); } catch (e) { mock = e.message; }
    assert(mock?.NAME === 'from the mock', `the mock file next to the class is read (${JSON.stringify(mock)?.slice(0, 120)})`);
    const model = path.join(dir, 'model.json');
    fs.writeFileSync(model, '﻿{"NAME": "from the flag"}');
    const r = run([app, '--no-config', '--screenshot', path.join(dir, 'shot.png'), '--screenshot-model', model]);
    assert(r.code === 0 && fs.existsSync(path.join(dir, 'shot.png')),
      `--screenshot-model reads it too (${r.code}: ${r.err.slice(0, 160)})`);
  });

  /* ── 9. --init never points $schema into an npx cache ────────────────── */

  /* schemaRef( ) fell back to "the schema file itself, when it sits under
   * the new file's directory" - meant for a checkout of this repository or a
   * vendored copy. An npx cache or a global prefix under that directory
   * passed the same test: `npx @abap2ui5/linter --init` run in the home
   * directory (or with npm's cache inside the project, the usual CI setup)
   * wrote "$schema": ".npm/_npx/<hash>/node_modules/@abap2ui5/linter/…" -
   * a path into a cache nobody commits and npm prunes. A copy reached
   * through a node_modules that is not the nearest one is an install, and
   * gets the published schema of its version. */
  section('round 2026-09-29b: --init writes no $schema into an npx cache below the new file', () => {
    const home = tempDir('a2l-npxhome-');
    const L = path.join(home, '.npm', '_npx', 'f00d', 'node_modules', '@abap2ui5', 'linter');
    fs.mkdirSync(L, { recursive: true });
    const ROOT = path.join(FIX, '..', '..');
    for (const x of ['cli.mjs', 'package.json']) fs.copyFileSync(path.join(ROOT, x), path.join(L, x));
    for (const d of ['lib', 'data']) fs.cpSync(path.join(ROOT, d), path.join(L, d), { recursive: true });
    const r = cp.spawnSync('node', [path.join(L, 'cli.mjs'), '--init'], { encoding: 'utf8', cwd: home, env: ENV });
    const schema = /"\$schema": "([^"]+)"/.exec(fs.readFileSync(path.join(home, 'abap2ui5lint.jsonc'), 'utf8'))?.[1];
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(r.status === 0 && schema === `https://unpkg.com/@abap2ui5/linter@${version}/data/abap2ui5lint.schema.json`,
      `the published schema, not the cache path (${r.status}: ${schema})`);
    // a vendored copy under the project is still addressed where it is
    const vendored = tempDir('a2l-vendored-');
    const V = path.join(vendored, 'tools', 'linter');
    fs.mkdirSync(V, { recursive: true });
    for (const x of ['cli.mjs', 'package.json']) fs.copyFileSync(path.join(ROOT, x), path.join(V, x));
    for (const d of ['lib', 'data']) fs.cpSync(path.join(ROOT, d), path.join(V, d), { recursive: true });
    cp.spawnSync('node', [path.join(V, 'cli.mjs'), '--init'], { encoding: 'utf8', cwd: vendored, env: ENV });
    const own = /"\$schema": "([^"]+)"/.exec(fs.readFileSync(path.join(vendored, 'abap2ui5lint.jsonc'), 'utf8'))?.[1];
    assert(own === './tools/linter/data/abap2ui5lint.schema.json', `a vendored copy keeps its relative path (${own})`);
  });

  /* ── 10. an output file that cannot be written ───────────────────────── */

  /* The report goes to stdout; --sarif-out / --json-out and the badges are
   * files written beside it, AFTER it. A sidecar that could not be written
   * threw out of the run - a stack trace and exit 1, the findings code, on a
   * clean run - and a badge that could not be written went through die( ),
   * i.e. process.exit(2), which is exactly the exit the first round took out
   * of the report path: a piped report larger than the pipe buffer was cut
   * off at 64 KiB. Both are now one line on stderr and exit 2, set as the
   * exit code, after the report has drained. */
  section('round 2026-09-29b: a sidecar or badge that cannot be written is exit 2, and the report arrives whole', () => {
    const dir = tempDir('a2l-outfail-');
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'not a directory');
    const clean = run([f('good.clas.abap'), '--no-render', '--no-config', '--no-progress', '--sarif-out', path.join(blocker, 'x.sarif')]);
    assert(clean.code === 2 && /could not write/.test(clean.err) && !/\n\s+at /.test(clean.err),
      `--sarif-out into a path that cannot exist: one line and exit 2, no stack trace (${clean.code}: ${clean.err.slice(0, 200)})`);
    assert(/Success!/.test(clean.out), 'the report itself was printed');
    const json = run([f('good.clas.abap'), '--no-render', '--no-config', '--no-progress', '--json-out', path.join(blocker, 'x.json')]);
    assert(json.code === 2 && /could not write/.test(json.err), `--json-out the same (${json.code})`);
    const bl = run([f('good.clas.abap'), '--no-render', '--no-config', '--no-progress', '--update-baseline', '--baseline', path.join(blocker, 'bl.json')]);
    assert(bl.code === 2 && /could not write the baseline file/.test(bl.err) && !/\n\s+at /.test(bl.err),
      `--update-baseline the same (${bl.code}: ${bl.err.slice(0, 120)})`);

    const corpus = tempDir('a2l-outfail-corpus-');
    const src = fs.readFileSync(f('structure.clas.abap'), 'utf8');
    for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(corpus, `zcl_out${i}.clas.abap`), src.replace(/zcl_structure/gi, `zcl_out${i}`));
    const cmd = `{ node ${JSON.stringify(CLI)} ${JSON.stringify(corpus)} --no-render --no-config --no-progress --json --badge ${JSON.stringify(path.join(blocker, 'b.json'))}; echo "exit=$?" >&2; } | { sleep 1; cat; }`;
    const r = cp.spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env: ENV, maxBuffer: 64 * 1024 * 1024 });
    let doc = null;
    try { doc = JSON.parse(r.stdout); } catch { /* cut off */ }
    const code = Number(/exit=(\d+)/.exec(r.stderr ?? '')?.[1]);
    assert(r.stdout.length > 64 * 1024 && doc?.results?.length === 30,
      `a badge that cannot be written no longer cuts the piped report off (${r.stdout.length} bytes, ${doc ? 'parses' : 'does not parse'})`);
    assert(code === 2 && /could not write the badge file/.test(r.stderr), `and it is still exit 2 with the reason (${code})`);
  });

  /* ── 11. --fix counts as deferred only what the next pass can still do ─ */

  /* An edit that overlaps an applied one is deferred to the next run - and
   * one that lies INSIDE text an applied edit deleted is not: that text is
   * gone. A CRLF class with five dead `view_model_update( )` lines reported
   * "fixed …, 10 deferred to the next run (overlapping)" (the `\r` of each
   * deleted line, part of the one crlf-line-ending finding) and the next run
   * had nothing left to do - a promise --fix could not keep. */
  section('round 2026-09-29b: --fix does not defer an edit inside text it deleted', async () => {
    const { applyFixes } = await import('../../lib/fix.mjs');
    const moot = applyFixes('abcdef', [{ fixes: [{ start: 1, end: 5, text: '' }] }, { fixes: [{ start: 2, end: 3, text: 'Z' }] }]);
    assert(moot.output === 'af' && moot.applied === 1 && moot.deferred === 0,
      `an edit inside a deleted span is moot, not deferred (${JSON.stringify({ ...moot, findings: undefined })})`);
    const partial = applyFixes('abcdef', [{ fixes: [{ start: 1, end: 4, text: '' }] }, { fixes: [{ start: 3, end: 5, text: 'Z' }] }]);
    assert(partial.deferred === 1, 'one that reaches past the deleted text is still deferred');
    const inReplaced = applyFixes('abcdef', [{ fixes: [{ start: 1, end: 5, text: 'X' }] }, { fixes: [{ start: 2, end: 3, text: 'Z' }] }]);
    assert(inReplaced.deferred === 1, 'and so is one inside REPLACED text - the replacement may still carry what it fixes');

    const dir = tempDir('a2l-crlffix-');
    const file = path.join(dir, 'zcl_crlf.clas.abap');
    fs.writeFileSync(file, fs.readFileSync(f('obsolete.clas.abap'), 'utf8').replace(/\n/g, '\r\n'));
    const first = run([file, '--no-render', '--no-config', '--no-progress', '--fix']);
    const second = run([file, '--no-render', '--no-config', '--no-progress', '--fix']);
    const deferred = Number(/(\d+) deferred to the next run/.exec(first.out)?.[1] ?? 0);
    const nextFixed = Number(/fixed (\d+) problem/.exec(second.out)?.[1] ?? 0);
    assert(deferred === nextFixed, `what one pass calls deferred is what the next pass fixes (${deferred} deferred, ${nextFixed} fixed next)`);
    assert(!fs.readFileSync(file, 'utf8').includes('\r'), 'and the file is LF throughout after the first pass');
  });

  /* ── 12. an attribute call's arguments in any order ──────────────────── */

  /* ABAP passes named parameters in any order, and `a( v = … n = … )` is the
   * same call as `a( n = … v = … )`. The reconstructor read `v`, `b` and `t`
   * as "everything after `v =` to the closing paren", so with the name
   * written second the value came out as `client->_bind_edit( mv_text ) n =
   * \`value\`` - unresolvable, dropped with a note, and the Input lost its
   * binding in every gate's view of the class. The arguments are read with
   * the same paren- and literal-aware splitter the rules use now. */
  section('round 2026-09-29b: a( v = … n = … ) reconstructs like a( n = … v = … )', () => {
    const wrap = (attrs) => `CLASS zcl_t DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_text TYPE string.
    DATA mv_flag TYPE abap_bool.
ENDCLASS.
CLASS zcl_t IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\`
          )->tag( \`Input\`
${attrs}
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
`;
    const nFirst = prepareAbap(wrap(`            )->a( n = \`value\` v = client->_bind_edit( mv_text )
            )->a( n = \`enabled\` b = mv_flag
            )->a( n = \`placeholder\` v = \`Name n = x\` ).`));
    const vFirst = prepareAbap(wrap(`            )->a( v = client->_bind_edit( mv_text ) n = \`value\`
            )->a( b = mv_flag n = \`enabled\`
            )->a( v = \`Name n = x\` n = \`placeholder\` ).`));
    assert(nFirst.docs[0] === vFirst.docs[0], `the same document either way (${vFirst.docs[0]})`);
    assert(/value="\{\/MV_TEXT\}"/.test(vFirst.docs[0]) && /placeholder="Name n = x"/.test(vFirst.docs[0]),
      'the binding and the literal are both in it');
    assert(!vFirst.notes.some((n) => /unresolved value expression dropped/.test(n)), `nothing was dropped (${vFirst.notes.join(' | ')})`);
  });

  /* ── 13. --init never shadows the config a directory already has ─────── */

  /* Discovery reads abap2ui5lint.jsonc BEFORE abap2ui5lint.json, and --init
   * only looked for the first. Beside an existing abap2ui5lint.json it wrote
   * a fresh .jsonc - which from then on silently won: a repository with
   * `"failOn": "never"` in its .json went from exit 0 to exit 1 with nothing
   * saying why. */
  section('round 2026-09-29b: --init refuses beside an abap2ui5lint.json as well', () => {
    const dir = tempDir('a2l-initjson-');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.json'), '{ "failOn": "never" }\n');
    const r = run(['--init'], { cwd: dir });
    assert(r.code === 2 && /abap2ui5lint\.json already exists/.test(r.err), `--init refuses (${r.code}: ${r.err.trim()})`);
    assert(!fs.existsSync(path.join(dir, 'abap2ui5lint.jsonc')), 'and writes nothing that would shadow it');
  });

  /* ── 14. abapGit's metadata XML is not a view ────────────────────────── */

  /* A file named on the command line is collected when it starts with `<`,
   * so that a view kept under another name is still checked. abapGit writes
   * an XML sidecar beside every object (`zcl_app.clas.xml`,
   * `package.devc.xml`), and every way of naming files in bulk names those
   * too: `abap2ui5lint src/*`, and the pre-commit hook
   * `abap2ui5lint $(git diff --cached --name-only)`. Each was read as a view
   * whose root control is `abapGit` - "abapGit is an aggregation sitting at
   * the view root", an error, exit 1, for every class the commit touched.
   * An abapGit document is recognised by its root element and not collected;
   * piped through --stdin it is nothing to check. */
  section('round 2026-09-29b: abapGit metadata XML named on the command line is not read as a view', () => {
    const dir = tempDir('a2l-abapgit-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'zcl_good.clas.abap'));
    const meta = '﻿<?xml version="1.0" encoding="utf-8"?>\n<abapGit version="v1.0.0" serializer="LCL_OBJECT_CLAS" serializer_version="v1.0.0">\n'
      + ' <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">\n  <asx:values>\n   <VSEOCLASS>\n    <CLSNAME>ZCL_GOOD</CLSNAME>\n'
      + '   </VSEOCLASS>\n  </asx:values>\n </asx:abap>\n</abapGit>\n';
    fs.writeFileSync(path.join(dir, 'zcl_good.clas.xml'), meta);
    fs.writeFileSync(path.join(dir, 'package.devc.xml'), meta.replace('LCL_OBJECT_CLAS', 'LCL_OBJECT_DEVC'));
    const named = ['zcl_good.clas.abap', 'zcl_good.clas.xml', 'package.devc.xml'];
    const r = run([...named, '--no-render', '--no-config', '--no-progress', '--json'], { cwd: dir });
    let doc = null;
    try { doc = JSON.parse(r.out); } catch { /* not json */ }
    assert(r.code === 0 && doc?.results?.length === 1 && doc.results[0].file === 'zcl_good.clas.abap',
      `only the class is checked - the sidecars are not views (${r.code}: ${doc?.results?.map((x) => `${x.file}:${x.findings.map((y) => y.type).join('+')}`).join(', ')})`);
    const piped = run(['--stdin', '--stdin-filename', 'zcl_good.clas.xml', '--no-config', '--json'], { cwd: dir, input: meta });
    let pdoc = null;
    try { pdoc = JSON.parse(piped.out); } catch { /* not json */ }
    assert(piped.code === 0 && pdoc?.problems === 0, `nor is one piped through --stdin (${piped.code}: ${pdoc?.problems})`);
    // a real view under a name of its own is still collected when named
    fs.copyFileSync(f('sample.view.xml'), path.join(dir, 'custom.xml'));
    const view = run(['custom.xml', '--no-render', '--no-config', '--no-progress', '--json'], { cwd: dir });
    assert(JSON.parse(view.out).results?.length === 1, 'while a view under another name is still read when it is named');
  });

  /* ── 15. --fix counts problems, not edits ─────────────────────────────── */

  /* "fixed N problem(s)" added up applied EDITS. One crlf-line-ending finding
   * carries an edit per line, so a CRLF class with six fixable findings
   * reported "would fix 216 problem(s)" under a dry-run list of six lines.
   * The summary counts the findings a pass settled, and the deferred count
   * the findings with an edit left for the next pass. */
  section('round 2026-09-29b: the --fix summary counts the problems it lists', () => {
    const dir = tempDir('a2l-fixcount-');
    const file = path.join(dir, 'zcl_crlf.clas.abap');
    fs.writeFileSync(file, fs.readFileSync(f('obsolete.clas.abap'), 'utf8').replace(/\n/g, '\r\n'));
    const r = run([file, '--no-render', '--no-config', '--no-progress', '--fix-dry-run']);
    const listed = r.out.split('\n').filter((l) => /:\d+:\d+ [a-z-]+$/.test(l));
    const count = Number(/would fix (\d+) problem/.exec(r.out)?.[1]);
    assert(listed.length > 1 && count === listed.length, `the count is the number of listed problems (${count} vs ${listed.length} listed)`);
  });

  /* ── 16. a save during the first watch run is not lost ───────────────── */

  /* --watch set its watchers up AFTER the first run. With the render gate
   * that run is seconds of browser launch and UI5 boot, and a file saved in
   * that window was never seen: the first run had collected before the save,
   * nothing was watching yet, and the loop then sat there reporting the old
   * state until the NEXT save. (The watch/render section of watch.mjs raced
   * the same window from the other side and failed on a loaded machine.)
   * The watchers now exist before the first run, and what they see while it
   * runs is one more run after it. */
  section('round 2026-09-29b: --watch sees a file saved while its first run is still rendering', async () => {
    const dir = tempDir('a2l-watchfirst-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'viewbuilder.clas.abap'));
    const child = cp.spawn('node', [CLI, dir, '--watch', '--render', '--progress', '--no-config'], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    const until = async (pred, ms = 60000) => {
      const t0 = Date.now();
      while (!pred() && child.exitCode === null && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
      return pred();
    };
    try {
      // the property gate is through (the closing line of its phase is written
      // when the render phase opens) - the first run has collected its files
      const rendering = await until(() => /properties gate/.test(err));
      assert(rendering, `the first run reaches the render phase (${err.slice(0, 200)})`);
      fs.copyFileSync(f('broken.clas.abap'), path.join(dir, 'broken.clas.abap'));
      const seen = await until(() => /broken\.clas\.abap/.test(out));
      assert(seen, `the file saved during the first run is reported by a run after it (stderr: ${err.replace(/\s+/g, ' ').slice(0, 300)})`);
    } finally {
      child.kill('SIGINT');
    }
    const end = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 15000))]);
    assert(end.code === 0 || process.platform === 'win32', `and Ctrl+C still ends it with exit 0 (${end.code ?? end.signal})`);
  });

  /* ── 17. a bare directive under --no-properties is unjudged too ────────── */

  /* The first round made a directive NAMING a rule that did not run
   * unjudged instead of unused - `--no-properties` had told authors to delete
   * the waivers the full run needs. A BARE directive (no id: every rule) kept
   * the old verdict: over a line whose only finding is a property-walk one,
   * `--no-properties` still said "suppressed nothing … remove the
   * directive". It is unjudged now whenever the run left a gate out; with
   * every gate on it is judged as before. */
  section('round 2026-09-29b: a bare directive is not called unused by a run that left the property gate out', () => {
    const src = (attr) => `CLASS zcl_bare DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.

CLASS zcl_bare IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\`     v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\`
              )->tag( \`Button\`
                  " abap2ui5lint-disable-next-line
                  )->a( n = \`${attr}\` v = \`x\`
          )->end( ).
      client->view_display( view->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
`;
    const unused = (r) => r.findings.filter((x) => x.type === 'unused-directive').length;
    assert(unused(checkAbapSource(src('textt'), { file: 'zcl_bare.clas.abap', render: false })) === 0,
      'the full run: the bare directive waives the unknown-property it stands over');
    assert(unused(checkAbapSource(src('textt'), { file: 'zcl_bare.clas.abap', render: false, properties: false })) === 0,
      'without the property gate it is unjudged - not "remove the directive"');
    assert(unused(checkAbapSource(src('text'), { file: 'zcl_bare.clas.abap', render: false })) === 1,
      'and with every gate on, one over a clean line is still unused');
  });

  /* ── 18. a waiver of a rule that stood down is unjudged ──────────────── */

  /* The first round made unused-namespace-declaration stand down for a class
   * whose view it cannot fully see (helperns.clas.abap is the shape of
   * abap2UI5's z2ui5_cl_ui5_app_start: `xmlns:form` for a SimpleForm a
   * RETURNING helper adds). app_start carries a waiver for exactly that
   * false positive, and after the round every run over abap2UI5 reported it
   * as `unused-directive` - "remove the directive" - the only change the
   * round made across abap2UI5 and samples-controls. A rule that stood down
   * did not judge the class; by the round's own rule for rules that did not
   * run, its waiver is unjudged, not unused. */
  section('round 2026-09-29b: a waiver of unused-namespace-declaration where the rule stood down is not unused', () => {
    const src = fs.readFileSync(f('helperns.clas.abap'), 'utf8').replace(
      /(\n\s*)(\)->a\( n = `xmlns:form`)/,
      '$1" abap2ui5lint-disable-next-line unused-namespace-declaration -- used by the form create_layout_form( ) adds$1$2',
    );
    assert(/abap2ui5lint-disable-next-line unused-namespace-declaration/.test(src), 'the waiver sits over the xmlns:form line');
    const r = checkAbapSource(src, { file: 'helperns.clas.abap', render: false });
    assert(!r.findings.some((x) => x.type === 'unused-namespace-declaration'), 'the rule stands down for the class, as the first round made it');
    assert(!r.findings.some((x) => x.type === 'unused-directive'),
      `and the waiver is not "unused" (${r.findings.filter((x) => x.type === 'unused-directive').map((x) => x.message).join(' | ')})`);
    // where the rule DID judge, a waiver that suppresses nothing is still unused
    const good = fs.readFileSync(f('good.clas.abap'), 'utf8').replace(
      /(\n\s*)(\)->a\( n = `xmlns:mvc`)/,
      '$1" abap2ui5lint-disable-next-line unused-namespace-declaration$1$2',
    );
    assert(/disable-next-line unused-namespace-declaration/.test(good), 'a waiver over a used prefix in a fully seen class');
    assert(checkAbapSource(good, { file: 'good.clas.abap', render: false }).findings.some((x) => x.type === 'unused-directive'),
      'is still reported as unused');
  });
}
