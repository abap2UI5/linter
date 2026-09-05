/*
 * Review round 2026-09 - the ABAP-side rules: positions, quotes, argument
 * order, chained declarations, prose, and the lifecycle heuristics. See
 * test/review/README.md for the harness.
 */
import { applyFixes } from '../../lib/fix.mjs';
import { RULE_DOCS } from '../../lib/rule-docs.mjs';

/* A complete app class around a main( ) body and a view: every gate runs, and
 * what a section asks about is the one thing it adds. `defs` lands in the
 * PUBLIC SECTION, `main` in z2ui5_if_app~main before the view is built,
 * `attrs` on the view's Button, `methods` after main( ). */
const frame = ({ defs = '', main = '', attrs = '', methods = '', tail = '' } = {}) =>
  'CLASS zcl_review_rules DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_rules IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
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
  + tail
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + methods
  + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;
  const fixed = (src) => applyFixes(src, judge(src)).output;

  section('review rules: the frame these sections ask in is clean', () => {
    const noise = judge(frame()).map((x) => x.type);
    assert(noise.length === 0, `the frame reports nothing on its own (${noise.join(', ') || 'none'})`);
  });

  section('review rules: the obsolete-model-update fix removes the whole statement, whatever the handle', () => {
    const src = frame({ main: '    DATA(li_client) = client.\n    li_client->view_model_update( ).\n    me->client->popup_model_update( ).\n' });
    const found = of(src, 'obsolete-model-update');
    assert(found.length === 2, `both calls are reported (${found.length})`);
    assert(found.every((x) => x.fixes?.length === 1), 'both carry a fix');
    const out = fixed(src);
    assert(!/model_update/.test(out), 'the calls are gone');
    assert(!/^\s*(?:li_|me->)\s*$/m.test(out), 'no handle prefix is left behind as a torn line');
    assert(/DATA\(li_client\) = client\./.test(out), 'the statement before is untouched');
  });

  section('review rules: event-argument findings sit on the argument they name', () => {
    const attrs = '            )->a( n = `press` v = client->_event( val = `GO`\n'
      + '              t_arg = VALUE #( ( `{COL}` ) ( `` ) ) ) )\n';
    const src = frame({ attrs });
    const row = lineOf(src, 't_arg = VALUE');
    const unresolved = of(src, 'event-arg-unresolved');
    const trailing = of(src, 'trailing-empty-event-arg');
    assert(unresolved.length === 1 && trailing.length === 1, `one finding each (${unresolved.length}/${trailing.length})`);
    const col = src.split('\n')[row - 1].indexOf('VALUE');
    assert(unresolved[0].line === row && unresolved[0].column > col, `event-arg-unresolved is on the t_arg row after VALUE (${unresolved[0].line}:${unresolved[0].column})`);
    assert(trailing[0].line === row && trailing[0].column > unresolved[0].column, `trailing-empty-event-arg is on the same row, after the first entry (${trailing[0].line}:${trailing[0].column})`);
    // the position is what a directive addresses: one above the row silences it
    const silenced = frame({ attrs: attrs.replace('              t_arg', '              " abap2ui5lint-disable-next-line event-arg-unresolved\n              t_arg') });
    assert(of(silenced, 'event-arg-unresolved').length === 0, 'a disable-next-line above the t_arg row suppresses the finding');
  });

  section('review rules: the fix for a trailing empty event argument keeps the indentation', () => {
    const src = frame({ attrs: '            )->a( n = `press` v = client->_event( val = `GO`\n'
      + '              t_arg = VALUE #( ( `x` )\n'
      + '              ( `` ) ) ) )\n' });
    const out = fixed(src);
    assert(!/\( `` \)/.test(out), 'the empty entry is gone');
    const tail = out.match(/^( *)\) \) \)\s*$/m);
    assert(tail && tail[1].length >= 14, `the closing parens keep the row's indentation (got ${tail ? tail[1].length : 'no such line'})`);
  });

  section('review rules: an id in single quotes is an id the wire rules know', () => {
    const src = frame({
      attrs: "            )->a( n = 'id' v = `btnB`\n",
      main: '    client->popover_display( xml = `<Popover xmlns="sap.m"/>` by_id = `btnB` ).\n'
        + '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `btnB` ) ( `focus` ) ) ).\n',
    });
    const about = judge(src).filter((x) => /btnB/.test(x.message || '') || x.value === 'btnB');
    assert(about.length === 0, `nothing is reported about btnB (${about.map((x) => x.type).join(', ') || 'none'})`);
    // and the id set is still judged: an id no view declares stays an error
    const typo = frame({ main: '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `btnC` ) ( `focus` ) ) ).\n' });
    assert(of(typo, 'frontend-action-unknown-id').length === 1, 'an undeclared id is still reported');
  });

  section('review rules: a WHEN literal names an event only inside the CASE over the event', () => {
    const attrs = '            )->a( n = `press` v = client->_event( val = `A` t_arg = VALUE #( ( `x` ) ) )\n'
      + '            )->a( n = `id` v = client->_event( val = `B` t_arg = VALUE #( ( `x` ) ( `y` ) ) )\n';
    const nested = frame({ attrs, main: '    CASE client->get( )-event.\n      WHEN `A`.\n        mv_text = client->get_event_arg( 1 ).\n'
      + '      WHEN `B`.\n        CASE mv_text.\n          WHEN `A`.\n            mv_text = client->get_event_arg( 2 ).\n        ENDCASE.\n'
      + '        mv_text = client->get_event_arg( 2 ).\n    ENDCASE.\n' });
    assert(of(nested, 'event-arg-out-of-range').length === 0,
      `a status switch inside B's handler is not A's handler (${of(nested, 'event-arg-out-of-range').map((x) => x.line).join() || 'none'})`);
    const after = frame({ attrs, main: '    CASE client->get( )-event.\n      WHEN `A`.\n        mv_text = client->get_event_arg( 1 ).\n    ENDCASE.\n'
      + '    CASE mv_text.\n      WHEN `A`.\n        mv_text = client->get_event_arg( 2 ).\n    ENDCASE.\n' });
    assert(of(after, 'event-arg-out-of-range').length === 0, 'a WHEN in a later CASE over a variable opens no handler scope');
    const real = frame({ attrs, main: '    CASE client->get( )-event.\n      WHEN `A`.\n        mv_text = client->get_event_arg( 2 ).\n    ENDCASE.\n' });
    assert(of(real, 'event-arg-out-of-range').length === 1, 'a read past the arity inside the real handler is still reported');
  });

  section('review rules: a class name in a single-quoted literal is text, like one in backticks', () => {
    const single = frame({ main: "    DATA(lv_class) = 'Z2UI5_CL_UTIL'.\n" });
    const back = frame({ main: '    DATA(lv_class) = `Z2UI5_CL_UTIL`.\n' });
    assert(of(single, 'non-released-api').length === 0, "'…' is a literal");
    assert(of(back, 'non-released-api').length === 0, '`…` is a literal');
    const code = frame({ main: '    DATA(lv_x) = z2ui5_cl_util=>boolean_abap_2_json( abap_true ).\n' });
    assert(of(code, 'non-released-api').length === 1, 'the same name as code is still reported');
  });

  section('review rules: a wire is read whatever the argument order and the table type', () => {
    const late = frame({ main: '    client->follow_up_action( t_arg = VALUE #( ( `x` ) ) val = `CONTROL_BY_IDX` ).\n' });
    assert(of(late, 'unknown-frontend-action').length === 1, 'the action name may be the second argument');
    const typed = frame({ main: '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE string_table( ( `nope` ) ( `focus` ) ) ).\n' });
    const ids = of(typed, 'frontend-action-unknown-id');
    assert(ids.length === 1 && ids[0].value === 'nope', `VALUE string_table( ) rows are arguments (${ids.map((x) => x.value).join() || 'none'})`);
  });

  section('review rules: a live wire through me->client, in either argument order, round-trips', () => {
    const me = frame({ attrs: '            )->a( n = `liveChange` v = me->client->_event( val = `LIVE` )\n' });
    assert(of(me, 'live-event-roundtrip').length === 1, 'me->client->_event( ) is the same round-trip');
    const swapped = frame({ attrs: '            )->a( v = client->_event( val = `LIVE` ) n = `liveChange`\n' });
    assert(of(swapped, 'live-event-roundtrip').length === 1, 'v = before n = is the same attribute');
    const frontendOnly = frame({ attrs: '            )->a( n = `liveChange` v = client->follow_up_action( val = `POPUP_CLOSE` )\n' });
    assert(of(frontendOnly, 'live-event-roundtrip').length === 0, 'a frontend-only wire is not a round-trip');
  });

  section('review rules: the loop-cursor rule says which runtime the clobber belongs to', () => {
    const doc = RULE_DOCS['delete-index-in-loop'].detail;
    assert(/transpiler/.test(doc) && /kernel/.test(doc), 'the doc names the kernel and the transpiler behaviour');
  });

  section('review rules: an ABAP boolean is caught in any argument order and behind me->', () => {
    const src = frame({
      defs: '    DATA: mv_flag TYPE abap_bool, mv_other TYPE abap_bool.\n',
      attrs: '            )->a( v = mv_flag n = `visible`\n'
        + '            )->a( n = `enabled` v = me->mv_other\n'
        + '            )->a( n = `busy` v = abap_true\n'
        + '            )->a( n = `blocked` v = client->_bind( mv_flag )\n',
    });
    const found = of(src, 'unconverted-abap-boolean');
    assert(found.length === 3, `three flags written as values (${found.length}: ${found.map((x) => x.member).join(', ')})`);
    assert(found.map((x) => x.member).sort().join() === 'busy,enabled,visible', `each names its attribute (${found.map((x) => x.member).join(', ')})`);
    assert(found.every((x) => x.fixes?.length === 1), 'every bare token carries the v-to-b fix');
    const out = fixed(src);
    assert(/a\( b = mv_flag n = `visible`/.test(out) && /n = `enabled` b = me->mv_other/.test(out) && /n = `busy` b = abap_true/.test(out),
      'the fix renames the parameter, wherever it stands');
    assert(of(out, 'unconverted-abap-boolean').length === 0, 'the fixed class is clean');
  });

  section('review rules: chained declarations are read by the binding rules', () => {
    const refs = frame({
      defs: '    DATA: mr_a TYPE REF TO data, mr_b TYPE REF TO data.\n',
      attrs: '            )->a( n = `tooltip` v = client->_bind( mr_b )\n',
    });
    const ref = of(refs, 'binding-to-reference');
    assert(ref.length === 1 && ref[0].member === 'mr_b', `the second reference of the chain is known (${ref.map((x) => x.member).join() || 'none'})`);
    assert(/_bind\( mr_b->\* \)/.test(fixed(refs)), 'the fix dereferences it');
    const locals = frame({
      main: '    DATA: lv_a TYPE string, lv_b TYPE string.\n    lv_b = `x`.\n',
      attrs: '            )->a( n = `tooltip` v = client->_bind( lv_b )\n',
    });
    const loc = of(locals, 'binding-to-local');
    assert(loc.length === 1 && loc[0].member === 'lv_b', `the second local of the chain is known (${loc.map((x) => x.member).join() || 'none'})`);
  });

  section('review rules: hardcoded-binding-path judges values, not prose', () => {
    const prose = frame({ main: '    DATA(prose) = `NOTE: areaShrinkRatio is two-way bound ({/AREASHRINKRATIO}, see the docs)`.\n'
      + '    " a comment quoting {/PATH} binds nothing either\n' });
    assert(of(prose, 'hardcoded-binding-path').length === 0, 'a path in a DATA literal or a comment is not a binding');
    const values = frame({
      attrs: '            )->a( n = `tooltip` v = `{/TITLE}`\n'
        + '            )->a( n = `icon` v = `sap-icon://` && `{/ICON}`\n'
        + '            )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `{/PATH}` ) ) )\n',
    });
    const found = of(values, 'hardcoded-binding-path');
    assert(found.length === 3, `an attribute value, a && chain and a t_arg row are three findings (${found.length})`);
    assert(found.map((x) => x.member).sort().join() === 'icon,t_arg,tooltip', `each names where it stands (${found.map((x) => x.member).join(', ')})`);
    assert(found.every((x) => x.line === lineOf(values, x.value)), 'each sits on the line of its literal');
  });

  section('review rules: lifecycle heuristics follow the class\'s own methods', () => {
    const helperFork = frame({
      main: '    IF client->check_on_init( ).\n      view_display( ).\n    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n',
      methods: '  METHOD view_display.\n    client->view_display( `<mvc:View xmlns:mvc="sap.ui.core.mvc"/>` ).\n  ENDMETHOD.\n\n',
    });
    assert(of(helperFork, 'redundant-init-display').length === 1, 'two identical helper arms that display decide nothing');
    const decides = helperFork.replace('    ELSEIF client->check_on_navigated( ).\n      view_display( ).', '    ELSEIF client->check_on_navigated( ).\n      on_navigation( ).')
      + '';
    assert(of(decides + '\n', 'redundant-init-display').length === 0, 'arms that differ are a decision');

    const delegated = 'CLASS zcl_review_dispatch DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n  PROTECTED SECTION.\n  PRIVATE SECTION.\n    METHODS dispatch.\nENDCLASS.\n\n'
      + 'CLASS zcl_review_dispatch IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n    dispatch( ).\n  ENDMETHOD.\n\n'
      + '  METHOD dispatch.\n    IF client->check_on_init( ).\n      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '      view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->tag( `Text` )->a( n = `text` v = `hi` ).\n'
      + '      client->view_display( view->stringify( ) ).\n    ENDIF.\n  ENDMETHOD.\n\nENDCLASS.\n';
    const missing = of(delegated, 'missing-on-navigated-branch');
    assert(missing.length === 1, 'a main( ) that delegates to dispatch( ) is judged on dispatch( )');
    assert(missing[0]?.line === lineOf(delegated, 'IF client->check_on_init'), `the finding sits on the lifecycle IF in dispatch( ) (${missing[0]?.line})`);

    const handsOn = frame({
      defs: '    DATA mo_helper TYPE REF TO object.\n',
      main: '    IF client->check_on_init( ).\n      client->view_display( `<mvc:View xmlns:mvc="sap.ui.core.mvc"/>` ).\n'
        + '    ELSEIF client->check_on_navigated( ).\n      mo_helper->on_navigated( client ).\n    ENDIF.\n',
    });
    assert(of(handsOn, 'missing-view-display-on-navigated').length === 0, 'a branch that hands client to another object is not judged');
    const silent = handsOn.replace('mo_helper->on_navigated( client ).', 'mv_text = client->get( )-event.');
    assert(of(silent, 'missing-view-display-on-navigated').length === 1, 'a branch that displays nothing and hands client to nobody is reported');
  });
}
