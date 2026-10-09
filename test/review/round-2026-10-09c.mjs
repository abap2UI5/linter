/*
 * The third 2026-10-09 round. See test/review/README.md for the harness.
 *
 *   1. `./check`: checkAbapSource, checkXmlSource and the decisions they are
 *      made of, reachable without the renderer - and the same functions the
 *      entry point exports
 *   2. the CLI's class index covers every class under the configured paths,
 *      not only the files the run checks - and --cache re-judges a class when
 *      one of those changes
 *   3. a tree nested 5,000 levels deep is judged, not a RangeError
 *   4. an unclosed `(` ends at its statement's period
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareAbap as prepareRaw } from '../../lib/reconstruct.mjs';
import { walkTree, nodesOf } from '../../lib/tree.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default function ({ section, assert, tempDir, checkAbapSource, checkXmlSource, checkFiles }) {
  const opts = { render: false };
  const CLI = path.join(ROOT, 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd, input) => {
    const r = cp.spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: ENV, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. ./check ──────────────────────────────────────────────────────── */

  /* The VS Code extension's web build cannot bundle the entry point (it
   * imports render.mjs: `http`, `os`, `module`), so it re-implemented what
   * only the entry point exported - declaresApp, the view-less rule list,
   * the size-limit test, the namespace stand-down - and pinned each port to
   * this source with a test of its own. Every one of them is a copy that
   * drifts. `./check` exports the originals from a module that does not
   * reach the renderer. */
  section('round 2026-10-09c: ./check loads neither the renderer nor the entry point', () => {
    /* At RUNTIME: every module the import resolves, recorded by a resolve
     * hook in a child process, so a dynamic import or a re-export through a
     * third module counts as well as a static one. */
    const probe = `
      const m = require('node:module');
      const seen = [];
      if (typeof m.registerHooks === 'function') {
        m.registerHooks({ resolve(spec, ctx, next) { const r = next(spec, ctx); seen.push(r.url); return r; } });
      }
      import('@abap2ui5/linter/check').then((check) => {
        console.log(JSON.stringify({ hooks: typeof m.registerHooks === 'function', seen, exports: Object.keys(check) }));
      });`;
    const r = cp.spawnSync(process.execPath, ['-e', probe], { cwd: ROOT, encoding: 'utf8' });
    const got = JSON.parse(r.stdout || '{}');
    assert(Array.isArray(got.exports) && got.exports.includes('checkAbapSource'),
      `./check imports in a fresh process (${r.stderr.split('\n')[0] || 'ok'})`);
    if (got.hooks) {
      const forbidden = got.seen.filter((u) => /\/lib\/(?:render|index|check-worker)\.mjs$|playwright|@openui5|linter-render|^node:(?:http|https|os|module|worker_threads|net|child_process)$|^(?:http|https|os|module|worker_threads)$/.test(u));
      assert(got.seen.some((u) => u.endsWith('/lib/check.mjs')) && !forbidden.length,
        `./check reaches no renderer, no entry point, no browser-hostile builtin (got ${forbidden.join(', ') || 'none'} of ${got.seen.length})`);
    }
    /* And STATICALLY, over the source: the import graph of check.mjs, so the
     * line holds on a Node without module.registerHooks too. */
    const graph = new Set();
    const builtins = new Set();
    const visit = (file) => {
      if (graph.has(file)) return;
      graph.add(file);
      const src = fs.readFileSync(path.join(ROOT, 'lib', file), 'utf8');
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)) {
        const spec = m[1] ?? m[2];
        if (spec.startsWith('./')) visit(spec.slice(2));
        else builtins.add(spec.replace(/^node:/, ''));
      }
    };
    visit('check.mjs');
    assert(!graph.has('render.mjs') && !graph.has('index.mjs') && !graph.has('check-worker.mjs'),
      `the static graph of check.mjs holds no renderer and no entry point (${[...graph].sort().join(', ')})`);
    const hostile = [...builtins].filter((b) => !['fs', 'path', 'url'].includes(b));
    assert(!hostile.length, `check.mjs's graph imports fs, path and url and nothing else from outside (got ${hostile.join(', ') || 'none'})`);
  });

  section('round 2026-10-09c: ./check and the entry point export the same functions', async () => {
    const check = await import('@abap2ui5/linter/check');
    const main = await import('@abap2ui5/linter');
    for (const name of ['checkAbapSource', 'checkXmlSource', 'declaresApp', 'isXmlSource', 'isAbapGitXml']) {
      assert(check[name] === main[name], `${name}: one function, both routes`);
    }
    for (const name of ['VIEWLESS_APP_RULE', 'sizeLimitRaised', 'standDownUnusedNamespaces', 'frozenBuilderOf', 'FROZEN_BUILDERS', 'xmlFileKind']) {
      assert(name in check, `./check exports ${name}`);
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.exports['./check']?.default === './lib/check.mjs', 'the exports map names ./check');
    /* the main entry's surface is what it was: nothing moved out of it */
    for (const name of ['checkFiles', 'collectFiles', 'screenshotFiles', 'mockModelFor', 'MOCK_SUFFIX', 'elementBoundSlots']) {
      assert(name in main, `the entry point still exports ${name}`);
    }
    // the decisions themselves, as checkAbapSource takes them
    assert(check.VIEWLESS_APP_RULE.test('binding-to-local') && !check.VIEWLESS_APP_RULE.test('unknown-property'),
      'VIEWLESS_APP_RULE: a class rule in, a view rule out');
    assert(check.sizeLimitRaised('client->follow_up_action( client->_event_client( z2ui5_if_client=>cs_event-set_size_limit ) ).')
      && !check.sizeLimitRaised('DATA(x) = `cs_event-set_size_limit is a constant`.'),
      'sizeLimitRaised: the constant in code, not in prose');
    assert(check.frozenBuilderOf('DATA(v) = Z2UI5_CL_XML_VIEW=>FACTORY( ).') === 'z2ui5_cl_xml_view'
      && check.frozenBuilderOf('DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).') === null,
      'frozenBuilderOf: the retired builder in any case, the current one not');
    assert(check.xmlFileKind('a.fragment.xml') === 'fragment' && check.xmlFileKind('a.view.xml') === 'view' && check.xmlFileKind('a.xml') === undefined,
      'xmlFileKind: by the file name');
  });

  /* standDownUnusedNamespaces is the block that sat inside checkAbapSource;
   * the extension's port of it is what it replaces, so it is held to the
   * entry point's answer on the cases the block distinguishes. */
  section('round 2026-10-09c: standDownUnusedNamespaces decides what checkAbapSource decides', async () => {
    const { standDownUnusedNamespaces } = await import('@abap2ui5/linter/check');
    const app = (extra) => 'CLASS zcl_ns DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n'
      + 'CLASS zcl_ns IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->a( n = `xmlns:form` v = `sap.ui.layout.form`\n'
      + `        )->ele( \`Page\` )->tag( \`Text\` )->a( n = \`text\` v = \`x\` ).\n${extra}`
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const unused = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'unused-namespace-declaration').length;
    const plain = app('');
    const hidden = app('    DATA(lv_ns) = `form`.\n    DATA(lv_tag) = `form:SimpleForm`.\n');
    assert(unused(plain) === 1 && unused(hidden) === 0, `the fixture: reported, and stood down where the source writes the prefix more often (${unused(plain)}, ${unused(hidden)})`);
    const finding = { type: 'unused-namespace-declaration', member: 'form' };
    const other = { type: 'unknown-property', member: 'form' };
    const a = standDownUnusedNamespaces([finding, other], plain, prepareRaw(plain));
    assert(a.findings.length === 2 && a.stoodDown.length === 0, 'every use reconstructed: kept, nothing stood down');
    const input = [finding, other];
    const b = standDownUnusedNamespaces(input, hidden, prepareRaw(hidden));
    assert(b.findings.length === 1 && b.findings[0] === other && b.stoodDown.join() === 'unused-namespace-declaration' && input.length === 2,
      'a prefix the documents carry less often than the source: dropped, the rule stood down, the input untouched');
    const c = standDownUnusedNamespaces([other], plain, { unplacedTokens: 2, nodes: [] });
    assert(c.findings.length === 1 && c.stoodDown.join() === 'unused-namespace-declaration',
      'an incomplete reconstruction stands the rule down with no finding to drop');
  });

  /* A host without a file system hands the snapshot over as text (the
   * extension's browser host reads it through workspace.fs) and the class it
   * already reconstructed: checkAbapSource takes both now, and judges
   * exactly as from the path. */
  section('round 2026-10-09c: checkAbapSource takes the snapshot and the reconstruction from the caller', async () => {
    const { snapshotFromJson, loadSnapshot } = await import('@abap2ui5/linter/properties');
    const text = fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8');
    const data = snapshotFromJson(text);
    const fromPath = loadSnapshot();
    assert(data.__ui5Version === fromPath.__ui5Version && Object.keys(data.__enums).length === Object.keys(fromPath.__enums).length
      && Object.keys(data.__modelTypes).length === Object.keys(fromPath.__modelTypes).length,
      'snapshotFromJson: the side tables loadSnapshot attaches');
    assert(snapshotFromJson(data) === data, 'handed back in: unchanged');
    let threw = false;
    try { snapshotFromJson('{"enums":{}}'); } catch (e) { threw = e instanceof TypeError; }
    assert(threw, 'not a snapshot: a TypeError, not a half-decorated object');
    const src = 'CLASS zcl_d DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n'
      + 'CLASS zcl_d IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Buttn` )->tag( `Text` )->a( n = `txt` v = `x` ).\n'
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const key = (r) => r.findings.map((x) => `${x.type}@${x.line}`).sort().join();
    const base = checkAbapSource(src, opts);
    const handed = checkAbapSource(src, { ...opts, data, prep: prepareRaw(src) });
    assert(key(base) && key(base) === key(handed), `the same findings either way (${key(base)} / ${key(handed)})`);
    const xml = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Buttn/></mvc:View>';
    assert(key(checkXmlSource(xml, { ...opts, data })) === key(checkXmlSource(xml, opts)), 'checkXmlSource too');
    // a bogus path is never read when the data is handed over
    assert(key(checkXmlSource(xml, { ...opts, data, snapshot: path.join(ROOT, 'no-such.json') })) === key(checkXmlSource(xml, opts)),
      '`data` wins over `snapshot`');
    // checkFiles judges each file by its own reconstruction, whatever `prep` says
    const dir = tempDir('a2l-prep-');
    const file = path.join(dir, 'zcl_x.view.xml');
    fs.writeFileSync(file, xml);
    const [r] = await checkFiles([file], { ...opts, prep: prepareRaw(src) });
    assert(r.findings.some((x) => x.type === 'unknown-control'), 'checkFiles ignores a `prep`');
  });

  /* ── 2. the class index covers the configured paths ──────────────────── */

  /* A popup whose public result its caller reads (`lo_pop->ms_result`) binds
   * nothing to it: unbound-public-attribute stands down when the caller is
   * in the class index. The caller here is a HELPER - no view, no app
   * interface - so a run without --all-classes never collected it, and a
   * one-file run never saw any other class at all: both reported what the
   * full run (and the editor, which indexes the workspace) silences. */
  const popup = 'CLASS zcl_pop DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + '    DATA ms_result TYPE string.\n    DATA mv_text TYPE string.\nENDCLASS.\n\n'
    + 'CLASS zcl_pop IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
    + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
    + '        )->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv_text ) )->tag( `Button` )->a( n = `text` v = `OK` )->a( n = `press` v = client->_event( `OK` ) ).\n'
    + '    client->view_display( view->stringify( ) ).\n'
    + '    IF client->get( )-event = `OK`.\n      ms_result = mv_text.\n      client->nav_app_leave( ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const helper = (read) => 'CLASS zcl_reader DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS result IMPORTING io_pop TYPE REF TO zcl_pop RETURNING VALUE(rv) TYPE string.\nENDCLASS.\n\n'
    + `CLASS zcl_reader IMPLEMENTATION.\n  METHOD result.\n    rv = io_pop->${read}.\n  ENDMETHOD.\nENDCLASS.\n`;
  const repo = () => {
    const dir = tempDir('a2l-index-');
    fs.mkdirSync(path.join(dir, 'src', 'ui'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'skip'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'ui', 'zcl_pop.clas.abap'), popup);
    fs.writeFileSync(path.join(dir, 'src', 'zcl_reader.clas.abap'), helper('ms_result'));
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "render": false }\n');
    return dir;
  };
  // the findings of the rule in a --format json report
  const unbound = (out) => {
    try {
      return JSON.parse(out).results.flatMap((r) => r.findings).filter((x) => x.type === 'unbound-public-attribute').length;
    } catch {
      return -1;
    }
  };

  section('round 2026-10-09c: the class index reads every class under the configured paths', () => {
    const dir = repo();
    const full = run(['--no-progress', '--format', 'json'], dir);
    assert(full.code !== 2 && unbound(full.out) === 0,
      `the configured run: the helper reads ms_result, nothing reported (${unbound(full.out)}, ${full.err.split('\n')[0]})`);
    const one = run(['src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir);
    assert(unbound(one.out) === 0, `a one-file run reads the same index (${unbound(one.out)})`);
    const sub = run(['src/ui', '--no-progress', '--format', 'json'], dir);
    assert(unbound(sub.out) === 0, 'a run over part of the paths too');
    const stdin = run(['--stdin', '--stdin-filename', 'src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir, popup);
    assert(unbound(stdin.out) === 0, `--stdin is judged against the repo's other classes (${unbound(stdin.out)})`);
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "allClasses": true, "render": false }\n');
    assert(unbound(run(['--stdin', '--stdin-filename', 'src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir, popup).out) === 0
      && unbound(run(['src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir).out) === 0,
      'and under allClasses, which collects the paths it indexes, a piped source and a named file still read the rest');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "render": false }\n');
    // the control: nobody reads it - reported, in every shape of run
    fs.writeFileSync(path.join(dir, 'src', 'zcl_reader.clas.abap'), helper('mv_text'));
    assert(unbound(run(['--no-progress', '--format', 'json'], dir).out) === 1 && unbound(run(['src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir).out) === 1,
      'with the read gone the finding is back, whole run and one file alike');
    // `ignore` keeps a class out of the index as it keeps it out of the run
    fs.writeFileSync(path.join(dir, 'src', 'skip', 'zcl_reader.clas.abap'), helper('ms_result'));
    assert(unbound(run(['--no-progress', '--format', 'json'], dir).out) === 0, 'a reader in another folder of the paths counts');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "ignore": ["/skip/"], "render": false }\n');
    assert(unbound(run(['src/ui/zcl_pop.clas.abap', '--no-progress', '--format', 'json'], dir).out) === 1, 'one under `ignore` does not');
    // without a config the run's own paths are the index's
    const bare = run(['--no-config', 'src', '--no-render', '--no-progress', '--format', 'json'], repo());
    assert(unbound(bare.out) === 0, `--no-config: the classes under the paths given, collected or not (${unbound(bare.out)})`);
  });

  section('round 2026-10-09c: --cache re-judges a class when a class only the index reads changes', () => {
    const dir = repo();
    const args = ['src/ui/zcl_pop.clas.abap', '--cache', '--no-progress', '--format', 'json'];
    assert(unbound(run(args, dir).out) === 0, 'first run: read from outside, silent');
    assert(unbound(run(args, dir).out) === 0, 'second run (from the cache): the same');
    fs.writeFileSync(path.join(dir, 'src', 'zcl_reader.clas.abap'), helper('mv_text'));
    assert(unbound(run(args, dir).out) === 1, 'the helper stops reading it: the cached entry is not replayed');
    fs.writeFileSync(path.join(dir, 'src', 'zcl_reader.clas.abap'), helper('ms_result'));
    assert(unbound(run(args, dir).out) === 0, 'and back');
  });

  /* ── 3. 5,000 levels ─────────────────────────────────────────────────── */

  /* Every walk over a tree recursed once per level, and the property walk
   * ran out of stack at about a thousand: `RangeError: Maximum call stack
   * size exceeded` out of the middle of a run, from the namespace scopes,
   * the main walk, toXml( ), the portable walk and the namespace stand-down
   * in turn. No real view nests that deep; a linter still may not crash on
   * its input. tree.mjs walks without recursion now. */
  const DEPTH = 5000;
  section('round 2026-10-09c: a view nested 5,000 levels deep is judged, not a RangeError', async () => {
    let chain = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:foo` v = `sap.ui.foo`\n      )->ele( `Page` )';
    for (let i = 0; i < DEPTH; i++) chain += '\n      ->ele( `VBox` )';
    chain += '\n      ->tag( `Text` )->a( n = `text` v = `x` ).\n    client->view_display( view->stringify( ) ).\n';
    const src = 'CLASS zcl_deep DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n'
      + `CLASS zcl_deep IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${chain}  ENDMETHOD.\nENDCLASS.\n`;
    const rules = { 'portable-app': 'warning', 'chain-house-layout': 'warning' };
    let r;
    let error = null;
    try { r = checkAbapSource(src, { ...opts, rules }); } catch (e) { error = e; }
    assert(!error, `the class: no exception (${error?.message})`);
    assert(r && r.stats.depth === DEPTH + 3 && r.docs[0].split('<VBox>').length === DEPTH + 1,
      `the whole document is rebuilt and profiled (depth ${r?.stats.depth})`);
    assert(r.findings.some((x) => x.type === 'unused-namespace-declaration' && x.member === 'foo'),
      'and judged: the unused declaration on the root is found below 5,000 levels of content');
    const xml = `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:foo="x.y">${'<VBox>'.repeat(DEPTH)}<Buttn/>${'</VBox>'.repeat(DEPTH)}</mvc:View>`;
    let x;
    error = null;
    try { x = checkXmlSource(xml, { ...opts, rules }); } catch (e) { error = e; }
    assert(!error, `the raw view: no exception (${error?.message})`);
    assert(x.findings.some((y) => y.type === 'unknown-control') && x.findings.some((y) => y.type === 'unused-namespace-declaration'),
      `a defect at the bottom is reported (${[...new Set(x.findings.map((y) => y.type))].join()})`);
    // the CLI end to end: the stats, the report
    const dir = tempDir('a2l-deep-');
    fs.writeFileSync(path.join(dir, 'zcl_deep.clas.abap'), src);
    fs.writeFileSync(path.join(dir, 'deep.view.xml'), xml);
    const cli = run(['--no-config', '.', '--no-render', '--format', 'json', '--no-progress'], dir);
    assert(cli.code === 1 && !/RangeError/.test(cli.err) && JSON.parse(cli.out).stats.depth >= DEPTH,
      `the CLI reports both files (exit ${cli.code}${cli.err ? `, ${cli.err.split('\n')[0]}` : ''})`);
  });

  section('round 2026-10-09c: walkTree visits in the order the recursion did', () => {
    const tree = { name: 'a', children: [
      { name: 'b', children: [{ name: 'c', children: [] }, { name: 'd', children: [] }] },
      { name: 'e', children: [{ name: 'f', children: [] }] },
    ] };
    const order = [];
    walkTree((walk, node, depth) => {
      order.push(`${node.name}${depth}`);
      for (const c of node.children) walk(c, depth + 1);
    }, tree, 0);
    assert(order.join() === 'a0,b1,c2,d2,e1,f2', `pre-order, siblings in order, state per child (${order.join()})`);
    assert([...nodesOf(tree)].map((n) => n.name).join('') === 'abcdef', 'nodesOf: the same order');
  });

  /* ── 4. an unclosed ( ends at its statement's period ─────────────────── */

  /* noteUnbalancedParens read an unclosed `(` as open to the end of the
   * file: every statement behind it ran into one, so a SECOND broken chain
   * was never reported, and a stray `)` further down was counted off
   * against the open one and vanished with it. parenRegion( ) has the rule
   * the scan lacked - a `.` before a blank ends the statement at any depth,
   * since no ABAP call reaches past one. */
  section('round 2026-10-09c: chain-unbalanced-parens ends an unclosed call at its period', () => {
    const app = (body) => 'CLASS zcl_p DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\nENDCLASS.\n'
      + `CLASS zcl_p IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${body}  ENDMETHOD.\nENDCLASS.\n`;
    const open = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( `Page`\n      )->tag( `Input` )->a( n = `value` v = client->_bind( mv_text ).\n'
      + '    client->view_display( view->stringify( ) ).\n';
    const extra = '    DATA(pop) = z2ui5_cl_ui5_view_builder=>factory( ).\n    pop->ele( `Dialog`\n      )->tag( `Text` )->a( n = `text` v = `x` ) ) ).\n'
      + '    client->popup_display( pop->stringify( ) ).\n';
    const unclosed = '    DATA(pop) = z2ui5_cl_ui5_view_builder=>factory( ).\n    pop->ele( `Dialog`\n      )->tag( `Text` )->a( n = `text` v = `x` .\n'
      + '    client->popup_display( pop->stringify( ) ).\n';
    const found = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'chain-unbalanced-parens')
      .map((x) => `${/never/.test(x.value) ? 'open' : 'extra'}@${x.line}`).join();
    const two = app(open + unclosed);
    assert(found(two) === 'open@9,open@13', `two unclosed chains: two findings, each on its statement (${found(two)})`);
    const then = app(open + extra);
    assert(found(then) === 'open@9,extra@14', `an unclosed chain does not swallow the stray ) of the next (${found(then)})`);
    assert(found(app(open)) === 'open@9', `one is one, where it always was (${found(app(open))})`);
    // a period inside a literal, a comment or a number does not end anything
    const literal = app('    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( `Page`\n      )->tag( `Text` )->a( n = `text` v = `a. b` " c. d\n      )->a( n = `width` v = `1.5rem` ).\n'
      + '    client->view_display( view->stringify( ) ).\n');
    assert(found(literal) === '', `no finding for a period in a literal or a comment (${found(literal)})`);
  });
}
