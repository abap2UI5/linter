/*
 * Apps by inheritance: the base-app design, where one class implements
 * z2ui5_if_app and main( ), and the concrete apps inherit it and redefine
 * its hooks (on_event, render). Found on an EWM app suite (2026-11-25) where
 * 41 of 57 app classes were never collected - "no checkable app classes" for
 * most of the repository, rule 4's false green.
 */
import fs from 'fs';
import path from 'path';
import { collectFiles } from '../../lib/index.mjs';
import { classIndexOf, classIndexDeps, inheritsApp, inheritsDynamicCall } from '../../lib/guide-rules.mjs';

export const BASE = 'CLASS zcl_base DEFINITION PUBLIC ABSTRACT.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
  + '  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\n    METHODS on_event.\nENDCLASS.\n\n'
  + 'CLASS zcl_base IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n    on_event( ).\n  ENDMETHOD.\n'
  + '  METHOD on_event.\n  ENDMETHOD.\nENDCLASS.\n';
export const MIDDLE = 'CLASS zcl_middle DEFINITION PUBLIC ABSTRACT INHERITING FROM zcl_base.\nENDCLASS.\n\nCLASS zcl_middle IMPLEMENTATION.\nENDCLASS.\n';
export const child = (superclass = 'zcl_base', body = '    client->message_toast_display( `go` ).') => `CLASS zcl_child DEFINITION PUBLIC INHERITING FROM ${superclass}.\n`
  + '  PUBLIC SECTION.\n    DATA mv_name TYPE string.\n  PROTECTED SECTION.\n    METHODS on_event REDEFINITION.\nENDCLASS.\n\n'
  + `CLASS zcl_child IMPLEMENTATION.\n  METHOD on_event.\n    CASE client->get_event( ).\n      WHEN \`GO\`.\n${body}\n    ENDCASE.\n  ENDMETHOD.\nENDCLASS.\n`;

export default async function ({ section, assert, tempDir, checkAbapSource }) {
  section('inherited app: collected when its superclass chain reaches z2ui5_if_app', () => {
    const dir = tempDir('inherited-apps-');
    // the base sits in a directory walked AFTER the child: decided after the walk
    fs.mkdirSync(path.join(dir, 'a'));
    fs.mkdirSync(path.join(dir, 'b'));
    fs.writeFileSync(path.join(dir, 'a', 'zcl_child.clas.abap'), child('zcl_middle'));
    fs.writeFileSync(path.join(dir, 'b', 'zcl_middle.clas.abap'), MIDDLE);
    fs.writeFileSync(path.join(dir, 'b', 'zcl_base.clas.abap'), BASE);
    fs.writeFileSync(path.join(dir, 'b', 'zcl_other.clas.abap'), 'CLASS zcl_other DEFINITION PUBLIC INHERITING FROM cx_static_check.\nENDCLASS.\nCLASS zcl_other IMPLEMENTATION.\nENDCLASS.\n');
    const names = collectFiles([dir]).map((f) => path.basename(f)).sort();
    assert(names.includes('zcl_child.clas.abap'), `the grandchild of the app is collected (${names})`);
    assert(names.includes('zcl_middle.clas.abap'), 'and so is the abstract class between them');
    assert(!names.includes('zcl_other.clas.abap'), 'a class whose chain leaves the paths is not');
  });

  section('inherited app: judged as an app with its superclass in the class index', () => {
    const index = classIndexOf([BASE, MIDDLE, child('zcl_middle')]);
    assert(inheritsApp('zcl_middle', index) === true, 'the chain reaches the base');
    assert(inheritsApp('cx_static_check', index) === null, 'a superclass outside the index is unknown, not "no app"');
    assert(inheritsApp(null, index) === false, 'no superclass is no app');
    const r = checkAbapSource(child('zcl_middle'), { render: false, classIndex: index });
    assert(r.appWithoutView === true, 'the inherited app is judged as an app without a view');
    const alone = checkAbapSource(child('zcl_middle'), { render: false });
    assert(!alone.appWithoutView, 'without its superclass in reach it is not');
  });
  /* Step two: the events. The base raises GO in its view and dispatches to
   * on_event( ); the child redefines on_event( ) and handles GO there. A
   * view helper (no app) raises HELP for every app; the child handles it. */
  const base = BASE.replace('    on_event( ).\n', '    DATA(press) = client->_event( `GO` ).\n    on_event( ).\n');
  const helper = 'CLASS zcl_view_helper DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    CLASS-METHODS button IMPORTING client TYPE REF TO z2ui5_if_client RETURNING VALUE(result) TYPE string.\nENDCLASS.\n\n'
    + 'CLASS zcl_view_helper IMPLEMENTATION.\n  METHOD button.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( `Button` )->a( n = `press` v = client->_event( `HELP` ) ).\n    result = view->stringify( ).\n  ENDMETHOD.\nENDCLASS.\n';
  const kid = child('zcl_base', '    client->message_toast_display( `go` ).\n      WHEN `HELP`.\n        client->message_toast_display( `help` ).\n      WHEN `OWN`.\n        DATA(own) = client->_event( `OWN` ).');
  const types = (src, index) => checkAbapSource(src, { render: false, classIndex: index }).findings
    .filter((f) => /^(?:event-without-handler|handler-without-event)$/.test(f.type)).map((f) => `${f.type}:${f.value}`).sort();

  section('inherited app: a raise in the base is handled in the subclass, and back', () => {
    const index = classIndexOf([base, kid, helper]);
    assert(types(base, classIndexOf([base])).join() === 'event-without-handler:GO', `alone, the base raises GO for nobody (${types(base, classIndexOf([base]))})`);
    assert(types(base, index).length === 0, `with the subclass in the run, GO is handled (${types(base, index)})`);
    assert(types(kid, classIndexOf([BASE, kid])).join() === 'handler-without-event:GO,handler-without-event:HELP', `under a base that raises nothing, GO and HELP are raised by nobody (${types(kid, classIndexOf([BASE, kid]))})`);
    assert(types(kid, index).length === 0, `with base and helper in the run, GO and HELP are raised (${types(kid, index)})`);
    assert(types(helper, index).length === 0, 'the helper\'s HELP is handled by an app of the run');
    assert(types(helper, classIndexOf([helper])).join() === 'event-without-handler:HELP', 'and reported when no app handles it');
  });

  section('inherited app: a dynamic handler in the family stands the rule down', () => {
    const dynamicKid = kid.replace('WHEN `OWN`.', 'WHEN OTHERS.\n        client->message_toast_display( `x` ).\n      WHEN `OWN`.');
    const index = classIndexOf([base.replace('`GO`', '`NOBODY`'), dynamicKid]);
    assert(types(base.replace('`GO`', '`NOBODY`'), index).length === 0, 'a WHEN OTHERS in the subclass may handle anything');
  });

  section('inherited app: the cache key follows the family\'s events', () => {
    const a = classIndexDeps(base, classIndexOf([base, kid]));
    const b = classIndexDeps(base, classIndexOf([base, kid.replace('WHEN `HELP`', 'WHEN `HELP2`')]));
    assert(a !== b, 'an edit to a subclass handler re-judges the base under --cache');
  });
  /* Step five: a base app whose screen comes from a renderer picked at
   * runtime (`CALL METHOD lo_obj->(render_method)`, customizing-driven).
   * Whether a check_on_navigated( ) branch of the class - or of a subclass -
   * re-displays is not decidable then; the rule stands down instead of
   * raising an error. */
  const navApp = (name, head, extra = '') => `CLASS ${name} DEFINITION PUBLIC${head}.\n  PUBLIC SECTION.\n    METHODS on_back.\n  PROTECTED SECTION.\n    DATA client TYPE REF TO z2ui5_if_client.\nENDCLASS.\n\n`
    + `CLASS ${name} IMPLEMENTATION.\n  METHOD on_back.\n    IF client->check_on_navigated( ).\n      DATA(x) = client->get_app_prev( ).\n    ENDIF.\n${extra}  ENDMETHOD.\nENDCLASS.\n`;
  const REDISPLAY = 'missing-view-display-on-navigated';
  const redisplay = (src, index = null) => checkAbapSource(src, { render: false, classIndex: index }).findings.filter((f) => f.type === REDISPLAY).length;

  section('dynamic call: missing-view-display-on-navigated is not decidable', () => {
    const plain = navApp('zcl_plain', '', '').replace('  PUBLIC SECTION.\n', '  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n');
    assert(redisplay(plain) === 1, 'a navigated branch that re-displays nothing is reported');
    for (const call of [
      '    DATA lo_obj TYPE REF TO object.\n    CALL METHOD lo_obj->(mv_render).\n',
      "    CALL METHOD me->('RENDER').\n",
      '    CALL METHOD (mv_class)=>(mv_method).\n',
      '    DATA lo_obj TYPE REF TO object.\n    CREATE OBJECT lo_obj TYPE (mv_class).\n',
    ]) {
      assert(redisplay(plain.replace('  ENDMETHOD.', call + '  ENDMETHOD.')) === 0, `a class with ${call.trim().split('\n').pop()} stands the rule down`);
    }
    // a dynamic ATTRIBUTE access is no call
    assert(redisplay(plain.replace('  ENDMETHOD.', "    DATA r TYPE REF TO object.\n    r->('MV_X') = 1.\n  ENDMETHOD.")) === 1, `r->('MV_X') = 1 is an assignment, not a call`);
  });

  section('dynamic call: a subclass inherits the stand-down from its base', () => {
    const dynBase = BASE.replace('  METHOD on_event.\n', '  METHOD on_event.\n    DATA lo_obj TYPE REF TO object.\n    CALL METHOD lo_obj->(mv_render).\n');
    const sub = navApp('zcl_sub', ' INHERITING FROM zcl_base');
    assert(inheritsDynamicCall('zcl_base', classIndexOf([dynBase, sub])) === true, 'the base calls by a runtime name');
    assert(redisplay(sub, classIndexOf([BASE, sub])) === 1, 'under a base without one the subclass is reported');
    assert(redisplay(sub, classIndexOf([dynBase, sub])) === 0, 'under a base with one it is not');
    const a = classIndexDeps(sub, classIndexOf([BASE, sub]));
    const b = classIndexDeps(sub, classIndexOf([dynBase, sub]));
    assert(a !== b, 'and --cache re-judges it when the base changes');
  });
  section('missing-view-display-on-navigated: no re-display after a popup', () => {
    const app = (branch) => 'CLASS zcl_nav DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_val TYPE string.\nENDCLASS.\n\n'
      + `CLASS zcl_nav IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${branch}  ENDMETHOD.\nENDCLASS.\n`;
    const back = (index, branch) => checkAbapSource(app(branch), { render: false, classIndex: index }).findings.filter((f) => f.type === REDISPLAY).length;
    const popupsAddon = '    IF client->check_on_navigated( ).\n      mv_val = CAST z2ui5_if_popup_result( client->get_app_prev( ) )->value_string( ).\n    ENDIF.\n';
    assert(back(null, popupsAddon) === 0, 'the result of a popups-addon popup is read - nothing to re-display');
    const guard = '    IF client->check_on_navigated( ) = abap_false.\n      RETURN.\n    ENDIF.\n    DATA(prev) = client->get_app_prev( ).\n    IF prev IS NOT INSTANCE OF z2ui5_cl_popup_value_help.\n      RETURN.\n    ENDIF.\n';
    assert(back(null, guard) === 0, 'a guard on INSTANCE OF z2ui5_cl_popup_value_help: the same');
    // a class of the run that may show a popup (itself or a superclass) - whether it replaced the view is a runtime matter
    const viewOrPopup = 'CLASS zcl_target DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\nCLASS zcl_target IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    IF mv_popup = abap_true.\n      client->popup_display( `<x/>` ).\n    ELSE.\n      client->view_display( `<x/>` ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
    const fromTarget = '    IF client->check_on_navigated( ).\n      DATA(t) = CAST zcl_target( client->get_app_prev( ) ).\n    ENDIF.\n';
    assert(back(classIndexOf([viewOrPopup, app(fromTarget)]), fromTarget) === 0, 'a run class that may display a popup is not judged');
    // the neighbouring form: a class of the run that only displays a view is still reported
    const viewOnly = viewOrPopup.replace('client->popup_display', 'client->view_display');
    assert(back(classIndexOf([viewOnly, app(fromTarget)]), fromTarget) === 1, 'one that only displays views is still reported');
    assert(back(null, fromTarget) === 1, 'and so is one the run does not hold');
  });
}
