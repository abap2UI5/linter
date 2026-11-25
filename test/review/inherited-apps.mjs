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
import { classIndexOf, inheritsApp } from '../../lib/guide-rules.mjs';

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
}
