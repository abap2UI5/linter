/*
 * What an app leaves behind when it navigates away.
 *
 *   - message-before-navigation: abap2UI5 cefce923 (2026-11-24, DEV) - a
 *     nav_app_leave( ) / nav_app_call( ) drops everything the leaving app
 *     queued in the roundtrip, so the "Saved." toast of a detail page that
 *     returns to its list never showed; keep_messages = abap_true carries it.
 *   - stateful-without-release: abap2UI5-addons/table-maintenance (DEV,
 *     2026-11-25) - z2ui5_cl_tm_001 locks with ENQUEUE_E_TABLE and
 *     set_session_stateful( abap_true ), and a way out of the app that does
 *     not release leaves lock and work process to the session timeout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes } from '../../lib/fix.mjs';

const app = (main, { methods = '', name = 'zcl_nav_exit', intf = true } = {}) =>
  `CLASS ${name} DEFINITION PUBLIC.\n\n  PUBLIC SECTION.\n`
  + (intf ? '    INTERFACES z2ui5_if_app.\n' : '')
  + '    DATA client TYPE REF TO z2ui5_if_client.\n'
  + `ENDCLASS.\n\n\nCLASS ${name} IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n`
  + main + '\n  ENDMETHOD.\n' + methods + '\nENDCLASS.\n';

export default async function ({ section, assert, tempDir, checkAbapSource, checkFiles }) {
  const opts = { render: false, properties: true, minUi5: '1.71' };
  const judge = (src, o = {}) => checkAbapSource(src, { ...opts, ...o }).findings;
  const of = (src, type, o) => judge(src, o).filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, judge(src).filter((x) => x.fixes?.length && x.type === type)).output;
  const MBN = 'message-before-navigation';
  const SWR = 'stateful-without-release';

  section('message-before-navigation: a toast, a box or a CONTROL_GLOBAL message in front of a navigation', () => {
    const toast = app('    client->message_toast_display( `Saved.` ).\n    client->nav_app_leave( ).\n');
    const t = of(toast, MBN);
    assert(t.length === 1 && t[0].member === 'message_toast_display' && t[0].value === 'nav_app_leave', `the toast is reported (${t.length})`);
    assert(t[0].line === 13, `at the toast (line ${t[0].line})`);
    const box = app('    client->message_box_display( `Saved.` ).\n    DATA(x) = 1.\n    client->nav_app_call( NEW zcl_list( ) ).\n');
    assert(of(box, MBN)[0]?.value === 'nav_app_call', 'a message box before nav_app_call( )');
    const global = app('    client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `show` ) ( `Saved.` ) ) ).\n    client->nav_app_leave( ).\n');
    assert(of(global, MBN)[0]?.member === 'follow_up_action', 'a CONTROL_GLOBAL MESSAGE_TOAST');
    const focus = app('    client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `VIEW_SLOTS` ) ( `destroy` ) ) ).\n    client->nav_app_leave( ).\n');
    assert(of(focus, MBN).length === 0, 'a CONTROL_GLOBAL call on another global is no message');
    const two = app('    client->message_toast_display( `a` ).\n    client->message_toast_display( `b` ).\n    client->nav_app_leave( ).\n');
    assert(of(two, MBN).length === 2, 'two messages, two findings');
  });

  section('message-before-navigation: the fix adds keep_messages = abap_true', () => {
    const cases = [
      ['client->nav_app_leave( ).', 'client->nav_app_leave( keep_messages = abap_true ).'],
      ['client->nav_app_leave( lo_prev ).', 'client->nav_app_leave( app = lo_prev keep_messages = abap_true ).'],
      ['client->nav_app_call( app = NEW zcl_list( ) tag = `x` ).', 'client->nav_app_call( app = NEW zcl_list( ) tag = `x` keep_messages = abap_true ).'],
      ['client->nav_app_call( NEW zcl_list( id = 1 ) ).', 'client->nav_app_call( app = NEW zcl_list( id = 1 ) keep_messages = abap_true ).'],
    ];
    for (const [call, want] of cases) {
      const src = app(`    client->message_toast_display( \`Saved.\` ).\n    ${call}\n`);
      const out = fixed(src, MBN);
      assert(out.includes(want), `${call} -> ${want}`);
      assert(of(out, MBN).length === 0, `the fixed class is silent (${call})`);
    }
    const released = app('    client->message_toast_display( `Saved.` ).\n    client->nav_app_leave( ).\n');
    const r = of(released, MBN, { abap2ui5: '1.140.0' });
    assert(r.length === 1 && !r[0].fixes, 'with a release configured: reported, no fix (the parameter is in no release)');
    assert(/no release yet/.test(r[0].message), 'the message says why');
  });

  section('message-before-navigation: what is not reported', () => {
    const quiet = (main, why) => assert(of(app(main), MBN).length === 0, why);
    quiet('    client->message_toast_display( `Saved.` ).\n    client->nav_app_leave( keep_messages = abap_true ).\n', 'keep_messages = abap_true');
    quiet('    client->message_toast_display( `Saved.` ).\n    client->nav_app_leave( keep_messages = mv_keep ).\n', 'keep_messages = a variable');
    quiet('    IF mv_ok = abap_true.\n      client->message_toast_display( `Saved.` ).\n    ELSE.\n      client->nav_app_leave( ).\n    ENDIF.\n', 'IF / ELSE arms');
    quiet('    CASE client->get( )-event.\n      WHEN `A`.\n        client->message_toast_display( `Saved.` ).\n      WHEN `B`.\n        client->nav_app_leave( ).\n    ENDCASE.\n', 'two WHEN arms');
    quiet('    IF mv_ok = abap_true.\n      client->message_toast_display( `Saved.` ).\n    ENDIF.\n    client->nav_app_leave( ).\n', 'an ENDIF boundary');
    quiet('    client->message_toast_display( `Saved.` ).\n    RETURN.\n    client->nav_app_leave( ).\n', 'a RETURN in between');
    quiet('    client->message_toast_display( `Saved.` ).\n    IF mv_ok = abap_true.\n      client->nav_app_leave( ).\n    ENDIF.\n', 'the navigation in a nested block');
    quiet('    client->nav_app_leave( ).\n    client->message_toast_display( `Saved.` ).\n', 'a message after the navigation');
    quiet('    client->message_toast_display( `Saved.` ).\n    client->nav_app_call( z2ui5_cl_pop_to_confirm=>factory( `Sure?` ) ).\n', 'nav_app_call( ) to an abap2UI5 popup');
    quiet('    DATA(lv_text) = `client->message_toast_display( ). client->nav_app_leave( ).`.\n', 'calls quoted in a literal');
  });

  section('message-before-navigation: a popup app of the run is a target whose caller stays', async () => {
    const dir = tempDir('abap2ui5lint-mbn-');
    const caller = path.join(dir, 'zcl_nav_exit.clas.abap');
    const popup = path.join(dir, 'zcl_my_dialog.clas.abap');
    fs.writeFileSync(caller, app('    client->message_toast_display( `Saved.` ).\n    client->nav_app_call( NEW zcl_my_dialog( ) ).\n'));
    fs.writeFileSync(popup, app('    client->popup_display( `<Dialog/>` ).\n', { name: 'zcl_my_dialog' }));
    const both = await checkFiles([caller, popup], opts);
    const mine = both.find((x) => x.file === caller).findings.filter((x) => x.type === MBN);
    assert(mine.length === 0, `not reported with the popup app in the run (${mine.length})`);
    const [alone] = await checkFiles([caller], opts);
    assert(alone.findings.filter((x) => x.type === MBN).length === 1, 'reported when the target is not known');
  });

  const LOCK = '    client->set_session_stateful( abap_true ).\n    CALL FUNCTION \'ENQUEUE_E_TABLE\'.\n';
  const RELEASE = '\n  METHOD release_lock.\n    CALL FUNCTION \'DEQUEUE_E_TABLE\'.\n    client->set_session_stateful( abap_false ).\n  ENDMETHOD.\n';

  section('stateful-without-release: a navigation out of a stateful app without a release', () => {
    const src = app(LOCK + '    CASE client->get( )-event.\n      WHEN `BACK`.\n        client->nav_app_leave( ).\n    ENDCASE.\n', { methods: RELEASE });
    const s = of(src, SWR);
    assert(s.length === 1 && s[0].member === 'nav_app_leave' && s[0].line === 17, `the leave is reported (${JSON.stringify(s.map((x) => [x.member, x.line]))})`);
    const call = app('    client->set_session_stateful( ).\n    client->nav_app_call( NEW zcl_other_app( ) ).\n');
    assert(of(call, SWR)[0]?.member === 'nav_app_call', 'set_session_stateful( ) without argument is abap_true; a nav_app_call( ) to a plain app');
    const after = app('    client->set_session_stateful( abap_true ).\n    client->nav_app_leave( ).\n    client->set_session_stateful( abap_false ).\n');
    assert(of(after, SWR).length === 1, 'a release after the navigation does not count');
    const lock = app(LOCK);
    const l = of(lock, SWR);
    assert(l.length === 1 && l[0].member === 'ENQUEUE_E_TABLE' && l[0].value === 'lock', 'an ENQUEUE without any DEQUEUE');
  });

  section('stateful-without-release: what is not reported', () => {
    const quiet = (src, why) => assert(of(src, SWR).length === 0, `${why} (${of(src, SWR).map((x) => x.member).join()})`);
    quiet(app(LOCK + '    CASE client->get( )-event.\n      WHEN `BACK`.\n        release_lock( ).\n        client->nav_app_leave( ).\n    ENDCASE.\n', { methods: RELEASE }), 'released through a helper');
    quiet(app(LOCK + '    on_leave( ).\n    client->nav_app_leave( ).\n', { methods: '\n  METHOD on_leave.\n    release_lock( ).\n  ENDMETHOD.\n' + RELEASE }), 'released two levels deep');
    quiet(app('    client->set_session_stateful( abap_true ).\n    client->set_session_stateful( abap_false ).\n    client->nav_app_leave( ).\n'), 'released inline before the leave');
    quiet(app('    client->set_session_stateful( abap_true ).\n    client->nav_app_call( z2ui5_cl_pop_to_confirm=>factory( `Sure?` ) ).\n    client->nav_app_call( NEW zcl_my_popup( ) ).\n'), 'nav_app_call( ) to a popup');
    quiet(app('    client->set_session_stateful( abap_true ).\n    IF client->check_on_navigated( ) = abap_true.\n      DATA(lo_prev) = client->get_app( client->get( )-s_draft-id_prev_app ).\n    ENDIF.\n    client->nav_app_call( NEW zcl_other_app( ) ).\n'), 'nav_app_call( ) in a class that takes the result back');
    quiet(app('    client->set_session_stateful( mv_stateful ).\n    client->nav_app_leave( ).\n'), 'a variable argument');
    quiet(app('    client->set_session_stateful( abap_false ).\n    client->nav_app_leave( ).\n'), 'never stateful');
    quiet(app('    client->nav_app_leave( ).\n    CALL FUNCTION \'ENQUEUE_E_TABLE\'.\n'), 'a stateless app');
    quiet(app(LOCK + '    client->nav_app_leave( ).\n', { intf: false }), 'not an app class');
    quiet(app(LOCK, { methods: RELEASE }), 'ENQUEUE with a DEQUEUE');
  });
}
