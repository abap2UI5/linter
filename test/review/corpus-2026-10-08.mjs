/*
 * The 2026-10-08 corpus round: what two corpora no earlier round had run
 * (abap2UI5/samples-controls with its four configs and view-gates, and
 * abap2UI5/samples with its baseline) found. See test/review/README.md for
 * the harness.
 *
 *   1. a waiver of unbound-/unused-public-attribute in a class another class
 *      of the run reads is unjudged, not an unused directive
 *   2. a name written once with a string template resolves to that template
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
}
