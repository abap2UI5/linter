/*
 * The 2026-10-08 audit, third round: the candidates the second one left, and
 * what a read of the modules no round had covered yet found. See
 * test/review/README.md for the harness.
 *
 *   1. the stylish report prints no control character out of the source
 *   2. a COND / SWITCH of literals is judged branch by branch, not reported
 *      as a value the gate cannot follow
 *   3. a PUBLIC attribute another class of the run reads from outside is not
 *      unbound (nor unused) - and the cache knows the cross-file fact
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes } from '../../lib/fix.mjs';
import { formatStylish, githubAnnotations, summarize, terminalSafe } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource, checkFiles }) {
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

  /* ── 3. read from outside ────────────────────────────────────────────── */

  /* A popup hands its result back through a PUBLIC attribute the caller
   * reads (`CAST zcl_pop( client->get_app( … ) )->ms_result`): unbound by
   * construction, and the rule's own text says no single source can see the
   * caller. A run that holds the caller sees it now. */
  const popup = 'CLASS zcl_pop DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + '    DATA ms_result TYPE string.\n    DATA mv_spare TYPE string.\n    DATA mv_text TYPE string.\nENDCLASS.\n\n'
    + 'CLASS zcl_pop IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
    + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
    + '        )->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv_text ) )->tag( `Button` )->a( n = `text` v = `OK` )->a( n = `press` v = client->_event( `OK` ) ).\n'
    + '    client->view_display( view->stringify( ) ).\n'
    + '    IF client->get( )-event = `OK`.\n      ms_result = mv_text.\n      client->nav_app_leave( ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const caller = (read) => 'CLASS zcl_caller DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_caller IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + '    IF client->check_on_navigated( ).\n'
    + `      DATA(lo_pop) = CAST zcl_pop( client->get_app( client->get( )-s_draft-id_prev_app ) ).\n      DATA(lv) = lo_pop->${read}.\n`
    + '      client->message_toast_display( lv ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const hits = (results, type) => results.find((r) => r.file.endsWith('zcl_pop.clas.abap')).findings
    .filter((x) => x.type === type).map((x) => x.member).sort().join();

  section('audit 2026-10-08c: a PUBLIC attribute another class of the run reads is not unbound', async () => {
    const dir = tempDir('a2l-outside-');
    const P = path.join(dir, 'zcl_pop.clas.abap');
    const C = path.join(dir, 'zcl_caller.clas.abap');
    fs.writeFileSync(P, popup);
    fs.writeFileSync(C, caller('ms_result'));
    assert(hits(await checkFiles([P], opts), 'unbound-public-attribute') === 'ms_result', 'alone: the result attribute is reported');
    assert(hits(await checkFiles([P, C], opts), 'unbound-public-attribute') === '', 'with its caller in the run: silent');
    assert(hits(await checkFiles([P, C], opts), 'unused-public-attribute') === 'mv_spare', 'unused: the attribute nothing reads still is');
    fs.writeFileSync(C, caller('mv_spare'));
    const both = await checkFiles([P, C], opts);
    assert(hits(both, 'unused-public-attribute') === '' && hits(both, 'unbound-public-attribute') === 'ms_result',
      `a read of the unused one silences that one only (${hits(both, 'unused-public-attribute')} / ${hits(both, 'unbound-public-attribute')})`);
    // a read through a class the reader never names is somebody else's attribute
    fs.writeFileSync(C, caller('ms_result').replace('CAST zcl_pop(', 'CAST z2ui5_if_app('));
    assert(hits(await checkFiles([P, C], opts), 'unbound-public-attribute') === 'ms_result', 'a reader that never names the class does not count');
    // ...nor one that names it and reaches `->ms_result` of ANOTHER object
    // (popups' get_range_m: CAST to the popup, its own r_result->ms_result)
    fs.writeFileSync(C, caller('ms_result').replace('DATA(lv) = lo_pop->ms_result.', 'DATA(lv) = lo_pop->result( ).\n      DATA(lo_me) = NEW zcl_caller( ).\n      lo_me->ms_result = lv.'));
    assert(hits(await checkFiles([P, C], opts), 'unbound-public-attribute') === 'ms_result', 'the receiver has to be typed as the class');
    // the other spellings of a typed receiver
    for (const [what, body] of [
      ['TYPE REF TO, written', 'DATA lo_p TYPE REF TO zcl_pop.\n      lo_p ?= client->get_app( `x` ).\n      lo_p->ms_result = `y`.'],
      ['a static factory', 'DATA(lo_p) = zcl_pop=>factory( ).\n      DATA(lv) = lo_p->ms_result.'],
      ['the cast itself', 'DATA(lv) = CAST zcl_pop( client->get_app( `x` ) )->ms_result.'],
      ['an attribute, through me->', 'DATA(lv) = me->mo_pop->ms_result.'],
    ]) {
      const src = caller('ms_result').replace(/      DATA\(lo_pop\)[^\n]*\n      DATA\(lv\) = lo_pop->ms_result\./, `      ${body}`)
        .replace('INTERFACES z2ui5_if_app.\n', 'INTERFACES z2ui5_if_app.\n    DATA mo_pop TYPE REF TO zcl_pop.\n');
      assert(src.includes(body.split('\n')[0]) && !src.includes('lo_pop->ms_result'), `${what}: the variant is written`);
      fs.writeFileSync(C, src);
      assert(hits(await checkFiles([P, C], opts), 'unbound-public-attribute') === '', `${what}: silent`);
    }

    // --cache: the popup's stored result is keyed on what the caller reads
    const ARGS = ['.', '--no-render', '--no-config', '--cache', '--json', '--no-progress'];
    const cached = () => {
      const doc = JSON.parse(run(ARGS, dir).out);
      return hits(doc.results, 'unbound-public-attribute');
    };
    fs.writeFileSync(C, caller('ms_result'));
    assert(cached() === '', 'cold, with the read: silent');
    fs.writeFileSync(C, caller('mv_spare'));
    assert(cached() === 'ms_result', 'the caller stops reading it: the CACHED popup is judged again');
    fs.writeFileSync(C, caller('ms_result'));
    assert(cached() === '', 'and back');
  });
}
