/*
 * The 2026-10-08 audit, third round: the candidates the second one left, and
 * what a read of the modules no round had covered yet found. See
 * test/review/README.md for the harness.
 *
 *   1. the stylish report prints no control character out of the source
 *   2. a COND / SWITCH of literals is judged branch by branch, not reported
 *      as a value the gate cannot follow
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes } from '../../lib/fix.mjs';
import { formatStylish, githubAnnotations, summarize, terminalSafe } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const opts = { render: false };
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd, input) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. terminal injection ───────────────────────────────────────────── */

  /* A message quotes the source, and the file under review is not trusted:
   * an ESC in a property value went to the reviewer's terminal raw - an
   * escape SEQUENCE that clears, retitles or recolours it, or hides the line.
   * The stylish report and the annotations print it as a visible \xNN. */
  section('audit 2026-10-08c: the stylish report prints no control character from the source', () => {
    const xml = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Button type="\u001b]0;pwned\u0007\u001b[2J\u009b31m‮" text="x"/></mvc:View>';
    const r = checkXmlSource(xml, { ...opts, file: 'esc.view.xml' });
    assert(r.findings.some((x) => x.type === 'invalid-property-value' && x.message.includes('\u001b')),
      'the finding quotes the value as written (the JSON keeps it)');
    const text = formatStylish([r], summarize([r]), { color: false });
    assert(!/[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/.test(text),
      `no control character reaches the stylish report (${JSON.stringify(text.split('\n')[1])})`);
    assert(text.includes('type="\\x1B]0;pwned\\x07\\x1B[2J\\x9B31m\\u202E"'), 'each one is shown, visibly');
    const ann = githubAnnotations([r]).join('\n');
    assert(!/[\u001b\u0007\u009b‮]/.test(ann), 'nor an annotation');
    assert(terminalSafe('a\tb\r\nc') === 'a b  c', 'a tab or line break is a blank: the stylish line stays one line');
    assert(terminalSafe('Grüße – ok') === 'Grüße – ok', 'printable text is untouched');

    // the CLI end to end, with a file NAME that carries one too
    const dir = tempDir('a2l-esc-');
    fs.writeFileSync(path.join(dir, 'e\u001b[1mvil.view.xml'), xml);
    const out = run(['.', '--no-render', '--no-config', '--no-progress', '--verbose'], dir);
    assert(!/[\u001b\u0007\u009b]/.test(out.out) && /e\\x1B\[1mvil\.view\.xml/.test(out.out),
      `the CLI's stdout carries none, the path included (${JSON.stringify(out.out.split('\n')[0])})`);
  });

  /* ── 2. literal branches ─────────────────────────────────────────────── */

  /* `COND #( WHEN n = 1 THEN `Emphasized` ELSE `Default` )` has a closed set
   * of values, and abap-cloud-gui writes exactly that on a Button type and a
   * SWITCH of three literals on a MessageItem type: both were reported as a
   * value the gate cannot follow. Each branch is judged like a literal now. */
  section('audit 2026-10-08c: a COND or SWITCH of literals is judged branch by branch', () => {
    const app = (v, verb = 'v') => 'CLASS zcl_c DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\nCLASS zcl_c IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    DATA(n) = 1.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `Go` )\n'
      + `            ->a( n = \`type\` ${verb} = ${v}\n`
      + '        )->end( ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const types = (v, verb) => checkAbapSource(app(v, verb), opts).findings
      .filter((x) => /invalid-property-value|unresolved-attribute-value/.test(x.type)).map((x) => `${x.type}:${x.value ?? ''}`).sort();
    const same = (v, want, verb) => {
      const got = types(v, verb);
      assert(JSON.stringify(got) === JSON.stringify(want), `${v} -> ${want.join() || 'silent'} (${got.join() || 'silent'})`);
    };
    same('COND #( WHEN n = 1 THEN `Emphasized` ELSE `Default` )', []);
    same('COND #( WHEN n = 1 THEN `Emphasised` ELSE `Default` )', ['invalid-property-value:Emphasised']);
    same("SWITCH #( n WHEN 1 THEN `Accept` WHEN 2 THEN 'Reject' ELSE `Bogus` )", ['invalid-property-value:Bogus']);
    same('SWITCH string( n\n                WHEN 1 THEN `Accept`\n                ELSE `Reject` )', []);
    same('COND #( WHEN n = 1 THEN `Accept` WHEN n = 2 THEN THROW zcx_x( ) ELSE `Reject` )', []);
    same('COND #( WHEN n = 1 THEN `Accept` ELSE COND #( WHEN n = 2 THEN `Nope` ELSE `Reject` ) )', ['invalid-property-value:Nope']);
    same('COND #( WHEN n = 1 THEN `Accept` ELSE `Reject` ) ##NO_TEXT', []);
    same('COND #( WHEN n = 1 THEN `Accept` ELSE `Reject` )', [], 't');
    // still a blind spot: no ELSE (the initial value is a value too), a
    // branch nothing resolves, a LET, anything after the closing paren
    same('COND #( WHEN n = 1 THEN `Accept` )', ['unresolved-attribute-value:']);
    same('COND #( WHEN n = 1 THEN `Accept` ELSE mv_type )', ['unresolved-attribute-value:']);
    same('COND #( LET x = `Accept` IN WHEN n = 1 THEN x ELSE `Reject` )', ['unresolved-attribute-value:']);
    same('COND #( WHEN n = 1 THEN `Accept` ELSE `Reject` ) && mv_suffix', ['unresolved-attribute-value:']);
    // a branch's word inside a literal or a nested call is no branch
    same('COND #( WHEN n = 1 THEN `ELSE` ELSE `Reject` )', ['invalid-property-value:ELSE']);

    // the case-only did-you-mean still lands on the literal inside the COND
    const src = app('COND #( WHEN n = 1 THEN `emphasized` ELSE `Default` )');
    const r = checkAbapSource(src, { ...opts, file: 'zcl_c.clas.abap' });
    const out = applyFixes(src, r.findings).output;
    assert(out.includes('THEN `Emphasized` ELSE `Default`'), `--fix repairs the branch (${/COND.*\)/.exec(out)?.[0]})`);
    assert(!r.notes.some((n) => /unresolved value expression dropped: `/.test(n)), 'a branch attempt leaves no note of its own');
  });
}
