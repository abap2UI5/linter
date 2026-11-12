/*
 * The 2026-09-25 round: seven verified defects, each with the source that
 * reproduced it. The unescaped-text false positives on constants, on
 * literal-fed helper parameters and on properties that cannot show text;
 * `_bind_path( )` and `_event_nav_app_leave( )` (added to z2ui5_if_client on
 * 2026-09-13) in the reconstructor and the rules; the app class whose view is
 * built elsewhere, which was not collected at all; the separate-lifecycle-ifs
 * fix that folded "seed on init, display on navigated" into a first roundtrip
 * that displays nothing; the new binding-to-static; the flow rules following
 * helper methods; and chain-unbalanced-parens. See test/review/README.md for
 * the harness.
 */
import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import { applyFixes } from '../../lib/fix.mjs';
import { collectFiles } from '../../lib/index.mjs';
import { runStats, statsRows, summarize } from '../../lib/report.mjs';

/* A complete app class around a main( ) body and a view - `defs` in the
 * PUBLIC SECTION, `main` before the view is built, `attrs` on the view's
 * Button, `chain` after the Button, `methods` after main( ). */
const frame = ({ defs = '', main = '', attrs = '', chain = '', methods = '', prot = '  PROTECTED SECTION.\n', priv = '  PRIVATE SECTION.\n', tail = '', core = false } = {}) =>
  'CLASS zcl_review_round0925 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + defs + prot + priv + 'ENDCLASS.\n\n'
  + 'CLASS zcl_review_round0925 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + main
  + '\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + (core ? '        )->a( n = `xmlns:core` v = `sap.ui.core`\n' : '')
  + '        )->ele( `Page`\n'
  + '          )->a( n = `id` v = `mainPage`\n'
  + '          )->tag( `Button`\n'
  + '            )->a( n = `text` v = client->_bind( mv_text )\n'
  + attrs
  + chain
  + '        )->end( ).\n\n'
  + tail
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\n'
  + methods
  + 'ENDCLASS.\n';

/* A dispatcher-only main( ) with the view built in a helper of its own, the
 * shape the lifecycle and flow rules read. */
const dispatcher = (main, { defs = '', methods = '' } = {}) =>
  'CLASS zcl_review_flow0925 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS view_display.\n    METHODS popup_display.\n'
  + defs + 'ENDCLASS.\n\nCLASS zcl_review_flow0925 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n' + main + '  ENDMETHOD.\n\n'
  + '  METHOD view_display.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n        )->a( n = `xmlns` v = `sap.m`\n        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n        )->ele( `Page`\n            )->tag( `Input`\n                )->a( n = `value` v = client->_bind( mv_text )\n        )->end( ).\n'
  + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\n\n'
  + '  METHOD popup_display.\n    DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    popup->ele( n = `FragmentDefinition` ns = `core`\n        )->a( n = `xmlns` v = `sap.m`\n        )->a( n = `xmlns:core` v = `sap.ui.core`\n        )->ele( `Dialog`\n            )->ele( `buttons`\n                )->tag( `Button`\n                    )->a( n = `text` v = `Close`\n                    )->a( n = `press` v = client->_event( `CLOSE` )\n        )->end( ).\n'
  + '    client->popup_display( popup->stringify( ) ).\n  ENDMETHOD.\n\n'
  + methods + 'ENDCLASS.\n';

export default async function ({ section, assert, FIX, tempDir, checkAbapSource, checkFiles, prepareAbap }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env: ENV }), err: '', code: 0 };
    } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
  };

  section('round 2026-09-25: the frames are clean', () => {
    const a = judge(frame()).map((x) => x.type);
    const b = judge(dispatcher('    IF client->check_on_init( ).\n      mv_text = `init`.\n      view_display( ).\n    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF client->check_on_event( `CLOSE` ).\n      view_display( ).\n    ENDIF.\n')).map((x) => x.type);
    assert(a.length === 0 && b.length === 0, `both frames report nothing on their own (${[...a, ...b].join(', ') || 'none'})`);
  });

  // ------------------------------------------------ 1. unescaped-text-in-attribute

  section('unescaped-text-in-attribute: a CONSTANTS is a literal, single or chained, whatever it is written into', () => {
    const src = frame({
      defs: '    CONSTANTS c_width TYPE string VALUE `12rem`.\n'
        + '    CONSTANTS: c_hint TYPE string VALUE `Type here`,\n               c_id   TYPE string VALUE `INPUT_ONE`.\n'
        + '    CONSTANTS: BEGIN OF c_s, label TYPE string VALUE `Name`, END OF c_s.\n',
      chain: '          )->tag( `Input`\n'
        + '            )->a( n = `placeholder` v = c_hint\n'
        + '            )->a( n = `id`          v = c_id\n'
        + '            )->a( n = `tooltip`     v = c_s-label\n'
        + '            )->a( n = `description` v = me->c_width\n',
    });
    const found = of(src, 'unescaped-text-in-attribute');
    assert(found.length === 0, `no constant is data (${found.map((x) => x.member).join(', ') || 'none'})`);
    // the control: the same attributes fed by a name nothing assigns
    const data = frame({ chain: '          )->tag( `Input`\n            )->a( n = `placeholder` v = lv_hint\n            )->a( n = `tooltip` v = ls_row-label\n' });
    assert(of(data, 'unescaped-text-in-attribute').length === 2, 'a name nothing writes is still data on the same attributes');
  });

  section('unescaped-text-in-attribute: a helper parameter every call passes a literal is a literal, per method', () => {
    const methods = '  METHOD render_row.\n    form->tag( `Label` )->a( n = `text` v = label ).\n'
      + '    form->tag( `Text` )->a( n = `text` v = text ).\n  ENDMETHOD.\n\n'
      + '  METHOD render_note.\n    form->tag( `Text` )->a( n = `text` v = text ).\n  ENDMETHOD.\n\n'
      + '  METHOD render_group.\n    render_row( form = form label = title text = name ).\n  ENDMETHOD.\n\n';
    const defs = '    METHODS render_row IMPORTING form TYPE REF TO z2ui5_cl_ui5_view_builder label TYPE string OPTIONAL text TYPE string.\n'
      + '    METHODS render_note IMPORTING form TYPE REF TO z2ui5_cl_ui5_view_builder text TYPE string.\n'
      + '    METHODS render_group IMPORTING form TYPE REF TO z2ui5_cl_ui5_view_builder title TYPE string name TYPE string.\n';
    // literals at every call site, once through a second parameter (`name` -> `text`)
    const literal = frame({
      defs, methods,
      tail: '    render_row( form = view label = `Stack` text = `samples-stack` ).\n'
        + '    render_group( form = view title = `Learn` name = `samples` && `-controls` ).\n'
        + '    render_note( form = view text = |{ mv_text }| ).\n',
    });
    const found = of(literal, 'unescaped-text-in-attribute');
    assert(found.length === 1 && lineOf(literal, 'METHOD render_note') < found[0].line && found[0].line < lineOf(literal, 'METHOD render_group'),
      `only render_note's text, fed a template, is data - render_row's text of the same name is not (${found.map((x) => `${x.member}@${x.line}`).join(', ')})`);
    // one call site passing a name makes the parameter data again
    const mixed = frame({ defs, methods, tail: '    render_row( form = view label = `Stack` text = mv_text ).\n    render_group( form = view title = `Learn` name = `samples` ).\n' });
    const again = of(mixed, 'unescaped-text-in-attribute');
    assert(again.length === 1 && again[0].member === 'text' && again[0].line === lineOf(mixed, 'v = text ).') , `a call passing a name keeps the parameter on the finding (${again.map((x) => `${x.member}@${x.line}`).join(', ')})`);
    // a method the class never calls: the value comes from elsewhere, so it is data
    const outside = frame({ defs, methods });
    assert(of(outside, 'unescaped-text-in-attribute').length === 2, 'a parameter of a method nothing in the class calls is data, as before (label, and text - the two `v = text` are one shape to the collector)');
  });

  section('unescaped-text-in-attribute: a property that cannot show text stands the rule down, a string one does not', () => {
    const src = frame({
      core: true,
      chain: '          )->tag( `Input`\n'
        + '            )->a( n = `width`       v = lv_size\n'      // sap.ui.core.CSSSize
        + '            )->a( n = `maxLength`   v = lv_max\n'       // int
        + '            )->a( n = `valueState`  v = lv_state\n'     // an enum
        + '            )->a( n = `description` v = lv_descr\n'     // string: reported
        + '          )->tag( n = `Icon` ns = `core`\n'
        + '            )->a( n = `size`        v = lv_size\n'      // CSSSize again, under a prefixed control
        + '            )->a( n = `alt`         v = lv_alt\n',       // string: reported
    });
    const members = of(src, 'unescaped-text-in-attribute').map((x) => x.member).sort().join();
    assert(members === 'alt,description', `only the string-typed properties are reported (${members || 'none'})`);
    // with no snapshot to ask, every one of them is judged as before
    const blind = checkAbapSource(src, { ...opts, properties: false }).findings.filter((x) => x.type === 'unescaped-text-in-attribute');
    assert(blind.length === 6, `without metadata nothing stands down (${blind.length})`);
  });

  // ------------------------------------------------ 2. _bind_path( ) and _event_nav_app_leave( )

  section('_bind_path( ): the reconstructor reads it as the bare path, exactly like _bind( val = … path = abap_true )', () => {
    const doc = (bind) => prepareAbap(frame({
      defs: '    TYPES: BEGIN OF ty_row, product TYPE string, END OF ty_row.\n    DATA t_items TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
      chain: `          )->ele( \`List\`\n            )->a( n = \`items\` v = ${bind}\n            )->ele( \`items\`\n              )->tag( \`StandardListItem\` )->a( n = \`title\` v = \`{product}\`\n            )->end(\n          )->end(\n`,
    })).docs[0];
    const long = doc('client->_bind( val = t_items path = abap_true )');
    assert(/items="\/T_ITEMS"/.test(long), 'the long form reconstructs the bare path');
    assert(doc('client->_bind_path( t_items )') === long, 'the positional _bind_path( ) reconstructs the same document');
    assert(doc('client->_bind_path( val = t_items )') === long, 'so does the named form');
    assert(!/items=/.test(doc('client->_bind_path( val = t_items path = abap_true )')), 'a second argument is not the one-parameter method - the value stays unresolved, as any call this gate cannot follow');
    // and the rules judge it as they judge the long form
    const src = frame({
      defs: '    TYPES: BEGIN OF ty_row, product TYPE string, END OF ty_row.\n    DATA t_items TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.\n',
      chain: '          )->ele( `List`\n            )->a( n = `items` v = client->_bind_path( t_items )\n            )->ele( `items`\n              )->tag( `StandardListItem` )->a( n = `title` v = `{product}`\n            )->end(\n          )->end(\n',
    });
    const types = judge(src).map((x) => x.type);
    const longTypes = judge(src.replace('client->_bind_path( t_items )', 'client->_bind( val = t_items path = abap_true )')).map((x) => x.type);
    assert(types.join() === longTypes.join() && types.length > 0, `the same findings as the long form (${types.join(', ')})`);
  });

  section('_bind_path( ) and _event_nav_app_leave( ) in the ABAP-side rules', () => {
    const local = frame({ main: '    DATA lv_x TYPE string.\n', attrs: '            )->a( n = `tooltip` v = client->_bind_path( lv_x )\n' });
    assert(of(local, 'binding-to-local').length === 1, 'binding-to-local reads _bind_path( )');
    const nonpublic = frame({ prot: '  PROTECTED SECTION.\n    DATA mv_hidden TYPE string.\n', attrs: '            )->a( n = `tooltip` v = client->_bind_path( mv_hidden )\n' });
    assert(of(nonpublic, 'binding-to-nonpublic').length === 1, 'binding-to-nonpublic reads _bind_path( )');
    const captured = frame({ main: '    DATA(lv_path) = client->_bind_path( mv_text ).\n', attrs: '            )->a( n = `tooltip` v = lv_path\n' });
    const cap = of(captured, 'client-handle-capture');
    assert(cap.length === 1 && cap[0].value === '_bind_path', 'client-handle-capture names the _bind_path( ) handle');
    const leave = frame({ main: '    DATA(lv_leave) = client->_event_nav_app_leave( ).\n', attrs: '            )->a( n = `press` v = lv_leave\n' });
    assert(of(leave, 'client-handle-capture').length === 1, 'and the _event_nav_app_leave( ) handle');
    // the wire survives reconstruction and is no event to handle
    const wired = frame({ attrs: '            )->a( n = `press` v = client->_event_nav_app_leave( )\n' });
    assert(/press="\.eB\(\)"/.test(prepareAbap(wired).docs[0]), 'navButtonPress-style wires reconstruct as a handler, not as a dropped attribute');
    const bad = judge(wired).map((x) => x.type);
    assert(!bad.includes('event-without-handler') && !bad.includes('handler-without-event'), `no handler is expected for it (${bad.join(', ') || 'none'})`);
    // a Dialog whose only wire is the leave
    const dialog = frame({
      methods: '  METHOD popup.\n    DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
        + '    popup->ele( n = `FragmentDefinition` ns = `core`\n        )->a( n = `xmlns` v = `sap.m`\n        )->a( n = `xmlns:core` v = `sap.ui.core`\n        )->ele( `Dialog`\n            )->ele( `buttons`\n                )->tag( `Button`\n                    )->a( n = `text` v = `Back`\n                    )->a( n = `press` v = client->_event_nav_app_leave( )\n        )->end( ).\n'
        + '    client->popup_display( popup->stringify( ) ).\n  ENDMETHOD.\n',
      defs: '    METHODS popup.\n',
    });
    assert(of(dialog, 'popup-without-close-wire').length === 0, 'a Dialog closed by leaving the app has its close wire');
    assert(of(dialog.replace('client->_event_nav_app_leave( )', '`x`'), 'popup-without-close-wire').length === 1, 'the same Dialog without it is reported');
  });

  // ------------------------------------------------ 3. an app class whose view is built elsewhere

  section('an app class that builds no view is collected, judged by what needs no view, and counted as such', async () => {
    const viewless = 'CLASS zcl_viewless DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_name TYPE string.\n'
      + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n  PRIVATE SECTION.\n    DATA mv_secret TYPE string.\nENDCLASS.\n\n'
      + 'CLASS zcl_viewless IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n    IF client->check_on_navigated( ).\n'
      + '      client->view_display( zcl_x_views=>main( client = client name = client->_bind_edit( mv_name ) secret = client->_bind( mv_secret ) ) ).\n'
      + '    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
    const helper = 'CLASS zcl_helper DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\nCLASS zcl_helper IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n';
    const dir = tempDir('abap2ui5lint-viewless-');
    fs.writeFileSync(path.join(dir, 'zcl_viewless.clas.abap'), viewless);
    fs.writeFileSync(path.join(dir, 'zcl_helper.clas.abap'), helper);
    const collected = collectFiles([dir]);
    assert(collected.length === 1 && collected[0].endsWith('zcl_viewless.clas.abap'), `the app class is collected on a directory walk, the helper still is not (${collected.length})`);
    assert(collectFiles([path.join(dir, 'zcl_viewless.clas.abap')]).length === 1, 'and when named');

    const r = checkAbapSource(viewless, { render: false });
    const types = r.findings.map((x) => x.type).sort();
    assert(r.usesBuilder === false && r.appWithoutView === true, 'the result says the class builds no view here');
    assert(types.includes('obsolete-binder') && types.includes('binding-to-nonpublic') && types.includes('private-app-attribute'),
      `the _bind_edit( ) and the bind on the PRIVATE attribute are reported (${types.join(', ')})`);
    assert(!types.includes('unbound-public-attribute') && !types.some((t) => /^(?:chain-|unknown-|unused-)/.test(t)),
      `nothing about the view it does not have is judged (${types.join(', ')})`);
    assert(r.findings.find((x) => x.type === 'binding-to-nonpublic').fixes?.length, 'the fixes travel with the findings');

    // the run summary counts it apart from the classes that build a view
    const [checked] = await checkFiles([path.join(dir, 'zcl_viewless.clas.abap')], { render: false });
    const stats = runStats([checked]);
    assert(stats.abap === 1 && stats.builder === 0 && stats.appsWithoutView === 1 && stats.emptyViews === 0, `counted as an app class building none here (${JSON.stringify({ abap: stats.abap, builder: stats.builder, appsWithoutView: stats.appsWithoutView })})`);
    const sources = statsRows(stats, { ...summarize([checked]), failing: 0 }).find(([label]) => label === 'sources')[1];
    assert(/1 app class \(0 building a view, 1 building none here/.test(sources), `the sources row says so (${sources})`);

    // and the CLI, for one file, says it under the report instead of "no checkable app classes"
    const named = run([path.join(dir, 'zcl_viewless.clas.abap'), '--no-render']);
    assert(named.code === 1 && /binding-to-nonpublic/.test(named.out), `the named file is checked and fails on its findings (exit ${named.code})`);
    assert(/1 app class builds no view here \(the view comes from another class\)/.test(named.out), 'the report says the view was not checked here');
    fs.writeFileSync(path.join(dir, 'zcl_clean.clas.abap'), viewless.replace(/zcl_viewless/g, 'zcl_clean').replace('_bind_edit( mv_name )', '_bind( mv_name )').replace('secret = client->_bind( mv_secret )', 'secret = mv_secret').replace('  PRIVATE SECTION.\n    DATA mv_secret TYPE string.\n', '  PRIVATE SECTION.\n'));
    const clean = run([path.join(dir, 'zcl_clean.clas.abap'), '--no-render']);
    assert(clean.code === 0 && /Success! No findings detected\./.test(clean.out) && /builds no view here/.test(clean.out) && !/no checkable app classes/.test(clean.out),
      `a clean one passes, and the pass says no view was checked (exit ${clean.code}: ${clean.out.split('\n').filter(Boolean).slice(-2).join(' | ')})`);
  });

  // ------------------------------------------------ 4. the separate-lifecycle-ifs fix

  section('separate-lifecycle-ifs: seed on init, display on navigated - reported, but not folded', () => {
    const seeds = dispatcher('    IF client->check_on_init( ).\n      mv_text = `seed`.\n    ENDIF.\n    IF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n');
    const found = of(seeds, 'separate-lifecycle-ifs');
    assert(found.length === 1 && !found[0].fixes, 'the finding stays and carries no fix');
    assert(applyFixes(seeds, found).output === seeds, 'so --fix leaves the class displaying on the first roundtrip');
    // the fold is still offered where the init block displays too - both arms
    // put a view on screen, so the ELSEIF changes nothing on the first roundtrip
    const both = dispatcher('    IF client->check_on_init( ).\n      mv_text = `seed`.\n      view_display( ).\n    ENDIF.\n    IF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n');
    const fixable = of(both, 'separate-lifecycle-ifs');
    assert(fixable.length === 1 && fixable[0].fixes?.length === 1, 'an init block that displays keeps the fold');
    assert(/ELSEIF client->check_on_navigated/.test(applyFixes(both, fixable).output), 'and the fold is the ELSEIF');
    // the other pairs are untouched: event after navigated folds as before
    const events = dispatcher('    IF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n    IF client->check_on_event( `CLOSE` ).\n      mv_text = `x`.\n    ENDIF.\n');
    assert(of(events, 'separate-lifecycle-ifs')[0]?.fixes?.length === 1, 'a navigated/event pair still folds');
  });

  // ------------------------------------------------ 5. binding-to-static

  section('binding-to-static: a CONSTANTS or CLASS-DATA bound raises BINDING_ERROR, whatever section declares it', () => {
    const src = frame({
      defs: '    CONSTANTS c_label TYPE string VALUE `Hello`.\n    CLASS-DATA gv_static TYPE string.\n'
        + '    CONSTANTS: c_one TYPE string VALUE `1`,\n               c_two TYPE string VALUE `2`.\n'
        + '    CONSTANTS: BEGIN OF c_s, title TYPE string VALUE `T`, END OF c_s.\n',
      priv: '  PRIVATE SECTION.\n    CLASS-DATA gv_hidden TYPE string.\n    CONSTANTS c_hidden TYPE string VALUE `h`.\n',
      main: '    CONSTANTS lc_local TYPE string VALUE `local`.\n',
      chain: '          )->tag( `Input`\n'
        + '            )->a( n = `value`       v = client->_bind( c_label )\n'
        + '            )->a( n = `placeholder` v = client->_bind( gv_static )\n'
        + '            )->a( n = `description` v = client->_bind_path( c_two )\n'
        + '            )->a( n = `tooltip`     v = client->_bind( c_s-title )\n'
        + '            )->a( n = `name`        v = client->_bind( gv_hidden )\n'
        + '            )->a( n = `valueStateText` v = client->_bind( c_hidden )\n'
        + '            )->a( n = `fieldGroupIds`  v = client->_bind( lc_local )\n',
    });
    const found = of(src, 'binding-to-static');
    const members = found.map((x) => `${x.member}:${x.value}`).sort().join(' ');
    assert(members === 'c_hidden:CONSTANTS c_label:CONSTANTS c_s:CONSTANTS c_two:CONSTANTS gv_hidden:CLASS-DATA gv_static:CLASS-DATA lc_local:CONSTANTS',
      `every static bind is reported once, with what declared it (${members})`);
    assert(found.every((x) => x.severity === 'error'), 'an error: the first roundtrip raises');
    assert(found.find((x) => x.member === 'c_label').line === lineOf(src, '_bind( c_label )'), 'the finding sits on the bind');
    assert(of(src, 'binding-to-nonpublic').length === 0, 'the PRIVATE statics are this rule\'s, not binding-to-nonpublic\'s - moving them to PUBLIC would change nothing');
    assert(of(src, 'binding-to-local').length === 0 && of(src, 'binding-to-expression').length === 0, 'and no neighbour claims them');
    assert(of(frame({ attrs: '            )->a( n = `tooltip` v = client->_bind( mv_text )\n' }), 'binding-to-static').length === 0, 'an instance attribute is silent');
  });

  // ------------------------------------------------ 6. the flow rules follow helper methods

  section('unconditional-popup-display and display-after-nav-app-call see a display issued through a helper', () => {
    const popup = dispatcher('    IF client->check_on_init( ).\n      view_display( ).\n    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n    popup_display( ).\n');
    const found = of(popup, 'unconditional-popup-display');
    assert(found.length === 1 && found[0].member === 'popup_display' && found[0].line === lineOf(popup, '    popup_display( ).'),
      `a popup helper at the top level of main( ) is reported at the call (${found.map((x) => `${x.member}@${x.line}`).join(', ')})`);
    const guarded = dispatcher('    IF client->check_on_init( ).\n      view_display( ).\n      RETURN.\n    ENDIF.\n    popup_display( ).\n');
    assert(of(guarded, 'unconditional-popup-display').length === 0, 'behind a guard that leaves the method it is conditional, as for the written-out call');
    const viewOnly = dispatcher('    IF client->check_on_init( ).\n      popup_display( ).\n    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ENDIF.\n    view_display( ).\n');
    assert(of(viewOnly, 'unconditional-popup-display').length === 0, 'a helper that displays the main view is not a popup');

    const nav = dispatcher('    IF client->check_on_init( ).\n      view_display( ).\n    ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF client->check_on_event( `CLOSE` ).\n      on_close( ).\n    ENDIF.\n',
      { defs: '    METHODS on_close.\n', methods: '  METHOD on_close.\n    client->nav_app_call( NEW zcl_review_flow0925( ) ).\n    view_display( ).\n  ENDMETHOD.\n' });
    const after = of(nav, 'display-after-nav-app-call');
    assert(after.length === 1 && after[0].member === 'view_display' && after[0].line === lineOf(nav, '    view_display( ).\n  ENDMETHOD.\nENDCLASS'),
      `a display helper behind nav_app_call( ) in a helper method is reported (${after.map((x) => `${x.member}@${x.line}`).join(', ')})`);
    assert(after[0].severity === 'hint', 'still a hint - only what it sees widened');
    const returns = nav.replace('NEW zcl_review_flow0925( ) ).\n    view_display( ).', 'NEW zcl_review_flow0925( ) ).\n    RETURN.\n    view_display( ).');
    assert(of(returns, 'display-after-nav-app-call').length === 0, 'a RETURN between the two ends the flow');
  });

  // ------------------------------------------------ 7. chain-unbalanced-parens

  section('chain-unbalanced-parens: one ) too many, one ( never closed, and the line the report names', () => {
    const extra = frame({ chain: '          )->tag( `Input`\n            )->a( n = `value` v = client->_bind( mv_text ) ) )\n' });
    const found = of(extra, 'chain-unbalanced-parens');
    assert(found.length === 1 && found[0].severity === 'warning' && /too many/.test(found[0].value), `the stray ) is reported as a warning (${found.map((x) => x.value).join(', ')})`);
    assert(found[0].line === lineOf(extra, 'v = client->_bind( mv_text ) ) )'), `on the line that carries it (${found[0].line})`);
    const missing = frame({ chain: '          )->tag( `Input`\n            )->a( n = `value` v = client->_bind( mv_text )\n          )->tag( `Text`\n            )->a( n = `text` v = `x`\n' }).replace('        )->end( ).', '        )->end( .');
    const open = of(missing, 'chain-unbalanced-parens');
    assert(open.length === 1 && /never closed/.test(open[0].value), `a ( never closed is reported the other way round (${open.map((x) => x.value).join(', ')})`);
    assert(of(frame(), 'chain-unbalanced-parens').length === 0, 'a balanced chain is silent');
    const elsewhere = frame({ main: '    DATA(lv_x) = strlen( mv_text ) ).\n' });
    assert(of(elsewhere, 'chain-unbalanced-parens').length === 0, 'a stray paren in a statement with no builder call is not this rule\'s');
    // the one-file run says when a builder produced no view, without --stats
    const dir = tempDir('abap2ui5lint-emptyview-');
    const file = path.join(dir, 'zcl_empty.clas.abap');
    fs.writeFileSync(file, 'CLASS zcl_empty DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\nCLASS zcl_empty IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n  ENDMETHOD.\nENDCLASS.\n');
    const one = run([file, '--no-render']);
    assert(/1 class opened a builder and produced no view/.test(one.out), `the line prints for a single file (${one.out.split('\n').filter(Boolean).slice(-2).join(' | ')})`);
    assert(!/opened a builder/.test(run([file, '--no-render', '--stats']).out), 'with the run summary printed, its views row carries the count and the line is not repeated');
  });
}
