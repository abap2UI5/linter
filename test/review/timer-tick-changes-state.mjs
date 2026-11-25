/*
 * timer-tick-changes-state - a timer handler that changes an attribute on
 * every tick (opt-in).
 *
 * abap2UI5 cdd2fb25 (2026-11-24): a START_TIMER tick whose main( ) left the
 * app serializing byte for byte to the draft it continued writes no draft
 * (z2ui5_cl_ui5_handler=>main_end_reuse). A handler that stamps the time or
 * counts the ticks makes every tick different - one draft per tick again.
 * Positive shapes, and every "must not report" of the backlog item: an
 * assignment from the polled data, one guarded by a comparison with the
 * previous value, a timer whose event is not a literal.
 */

const app = ({ main, extra = '', decl = '' }) => `CLASS zcl_poll DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA client TYPE REF TO z2ui5_if_client.
    DATA mv_refreshed_at TYPE t.
    DATA mv_stamp TYPE timestampl.
    DATA mv_ticks TYPE i.
    DATA mt_orders TYPE string_table.
    DATA ms_state TYPE REF TO data.
    CLASS-DATA gv_ticks TYPE i.
${decl}  PROTECTED SECTION.
    METHODS read_orders RETURNING VALUE(result) TYPE string_table.
ENDCLASS.

CLASS zcl_poll IMPLEMENTATION.

  METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_init( ).
      client->view_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`Page\` )->stringify( ) ).
      client->follow_up_action( val   = client->cs_event-start_timer
                                t_arg = VALUE #( ( \`TICK\` ) ( \`5000\` ) ( \`\` ) ( \`X\` ) ) ).
      RETURN.
    ENDIF.
${main}
  ENDMETHOD.

  METHOD read_orders.
  ENDMETHOD.
${extra}
ENDCLASS.
`;

const tick = (body) => `    CASE client->get_event( ).\n      WHEN \`TICK\`.\n${body}\n    ENDCASE.`;

export default async function ({ section, assert, checkAbapSource }) {
  const on = { render: false, properties: true, minUi5: '1.71', rules: { 'timer-tick-changes-state': 'hint' } };
  const of = (src, opts = on) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'timer-tick-changes-state');

  section('timer-tick-changes-state: off by default, a hint once asked for', () => {
    const src = app({ main: tick('        mv_refreshed_at = sy-uzeit.\n        mt_orders = read_orders( ).') });
    assert(of(src, { render: false, properties: true, minUi5: '1.71' }).length === 0, 'opt-in: silent without a rules entry');
    const hit = of(src);
    assert(hit.length === 1 && hit[0].member === 'mv_refreshed_at' && hit[0].value === 'TICK', `the time stamp, once (${hit.length})`);
    assert(/draft per tick/.test(hit[0].message), 'the message says what it costs');
  });

  section('timer-tick-changes-state: the sources that differ on every call', () => {
    const cases = [
      ['        mv_ticks = mv_ticks + 1.', 'a counter'],
      ['        mv_ticks += 1.', 'a counter with +='],
      ['        me->mv_refreshed_at = sy-uzeit.', 'me->'],
      ['        GET TIME STAMP FIELD mv_stamp.', 'GET TIME STAMP FIELD'],
      ['        mv_stamp = utclong_current( ).', 'utclong_current( )'],
      ['        mv_refreshed_at = cl_abap_context_info=>get_system_time( ).', 'cl_abap_context_info'],
      ['        mv_refreshed_at = |{ sy-datum DATE = USER }|.', 'a template around sy-datum'],
      ['        TRY.\n            mv_refreshed_at = sy-uzeit.\n          CATCH cx_root.\n        ENDTRY.', 'inside a TRY body'],
    ];
    for (const [body, what] of cases) assert(of(app({ main: tick(body) })).length === 1, `${what} is reported`);
    // the other spellings of the handler
    assert(of(app({ main: '    IF client->check_on_event( `TICK` ).\n      mv_ticks = mv_ticks + 1.\n    ENDIF.' })).length === 1, 'a check_on_event( ) arm');
    assert(of(app({ main: '    IF client->get_event( ) = `TICK`.\n      mv_ticks = mv_ticks + 1.\n    ENDIF.' })).length === 1, 'a get_event( ) comparison');
    // through a method the handler calls
    const viaMethod = app({
      main: tick('        on_tick( ).'),
      decl: '    METHODS on_tick.\n',
      extra: '\n  METHOD on_tick.\n    mt_orders = read_orders( ).\n    mv_refreshed_at = sy-uzeit.\n  ENDMETHOD.\n',
    });
    const v = of(viaMethod);
    assert(v.length === 1 && v[0].member === 'mv_refreshed_at', `through on_tick( ) (${v.length})`);
    // timer_set( ) declares the tick too
    const declared = app({ main: `    client->timer_set( event = \`POLL\` delay_ms = 5000 ).\n    CASE client->get_event( ).\n      WHEN \`POLL\`.\n        mv_ticks = mv_ticks + 1.\n    ENDCASE.` });
    assert(of(declared).length === 1, 'a timer_set( ) event');
  });

  section('timer-tick-changes-state: what it must not report', () => {
    assert(of(app({ main: tick('        mt_orders = read_orders( ).') })).length === 0, 'an assignment from the polled data itself');
    assert(of(app({ main: tick('        DATA(lt_new) = read_orders( ).\n        IF lt_new <> mt_orders.\n          mt_orders = lt_new.\n          mv_refreshed_at = sy-uzeit.\n        ENDIF.') })).length === 0,
      'an assignment guarded by a comparison with the previous value');
    assert(of(app({ main: tick('        DATA(lv_now) = sy-uzeit.\n        gv_ticks = gv_ticks + 1.') })).length === 0, 'a local and a CLASS-DATA');
    assert(of(app({ main: '    CASE client->get_event( ).\n      WHEN `OTHER`.\n        mv_ticks = mv_ticks + 1.\n    ENDCASE.' })).length === 0, 'a branch of an event no timer arms');
    const dynamic = app({ main: tick('        mv_ticks = mv_ticks + 1.') }).replace('( `TICK` ) ( `5000` )', '( mv_event ) ( `5000` )')
      .replace('DATA mv_ticks TYPE i.', 'DATA mv_ticks TYPE i.\n    DATA mv_event TYPE string.');
    assert(of(dynamic).length === 0, 'a timer whose event is not resolvable to a literal');
    assert(of(app({ main: tick('        mv_ticks = mv_ticks + 1.') }).replace(/\s*client->follow_up_action\( val   = client->cs_event-start_timer\n[^\n]*\n/, '\n')).length === 0,
      'no timer at all');
  });
}
