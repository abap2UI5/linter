/*
 * The 2026-09-29 round: defects reported against the published 0.8.3, each
 * reproduced first and pinned here with the input that showed it - the report
 * cut off at 64 KiB when it went into a pipe, the render gate under pnpm and
 * without a browser, a baseline that called every entry of an unlinted file
 * stale, a `--fix` that deleted a namespace a helper still used, a view that
 * was not well-formed passing the property gate, and the smaller ones behind
 * them. See test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { libRoots, missingRenderDeps, runtimeSnapshotMismatch, browserLaunchError } from '../../lib/render.mjs';

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, { cwd, input, env = {} } = {}) => {
    const r = cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...ENV, ...env }, cwd, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. a report into a pipe is the whole report ─────────────────────── */

  /* `process.exit( )` after a report dropped whatever the pipe had not taken
   * yet: a failing `--json` run piped into a reader that is not instantly
   * there came out as exactly 65,536 bytes. The reader here sleeps before it
   * reads, which is what any real consumer (jq behind a slow job log, a
   * workflow step) does often enough - and the only reliable way to see it. */
  const piped = (args) => {
    const cmd = `{ node ${JSON.stringify(CLI)} ${args.map((a) => JSON.stringify(a)).join(' ')}; echo "exit=$?" >&2; } | { sleep 1; cat; }`;
    const r = cp.spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env: ENV, maxBuffer: 64 * 1024 * 1024 });
    return { out: r.stdout ?? '', code: Number(/exit=(\d+)/.exec(r.stderr ?? '')?.[1]) };
  };

  section('round 2026-09-29: a failing report piped into a slow reader arrives whole', () => {
    const dir = tempDir('a2l-pipe-');
    const src = fs.readFileSync(f('structure.clas.abap'), 'utf8');
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(dir, `zcl_pipe${i}.clas.abap`), src.replace(/zcl_structure/gi, `zcl_pipe${i}`));
    }
    const r = piped([dir, '--no-render', '--no-config', '--no-progress', '--json']);
    let doc = null;
    try { doc = JSON.parse(r.out); } catch { /* truncated */ }
    assert(r.out.length > 64 * 1024, `the report is larger than a pipe buffer, or this proves nothing (${r.out.length} bytes)`);
    assert(doc !== null, `the --json document parses - nothing was cut off at 64 KiB (${r.out.length} bytes, ends ${JSON.stringify(r.out.slice(-40))})`);
    assert(r.code === 1, `and the exit code still says the run failed (${r.code})`);
    assert(doc?.results?.length === 30, `every file is in it (${doc?.results?.length})`);

    // --explain is a documentation command with an early exit of its own
    const ids = run(['--explain']).out.split('\n').map((l) => /^\s+([a-z0-9-]+)\s/.exec(l)?.[1]).filter(Boolean).slice(0, 80);
    const direct = run(['--explain', ...ids]).out;
    const e = piped(['--explain', ...ids]);
    assert(direct.length > 64 * 1024, `--explain over ${ids.length} ids is larger than a pipe buffer (${direct.length} bytes)`);
    assert(e.out === direct && e.code === 0, `and arrives whole through a slow pipe too (${e.out.length} of ${direct.length} bytes, exit ${e.code})`);
  });

  /* ── 2, 3, 8b. the render runtime where a real install puts it ───────── */

  /* A pnpm-shaped install, built from the packages this checkout has: every
   * @openui5 package in a store directory OF ITS OWN (a real directory with
   * its package.json, `src` linked to the real sources), linter-render seeing
   * them through symlinks, and the project's node_modules linking to it. And
   * beside the project, a copy of the linter with no node_modules at all -
   * the shape of `npx --yes @abap2ui5/linter` or a global install, which can
   * only find the runtime through the project it is run in. */
  const ROOT = path.join(FIX, '..', '..');
  const pnpmTree = ({ playwright = null, coreVersion = null } = {}) => {
    const T = tempDir('a2l-pnpm-');
    const L = path.join(T, 'linter');
    fs.mkdirSync(L);
    for (const x of ['cli.mjs', 'package.json']) fs.copyFileSync(path.join(ROOT, x), path.join(L, x));
    for (const d of ['lib', 'data']) fs.cpSync(path.join(ROOT, d), path.join(L, d), { recursive: true });
    const P = path.join(T, 'project');
    const store = path.join(P, 'node_modules', '.pnpm');
    const lr = path.join(store, '@abap2ui5+linter-render@0.0.0', 'node_modules');
    fs.mkdirSync(path.join(lr, '@abap2ui5', 'linter-render'), { recursive: true });
    fs.mkdirSync(path.join(lr, '@openui5'));
    fs.copyFileSync(path.join(ROOT, 'linter-render', 'package.json'), path.join(lr, '@abap2ui5', 'linter-render', 'package.json'));
    const real = path.join(ROOT, 'node_modules', '@openui5');
    for (const lib of fs.readdirSync(real)) {
      const own = path.join(store, `@openui5+${lib}@0.0.0`, 'node_modules', '@openui5', lib);
      fs.mkdirSync(own, { recursive: true });
      const pkg = JSON.parse(fs.readFileSync(path.join(real, lib, 'package.json'), 'utf8'));
      if (coreVersion && lib === 'sap.ui.core') pkg.version = coreVersion;
      fs.writeFileSync(path.join(own, 'package.json'), JSON.stringify(pkg));
      fs.symlinkSync(path.join(real, lib, 'src'), path.join(own, 'src'));
      fs.symlinkSync(own, path.join(lr, '@openui5', lib));
    }
    if (playwright) {
      fs.mkdirSync(path.join(lr, 'playwright'));
      fs.writeFileSync(path.join(lr, 'playwright', 'package.json'), '{"name":"playwright","main":"index.js"}');
      fs.writeFileSync(path.join(lr, 'playwright', 'index.js'), playwright);
    } else {
      fs.symlinkSync(path.join(ROOT, 'node_modules', 'playwright'), path.join(lr, 'playwright'));
    }
    fs.mkdirSync(path.join(P, 'node_modules', '@abap2ui5'));
    fs.symlinkSync(path.join(lr, '@abap2ui5', 'linter-render'), path.join(P, 'node_modules', '@abap2ui5', 'linter-render'));
    fs.copyFileSync(f('good.clas.abap'), path.join(P, 'good.clas.abap'));
    const cli = (args, opts = {}) => {
      const r = cp.spawnSync('node', [path.join(L, 'cli.mjs'), ...args], {
        encoding: 'utf8', cwd: P, env: { ...ENV, ...opts.env }, timeout: 180_000,
      });
      return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status, signal: r.signal };
    };
    const node = (code) => {
      const r = cp.spawnSync('node', ['--input-type=module', '-e', code], { encoding: 'utf8', cwd: P, env: ENV, timeout: 180_000 });
      return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status, signal: r.signal };
    };
    return { T, L, P, lr, cli, node, renderUrl: pathToFileURL(path.join(L, 'lib', 'render.mjs')).href };
  };

  section('round 2026-09-29: the runtime of a pnpm tree is served package by package', () => {
    const t = pnpmTree();
    const req = createRequire(path.join(t.lr, '@abap2ui5', 'linter-render', 'package.json'));
    const roots = libRoots(req);
    assert(roots.length === 11, `every @openui5 package of RENDER_DEPS is a source root, each from its own store directory (${roots.length})`);
    assert(roots.some((r) => r.includes('@openui5+sap.m@')) && roots.some((r) => r.includes('@openui5+sap.ui.core@')),
      `sap.m comes from its own directory, not from the one sap.ui.core sits in (${roots.slice(0, 2).join(', ')})`);
    assert(missingRenderDeps(req.resolve).length === 0, 'and nothing is reported missing');
  });

  section('round 2026-09-29: a linter outside the project finds the project\'s runtime, and renders under pnpm', () => {
    const t = pnpmTree();
    const r = t.cli(['good.clas.abap', '--render', '--no-config', '--no-progress']);
    assert(r.signal === null, `the run ends on its own - it used to hang on a runtime whose libraries were not served (${r.signal})`);
    assert(r.code === 0 && /Success!/.test(r.out), `the good fixture renders clean, from the project's runtime (${r.code}: ${r.err.slice(0, 300)})`);
    assert(!/missing/.test(r.err), `nothing is called missing (${r.err.slice(0, 200)})`);
    // and the gate really ran: a broken view is a render error, not a pass
    fs.copyFileSync(f('broken.clas.abap'), path.join(t.P, 'broken.clas.abap'));
    const b = t.cli(['broken.clas.abap', '--render', '--no-config', '--no-progress', '--json']);
    let renderErrors = -1;
    try { renderErrors = JSON.parse(b.out).results[0].renderErrors.length; } catch { /* not json */ }
    assert(renderErrors > 0, `the broken fixture fails view creation there (${renderErrors} render errors)`);
  });

  section('round 2026-09-29: a runtime of another UI5 release than the snapshot is said out loud', () => {
    assert(runtimeSnapshotMismatch('1.152.0', '1.152.3') === null, 'a patch release is the same API');
    assert(runtimeSnapshotMismatch('1.152.0', null) === null, 'no runtime, nothing to say');
    assert(/serves OpenUI5 1\.151\.0.*snapshot is 1\.152\.0/.test(runtimeSnapshotMismatch('1.152.0', '1.151.0') ?? ''),
      'a minor apart is named, both versions in the sentence');
    const t = pnpmTree({ coreVersion: '1.151.0' });
    const r = t.cli(['good.clas.abap', '--render', '--no-config', '--no-progress']);
    assert(/serves OpenUI5 1\.151\.0/.test(r.err) && r.code === 0,
      `the CLI warns on stderr and the run goes on (${r.code}: ${r.err.slice(0, 200)})`);
    const quiet = t.cli(['good.clas.abap', '--no-render', '--no-config', '--no-progress']);
    assert(!/serves OpenUI5/.test(quiet.err), 'and not when the render gate is off');
  });

  section('round 2026-09-29: a browser that will not start is a clean tool error, or a fallback', () => {
    const t = pnpmTree({
      playwright: 'exports.chromium = { launch: async () => { throw new Error("browserType.launch: Executable doesn\'t exist at /nowhere/chrome\\n\u2554\u2550\u2550\u2557\\n\u2551 Looks like Playwright was just installed \u2551"); } };',
    });
    const asked = t.cli(['good.clas.abap', '--render', '--no-config', '--no-progress']);
    assert(asked.code === 2, `an ASKED-for gate without a browser is the tool-error exit 2, not the findings exit 1 (${asked.code})`);
    assert(/could not start Chromium \(browserType\.launch: Executable doesn't exist at \/nowhere\/chrome\)/.test(asked.err)
      && /npx playwright install chromium/.test(asked.err),
    `one sentence naming the cause and the command (${asked.err.slice(0, 300)})`);
    assert(!/\n\s+at /.test(asked.err) && asked.err.trim().split('\n').length === 1, `no stack trace, no banner (${asked.err.split('\n').length} lines)`);
    const left = t.cli(['good.clas.abap', '--no-config', '--no-progress']);
    assert(left.code === 0 && /Success!/.test(left.out), `a DEFAULT-on gate steps aside, the property gate still runs (${left.code}: ${left.out.slice(0, 120)})`);
    assert(/render gate is OFF for this run - it could not start Chromium/.test(left.err), `and says so on stderr (${left.err.slice(0, 200)})`);
    const e = browserLaunchError(new Error('browserType.launch: boom\n╔══╗'));
    assert(e.code === 'ERR_RENDER_BROWSER_MISSING' && /\(browserType\.launch: boom\)/.test(e.message), 'the library error carries the first line of the cause');
    // openRenderer closes the server it had already started: the process ends
    const lib = t.node(`const r = await import(${JSON.stringify(t.renderUrl)});
      try { await r.openRenderer(); } catch (e) { console.log(e.code); }`);
    assert(lib.signal === null && lib.out.trim() === 'ERR_RENDER_BROWSER_MISSING',
      `openRenderer rejects and leaves nothing running behind it (${lib.signal ?? lib.out.trim()} ${lib.err.slice(0, 200)})`);
  });

  section('round 2026-09-29: the render gate\'s waits are bounded', () => {
    const t = pnpmTree();
    const boot = t.node(`const r = await import(${JSON.stringify(t.renderUrl)});
      try { await r.openRenderer({ bootTimeout: 1 }); console.log('opened'); } catch (e) { console.log(e.code); console.log(e.message); }`);
    assert(boot.signal === null && /^ERR_RENDER_RUNTIME_BROKEN\n.*did not boot within/.test(boot.out),
      `a UI5 that does not boot in time is an error, and nothing is left running (${boot.signal ?? ''} ${boot.out.slice(0, 200)} ${boot.err.slice(0, 200)})`);
    const render = t.node(`const r = await import(${JSON.stringify(t.renderUrl)});
      const x = await r.openRenderer({ renderTimeout: 1 });
      console.log(JSON.stringify(await x.render({ xml: '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Text text="a"/></mvc:View>' })));
      await x.close();`);
    assert(render.signal === null && /HARNESS: the document did not finish rendering within/.test(render.out),
      `a render that does not finish is that document's error, and the renderer still closes (${render.signal ?? ''} ${render.out.slice(0, 200)} ${render.err.slice(0, 200)})`);
  });

  /* ── 4. a baseline speaks for the files the run linted ───────────────── */

  section('round 2026-09-29: only an entry of a linted (or deleted) file can be stale', () => {
    const dir = tempDir('a2l-base-');
    for (const n of ['abaprules.clas.abap', 'structure.clas.abap', 'wires.clas.abap']) fs.copyFileSync(f(n), path.join(dir, n));
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    const base = ['--no-render', '--no-config', '--no-progress', '--baseline', bl];
    const entries = () => JSON.parse(fs.readFileSync(bl, 'utf8')).findings;
    const filesOf = (m) => [...new Set(Object.keys(m).map((k) => k.split('|')[0]))].sort();
    assert(run([dir, ...base, '--update-baseline']).code === 0, 'the whole directory is baselined');
    const all = entries();
    assert(filesOf(all).length === 3, `with entries for all three files (${filesOf(all).join(', ')})`);

    const one = run([path.join(dir, 'wires.clas.abap'), ...base]);
    assert(one.code === 0 && !/STALE/.test(one.out),
      `linting ONE file calls none of the other files' entries stale (${one.code}: ${one.out.split('\n').filter((l) => /STALE|stale/.test(l)).join(' | ')})`);
    const src = fs.readFileSync(path.join(dir, 'structure.clas.abap'), 'utf8');
    const piped = run(['--stdin', '--stdin-filename', path.join(dir, 'structure.clas.abap'), ...base], { input: src });
    assert(piped.code === 0 && !/STALE/.test(piped.out), `nor does --stdin (${piped.code}: ${piped.out.slice(-200)})`);

    // the one linted file lost its findings: ITS entries are stale, only its
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'wires.clas.abap'));
    const stale = run([path.join(dir, 'wires.clas.abap'), ...base]);
    const staleLines = stale.out.split('\n').filter((l) => /! stale:/.test(l));
    assert(stale.code === 1 && staleLines.length > 0 && staleLines.every((l) => l.includes('wires.clas.abap|')),
      `the linted file's gone findings are stale and fail, no other file's (${stale.code}: ${staleLines.length} lines)`);
    const advisory = run([path.join(dir, 'wires.clas.abap'), ...base, '--advisory']);
    assert(advisory.code === 0 && /STALE/.test(advisory.out), `--advisory reports them and exits 0, as its help promises (${advisory.code})`);
    const never = run([path.join(dir, 'wires.clas.abap'), ...base, '--fail-on', 'never']);
    assert(never.code === 0, `so does --fail-on never (${never.code})`);
    const json = run([path.join(dir, 'wires.clas.abap'), ...base, '--json']);
    let doc = null;
    try { doc = JSON.parse(json.out); } catch { /* not json */ }
    assert(json.code === 1 && doc?.failing === 0 && doc?.baseline?.stale?.length === staleLines.length
      && doc.baseline.stale.every((e) => e.key.startsWith('wires.clas.abap|') && e.count > 0),
    `--json names why a run with failing: 0 exits 1 - the stale entries (${JSON.stringify(doc?.baseline)?.slice(0, 200)})`);
    assert(typeof doc?.baseline?.suppressed === 'number' && /abap2ui5lint-baseline\.json$/.test(doc?.baseline?.file ?? ''),
      'with the file and what it suppressed');

    // a file that is gone can never match again - stale in any run
    fs.rmSync(path.join(dir, 'abaprules.clas.abap'));
    fs.copyFileSync(f('wires.clas.abap'), path.join(dir, 'wires.clas.abap'));
    const gone = run([path.join(dir, 'wires.clas.abap'), ...base]);
    const goneLines = gone.out.split('\n').filter((l) => /! stale:/.test(l));
    assert(gone.code === 1 && goneLines.length > 0 && goneLines.every((l) => l.includes('abaprules.clas.abap|')),
      `an entry of a deleted file is stale even when another file was linted (${goneLines.length})`);
  });

  section('round 2026-09-29: --update-baseline on one file keeps every other file\'s entries', () => {
    const dir = tempDir('a2l-base-');
    for (const n of ['abaprules.clas.abap', 'structure.clas.abap', 'wires.clas.abap']) fs.copyFileSync(f(n), path.join(dir, n));
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    const base = ['--no-render', '--no-config', '--no-progress', '--baseline', bl];
    const entries = () => JSON.parse(fs.readFileSync(bl, 'utf8')).findings;
    run([dir, ...base, '--update-baseline']);
    const before = entries();
    const others = Object.entries(before).filter(([k]) => !k.startsWith('wires.clas.abap|'));
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'wires.clas.abap'));
    assert(run([path.join(dir, 'wires.clas.abap'), ...base, '--update-baseline']).code === 0, 'the one file is re-baselined');
    const after = entries();
    assert(others.every(([k, n]) => after[k] === n), `every other file's entries are kept, counts included (${others.length})`);
    assert(!Object.keys(after).some((k) => k.startsWith('wires.clas.abap|')), 'and the updated file\'s entries are what it now has - none');
    assert(run([dir, ...base]).code === 0, 'the whole directory is green against the updated file');
    // an update over the directory drops the entries of a deleted file
    fs.rmSync(path.join(dir, 'abaprules.clas.abap'));
    run([dir, ...base, '--update-baseline']);
    assert(!Object.keys(entries()).some((k) => k.startsWith('abaprules.clas.abap|')), 'an update drops the entries of a file that is gone');
  });

  /* ── 5. a namespace the reconstruction did not see used is not unused ── */

  /* helperns.clas.abap is the shape of abap2UI5's z2ui5_cl_ui5_app_start:
   * the root declares xmlns:form for a SimpleForm a RETURNING helper adds,
   * and the caller assigns the helper's result - a call the reconstructor
   * does not follow. The finding came with a deleting --fix, which broke the
   * view. unplacedns.clas.abap builds on a handle the reconstruction cannot
   * place, with the prefix in a variable: nothing in the text shows the use. */
  section('round 2026-09-29: unused-namespace-declaration stands down where the view is not fully seen', () => {
    const opts = { render: false, properties: true };
    const ns = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'unused-namespace-declaration');
    const helper = fs.readFileSync(f('helperns.clas.abap'), 'utf8');
    const unplaced = fs.readFileSync(f('unplacedns.clas.abap'), 'utf8');
    assert(ns(helper).length === 0,
      `a prefix a helper the reconstructor does not follow writes is not reported, so no fix deletes it (${ns(helper).map((x) => x.member).join(',')})`);
    assert(ns(unplaced).length === 0,
      `a class with a builder call the reconstruction could not place is not judged (${ns(unplaced).map((x) => x.member).join(',')})`);
    const fixed = run([f('helperns.clas.abap'), '--no-render', '--no-config', '--fix-dry-run']);
    assert(!/unused-namespace-declaration/.test(fixed.out), `--fix would not touch the declaration (${fixed.out.slice(0, 200)})`);
    // the rule still works where it can see: a prefix used nowhere at all
    const stale = helper.replace('`xmlns:form` v = `sap.ui.layout.form`', '`xmlns:form` v = `sap.ui.layout.form`\n          )->a( n = `xmlns:f`    v = `sap.f`');
    assert(ns(stale).map((x) => x.member).join() === 'f',
      `beside it, a prefix the class writes nowhere is still reported (${ns(stale).map((x) => x.member).join(',')})`);
    // and a second stringify( ) of a finished view is not an incomplete one
    const docrules = fs.readFileSync(f('docrules.clas.abap'), 'utf8');
    assert(ns(docrules).length === 3, `a re-display in ELSEIF keeps the verdict (${ns(docrules).length})`);
  });

  /* ── 6. a view that is not well-formed is not a clean view ───────────── */

  section('round 2026-09-29: malformed-xml - a mismatched close, an unclosed root and a duplicate attribute', () => {
    const xml = fs.readFileSync(f('malformed.view.xml'), 'utf8');
    const hits = checkXmlSource(xml, { render: false }).findings.filter((x) => x.type === 'malformed-xml');
    const kinds = hits.map((x) => `${x.member}:${x.control}${x.value ? `/${x.value}` : ''}@${x.line}`);
    assert(kinds.join() === 'unclosed-tag:mvc:View@1,duplicate-attribute:Page/title@3,mismatched-tag:contnt/content@7',
      `the three defects, each once, in document order (${kinds.join(', ')})`);
    assert(hits.every((x) => x.severity === 'error'), 'an error - the browser refuses the document');
    const cli = run([f('malformed.view.xml'), '--no-render', '--no-config', '--no-progress']);
    assert(cli.code === 1 && !/Success!/.test(cli.out), `the property-gate-only run fails instead of "Success!" (${cli.code})`);
    const clean = (x) => checkXmlSource(x, { render: false }).findings.filter((y) => y.type === 'malformed-xml').length;
    assert(clean(fs.readFileSync(f('sample.view.xml'), 'utf8')) === 0, 'a well-formed view carries none');
    assert(clean('<mvc:View xmlns:mvc="sap.ui.core.mvc"><core:HTML xmlns:core="sap.ui.core"><![CDATA[<br><b>x]]></core:HTML></mvc:View>') === 0,
      'tags inside CDATA are text');
    assert(clean('<mvc:View xmlns:mvc="sap.ui.core.mvc"><!-- </Page> --></mvc:View>') === 0, 'and so are tags inside a comment');
    const stray = checkXmlSource('<mvc:View xmlns:mvc="sap.ui.core.mvc"/></Page>', { render: false }).findings.filter((y) => y.type === 'malformed-xml');
    assert(stray.length === 1 && stray[0].member === 'stray-close', `a close with nothing open is its own kind (${stray.map((y) => y.member)})`);
    const skipped = checkXmlSource('<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Page><VBox></Page></mvc:View>', { render: false })
      .findings.filter((y) => y.type === 'malformed-xml');
    assert(skipped.length === 1 && skipped[0].member === 'unclosed-tag' && skipped[0].control === 'VBox' && skipped[0].value === 'Page',
      `an element a close further out skips is unclosed, named with the close that skipped it (${skipped.map((y) => `${y.member}:${y.control}/${y.value}`)})`);
  });

  /* ── 7. the small ones ───────────────────────────────────────────────── */

  const DIRECTED = `CLASS zcl_review_directed DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_text TYPE string.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_review_directed IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\`
          )->tag( \`Button\`
            )->a( n = \`text\` v = client->_bind( mv_text )
            " abap2ui5lint-disable-next-line unknown-property -- a custom property a later release adds
            )->a( n = \`colour\` v = \`red\`
        )->end( ).
    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
`;

  section('round 2026-09-29: a directive for a rule that did not run is unjudged, not unused', () => {
    const unused = (o) => checkAbapSource(DIRECTED, { render: false, ...o }).findings.filter((x) => x.type === 'unused-directive');
    assert(unused({}).length === 0, 'with every gate on, the directive waives its finding and is used');
    assert(unused({ properties: false }).length === 0,
      `--no-properties: the property walk never ran, so its waiver is not "unused" (${unused({ properties: false }).map((x) => x.value)})`);
    assert(unused({ rules: { 'unknown-property': false } }).length === 0, 'nor with the rule switched off in the config');
    assert(unused({ rules: { 'unknown-property': { exclude: ['zcl_'] } }, file: 'src/zcl_review_directed.clas.abap' }).length === 0,
      'nor with the rule excluded for this file');
    const fixed = DIRECTED.replace('`colour`', '`type`').replace('`red`', '`Emphasized`');
    const dead = checkAbapSource(fixed, { render: false }).findings.filter((x) => x.type === 'unused-directive');
    assert(dead.length === 1 && dead[0].value === 'unknown-property', `where the rule ran and found nothing, the directive IS unused (${dead.map((x) => x.value)})`);
    const dir = tempDir('a2l-dir-');
    fs.writeFileSync(path.join(dir, 'zcl_review_directed.clas.abap'), DIRECTED);
    const cli = run([path.join(dir, 'zcl_review_directed.clas.abap'), '--no-properties', '--no-config', '--no-render']);
    assert(cli.code === 0 && !/unused-directive/.test(cli.out), `and the CLI agrees (${cli.code}: ${cli.out.slice(0, 160)})`);
  });

  section('round 2026-09-29: WALK_ONLY_RULES is every id the property walk alone emits', async () => {
    const { WALK_ONLY_RULES } = await import('../../lib/properties.mjs');
    const lib = path.join(FIX, '..', '..', 'lib');
    const emitted = (file) => new Set([...fs.readFileSync(path.join(lib, file), 'utf8').matchAll(/type: '([a-z0-9-]+)'/g)].map((m) => m[1]));
    const walk = emitted('properties.mjs');
    const elsewhere = new Set(fs.readdirSync(lib).filter((n) => n.endsWith('.mjs') && !['properties.mjs', 'findings.mjs', 'rule-docs.mjs'].includes(n))
      .flatMap((n) => [...emitted(n)]));
    const expected = [...walk].filter((id) => !elsewhere.has(id)).sort();
    assert(JSON.stringify([...WALK_ONLY_RULES].sort()) === JSON.stringify(expected),
      `the list matches the emit sites (missing: ${expected.filter((id) => !WALK_ONLY_RULES.has(id)).join(', ') || 'none'}; extra: ${[...WALK_ONLY_RULES].filter((id) => !expected.includes(id)).join(', ') || 'none'})`);
  });

  section('round 2026-09-29: a byte-order mark in the config or the baseline is not an error', async () => {
    const { loadConfig } = await import('../../lib/config.mjs');
    const { loadBaseline } = await import('../../lib/baseline.mjs');
    const dir = tempDir('a2l-bom-');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '﻿{\n  // a comment\n  "ui5": "1.96"\n}\n');
    let cfg = null;
    try { cfg = loadConfig(path.join(dir, 'abap2ui5lint.jsonc')); } catch (e) { cfg = e.message; }
    assert(cfg?.minUi5 === '1.96', `a config saved with a BOM loads (${typeof cfg === 'string' ? cfg : cfg?.minUi5})`);
    fs.writeFileSync(path.join(dir, 'b.json'), '﻿{ "findings": { "x.clas.abap|unknown-control|||": 1 } }\n');
    let map = null;
    try { map = loadBaseline(path.join(dir, 'b.json')); } catch (e) { map = e.message; }
    assert(map instanceof Map && map.size === 1, `and so does a baseline (${map instanceof Map ? map.size : map})`);
  });

  section('round 2026-09-29: a missing extends target names extends, not --config', () => {
    const dir = tempDir('a2l-ext-');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "extends": "./shared/base.jsonc" }\n');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    const r = run(['good.clas.abap', '--no-render'], { cwd: dir });
    assert(r.code === 2 && /'extends' names \.\/shared\/base\.jsonc, which does not exist/.test(r.err) && !/--config/.test(r.err),
      `the message points at the extends line (${r.err.trim()})`);
    fs.mkdirSync(path.join(dir, 'shared', 'base.jsonc'), { recursive: true });
    const d = run(['good.clas.abap', '--no-render'], { cwd: dir });
    assert(d.code === 2 && /which is a directory/.test(d.err) && !/--config/.test(d.err), `and a directory is named as one (${d.err.trim()})`);
    // a --config path that is missing keeps its own message
    const c = run(['good.clas.abap', '--no-render', '--config', 'nope.jsonc'], { cwd: dir });
    assert(c.code === 2 && /check the --config path/.test(c.err), 'a missing --config file is still about --config');
  });

  section('round 2026-09-29: --init writes the $schema the new file can actually reach', () => {
    const root = tempDir('a2l-init-');
    const proj = path.join(root, 'proj');
    fs.mkdirSync(path.join(proj, 'node_modules', '@abap2ui5'), { recursive: true });
    fs.mkdirSync(path.join(proj, 'packages', 'app'), { recursive: true });
    fs.symlinkSync(path.join(FIX, '..', '..'), path.join(proj, 'node_modules', '@abap2ui5', 'linter'));
    const schemaOf = (cwd) => {
      run(['--init'], { cwd });
      return /"\$schema": "([^"]+)"/.exec(fs.readFileSync(path.join(cwd, 'abap2ui5lint.jsonc'), 'utf8'))?.[1];
    };
    assert(schemaOf(proj) === './node_modules/@abap2ui5/linter/data/abap2ui5lint.schema.json', 'installed beside the file: the relative path');
    assert(schemaOf(path.join(proj, 'packages', 'app')) === '../../node_modules/@abap2ui5/linter/data/abap2ui5lint.schema.json',
      'in a monorepo package: the path up to the node_modules that holds it');
    const bare = path.join(root, 'bare');
    fs.mkdirSync(bare);
    const { version } = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8'));
    assert(schemaOf(bare) === `https://unpkg.com/@abap2ui5/linter@${version}/data/abap2ui5lint.schema.json`,
      'nowhere near an install (npx, global): the published schema of this version');
  });

  section('round 2026-09-29: generate-metadata finds the @openui5 sources through linter-render', () => {
    const t = pnpmTree();
    fs.mkdirSync(path.join(t.L, 'scripts'));
    fs.copyFileSync(path.join(ROOT, 'scripts', 'generate-metadata.mjs'), path.join(t.L, 'scripts', 'generate-metadata.mjs'));
    const out = path.join(t.T, 'properties.json');
    const r = cp.spawnSync('node', [path.join(t.L, 'scripts', 'generate-metadata.mjs'), '--out', out], { encoding: 'utf8', cwd: t.P, env: ENV });
    assert(r.status === 0 && !/no sources/.test(r.stderr), `every library resolves from the project's pnpm runtime (${r.status}: ${r.stderr.slice(0, 200)})`);
    const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8');
    assert(same, 'and writes the committed snapshot byte for byte');
  });
}
