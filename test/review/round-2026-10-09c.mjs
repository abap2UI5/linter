/*
 * The third 2026-10-09 round. See test/review/README.md for the harness.
 *
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
