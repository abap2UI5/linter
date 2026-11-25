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
import { classIndexOf, classIndexDeps, inheritsApp } from '../../lib/guide-rules.mjs';

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
}
