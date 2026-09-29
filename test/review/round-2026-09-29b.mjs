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

export default async function ({ section, assert, f, FIX, tempDir, checkXmlSource }) {
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
}
