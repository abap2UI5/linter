/*
 * The event read into a name before it is compared - from a review of
 * 2026-11-27, the first section failing on the code as it was. See
 * test/review/README.md for the harness.
 *
 *   DATA(ls_get) = client->get( ).        " the whole structure
 *   IF ls_get-event = `GO`.               " …and its event
 *
 *   DATA(lv_event) = client->get( )-event.
 *   IF lv_event = `GO`.
 *
 * A WHEN in a CASE over such a name was read as a handler already; an IF on
 * it was not, so the event was reported as raised and never handled
 * (event-without-handler). eventHolders( ) in lib/abap-helpers.mjs names
 * them for the handler reading and for the event CASE.
 */
const app = (dispatch) => 'CLASS zcl_eh DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA name TYPE string.\nENDCLASS.\n\n'
  + 'CLASS zcl_eh IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
  + '    IF client->check_on_navigated( ).\n'
  + '      client->view_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page`\n'
  + '        )->tag( `Input` )->a( n = `value` v = client->_bind( name )\n'
  + '        )->tag( `Button` )->a( n = `text` v = `Go` )->a( n = `press` v = client->_event( `GO` ) )->stringify( ) ).\n'
  + '    ENDIF.\n' + dispatch + '  ENDMETHOD.\nENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false };
  const of = (src, type) => checkAbapSource(src, opts).findings.filter((x) => x.type === type);

  section('event holders: a comparison on a copy of the event is a handler', () => {
    const shapes = [
      '    DATA(ls_get) = client->get( ).\n    IF ls_get-event = \'GO\'.\n      RETURN.\n    ENDIF.\n',
      '    DATA(ls_get) = client->get( ).\n    IF `GO` = ls_get-event.\n      RETURN.\n    ENDIF.\n',
      '    DATA ls_get TYPE z2ui5_if_types=>ty_s_get.\n    ls_get = client->get( ).\n    IF ls_get-event EQ `GO` OR ls_get-event = `OTHER`.\n      RETURN.\n    ENDIF.\n',
      '    DATA(lv_event) = client->get( )-event.\n    IF lv_event = `GO`.\n      RETURN.\n    ENDIF.\n',
      '    DATA(lv_event) = client->get_event( ).\n    CHECK lv_event = `GO`.\n',
      '    DATA(ls_get) = client->get( ).\n    CASE ls_get-event.\n      WHEN `GO`.\n        RETURN.\n    ENDCASE.\n',
    ];
    for (const d of shapes) {
      const hits = of(app(d), 'event-without-handler');
      assert(hits.length === 0, `GO is handled: ${d.trim().split('\n').slice(0, 2).join(' ')} (${hits.map((x) => x.value).join() || 'none'})`);
    }
  });

  section('event holders: what is not a handler', () => {
    // a write of a literal into the name is no comparison
    const write = app('    DATA(lv_event) = client->get( )-event.\n    lv_event = `GO`.\n');
    assert(of(write, 'event-without-handler').length === 1, 'an assignment to the name handles nothing');
    // a structure from some other get( ) carries no event
    const other = app('    DATA(ls_cfg) = lo_config->get_settings( ).\n    IF ls_cfg-event = `GO`.\n      RETURN.\n    ENDIF.\n');
    assert(of(other, 'event-without-handler').length === 1, 'the -event of another structure is not the event');
  });

  section('event holders: a WHEN in a CASE over the copy is judged for a raise like any event CASE', () => {
    const dead = app('    DATA(ls_get) = client->get( ).\n    CASE ls_get-event.\n      WHEN `GO`.\n        RETURN.\n      WHEN `GONE`.\n        RETURN.\n    ENDCASE.\n');
    const hits = of(dead, 'handler-without-event').map((x) => x.value);
    assert(hits.join() === 'GONE', `the WHEN nothing raises is a dead handler (${hits.join() || 'none'})`);
  });
}
