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
 *   4. a builder handle stored in an attribute and stringified in another
 *      method is skipped as not reconstructable, not "no view reconstructed"
 *   5. a baseline that is JSON but no object gets a message, not a
 *      TypeError; --stdin refuses a path it would not read
 *   6. default-key-table (and the PUBLIC attribute reader) stay linear when
 *      no `.` or `,` follows the declarations
 *
 * Part B - modules no round had read yet:
 *   7. an xmlns declared on an inner element is scoped to that element
 *   8. `sap-icon://prefix-` && name is a prefix, not an unknown icon
 *   9. unescaped-text-in-attribute leaves `id` and `class` alone
 *  10. a raw fragment file is rendered as a fragment whatever its prolog
 *  11. action.yml: a boolean input means the same to the shell as to the
 *      `if:` expressions, and the Chromium cache is where the browser is
 *  12. popup-display-xml / popover-display-val / popover-anchor-unknown-id
 *      read the client's call, with the argument wherever it stands
 *  13. uncurated-formatter reads every alias core:require points at the
 *      curated module, and no name that merely ends in `Formatter`
 *  14. an int/float/boolean value is judged the way DataType parses it
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes } from '../../lib/fix.mjs';
import { checkIcons } from '../../lib/icons.mjs';
import { formatStylish, githubAnnotations, summarize, terminalSafe } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource, checkFiles, prepareAbap }) {
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

  /* ── 4. a handle kept in an attribute ────────────────────────────────── */

  /* abap2UI5's node/srv/zcl_tst_host (sample 338 as a fixture): the page is
   * built in view_display( ), kept in mo_main_page, a sub-app created by
   * name builds into it, and render_sub_app( ) stringifies it. The replay
   * enters only the method that opens the factory, so nothing came out and
   * the render gate failed the class with "no view reconstructed" - which
   * abap2UI5 had to waive in its config. It is skipped like the other
   * shapes a replay cannot follow now. */
  const host = 'CLASS zcl_host DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mo_app TYPE REF TO object.\n'
    + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    DATA mo_main_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n    METHODS view_display.\n    METHODS render_sub_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_host IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n    view_display( ).\n    render_sub_app( ).\n  ENDMETHOD.\n\n'
    + '  METHOD view_display.\n    DATA view TYPE REF TO z2ui5_cl_ui5_view_builder.\n    DATA page TYPE REF TO z2ui5_cl_ui5_view_builder.\n'
    + '    view = z2ui5_cl_ui5_view_builder=>factory( ).\n'
    + '    page = view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
    + '        )->ele( `Page` )->a( n = `title` v = `HOST` ).\n    mo_main_page = page.\n  ENDMETHOD.\n\n'
    + '  METHOD render_sub_app.\n    CALL METHOD mo_app->(`Z2UI5_IF_APP~MAIN`) EXPORTING client = client.\n'
    + '    client->view_display( mo_main_page->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';

  section('audit 2026-10-08c: a builder handle stringified from an attribute in another method is skipped, not failed', async () => {
    const prep = prepareAbap(host);
    assert(prep.docs.length === 0 && prep.helperTokens > 0, `no document, and the calls outside the replay are counted (${prep.helperTokens})`);
    const dir = tempDir('a2l-host-');
    const file = path.join(dir, 'zcl_host.clas.abap');
    fs.writeFileSync(file, host);
    const [r] = await checkFiles([file], { render: true });
    assert(r.skippedRender && !r.renderErrors.length, `skipped quietly (${JSON.stringify(r.renderErrors)})`);
    // a class whose replay DOES yield its document keeps its render: the
    // count stays 0 even with a builder call in a method the replay skips
    const both = host.replace('    mo_main_page = page.\n', '    mo_main_page = page.\n    client->view_display( view->stringify( ) ).\n');
    const p2 = prepareAbap(both);
    assert(p2.docs.length === 1 && p2.helperTokens === 0, `a reconstructed document is rendered as before (${p2.docs.length} / ${p2.helperTokens})`);
  });

  /* ── 5. baseline shape, --stdin with a path ──────────────────────────── */

  section('audit 2026-10-08c: a baseline that is null, a number or an array is refused by name', () => {
    const dir = tempDir('a2l-blnull-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    for (const [text, got] of [['null', 'null'], ['5', 'number'], ['[]', 'an array'], ['"x"', 'string']]) {
      fs.writeFileSync(path.join(dir, 'bl.json'), text);
      const r = run(['good.clas.abap', '--no-render', '--no-config', '--baseline', 'bl.json'], dir);
      assert(r.code === 2 && /bl\.json: not a valid baseline file - expected a JSON object/.test(r.err) && r.err.includes(`got ${got}`)
        && !/Cannot read properties/.test(r.err), `${text}: exit 2, the file and what it should hold (${r.err.trim()})`);
    }
  });

  section('audit 2026-10-08c: --stdin refuses a path it would not read', () => {
    const dir = tempDir('a2l-stdinpath-');
    const src = fs.readFileSync(f('good.clas.abap'), 'utf8');
    fs.writeFileSync(path.join(dir, 'bad.view.xml'), '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Buttonn/></mvc:View>');
    const r = run(['--stdin', 'bad.view.xml', '--no-config'], dir, src);
    assert(r.code === 2 && /--stdin lints the source piped to it, not 'bad\.view\.xml'/.test(r.err) && /--stdin-filename/.test(r.err),
      `exit 2 and the way out, instead of a green report on a file never read (${r.code}: ${r.err.trim()})`);
    const ok = run(['--stdin', '--stdin-filename', 'bad.view.xml', '--no-config'], dir, src);
    assert(ok.code === 0, `--stdin-filename is the spelling (${ok.code})`);
  });

  /* ── 6. linear without a terminator ──────────────────────────────────── */

  /* The 08b round made default-key-table linear for declarations that end;
   * with no `.` or `,` behind them each one still searched - and the PUBLIC
   * attribute reader still sliced - to the end of the file: 20,000 took 3.5
   * seconds through checkAbapSource, 80,000 most of a minute. */
  section('audit 2026-10-08c: declarations with no terminator behind them are read in linear time', () => {
    const body = (n) => Array.from({ length: n }, (_, i) => `    DATA t${i} TYPE TABLE OF string`).join('\n');
    const src = (n) => `CLASS zcl_x DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${body(n)}\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n`;
    const time = (n) => {
      const t = Date.now();
      const found = checkAbapSource(src(n), opts).findings.filter((x) => x.type === 'default-key-table');
      return { ms: Date.now() - t, found };
    };
    time(2000); // warm
    const small = time(10000);
    const big = time(40000);
    assert(big.found.length === 40000 && big.found[0].member === 't0' && big.found.at(-1).member === 't39999',
      `every declaration under its own name (${big.found.length})`);
    assert(big.ms < 8000 && big.ms < small.ms * 4 * 2.5 + 200, `four times the input, about four times the time (${small.ms} ms -> ${big.ms} ms)`);
    // a key clause still counts for its own element only
    const mixed = checkAbapSource('CLASS zcl_x DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    DATA a TYPE TABLE OF i WITH EMPTY KEY\n    DATA b TYPE TABLE OF i\n    DATA c TYPE TABLE OF i WITH DEFAULT KEY.\n    DATA d TYPE TABLE OF i.\n'
      + 'ENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n', opts)
      .findings.filter((x) => x.type === 'default-key-table').map((x) => x.member);
    assert(mixed.join() === 'd', `an element up to its terminator carries a key if any part of it does, as before (${mixed.join()})`);
  });

  /* ── 7. namespace scope ──────────────────────────────────────────────── */

  /* Every xmlns of the document went into one map, the last declaration
   * winning: `<VBox xmlns="sap.ui.layout.form">` inside a sap.m Page made the
   * Page above it and the Panel beside it sap.ui.layout.form controls, both
   * "does not exist - typo?". And a prefix declared in one subtree counted
   * as declared in another, where the browser refuses the document. */
  section('audit 2026-10-08c: an xmlns on an inner element binds that element and its subtree only', () => {
    const view = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">\n  <Page title="x">\n    <content>\n'
      + '      <f:SimpleForm xmlns:f="sap.ui.layout.form" xmlns="sap.ui.core"><f:content><Title text="t"/></f:content></f:SimpleForm>\n'
      + '      <Panel xmlns:l="sap.ui.layout"><l:Grid defaultSpan="XL1"/></Panel>\n'
      + '      <Text text="after"/>\n'
      + '    </content>\n  </Page>\n</mvc:View>\n';
    const got = checkXmlSource(view, { ...opts, file: 'ns.view.xml' }).findings.map((x) => `${x.type}:${x.control ?? ''}`);
    assert(!got.some((t) => /^unknown-control/.test(t)), `Page, Panel and Text stay sap.m, Title is sap.ui.core (${got.join() || 'silent'})`);
    const outside = view.replace('<Text text="after"/>', '<l:Grid/>');
    const got2 = checkXmlSource(outside, { ...opts, file: 'ns.view.xml' }).findings.map((x) => `${x.type}:${x.member ?? ''}`);
    assert(got2.includes('undeclared-namespace:l'), `l: used outside the Panel that declares it (${got2.join()})`);
  });

  /* ── 8. an icon prefix joined with && ────────────────────────────────── */

  /* `|sap-icon://status-{ code }|` already names its glyph at runtime and is
   * not judged; the backtick spelling of the same prefix was reported as the
   * glyph `status-`. */
  section('audit 2026-10-08c: a sap-icon:// literal joined with && is a prefix, not a glyph', () => {
    const t = (src) => checkIcons(src).map((x) => `${x.type}:${x.value}`).join();
    assert(t('v = `sap-icon://status-` && lv_code') === '', 'a backtick prefix: silent');
    assert(t("v = 'sap-icon://status-' && lv_code") === '', 'a quoted one too');
    assert(t('v = `sap-icon://statusx` ).') === 'unknown-icon:statusx', 'a whole literal is still judged');
    assert(t('v = lv_base && `sap-icon://statusx`') === 'unknown-icon:statusx', 'and so is one that ENDS a concatenation');
    assert(checkIcons('<Icon src="sap-icon://statusx" />` && x', { xml: true }).length === 1, 'raw XML has no && to read');
  });

  /* ── 9. id and class are taken verbatim ──────────────────────────────── */

  /* The XMLTemplateProcessor hands `id` to getId( ) and `class` to
   * addStyleClass( ) and parses neither for a binding, so a brace in them
   * is no binding mistaken for text - and the fix (`t =`) wrote a
   * backslash into the id or the class token. */
  section('audit 2026-10-08c: unescaped-text-in-attribute leaves id and class alone', () => {
    const app = (n) => 'CLASS zcl_v DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\nENDCLASS.\n\n'
      + 'CLASS zcl_v IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(lv_css) = to_lower( mv_text ).\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + `        )->ele( \`Page\` )->tag( \`Text\` )->a( n = \`${n}\` v = lv_css ).\n`
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const hit = (n) => checkAbapSource(app(n), opts).findings.filter((x) => x.type === 'unescaped-text-in-attribute').length;
    assert(hit('text') === 1, 'text: reported, as before');
    assert(hit('class') === 0 && hit('id') === 0, `class and id: silent (${hit('class')} / ${hit('id')})`);
  });

  /* ── 10. a fragment file is loaded as a fragment ─────────────────────── */

  /* The renderer sniffed `^<core:FragmentDefinition`: a .fragment.xml that
   * opened with an XML declaration or a comment, wrote FragmentDefinition in
   * the default namespace, or had a bare control as root (which the rule
   * text itself calls legitimate) went through XMLView.create and failed
   * with "XMLView's root node must be 'View'". The file name decides now,
   * and the sniff reads past the prolog and any prefix. */
  section('audit 2026-10-08c: a raw fragment file renders as a fragment, whatever its prolog or root', async () => {
    const dir = tempDir('a2l-frag-');
    const body = '<core:FragmentDefinition xmlns="sap.m" xmlns:core="sap.ui.core">\n  <Dialog title="x"><Text text="y"/></Dialog>\n</core:FragmentDefinition>\n';
    const files = {
      'prolog.fragment.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a dialog -->\n${body}`,
      'default.fragment.xml': '<FragmentDefinition xmlns="sap.ui.core" xmlns:m="sap.m">\n  <m:Dialog title="x"><m:Text text="y"/></m:Dialog>\n</FragmentDefinition>\n',
      'bare.fragment.xml': '<m:Dialog xmlns:m="sap.m" title="x"><m:Text text="y"/></m:Dialog>\n',
      'sniffed.xml': `﻿<?xml version="1.0"?>\n${body}`,
      'prolog.view.xml': '<?xml version="1.0"?>\n<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Text text="v"/></mvc:View>\n',
    };
    const paths = Object.entries(files).map(([name, text]) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; });
    const results = await checkFiles(paths, { render: true });
    for (const r of results) {
      assert(!r.renderErrors.length, `${path.basename(r.file)}: renders clean (${r.renderErrors.join(' | ')})`);
    }
    // and a view file is still a view: a fragment body under that name fails
    const wrong = path.join(dir, 'wrong.view.xml');
    fs.writeFileSync(wrong, body);
    const [w] = await checkFiles([wrong], { render: true });
    assert(w.renderErrors.some((e) => /root node must be 'View'/.test(e)), `wrong.view.xml: loaded as the view it claims to be (${w.renderErrors.join(' | ')})`);
  });

  /* ── 11. action.yml ──────────────────────────────────────────────────── */

  /* GitHub compares strings in an `if:` case-insensitively, the shell does
   * not: `render: False` skipped the runtime install (the expression saw
   * 'false') and then ran the gate anyway (the shell did not), and
   * `annotations: False` annotated. The lint step's own script, run under
   * bash against a stand-in cli.mjs that records its argv. */
  section('audit 2026-10-08c: action.yml reads a boolean input the way its if: expressions do', () => {
    const ROOT = path.join(FIX, '..', '..');
    const action = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
    const lines = action.split('\n');
    const at = lines.findIndex((l) => /^\s*id: lint\s*$/.test(l));
    const runAt = lines.findIndex((l, i) => i > at && /^\s*run: \|\s*$/.test(l));
    const indent = lines[runAt].match(/^\s*/)[0].length;
    const body = [];
    for (let j = runAt + 1; j < lines.length && !(lines[j].trim() && lines[j].match(/^\s*/)[0].length <= indent); j++) body.push(lines[j]);
    const script = body.map((l) => l.slice(indent + 2)).join('\n');
    const dir = tempDir('a2l-action-');
    fs.writeFileSync(path.join(dir, 'cli.mjs'), "import fs from 'node:fs';\nfs.writeFileSync(process.env.ARGV_OUT, JSON.stringify(process.argv.slice(2)));\n");
    const argv = (env) => {
      const out = path.join(dir, 'argv.json');
      const r = cp.spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, ACTION_PATH: dir, RUNNER_TEMP: dir, GITHUB_OUTPUT: path.join(dir, 'out.txt'), ARGV_OUT: out,
          LINT_PATHS: 'src', LINT_RENDER: 'true', LINT_ANNOTATIONS: 'true', ...env },
      });
      assert(r.status === 0, `the step runs (${r.stderr})`);
      return JSON.parse(fs.readFileSync(out, 'utf8'));
    };
    assert(!argv({}).includes('--no-render') && !argv({}).includes('--no-annotate'), 'the defaults pass neither');
    for (const v of ['false', 'False', 'FALSE']) {
      const a = argv({ LINT_RENDER: v, LINT_ANNOTATIONS: v });
      assert(a.includes('--no-render') && a.includes('--no-annotate'), `${v}: --no-render and --no-annotate (${a.join(' ')})`);
    }

    /* The browser cache: Playwright's default directory is ~/.cache only on
     * Linux, so on Windows and macOS the cache step saved nothing. One
     * PLAYWRIGHT_BROWSERS_PATH now, the same on every step that installs or
     * launches Chromium and on the cache. */
    const cachePath = action.match(/name: Cache the Chromium build[\s\S]*?path: (\S+)/)[1];
    const steps = action.split(/\n {4}- /).filter((st) => /playwright install|cli\.mjs/.test(st) && /shell: bash/.test(st));
    assert(steps.length === 3, `three steps run Chromium or may (${steps.length})`);
    for (const st of steps) {
      const name = st.match(/name: (.*)/)?.[1];
      assert(st.match(/PLAYWRIGHT_BROWSERS_PATH: (\S+)/)?.[1] === cachePath, `${name}: PLAYWRIGHT_BROWSERS_PATH is the cached ${cachePath}`);
    }
    assert(!cachePath.startsWith('~'), `the cache path is the runner's, not Linux's default (${cachePath})`);
  });

  /* ── 12. the display calls, read as client calls ─────────────────────── */

  /* Three rules matched `popup_display\s*\(\s*xml =` / `popover_display\s*\(`
   * on the text: an app's own `my_popup_display( xml = … )` was reported and
   * "fixed" into a call its signature refuses, and the wrong argument went
   * unseen as soon as it was not the first one. */
  section('audit 2026-10-08c: the display-call rules read the client call, the argument wherever it stands', () => {
    const mk = (stmt) => 'CLASS zcl_p DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    METHODS my_popup_display IMPORTING xml TYPE string.\n    METHODS my_popover_display IMPORTING val TYPE string by_id TYPE string.\nENDCLASS.\n'
      + 'CLASS zcl_p IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Button` )->a( n = `id` v = `btn` )->a( n = `text` v = `t` ).\n'
      + `    client->view_display( view->stringify( ) ).\n    ${stmt}\n  ENDMETHOD.\n`
      + '  METHOD my_popup_display.\n  ENDMETHOD.\n  METHOD my_popover_display.\n  ENDMETHOD.\nENDCLASS.\n';
    const run1 = (stmt) => {
      const src = mk(stmt);
      const found = checkAbapSource(src, opts).findings.filter((x) => /^(popup-display-xml|popover-display-val|popover-anchor-unknown-id)$/.test(x.type));
      return { types: found.map((x) => x.type).sort().join(), fixed: applyFixes(src, found).output };
    };
    assert(run1('my_popup_display( xml = `x` ).').types === '', 'an own method named *popup_display: silent');
    assert(run1('my_popover_display( val = `x` by_id = `nope` ).').types === '', 'an own method named *popover_display: silent');
    const a = run1('client->popup_display( xml = `x` ).');
    assert(a.types === 'popup-display-xml' && a.fixed.includes('client->popup_display( val = `x` )'), `the client's call: reported and fixed (${a.types})`);
    const b = run1('client->popover_display( by_id = `btn` val = `x` ).');
    assert(b.types === 'popover-display-val' && b.fixed.includes('popover_display( by_id = `btn` xml = `x` )'), `val behind by_id: reported and fixed (${b.types})`);
    const c = run1('client->popover_display( xml = `x` by_id = `Btn` ).');
    assert(c.types === 'popover-anchor-unknown-id' && c.fixed.includes('by_id = `btn`'), `the anchor id, as before (${c.types})`);
    assert(run1('DATA(lv) = `client->popover_display( val = 1 )`.').types === '', 'a call written inside a literal is text');
  });

  /* ── 13. formatter aliases ───────────────────────────────────────────── */

  /* Only the alias spelled `Formatter` was judged: `core:require="{ Fmt:
   * 'z2ui5/model/formatter' }"` and `formatter: 'Fmt.round2DP'` names the
   * same removed function and went unseen. And the expression form matched
   * `myFormatter.round2DP(` - a name that only ends in Formatter. */
  section('audit 2026-10-08c: uncurated-formatter reads every alias of the curated module', () => {
    const view = (req, text) => `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:core="sap.ui.core"${req ? ` core:require="${req}"` : ''}>\n`
      + `  <Page title="x"><content><Text text="${text}"/></content></Page>\n</mvc:View>\n`;
    const hits = (req, text) => checkXmlSource(view(req, text), { ...opts, file: 'f.view.xml' }).findings
      .filter((x) => x.type === 'uncurated-formatter').map((x) => `${x.value}${x.suggestion ? `>${x.suggestion}` : ''}`).join();
    const REQ = "{ Fmt: 'z2ui5/model/formatter' }";
    assert(hits(REQ, "{ path: '/D', formatter: 'Fmt.round2DP' }") === 'round2DP', 'an alias of another name: judged');
    assert(hits(REQ, "{ path: '/D', formatter: 'Fmt.dateCreateObject' }") === 'dateCreateObject>Fmt.DateCreateObject', 'with the did-you-mean in its own spelling');
    assert(hits(REQ, "{ path: '/D', formatter: 'Fmt.DateCreateObject' }") === '', 'a curated name: silent');
    assert(hits(REQ, '{= Fmt.round2DP(${/D}) }') === 'round2DP', 'the expression form too');
    assert(hits("{ Fmt: 'my/own/module' }", "{ path: '/D', formatter: 'Fmt.anything' }") === '', 'an alias of another module: not ours to know');
    assert(hits('', '{= myFormatter.round2DP(${/D}) }') === '', 'a name that only ends in Formatter is not the alias');
    assert(hits('', "{ path: '/D', formatter: 'z2ui5.Formatter.round2DP' }") === 'round2DP', 'the global, as before');
    assert(hits('', "{ path: '/D', formatter: 'Formatter.round2DP' }") === 'round2DP', 'the conventional alias, as before');
  });

  /* ── 14. numbers as UI5 reads them ───────────────────────────────────── */

  /* `^[+-]?\d+(\.\d+)?$` was the numeric check: `.5`, `5.` and `1e3` - all
   * numbers to DataType's Number( ) - were reported, `10.5` on an int was
   * not (Number.isInteger refuses it), and the empty value a LOOP variable
   * reconstructs to was reported as the author's. */
  section('audit 2026-10-08c: an int, float or boolean value is judged the way DataType parses it', () => {
    const view = (attrs) => `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Page title="x"><content>${attrs}</content></Page></mvc:View>`;
    const bad = (attrs) => checkXmlSource(view(attrs), { ...opts, file: 'n.view.xml' }).findings
      .filter((x) => x.type === 'invalid-property-value').map((x) => `${x.member}=${x.value}`).join();
    assert(bad('<Slider value=".5" max="1e3" step="5." min=" -2 "/>') === '', 'float: every spelling Number( ) reads is a number');
    assert(bad('<Slider value="1,5"/>') === 'value=1,5', 'float: a comma is not');
    assert(bad('<Input value="{/V}" maxLength="1e1"/>') === '', 'int: 1e1 is the integer 10');
    assert(bad('<Input value="{/V}" maxLength="10.5"/>') === 'maxLength=10.5', 'int: 10.5 is no integer');
    assert(bad('<Input value="{/V}" maxLength=""/><Button text="a" enabled=""/>') === '', 'empty: NaN for a number, false for a boolean');
    assert(bad('<Button text="a" enabled="True"/>') === 'enabled=True', 'a boolean spelt otherwise: as before');
    // a value the reconstruction guessed from a LOOP variable is not judged
    const src = 'CLASS zcl_n DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    TYPES: BEGIN OF ty_s, len TYPE i, on TYPE abap_bool, END OF ty_s.\n    DATA mt TYPE STANDARD TABLE OF ty_s WITH EMPTY KEY.\n    DATA mv TYPE string.\nENDCLASS.\n'
      + 'CLASS zcl_n IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    DATA(page) = view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n        )->ele( `Page` ).\n'
      + '    LOOP AT mt INTO DATA(ls).\n      page->tag( `Input` )->a( n = `value` v = client->_bind( mv ) )->a( n = `maxLength` v = |{ ls-len }| ).\n    ENDLOOP.\n'
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const guessed = checkAbapSource(src, opts).findings.filter((x) => x.type === 'invalid-property-value');
    assert(!guessed.length, `a guessed value: silent (${guessed.map((x) => `${x.member}=${x.value}`).join()})`);
  });
}
