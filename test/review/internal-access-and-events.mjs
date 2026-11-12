/*
 * Review round 2026-11-10 - one rule extended, one rule added and one event
 * source the handler check did not know: `ui5-internal-access` reading the
 * private fields a client expression walks (`$event.oSource.sId`),
 * `bind-path-flag` (`_bind( val = x path = abap_true )` where
 * `_bind_path( x )` says the same) and `handler-without-event` reading the
 * third t_arg of CROSS_APP_NAV_GET_LINKS as a raised event (samples-stack
 * app 026), plus `close-only-roundtrip`: an event whose branch only closes
 * the popup or popover. See test/review/README.md for the harness.
 */
import { applyFixes } from '../../lib/fix.mjs';

/* A complete app class around one main( ): `main` before the view is built,
 * `attrs` on the view's Button, `methods` after main( ). */
const frame = ({ main = '', attrs = '', methods = '' } = {}) =>
  'CLASS zcl_review_round1110 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + '    DATA mt_rows TYPE string_table.\n'
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_round1110 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + main
  + '\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page`\n'
  + '          )->a( n = `id` v = `mainPage`\n'
  + '          )->tag( `Button`\n'
  + '            )->a( n = `text` v = client->_bind( mv_text )\n'
  + attrs
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + methods
  + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src) => applyFixes(src, judge(src)).output;

  // ------------------------------------------------ 1. ui5-internal-access

  section('ui5-internal-access: a private field read in an event argument, fixed to its getter', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( val = `PRESS` t_arg = VALUE #( ( `$event.oSource.sId` )\n'
        + '                                                            ( `$event.oSource.getBindingContext().getPath()` )\n'
        + '                                                            ( `$event.mParameters` ) ) )\n',
      main: '    IF client->check_on_event( `PRESS` ).\n    ENDIF.\n',
    });
    const hits = of(src, 'ui5-internal-access').map((x) => x.value);
    assert(hits.join() === 'oSource,sId,oSource,mParameters', `every private field, none of the method calls (${hits.join()})`);
    const out = fixed(src);
    assert(out.includes('`$event.getSource().getId()`') && out.includes('`$event.getSource().getBindingContext().getPath()`')
      && out.includes('`$event.getParameters()`'), 'each field became its public getter');
    assert(of(out, 'ui5-internal-access').length === 0, 'and the fixed class is clean');
  });

  section('ui5-internal-access: an unknown private field is reported without a fix', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( val = `PRESS` arg = `$event.getSource().sParentAggregationName` )\n',
      main: '    IF client->check_on_event( `PRESS` ).\n    ENDIF.\n',
    });
    const hits = of(src, 'ui5-internal-access');
    assert(hits.length === 1 && hits[0].value === 'sParentAggregationName' && !hits[0].fixes, 'reported, no getter guessed');
  });

  section('ui5-internal-access: a literal that is no client expression is prose', () => {
    const src = frame({
      main: '    client->message_toast_display( `Read e.oSource.sId - it is private` ).\n',
    });
    assert(of(src, 'ui5-internal-access').length === 0, 'no $event, no ${ - not judged');
  });

  // ------------------------------------------------ 2. bind-path-flag

  section('bind-path-flag: val plus path = abap_true becomes _bind_path( )', () => {
    const src = frame({
      attrs: "            )->a( n = `items` v = |\\{ path: '{ client->_bind( val = mt_rows path = abap_true ) }', templateShareable: false \\}|\n",
    });
    const hits = of(src, 'bind-path-flag');
    assert(hits.length === 1 && hits[0].member === 'mt_rows', `reported once (${hits.length})`);
    const out = fixed(src);
    assert(out.includes("'{ client->_bind_path( mt_rows ) }'") && of(out, 'bind-path-flag').length === 0, 'rewritten, and clean');
  });

  section('bind-path-flag: a third argument keeps _bind( ), and a bare v = value is bind-path-as-value\'s', () => {
    const third = frame({
      attrs: "            )->a( n = `items` v = |\\{ path: '{ client->_bind( val = mt_rows path = abap_true switch_default_model = abap_true ) }' \\}|\n",
    });
    assert(of(third, 'bind-path-flag').length === 0, 'a third argument is _bind( )\'s business');
    const bare = frame({ attrs: '            )->a( n = `tooltip` v = client->_bind( val = mv_text path = abap_true )\n' });
    assert(of(bare, 'bind-path-flag').length === 0 && of(bare, 'bind-path-as-value').length === 1, 'the bare value stays with bind-path-as-value');
  });

  // ------------------------------------------------ 3. handler-without-event

  section('handler-without-event: the answer event of cross_app_nav_get_links is raised', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `LINKS` )\n',
      main: '    CASE client->get_event( ).\n'
        + '      WHEN `LINKS`.\n'
        + '        client->follow_up_action( val = client->cs_event-cross_app_nav_get_links\n'
        + '                                  t_arg = VALUE #( ( `{"semanticObject":"SO"}` ) ( `` ) ( `LINKS_READ` ) ) ).\n'
        + '      WHEN `LINKS_READ`.\n'
        + '    ENDCASE.\n',
    });
    const found = of(src, 'handler-without-event').map((x) => x.value);
    assert(found.length === 0, `LINKS_READ is raised by the getLinks answer (${found.join(', ')})`);
  });

  // ------------------------------------------------ 4. close-only-roundtrip

  const dialog = (cancelBranch, raise = 'client->_event( `CANCEL` )') => frame({
    attrs: `            )->a( n = \`press\` v = ${raise}\n`,
    main: '    CASE client->get_event( ).\n'
      + '      WHEN `SAVE`.\n'
      + '        mv_text = `saved`.\n'
      + '        client->popup_destroy( ).\n\n'
      + cancelBranch
      + '    ENDCASE.\n'
      + '    DATA(save) = client->_event( `SAVE` ).\n',
  });

  section('close-only-roundtrip: a branch that only destroys the popup becomes the frontend close', () => {
    const src = dialog('      WHEN `CANCEL`.\n        client->popup_destroy( ).\n\n      WHEN OTHERS.\n\n');
    const hits = of(src, 'close-only-roundtrip');
    assert(hits.length === 1 && hits[0].value === 'CANCEL' && hits[0].member === 'popup', `the CANCEL branch, not SAVE (${hits.map((h) => h.value)})`);
    const out = fixed(src);
    assert(out.includes('v = client->follow_up_action( val = client->cs_event-popup_close )'), 'the raise became the frontend action');
    assert(!/WHEN `CANCEL`/.test(out) && out.includes("        client->popup_destroy( ).\n\n      WHEN OTHERS."), 'the branch is gone, the CASE closes up');
    assert(of(out, 'close-only-roundtrip').length === 0 && of(out, 'handler-without-event').length === 0, 'and nothing is left to report');
  });

  section('close-only-roundtrip: the popover and the ELSEIF form', () => {
    const src = frame({
      attrs: '            )->a( n = `press` v = client->_event( `CLOSE_POPOVER` )\n',
      main: '    IF client->check_on_event( `OPEN` ).\n      mv_text = `x`.\n'
        + '    ELSEIF client->check_on_event( `CLOSE_POPOVER` ).\n      client->popover_destroy( ).\n    ENDIF.\n'
        + '    DATA(o) = client->_event( `OPEN` ).\n',
    });
    const out = fixed(src);
    assert(out.includes('client->follow_up_action( val = client->cs_event-popover_close )')
      && !out.includes('CLOSE_POPOVER') && /mv_text = `x`\.\n    ENDIF\./.test(out), 'the ELSEIF branch is gone and the raise closes the popover');
  });

  section('close-only-roundtrip: backend work, event arguments and a lone WHEN keep the branch', () => {
    assert(of(dialog('      WHEN `CANCEL`.\n        mv_text = ``.\n        client->popup_destroy( ).\n\n'), 'close-only-roundtrip').length === 0,
      'a branch that also writes state is backend work');
    assert(of(dialog('      WHEN `CANCEL`.\n        client->popup_destroy( ).\n\n', 'client->_event( val = `CANCEL` t_arg = VALUE #( ( `x` ) ) )'), 'close-only-roundtrip').length === 0,
      'a raise that carries arguments is not swapped');
    const lone = frame({
      attrs: '            )->a( n = `press` v = client->_event( `CANCEL` )\n',
      main: '    CASE client->get_event( ).\n      WHEN `CANCEL`.\n        client->popup_destroy( ).\n    ENDCASE.\n',
    });
    const hits = of(lone, 'close-only-roundtrip');
    assert(hits.length === 1 && !hits[0].fixes, 'the only WHEN of the CASE is reported without a fix');
    const two = dialog('      WHEN `CANCEL`.\n        client->popup_destroy( ).\n\n');
    assert(of(two, 'close-only-roundtrip').length === 1 && !of(two, 'close-only-roundtrip')[0].fixes,
      'a CASE that would keep one WHEN is reported without a fix - abaplint short_case');
    const why = dialog('      WHEN `CANCEL`.\n        " through the backend on purpose\n        client->popup_destroy( ).\n\n      WHEN OTHERS.\n\n');
    assert(of(why, 'close-only-roundtrip').length === 0, 'a branch with a comment is the author\'s decision - not judged');
  });

  // ------------------------------------------------ 5. unknown-binding-path behind a cleared table

  section('unknown-binding-path: VALUE #( ) that clears the table keeps the row shape', () => {
    /* samples app 053: a search empties the bound table and refills it in a
     * loop. The empty constructor was read as the table's seed, the table
     * came out empty, and no relative field of the template was checked. */
    const src = frame({
      main: '    t_rows = VALUE #( ( name = `a` ) ).\n    t_rows = VALUE #( ).\n',
      attrs: '            )->a( n = `press` v = client->_event( `X` )\n',
    }).replace('    DATA mt_rows TYPE string_table.\n',
      '    TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.\n    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.\n')
      .replace('        )->end( ).\n', '          )->ele( `List` )->a( n = `items` v = client->_bind( t_rows )\n'
        + '            )->tag( `StandardListItem` )->a( n = `title` v = `{NAMEX}`\n        )->end( ).\n');
    const hits = of(src, 'unknown-binding-path').map((x) => x.value);
    assert(hits.includes('NAMEX'), `the typo under the cleared table is reported (${hits.join()})`);
    assert(of(src.replace('{NAMEX}', '{NAME}'), 'unknown-binding-path').length === 0, 'and the right name is not');
  });
}
