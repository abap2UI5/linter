/*
 * The 2026-09-30 round: what the abap2UI5-addons/popups migration onto 0.8.5
 * found in the two navigated rules. Every section fails on the code as it was.
 * See test/review/README.md for the harness.
 *
 *   1. missing-on-navigated-branch --fix wrote the new arm right behind the
 *      init branch, ahead of the event arms. A popup that leaves with an event
 *      (`nav_app_leave( event = … )`) raises check_on_navigated( ) AND that
 *      event on the same roundtrip, so the fixed class never received the
 *      popup's result (popups sample_05, POPUP_TRUE / POPUP_FALSE).
 *   2. The same fix copied a display statement that reads a variable the init
 *      branch declares - `client->view_display( view->stringify( ) )` next to
 *      `DATA(view) = …` - which compiles and dumps on the first hop back.
 *   3. missing-view-display-on-navigated judged the RETURN arm of a negated
 *      guard, `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.`,
 *      as the navigated branch, with the re-display standing right below it
 *      (popups z2ui5_cl_popup_search_help).
 */
import { applyFixes } from '../../lib/fix.mjs';

/* A class whose view is built in render( ); `main` is the dispatcher body and
 * `extra` more methods. `nav_app_call` somewhere in the class is what makes a
 * returning event possible. */
const app = (main, { defs = '', methods = '' } = {}) =>
  'CLASS zcl_review_nav0930 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n    METHODS render RETURNING VALUE(result) TYPE string.\n'
  + defs + 'ENDCLASS.\n\nCLASS zcl_review_nav0930 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n' + main + '  ENDMETHOD.\n\n'
  + '  METHOD render.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` )->tag( `Button` )->a( n = `text` v = client->_bind( mv_text ) )->a( n = `press` v = client->_event( `POPUP` ) )->end( ).\n'
  + '    result = view->stringify( ).\n  ENDMETHOD.\n' + methods + 'ENDCLASS.\n';

const CALL = '      client->nav_app_call( z2ui5_cl_popup_to_confirm=>factory( i_question_text = `sure?` i_event_confirm = `POPUP_TRUE` ) ).\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, of(src, type)).output;
  const NAV = 'missing-on-navigated-branch';
  const REDISPLAY = 'missing-view-display-on-navigated';

  section('round 2026-09-30: missing-on-navigated-branch --fix puts the arm behind the event arms of a class that calls other apps', () => {
    const src = app('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n'
      + '    ELSEIF client->check_on_event( `POPUP` ).\n' + CALL
      + '    ELSEIF client->check_on_event( `POPUP_TRUE` ).\n      mv_text = `confirmed`.\n    ENDIF.\n');
    const hits = of(src, NAV);
    assert(hits.length === 1 && hits[0].fixes?.length === 1, `reported with a fix (${hits.length})`);
    const out = fixed(src, NAV);
    assert(out.includes('      mv_text = `confirmed`.\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ENDIF.'),
      'the navigated arm is the LAST one - the returning POPUP_TRUE still reaches its own arm');
    assert(of(out, NAV).length === 0, 'and the finding is gone');

    // with no app called, nothing can return with an event: the arm stays where every guide writes it
    const plain = app('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_event( `POPUP` ).\n      mv_text = `x`.\n    ENDIF.\n');
    assert(fixed(plain, NAV).includes('      client->view_display( render( ) ).\n    ELSEIF client->check_on_navigated( ).\n      client->view_display( render( ) ).\n    ELSEIF client->check_on_event( `POPUP` ).'),
      'a class that calls no app keeps the arm right behind init');

    // an ELSE catch-all would be shadowed by the arm wherever it goes
    const withElse = app('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n    ELSE.\n      on_event( ).\n    ENDIF.\n',
      { defs: '    METHODS on_event.\n', methods: '  METHOD on_event.\n    IF client->check_on_event( `POPUP` ).\n' + CALL + '    ENDIF.\n  ENDMETHOD.\n' });
    const e = of(withElse, NAV);
    assert(e.length === 1 && !e[0].fixes, 'a chain ending in ELSE, in a class that calls other apps: reported, no fix');
  });

  section('round 2026-09-30: missing-on-navigated-branch --fix does not copy a display of a variable the init branch declares', () => {
    const src = app('    IF client->check_on_init( ).\n'
      + '      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '      view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` )->tag( `Button` )->a( n = `text` v = client->_bind( mv_text ) )->a( n = `press` v = client->_event( `GO` ) )->end( ).\n'
      + '      client->view_display( view->stringify( ) ).\n'
      + '    ELSEIF client->check_on_event( `GO` ).\n      mv_text = `go`.\n    ENDIF.\n');
    const hits = of(src, NAV);
    assert(hits.length === 1 && !hits[0].fixes, `reported without a fix - the copy would dereference an initial view (${hits[0]?.fixes?.length})`);
    // the same shape through a method of the class stays fixable
    const helper = app('    IF client->check_on_init( ).\n      DATA(lv_x) = 1.\n      client->view_display( render( ) ).\n    ENDIF.\n');
    assert(of(helper, NAV)[0]?.fixes?.length === 1, 'a local the display does not read does not block the fix');
  });

  section('round 2026-09-30: missing-view-display-on-navigated reads a negated guard as a guard', () => {
    const guard = (after) => app('    IF client->check_on_init( ).\n      client->view_display( render( ) ).\n    ELSE.\n      on_after( ).\n    ENDIF.\n',
      { defs: '    METHODS on_after.\n', methods: '  METHOD on_after.\n    IF client->check_on_navigated( ) = abap_false.\n      RETURN.\n    ENDIF.\n' + after + '  ENDMETHOD.\n' });
    const shown = guard('    TRY.\n        mv_text = `back`.\n        client->view_display( render( ) ).\n      CATCH cx_root.\n    ENDTRY.\n');
    assert(of(shown, REDISPLAY).length === 0, 'the re-display below the RETURN guard counts');
    const silent = guard('    mv_text = `back`.\n');
    const s = of(silent, REDISPLAY);
    assert(s.length === 1 && !s[0].fixes, 'nothing below the guard displays: still reported, without a fix into the guard');
  });
}
