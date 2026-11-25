/*
 * The names abap2UI5's DEV added before its main has them
 * (lib/abap2ui5-preview.mjs), and the 0.11.4 sync of main's manifest.
 *
 * Every 0.11.x reported z2ui5_cl_ui5_view_builder=>component_path( )
 * (abap2UI5 40e8a073) as unknown-builder-method and a wired STOP_TIMER
 * (4a418249) as unknown-frontend-action - both documented on DEV the day
 * they landed; abap2UI5/table-maintenance 880fc2d suppressed the first,
 * abap2UI5/protocol 9361b44 met the second. Syncing against DEV would have
 * taken DEV's removals along (ROUTER, VIEW_SLOTS display/updateModel), so the
 * linter syncs against main and lists DEV's additions by hand.
 */
import fs from 'fs';
import { DEV_PREVIEW } from '../../lib/abap2ui5-preview.mjs';

/* with a view: the frontend-wire rules run where the class builds one */
const VIEW = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n        )->a( n = `xmlns` v = `sap.m`\n        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->tag( `Input`\n            )->a( n = `value` v = client->_bind( name )\n        )->end( ).\n'
  + '    client->view_display( view->stringify( ) ).\n';
const app = (main, methods = '') => 'CLASS zcl_preview DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA name TYPE string.\nENDCLASS.\n\n'
  + 'CLASS zcl_preview IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n' + VIEW + main + '\n  ENDMETHOD.\n' + methods + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const judge = (src, extra = {}) => checkAbapSource(src, { render: false, properties: true, minUi5: '1.71', ...extra }).findings;
  const of = (src, type, extra) => judge(src, extra).filter((x) => x.type === type);

  section('dev preview: a name leaves the list the day main\'s manifest carries it', () => {
    const manifest = JSON.parse(fs.readFileSync(new URL('../../data/abap2ui5-manifest.json', import.meta.url), 'utf8'));
    for (const [key, names] of Object.entries(DEV_PREVIEW)) {
      const theirs = manifest[key] ?? [];
      const both = names.filter((n) => theirs.includes(n));
      assert(both.length === 0, `${key}: ${both.join(', ') || 'none'} is in data/abap2ui5-manifest.json now - drop it from lib/abap2ui5-preview.mjs`);
    }
  });

  section('dev preview: STOP_TIMER is a known frontend action, a misspelling is not', () => {
    const wired = app('    client->follow_up_action( client->_event_client( client->cs_event-stop_timer ) ).\n');
    assert(of(wired, 'unknown-frontend-action').length === 0, 'cs_event-stop_timer passes');
    const literal = app('    client->follow_up_action( val = `STOP_TIMER` ).\n');
    assert(of(literal, 'unknown-frontend-action').length === 0, 'the literal STOP_TIMER passes');
    for (const wrong of ['STOP_TIMERS', 'stop_timer']) {
      const bad = app(`    client->follow_up_action( val = \`${wrong}\` ).\n`);
      assert(of(bad, 'unknown-frontend-action').length === 1, `${wrong} is still reported`);
    }
  });

  section('dev preview: component_path( ) is a static of the builder, escape( ) is not', () => {
    const ok = app('    DATA(path) = z2ui5_cl_ui5_view_builder=>component_path( name ).\n');
    assert(of(ok, 'unknown-builder-method').length === 0, 'component_path( ) passes');
    const bad = app('    DATA(text) = z2ui5_cl_ui5_view_builder=>escape( name ).\n');
    assert(of(bad, 'unknown-builder-method').length === 1, 'an unknown static is still reported');
  });

  section('dev preview: abap2ui5-api-too-new knows STOP_TIMER is in no release', () => {
    const src = app('    client->follow_up_action( client->_event_client( client->cs_event-stop_timer ) ).\n');
    const f = of(src, 'abap2ui5-api-too-new', { abap2ui5: '1.148.0' });
    assert(f.length === 1 && f[0].since === 'DEV', `reported against a release (${f.length}, ${f[0]?.since})`);
    assert(/is on abap2UI5's DEV and in no release yet/.test(f[0]?.message ?? ''), 'the message says DEV');
    assert(of(src, 'abap2ui5-api-too-new').length === 0, 'without a configured release: not judged');
  });

  section('main sync: an object abap2UI5 deleted is still reported, with its successor', () => {
    const src = app('    DATA lo_exit TYPE REF TO z2ui5_if_exit.\n    DATA lo_h TYPE REF TO z2ui5_cl_http_handler.\n');
    const f = of(src, 'non-released-api');
    const exit = f.find((x) => x.value === 'z2ui5_if_exit');
    const handler = f.find((x) => x.value === 'z2ui5_cl_http_handler');
    assert(exit?.member === 'removed' && /z2ui5_if_ui5_exit/.test(exit.message), 'z2ui5_if_exit: removed, use z2ui5_if_ui5_exit');
    assert(handler?.member === 'removed' && /z2ui5_cl_ui5_http_handler/.test(handler.message), 'z2ui5_cl_http_handler: removed, use z2ui5_cl_ui5_http_handler');
  });
}
