/*
 * The 2026-10-08 corpus round: what two corpora no earlier round had run
 * (abap2UI5/samples-controls with its four configs and view-gates, and
 * abap2UI5/samples with its baseline) found. See test/review/README.md for
 * the harness.
 *
 *   1. a waiver of unbound-/unused-public-attribute in a class another class
 *      of the run reads is unjudged, not an unused directive
 *   2. a name written once with a string template resolves to that template
 *   3. a CONSTANTS value resolves, a structured one as `cs-name`
 *   4. the browser's network error is not a render error of the view
 */
import fs from 'node:fs';
import path from 'node:path';

export default function ({ section, assert, tempDir, checkAbapSource, checkFiles }) {
  const opts = { render: false };

  /* ── 1. a waiver the run's other classes made redundant ──────────────── */

  /* abap2UI5/samples app 024 waives unbound-public-attribute on the
   * attribute app 025 sets from outside, with the reason in the directive.
   * The rule stands down for it when 025 is in the same run (outsideReads),
   * so the waiver suppressed nothing and came back as `unused-directive` -
   * whose deleting --fix takes out the waiver the same class still needs
   * when it is linted alone (an editor, a pre-commit hook on one file). */
  const popup = 'CLASS zcl_pop DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + '    " abap2ui5lint-disable-next-line unbound-public-attribute -- the caller reads it\n'
    + '    DATA ms_result TYPE string.\n    DATA mv_text TYPE string.\nENDCLASS.\n\n'
    + 'CLASS zcl_pop IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
    + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
    + '        )->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv_text ) )->tag( `Button` )->a( n = `text` v = `OK` )->a( n = `press` v = client->_event( `OK` ) ).\n'
    + '    client->view_display( view->stringify( ) ).\n'
    + '    IF client->get( )-event = `OK`.\n      ms_result = mv_text.\n      client->nav_app_leave( ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const caller = 'CLASS zcl_caller DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_caller IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + '    IF client->check_on_navigated( ).\n'
    + '      DATA(lo_pop) = CAST zcl_pop( client->get_app( client->get( )-s_draft-id_prev_app ) ).\n      DATA(lv) = lo_pop->ms_result.\n'
    + '      client->message_toast_display( lv ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const types = (results) => results.find((r) => r.file.endsWith('zcl_pop.clas.abap')).findings
    .filter((x) => /^(?:unbound-public-attribute|unused-public-attribute|unused-directive)$/.test(x.type)).map((x) => x.type).sort().join();

  section('corpus 2026-10-08: a waiver of the attribute rules is unjudged where the run reads the attribute', async () => {
    const dir = tempDir('a2l-waiver-');
    const P = path.join(dir, 'zcl_pop.clas.abap');
    const C = path.join(dir, 'zcl_caller.clas.abap');
    fs.writeFileSync(P, popup);
    fs.writeFileSync(C, caller);
    assert(types(await checkFiles([P], opts)) === '', `alone: the waiver suppresses the finding (${types(await checkFiles([P], opts))})`);
    const both = await checkFiles([P, C], opts);
    assert(types(both) === '', `with its reader in the run: no unused-directive either (${types(both)})`);
    // a waiver that suppresses nothing in a class nobody reads is still unused
    fs.writeFileSync(C, caller.replace('lo_pop->ms_result', 'lo_pop->mv_nothing'));
    fs.writeFileSync(P, popup.replace('ms_result = mv_text.', 'ms_result = mv_text.\n      client->_bind( ms_result ).'));
    assert(types(await checkFiles([P, C], opts)).includes('unused-directive'), 'a waiver nothing needs anywhere is still reported');
  });

  /* ── 2. a template written once ──────────────────────────────────────── */

  /* samples-controls apps 445 and 452 build one expression binding in a
   * local and hand it to every control: `DATA(expr) = |\{= ${ client->_bind(
   * flag ) } ? 'Hyphenated' : 'Normal' \}|.`, then `v = expr`. Only literal
   * assignments were followed, so the value was dropped and fifteen
   * enum-typed attributes were reported as values the gate cannot follow,
   * with every version finding on them placed on the control rather than on
   * the attribute. */
  section('corpus 2026-10-08: a name written once with a string template resolves to it', () => {
    const app = (decl) => 'CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA hyphenate TYPE abap_bool.\nENDCLASS.\n\n'
      + 'CLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + `${decl}\n`
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Switch` )->a( n = `state` v = client->_bind_edit( hyphenate ) )\n'
      + '        ->tag( `Text` )->a( n = `text` v = `Lorem` )\n'
      + '            ->a( n = `wrappingType` v = wrapping\n'
      + '        )->end( ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const expr = "    DATA(wrapping) = |\\{= ${ client->_bind( hyphenate ) } ? 'Hyphenated' : 'Normal' \\}|.";
    const r = checkAbapSource(app(expr), opts);
    const got = r.findings.map((x) => x.type).sort().join();
    assert(!got.includes('unresolved-attribute-value'), `the template is followed (${got || 'silent'})`);
    assert(r.docs.join().includes(`wrappingType="{= \${/HYPHENATE} ? 'Hyphenated' : 'Normal' }"`),
      `and the attribute carries the expression binding (${r.docs.join()})`);
    // the value is judged like any other: a template of literal text
    const typo = checkAbapSource(app('    DATA(wrapping) = |Hyphenatd|.'), opts).findings.map((x) => `${x.type}:${x.value ?? ''}`);
    assert(typo.includes('invalid-property-value:Hyphenatd'), `a literal-only template is judged (${typo.join()})`);
    // a second write makes it a variable: not followed
    const twice = checkAbapSource(app(`${expr}\n    IF hyphenate = abap_false.\n      wrapping = |Normal|.\n    ENDIF.`), opts)
      .findings.map((x) => x.type);
    assert(twice.includes('unresolved-attribute-value'), `written twice: still unresolved (${twice.join()})`);
    // a template that names itself does not loop
    const self = checkAbapSource(app('    DATA(wrapping) = |{ wrapping }x|.'), opts).findings.map((x) => x.type);
    assert(Array.isArray(self), 'a self-reference terminates');
  });
  /* ── 3. constants ────────────────────────────────────────────────────── */

  /* samples-controls app 044 keeps its image base in `CONSTANTS c_base_url
   * TYPE string VALUE \`https://…\`` and writes `t = c_base_url &&
   * \`sample1.jpg\``; demo_004 does the same with `|{ c_img }…|` and a
   * `DATA(line_break) = cl_abap_char_utilities=>newline`. None of them was
   * followed: the value was dropped, so neither the URL rules nor the
   * render gate saw what the view carries. */
  section('corpus 2026-10-08: a CONSTANTS value resolves, plain, chained and in a BEGIN OF block', () => {
    const app = (decl, v) => 'CLASS zcl_k DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + `${decl}\n`
      + 'ENDCLASS.\n\nCLASS zcl_k IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    DATA(nl) = cl_abap_char_utilities=>newline.\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `Go` )\n'
      + `            ->a( n = \`type\` v = ${v}\n`
      + '        )->tag( `Image` )->a( n = `alt` v = `x` )->a( n = `src` v = c_base && `a.jpg`\n'
      + '        )->tag( `Text` )->a( n = `text` v = |one{ nl }two|\n'
      + '        )->end( ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const run = (decl, v) => checkAbapSource(app(decl, v), opts);
    const base = '    CONSTANTS c_base TYPE string VALUE `https://example.org/img/`.';
    const plain = run(`${base}\n    CONSTANTS c_type TYPE string VALUE \`Emphasised\`.`, 'c_type');
    const kinds = (r) => r.findings.map((x) => `${x.type}:${x.value ?? ''}`).filter((x) => /property-value|unresolved/.test(x));
    assert(kinds(plain).join() === 'invalid-property-value:Emphasised', `a constant is judged like the literal it is (${kinds(plain).join()})`);
    assert(plain.docs.join().includes('src="https://example.org/img/a.jpg"'), `the && chain resolves (${plain.docs.join()})`);
    assert(plain.docs.join().includes('text="one\ntwo"') || plain.docs.join().includes('text="one&#10;two"') || plain.docs.join().includes('text="one&#xA;two"'),
      `a name written once with cl_abap_char_utilities=>newline resolves (${plain.docs.join().match(/text="one[^"]*"/)?.[0]})`);
    const chained = run('    CONSTANTS: c_base TYPE string VALUE `https://example.org/img/`,\n               c_type TYPE string VALUE `Accept`.', 'c_type');
    assert(kinds(chained).join() === '' && chained.docs.join().includes('type="Accept"'), `a chained CONSTANTS resolves (${kinds(chained).join()})`);
    const block = run(`${base}\n    CONSTANTS: BEGIN OF cs_type,\n                 ok  TYPE string VALUE \`Accept\`,\n                 bad TYPE string VALUE \`Rejekt\`,\n               END OF cs_type.`, 'cs_type-bad');
    assert(kinds(block).join() === 'invalid-property-value:Rejekt', `a BEGIN OF block resolves as cs-name (${kinds(block).join()})`);
    // a work-area field is not a constant: still dropped, still said
    const wa = run(base, 'ls_row-type');
    assert(kinds(wa).join() === 'unresolved-attribute-value:', `a structure field nothing declares stays unresolved (${kinds(wa).join()})`);
  });
  /* ── 4. a host the gate cannot reach ─────────────────────────────────── */

  /* samples-controls apps 118 and 168 give a Card a manifest on
   * sdk.openui5.org. Where that host does not answer (a sandbox, an offline
   * runner) the fetch rejects whenever the network says so - after the
   * document's window, so view-gates failed app 180, 183, 184 or 185
   * depending on the run, with "TypeError: Failed to fetch". */
  section('corpus 2026-10-08: a fetch the network refuses is not a render error', async () => {
    const dir = tempDir('a2l-fetch-');
    const file = path.join(dir, 'card.view.xml');
    fs.writeFileSync(file, '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:w="sap.ui.integration.widgets">\n'
      + '  <w:Card manifest="http://127.0.0.1:9/manifest.json" width="300px"/>\n</mvc:View>\n');
    const [r] = await checkFiles([file], { render: true });
    const errors = (r.renderErrors ?? []).map(String);
    assert(errors.length > 0, `the card without its manifest still reports what the card says (${errors.length})`);
    assert(!errors.some((e) => /Failed to fetch/.test(e)), `but not the network error itself (${errors.filter((e) => /fetch/i.test(e)).join(' | ')})`);
  });
}
