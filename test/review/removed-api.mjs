/*
 * Removed and moved names, said with their release and their successor:
 * rule removed-api, the vendored deprecations (data/deprecations.json, its
 * module mirror lib/abap2ui5-deprecations.mjs, the reader lib/deprecations.mjs)
 * and what a class on the frozen builder is judged by. Added 2026-11-27.
 *
 * The occasion: a class written from 2024's examples - z2ui5_cl_xml_view,
 * _bind_edit( ), z2ui5_cl_pop_to_confirm, a hand-rolled init flag - got ONE
 * finding, frozen-view-builder, whose sentence said the builder was "planned
 * to move" a release after it had moved. checkAbapSource( ) returned after
 * that finding, so no source-side rule and no obsolete-* rule ran on exactly
 * the class that needed them, while abaplint beside it reported three names
 * as not found and none with what replaced it.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ABAP2UI5_DEPRECATIONS } from '../../lib/abap2ui5-deprecations.mjs';
import { deprecationOf, objectDeprecation } from '../../lib/deprecations.mjs';
import { apiVerdict, MOVED_OBJECTS, REMOVED_OBJECTS } from '../../lib/released-api.mjs';
import { moduleText, shapeProblem } from '../../scripts/sync-deprecations.mjs';

export default async function ({ section, assert, f, FIX, checkAbapSource }) {
  const ROOT = path.join(FIX, '..', '..');
  const read = (name) => fs.readFileSync(f(name), 'utf8');
  const of = (source, opts = {}) => checkAbapSource(source, { render: false, ...opts }).findings;
  const app = (body) => 'CLASS zcl_rm DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_rm IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n' + body + '\n  ENDMETHOD.\nENDCLASS.\n';

  section('deprecations: the vendored copy names the docs commit it was read at', () => {
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'deprecations.source.json'), 'utf8'));
    const bytes = fs.readFileSync(path.join(ROOT, 'data', 'deprecations.json'));
    assert(record.repository === 'abap2UI5/docs' && record.path === 'docs/public/api/deprecations.json',
      `deprecations: vendored from ${record.repository} ${record.path}`);
    assert(/^[0-9a-f]{40}$/.test(record.commit), `deprecations: the source commit is recorded (${record.commit})`);
    assert(crypto.createHash('sha256').update(bytes).digest('hex') === record.sha256,
      'deprecations: data/deprecations.json is the verbatim copy the record hashes - refresh it with npm run sync-deprecations, never by hand');
    const doc = JSON.parse(bytes.toString('utf8'));
    assert(shapeProblem(doc) === null, `deprecations: the copy is the shape the linter reads (${shapeProblem(doc)})`);
    assert(fs.readFileSync(path.join(ROOT, 'lib', 'abap2ui5-deprecations.mjs'), 'utf8') === moduleText(doc),
      'deprecations: lib/abap2ui5-deprecations.mjs is generated from the copy - node scripts/sync-deprecations.mjs --module');
    assert(ABAP2UI5_DEPRECATIONS.entries.length === doc.entries.length && doc.entries.length >= 40,
      `deprecations: the module carries every entry (${doc.entries.length})`);
  });

  section('deprecations: a shape the linter does not read is refused, by name', () => {
    const ok = { schema: 1, entries: [{ name: 'a', kind: 'method', status: 'removed', replacement: '', since: '1.2.3' }] };
    assert(shapeProblem(ok) === null, 'the smallest valid document passes');
    const bad = (change) => shapeProblem({ ...ok, ...change });
    assert(/schema/.test(bad({ schema: 2 })), 'another schema');
    assert(/no entries/.test(bad({ entries: [] })), 'no entries');
    const entry = (e) => shapeProblem({ schema: 1, entries: [{ ...ok.entries[0], ...e }] });
    assert(/lower-case/.test(entry({ name: 'Z2UI5_CL_X' })), 'an upper-case name');
    assert(/status/.test(entry({ status: 'gone' })), 'an unknown status');
    assert(/since/.test(entry({ since: 'main' })), 'a since that is no release');
    assert(/movedTo/.test(entry({ status: 'moved' })), 'moved, to nowhere');
    assert(/movedTo/.test(entry({ movedTo: 'a/b' })), 'movedTo on a removed name');
    assert(/pattern/.test(entry({ name: 'a*' })), 'a * without pattern');
  });

  section('deprecations: exact before pattern, the longer pattern before the shorter', () => {
    assert(objectDeprecation('Z2UI5_CL_XML_VIEW')?.entry.status === 'moved' && objectDeprecation('z2ui5_cl_xml_view').how === 'exact',
      'an exact name, case-free');
    assert(objectDeprecation('z2ui5_cl_pop_to_confirm')?.entry.name === 'z2ui5_cl_pop_*', 'a popup is the popup pattern');
    assert(objectDeprecation('z2ui5_cl_pop_js_loader')?.entry.status === 'removed', 'the removed popup outranks the moved pattern it matches');
    assert(objectDeprecation('z2ui5_cl_util_api_cloud')?.entry.name === 'z2ui5_cl_util_api*', 'the longer pattern wins');
    assert(objectDeprecation('z2ui5_cl_util_xml')?.entry.name === 'z2ui5_cl_util*', 'the shorter one takes the rest');
    assert(objectDeprecation('z2ui5_cl_popup_to_confirm') === null && objectDeprecation('z2ui5_cl_ui5_view_builder') === null,
      'the successors are no deprecation');
    assert(deprecationOf('_BIND_EDIT', 'method')?.replacement === '_bind( )' && deprecationOf('t_sort', 'parameter', 'window_bind_tab')?.status === 'removed',
      'a method and a parameter of a method');
  });

  section('deprecations: the mirror in released-api.mjs and the data tell one story', () => {
    /* non-released-api takes WHICH objects from its mirror and WHEN from the
     * data. A mirrored name the data does not date, or dates as something
     * else, would print a sentence with half its facts missing. */
    for (const name of Object.keys(MOVED_OBJECTS)) {
      const e = objectDeprecation(name)?.entry;
      assert(e?.status === 'moved' && e.movedTo === 'abap2UI5/abap2UI5-ext', `${name}: moved in the mirror, and moved to abap2UI5-ext in the data (${e?.status ?? 'absent'})`);
    }
    for (const name of Object.keys(REMOVED_OBJECTS)) {
      assert(objectDeprecation(name)?.entry.status === 'removed', `${name}: removed in the mirror and in the data`);
    }
  });

  section('removed-api: every kind of name, with status, release and successor', () => {
    const found = of(read('removedapi.clas.abap')).filter((x) => x.type === 'removed-api');
    const got = found.map((x) => `${x.line} ${x.member} ${x.value} ${x.severity}`).sort().join('\n');
    const want = [
      '22 field s_ctrl-check_allow_multi_req error',
      '26 attribute z2ui5_if_app~check_initialized error',
      '27 method set_push_state error',
      '32 constant cs_event-set_nav_routing error',
      '34 method set_nav_back error',
      '36 class z2ui5_cl_pop_js_loader error',
    ].join('\n');
    assert(got === want, `removed-api: one finding per removed name, none for the comment and the string\n${got}`);
    const push = found.find((x) => x.value === 'set_push_state');
    assert(/client->set_push_state\( \) was removed from abap2UI5 in 1\.144\.1/.test(push.message) && /instead: hash_set\( \)/.test(push.message),
      `removed-api: the sentence carries the status, the release and the replacement (${push.message})`);
    const src = read('removedapi.clas.abap').split('\n');
    assert(src[push.line - 1].slice(push.column - 1).startsWith('set_push_state'), 'removed-api: the finding points at the name');
    const loader = found.find((x) => x.value === 'z2ui5_cl_pop_js_loader');
    assert(/removed from abap2UI5 in 1\.145\.0/.test(loader.message), 'removed-api: an exact removed name is not read as the moved pattern it also matches');
  });

  section('removed-api: a removed parameter of a call', () => {
    const found = of(app('    client->window_bind_tab( val = mt_rows t_sort = mt_sort total = 10 ).\n    client->window_bind_tab( val = mt_rows total = lines( VALUE string_table( ( `t_sort = x` ) ) ) ).'))
      .filter((x) => x.type === 'removed-api');
    assert(found.length === 1 && found[0].value === 't_sort' && found[0].line === 8,
      `removed-api: t_sort on the call that passes it, nothing for the one that does not (${found.map((x) => `${x.line}:${x.value}`).join()})`);
    assert(/the parameter t_sort of window_bind_tab\( \) was removed from abap2UI5 in 1\.151\.0/.test(found[0].message), found[0].message);
  });

  section('removed-api: one token, one finding - what another rule reports is left to it', () => {
    const src = app('    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).\n    v->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv_a ) )->a( n = `placeholder` v = client->_bind( val = mv_b view = `MAIN` ) ).\n'
      + '    client->view_display( v->stringify( ) ).\n    client->view_model_update( ).\n    client->popup_model_update( ).\n'
      + '    DATA(c) = client->get( )-viewname.\n'
      + '    DATA(d) = z2ui5_cl_pop_to_confirm=>factory( `x` ).\n    DATA e TYPE REF TO z2ui5_if_exit.\n    DATA g TYPE REF TO z2ui5_cl_xml_view.');
    const found = of(src);
    assert(!found.some((x) => x.type === 'removed-api'), `removed-api stands down for every one of them (${found.filter((x) => x.type === 'removed-api').map((x) => x.value).join()})`);
    assert(found.filter((x) => x.type === 'obsolete-binder').length === 1, '_bind_edit( ) is obsolete-binder\'s');
    assert(found.filter((x) => x.type === 'obsolete-model-update').length === 2, 'the model updates are obsolete-model-update\'s');
    assert(found.some((x) => x.type === 'obsolete-bind-argument') && found.some((x) => x.type === 'get-viewname-removed'), 'the view argument and the viewname read keep their rules');
    const moved = found.filter((x) => x.type === 'non-released-api');
    assert(moved.length === 3, `the moved and the deleted objects are non-released-api's (${moved.map((x) => x.value).join()})`);
  });

  section('non-released-api: a moved or deleted object carries the release from the data', () => {
    const found = of(app('    DATA(d) = z2ui5_cl_pop_to_confirm=>factory( `x` ).\n    DATA e TYPE REF TO z2ui5_if_exit.\n    DATA(u) = z2ui5_cl_util=>uuid_get_c32( ).\n    DATA(j) = z2ui5_cl_ajson=>create_empty( ).'))
      .filter((x) => x.type === 'non-released-api');
    const msg = (name) => found.find((x) => x.value === name)?.message ?? '';
    assert(/no longer shipped with abap2UI5 since 1\.151\.0/.test(msg('z2ui5_cl_pop_to_confirm')) && /github\.com\/abap2UI5\/abap2UI5-ext/.test(msg('z2ui5_cl_pop_to_confirm'))
      && /z2ui5_cl_popup_\* from the popups addon/.test(msg('z2ui5_cl_pop_to_confirm')), msg('z2ui5_cl_pop_to_confirm'));
    assert(/since 1\.149\.0/.test(msg('z2ui5_cl_util')), `the utility classes left two releases earlier (${msg('z2ui5_cl_util')})`);
    assert(/deleted upstream in 1\.151\.0/.test(msg('z2ui5_if_exit')) && /use z2ui5_if_ui5_exit/.test(msg('z2ui5_if_exit')), msg('z2ui5_if_exit'));
    assert(!/\d+\.\d+\.\d+/.test(msg('z2ui5_cl_ajson')) && /internal/.test(msg('z2ui5_cl_ajson')), 'an internal object left nowhere and is dated by nothing');
    assert(found.every((x) => x.severity === 'warning'), 'the severity of non-released-api did not move');
  });

  section('removed-api: unknown is not missing', () => {
    // somebody's own class under a moved pattern, in a package this run does not see
    assert(!of(app('    DATA(x) = z2ui5_cl_utility_own=>get( ).\n    DATA(y) = z2ui5_cl_pop_my_own=>factory( ).')).some((x) => x.type === 'removed-api'),
      'a name only a MOVED pattern matches is nobody\'s listed object');
    // the repository's own object, and the class's own name
    const own = of(app('    DATA(x) = z2ui5_cl_pop_js_loader=>factory( ).'), { ownObjects: ['z2ui5_cl_pop_js_loader'] });
    assert(!own.some((x) => x.type === 'removed-api'), 'an object the linted repository defines is its own');
    // a method of that name on something that is no client
    assert(!of(app('    lo_router->set_nav_back( `X` ).\n    DATA(t) = mo_grid->cs_event-set_nav_routing.')).filter((x) => x.type === 'removed-api' && x.member === 'method').length,
      'set_nav_back( ) on another object is not the client\'s method');
    // a hand-rolled attribute called check_initialized is not the interface's
    assert(!of(read('frozenoldstyle.clas.abap')).some((x) => x.type === 'removed-api'),
      'check_initialized as the class\'s own attribute is manual-init-flag\'s, not a removed name');
    // deprecated is not removed
    assert(!of(app('    client->follow_up_action( client->_event_client( client->cs_event-popup_close ) ).')).some((x) => x.type === 'removed-api'),
      '_event_client( ) still compiles: obsolete-frontend-event, not removed-api');
  });

  section('removed-api: a moved name is a warning, a removed one an error, and the config has the last word', () => {
    assert(of(app('    client->set_nav_back( `X` ).')).find((x) => x.type === 'removed-api')?.severity === 'error',
      'removed: the class does not compile on the current release');
    const off = of(app('    client->set_nav_back( `X` ).'), { rules: { 'removed-api': false } });
    assert(!off.some((x) => x.type === 'removed-api'), 'switched off in the rules block');
    const soft = of(app('    client->set_nav_back( `X` ).'), { rules: { 'removed-api': 'warning' } });
    assert(soft.find((x) => x.type === 'removed-api')?.severity === 'warning', 'an installation on an older release says so once');
    const waived = of(app('    client->set_nav_back( `X` ). " abap2ui5lint-disable-line removed-api'));
    assert(!waived.some((x) => x.type === 'removed-api' || x.type === 'unused-directive'), 'a directive waives it, and is used');
    // it reads a class with no view too
    const helper = 'CLASS zcl_h DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS go IMPORTING client TYPE REF TO z2ui5_if_client.\nENDCLASS.\n\nCLASS zcl_h IMPLEMENTATION.\n  METHOD go.\n    client->set_nav_back( `X` ).\n  ENDMETHOD.\nENDCLASS.\n';
    assert(of(helper, { allClasses: true }).some((x) => x.type === 'removed-api'), 'a helper class under allClasses is read as well');
  });

  section('frozen builder: the class is told what replaced each old name, not only that its builder is old', () => {
    const found = of(read('frozenoldstyle.clas.abap'));
    const got = found.map((x) => `${x.line}:${x.column} ${x.severity} ${x.type}`).sort().join('\n');
    const want = ['17:5 warning manual-init-flag', '19:20 warning frozen-view-builder', '22:25 warning obsolete-binder', '30:31 warning non-released-api'].join('\n');
    assert(got === want, `frozen builder: the four things a class from 2024's examples has to hear, and nothing about a view nobody read\n${got}`);
    const frozen = found.find((x) => x.type === 'frozen-view-builder');
    assert(/since abap2UI5 1\.151\.0 no longer part of the framework/.test(frozen.message) && /moved to github\.com\/abap2UI5\/abap2UI5-ext/.test(frozen.message)
      && /compiles only where that repository is installed/.test(frozen.message) && !/planned to move/.test(frozen.message),
      `frozen builder: where the builder IS, not where it was planned to go (${frozen.message})`);
    assert(found.filter((x) => x.type === 'non-released-api').every((x) => x.value !== 'z2ui5_cl_xml_view'),
      'frozen builder: the builder at its factory call is one finding, not two');
    const binder = found.find((x) => x.type === 'obsolete-binder');
    assert(binder.fixes?.length === 1, 'frozen builder: the rename keeps its fix');
  });

  section('frozen builder: no rule about the view it cannot read', () => {
    /* page( ), button( ), a wrapper raising an event: the old API. A rule
     * that reads a chain or pairs events with handlers would be guessing. */
    const src = read('frozenoldstyle.clas.abap').replace('WHEN `POST`.', 'WHEN `NEVER_RAISED`.');
    const types = new Set(of(src).map((x) => x.type));
    for (const id of ['unknown-builder-method', 'handler-without-event', 'event-without-handler', 'view-never-displayed', 'unknown-control']) {
      assert(!types.has(id), `frozen builder: ${id} stays out`);
    }
    // a second mention of the builder is a use of a moved object like any other
    const twice = read('frozenoldstyle.clas.abap').replace('PROTECTED SECTION.', 'PROTECTED SECTION.\n    DATA mo_view TYPE REF TO z2ui5_cl_xml_view.');
    assert(of(twice).filter((x) => x.type === 'non-released-api' && x.value === 'z2ui5_cl_xml_view').length === 1,
      'frozen builder: only the token frozen-view-builder reports is left to it');
    // a waiver for a rule that did run is used; one for a view rule is unjudged, not unused
    const waived = read('frozenoldstyle.clas.abap').replace('client->_bind_edit( name )', 'client->_bind_edit( name ) " abap2ui5lint-disable-line obsolete-binder');
    assert(!of(waived).some((x) => x.type === 'obsolete-binder' || x.type === 'unused-directive'), 'frozen builder: a directive for a rule that ran is honoured');
  });
}
