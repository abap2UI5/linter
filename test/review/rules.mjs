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

  section('review rules: event-arg-single-row-table - one row is arg, and only on client->_event( )', () => {
    const attrs = '            )->a( n = `press` v = client->_event( val   = `GO`\n'
      + '                                                          t_arg = VALUE #( ( `${$source>/text}` ) ) ) )\n';
    const src = frame({ attrs, main: '    IF client->check_on_event( `GO` ).\n      mv_text = client->get_event_arg( ).\n    ENDIF.\n' });
    const hits = of(src, 'event-arg-single-row-table');
    assert(hits.length === 1 && hits[0].severity === 'hint' && hits[0].fixes?.length === 1, `one hint, fixable (${hits.length})`);
    const row = lineOf(src, 't_arg = VALUE');
    assert(hits[0].line === row && hits[0].column === src.split('\n')[row - 1].indexOf('t_arg') + 1,
      `on the t_arg token itself, so a disable-next-line above the row reaches it (${hits[0].line}:${hits[0].column})`);
    const out = fixed(src);
    // \b, because `get_event_arg` ends in the same five characters
    assert(/arg = `\$\{\$source>\/text\}` \) \)/.test(out) && !/\bt_arg/.test(out), 'the table constructor became arg = the value inside it');
    assert(out.split('\n')[row - 1].indexOf('arg') === src.split('\n')[row - 1].indexOf('t_arg'),
      'the continuation keeps its column - a chain stays aligned under the fix');
    assert(of(out, 'event-arg-single-row-table').length === 0 && of(out, 'event-arg-out-of-range').length === 0,
      'the fixed source is clean, and the handler still reads one argument');

    // two rows is what t_arg is for, and stays it
    const two = frame({ attrs: '            )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `a` ) ( `b` ) ) ) )\n' });
    assert(of(two, 'event-arg-single-row-table').length === 0, 'from two values on, t_arg is the right parameter');
    // both spellings: the documented composition appends arg BEHIND the rows, so the call sends two
    const both = frame({ attrs: '            )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `a` ) ) arg = `b` ) )\n' });
    assert(of(both, 'event-arg-single-row-table').length === 0, 'a call that already passes arg sends one more argument, not the same one');
    // arg is generic (TYPE clike): # has no type to derive there, so the remedy would not compile
    const conv = frame({ attrs: '            )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( CONV #( mv_text ) ) ) ) )\n' });
    assert(of(conv, 'event-arg-single-row-table').length === 0, 'a row containing a # is left alone');
    // the two frontend siblings have no arg parameter at all
    const action = frame({ main: '    client->follow_up_action( val = client->cs_event-hash_attach_changed t_arg = VALUE #( ( `HASH_CHANGED` ) ) ).\n' });
    assert(of(action, 'event-arg-single-row-table').length === 0, 'follow_up_action( ) is a frontend action and has no arg');
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

  section('review rules: a value carrying data is reported on v, and the fix moves it onto t', () => {
    const src = frame({
      defs: '    DATA mv_search TYPE string.\n    DATA mv_flag TYPE abap_bool.\n'
        + '    DATA: BEGIN OF ms_row, name TYPE string, END OF ms_row.\n',
      main: '    DATA(lv_title) = |Results for { mv_search }|.\n'
        + '    DATA(lv_expr) = |\\{= ${ client->_bind( mv_search ) } === `x` \\}|.\n'
        + '    DATA(lv_const) = `A constant`.\n'
        + '    DATA(lv_base) = `https://host/`.\n',
      attrs: '            )->a( n = `tooltip`     v = |Hits for { mv_search }|\n'
        + '            )->a( n = `id`          v = lv_title\n'
        + '            )->a( n = `busy`        v = mv_flag\n'
        + '            )->a( n = `icon`        v = lv_expr\n'
        + '            )->a( n = `activeIcon`  v = lv_const\n'
        + '            )->a( n = `ariaLabelledBy` v = ms_row-name\n'
        + '            )->a( n = `fieldGroupIds` v = lv_base && `x.jpg`\n'
        + '            )->a( n = `class`       v = CONV string( mv_search )\n'
        + '            )->a( n = `width`       v = lv_title\n'
        + '            )->a( n = `type`        v = `Emphasized`\n'
        + '            )->a( n = `press`       v = client->_event( `GO` )\n'
        + '            )->a( n = `visible`     v = |\\{= ${ client->_bind( mv_search ) } !== `` \\}|\n'
        + '            )->a( n = `blocked`     v = |{ z2ui5_cl_ui5_view_builder=>escape_literal( mv_search ) }: \\{/COUNT\\}|\n'
        + '            )->a( n = `enabled`     v = COND #( WHEN mv_flag = abap_true THEN `x` ELSE `y` )\n',
    });
    const found = of(src, 'unescaped-text-in-attribute');
    const members = found.map((x) => x.member).sort().join();
    assert(members === 'ariaLabelledBy,class,fieldGroupIds,id,tooltip',
      `the five values whose origin is data are reported, nothing else - not width (a CSSSize) and not activeIcon (a URI), where no text can be shown (${members || 'none'})`);
    assert(found.every((x) => x.fixes?.length === 1 && x.fixes[0].text === 't'), 'every one carries the v-to-t fix');
    assert(of(src, 'unconverted-abap-boolean').length === 1, 'the boolean stays the boolean rule\'s');
    const out = fixed(src);
    assert(/n = `tooltip`     t = \|Hits for \{ mv_search \}\|/.test(out) && /n = `id`          t = lv_title/.test(out),
      'the fix renames the parameter and leaves the value as written');
    assert(/n = `icon`        v = lv_expr/.test(out) && /n = `type`        v = `Emphasized`/.test(out),
      'a binding held in a variable and a constant stay on v');
    assert(of(out, 'unescaped-text-in-attribute').length === 0, 'the fixed class is clean');
  });

  section('review rules: a name assigned binding vocabulary anywhere in the class stays on v', () => {
    const late = frame({
      defs: '    DATA mv_wrap TYPE string.\n',
      main: '    IF 1 = 2.\n      mv_wrap = `plain`.\n    ELSE.\n'
        + '      mv_wrap = |\\{= ${ client->_bind( mv_text ) } ? `Hyphenated` : `Normal` \\}|.\n    ENDIF.\n',
      attrs: '            )->a( n = `tooltip` v = mv_wrap\n',
    });
    assert(of(late, 'unescaped-text-in-attribute').length === 0, 'one assignment with vocabulary is enough to keep the name on v');
    const seeded = frame({
      defs: '    TYPES: BEGIN OF ty_row, label TYPE string, END OF ty_row.\n    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
      main: '    mt_rows = VALUE #( ( label = `{/X}` ) ).\n    LOOP AT mt_rows REFERENCE INTO DATA(lr_row).\n    ENDLOOP.\n',
      attrs: '            )->a( n = `tooltip` v = lr_row->label\n',
    });
    assert(of(seeded, 'unescaped-text-in-attribute').length === 1,
      'a seed row holding a literal binding without an escape is still data - it is the value the rule exists for');
    const unassigned = frame({ attrs: '            )->a( n = `tooltip` v = lr_row->label\n' });
    assert(of(unassigned, 'unescaped-text-in-attribute').length === 1, 'a name nothing in the class writes is data by definition');
  });

  section('review rules: a t attribute reconstructs escaped, as the running view carries it', async () => {
    const { prepareAbap } = await import('../../lib/reconstruct.mjs');
    const src = frame({
      main: '    DATA(lv_t) = `a {b} c\\d`.\n',
      attrs: '            )->a( n = `tooltip` t = lv_t\n            )->a( n = `id` t = `t_one`\n',
    });
    const r = prepareAbap(src);
    assert(/tooltip="a \\\{b\\\} c\\\\d"/.test(r.docs[0] ?? ''), `the braces and the backslash are escaped (${r.docs[0]})`);
    assert(!r.notes.some((n) => /unparsed attribute call/.test(n)), 'a t attribute is no longer an unparsed call');
    const noise = judge(src).map((x) => x.type);
    assert(noise.length === 0, `a t attribute reports nothing (${noise.join(', ') || 'none'})`);
    // an id written as text still counts as this class's id
    const wired = frame({
      attrs: '            )->a( n = `id` t = `btn_t`\n',
      main: '    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `btn_t` ) ( `focus` ) ) ).\n',
    });
    assert(of(wired, 'frontend-action-unknown-id').length === 0, 'an id passed through t is known to the wire rules');
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
