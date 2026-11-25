/*
 * Builder chains through static helpers of ANOTHER class of the run - the
 * views class an app suite builds every screen with:
 *
 *   DATA(page) = zcl_views=>factory_view( ).          " the root, handed out
 *   page->ele( `Page` )->…
 *   client->view_display( zcl_views=>stringify( page ) ).
 *
 * One level deep and no further (builderHelpersOf in lib/reconstruct.mjs): a
 * factory helper whose body is `result = <builder>=>factory( )->literal
 * chain`, and a stringify helper that takes one handle. Found on an EWM app
 * suite (2026-11-25) where no view of 57 app classes was reconstructed.
 */
import { classIndexOf, classIndexDeps } from '../../lib/guide-rules.mjs';
import { builderHelpersOf } from '../../lib/reconstruct.mjs';

const VIEWS = (stringifyBody = '    result = i_view->stringify( ).\n', factoryChain = '\n        )->ele( n = `View` ns = `mvc`\n            )->a( n = `xmlns` v = `sap.m`\n            )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )') =>
  'CLASS zcl_views DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
  + '    CLASS-METHODS factory_view RETURNING VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.\n'
  + '    CLASS-METHODS stringify IMPORTING i_view TYPE REF TO z2ui5_cl_ui5_view_builder RETURNING VALUE(result) TYPE string.\n'
  + '    CLASS-METHODS build_table IMPORTING i_xml TYPE REF TO z2ui5_cl_ui5_view_builder.\n'
  + 'ENDCLASS.\n\nCLASS zcl_views IMPLEMENTATION.\n'
  + `  METHOD factory_view.\n    result = z2ui5_cl_ui5_view_builder=>factory(${factoryChain}.\n  ENDMETHOD.\n`
  + `  METHOD stringify.\n    IF i_view IS NOT BOUND.\n      RETURN.\n    ENDIF.\n${stringifyBody}  ENDMETHOD.\n`
  + '  METHOD build_table.\n    i_xml->ele( `Table` ).\n  ENDMETHOD.\nENDCLASS.\n';

const APP = (extra = '') => 'CLASS zcl_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_name TYPE string.\nENDCLASS.\n\n'
  + 'CLASS zcl_app IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
  + '    DATA(page) = zcl_views=>factory_view( ).\n'
  + '    page->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind( mv_name ) ).\n'
  + extra
  + '    client->view_display( zcl_views=>stringify( page ) ).\n  ENDMETHOD.\nENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource, prepareAbap }) {
  section('builder helpers: what a views class offers', () => {
    const h = builderHelpersOf(VIEWS());
    assert(h?.get('factory_view')?.kind === 'factory' && /View/.test(h.get('factory_view').chain), 'factory_view is a factory helper with its chain');
    assert(h.get('stringify')?.kind === 'stringify' && h.get('stringify').rewrites === false, 'stringify behind a bound guard is a plain stringify helper');
    assert(!h.has('build_table'), 'a method that builds into a handle it is given is no helper of either kind');
    const param = VIEWS(undefined, '\n        )->ele( n = `View` ns = `mvc`\n            )->a( n = `title` v = mv_title )');
    assert(!builderHelpersOf(param)?.has('factory_view'), 'a chain naming a variable is not replayed in another class');
    assert(builderHelpersOf(VIEWS('    result = i_view->stringify( ).\n    REPLACE `<a` IN result WITH `<b`.\n')).get('stringify').rewrites === true, 'a stringify helper that edits the string rewrites');
  });

  section('builder helpers: an app built on them is reconstructed', () => {
    const index = classIndexOf([VIEWS(), APP()]);
    const prep = prepareAbap(APP(), { classIndex: index });
    assert(prep.usesBuilder && prep.docs.length === 1, `one document (usesBuilder ${prep.usesBuilder}, ${prep.docs.length} docs)`);
    assert(/<mvc:View[^>]*>\s*<Page>\s*<Input value="\{\/MV_NAME\}"/.test(prep.docs[0]), `the helper's root holds the app's Page (${prep.docs[0]})`);
    assert(prep.helperTokens === 0, 'and nothing is left unplaced');
    const alone = prepareAbap(APP());
    assert(!alone.usesBuilder && !alone.docs.length, 'without the views class in the run nothing is guessed');
    const r = checkAbapSource(APP(), { render: false, classIndex: index });
    assert(!r.appWithoutView && r.stats.controls >= 2, `the app is judged with its view (${r.stats.controls} controls)`);
  });

  section('builder helpers: a handle handed to a helper the replay does not enter', () => {
    const app = APP('    zcl_views=>build_table( i_xml = page ).\n');
    const prep = prepareAbap(app, { classIndex: classIndexOf([VIEWS(), app]) });
    assert(prep.docs.length === 1 && prep.helperTokens > 0, `the document is incomplete, its render skipped (helperTokens ${prep.helperTokens})`);
  });

  section('builder helpers: a stringify helper that rewrites the string', () => {
    const views = VIEWS('    result = i_view->stringify( ).\n    result = complete_namespaces( result ).\n');
    const app = APP().replace('page->ele( `Page` )', 'page->ele( `Page` )->ele( n = `SimpleForm` ns = `form` )->end( )');
    const index = classIndexOf([views, app]);
    const prep = prepareAbap(app, { classIndex: index });
    assert(prep.helperTokens > 0, 'the document the browser gets is not this one - no render');
    const ns = checkAbapSource(app, { render: false, classIndex: index }).findings.filter((f) => /namespace/.test(f.type));
    assert(ns.length === 0, `the namespace rules stand down for it (${ns.map((f) => f.type)})`);
    const plain = classIndexOf([VIEWS(), app]);
    assert(checkAbapSource(app, { render: false, classIndex: plain }).findings.some((f) => f.type === 'undeclared-namespace'), 'behind a plain stringify helper the undeclared form: is reported');
  });

  section('builder helpers: the cache key follows the helper', () => {
    const a = classIndexDeps(APP(), classIndexOf([VIEWS(), APP()]));
    const b = classIndexDeps(APP(), classIndexOf([VIEWS(undefined, '\n        )->ele( n = `View` ns = `mvc` )'), APP()]));
    assert(a !== b, 'an edit to the factory helper re-judges the app under --cache');
  });
}
