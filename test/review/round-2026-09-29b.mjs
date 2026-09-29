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
}
