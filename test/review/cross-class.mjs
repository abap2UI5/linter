/*
 * Rules that read another class of the run through the class index
 * (classIndexOf in lib/guide-rules.mjs): nav-target-never-displays.
 * Added 2026-11-12.
 */
import { classIndexOf, classIndexDeps } from '../../lib/guide-rules.mjs';

export default async function ({ section, assert, checkAbapSource }) {
  const caller = 'CLASS zcl_caller DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_caller IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    IF client->check_on_event( `GO` ).\n'
    + '      client->nav_app_call( zcl_target=>factory( ) ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';
  const target = (body, head = '') => `CLASS zcl_target DEFINITION PUBLIC${head}.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_count TYPE i.\nENDCLASS.\n\n`
    + `CLASS zcl_target IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${body}\n  ENDMETHOD.\nENDCLASS.\n`;
  const hits = (t) => checkAbapSource(caller, { render: false, classIndex: classIndexOf([caller, t]) }).findings
    .filter((x) => x.type === 'nav-target-never-displays').map((x) => x.value);

  section('nav-target-never-displays: a called app that shows nothing', () => {
    assert(hits(target('    mv_count = mv_count + 1.')).join() === 'zcl_target', 'an app that neither displays nor hands on is reported');
    assert(hits(target('    client->nav_app_leave( ).')).length === 0, 'one that leaves is not');
    assert(hits(target('    client->view_display( `<mvc:View/>` ).')).length === 0, 'one that displays is not');
    assert(hits(target('    NEW zcl_renderer( )->render( client ).')).length === 0, 'one that hands its client to another object is not judged');
    assert(hits(target('    mv_count = 1.', ' INHERITING FROM zcl_base')).length === 0, 'nor one with a superclass that may display');
    assert(checkAbapSource(caller, { render: false }).findings.every((x) => x.type !== 'nav-target-never-displays'), 'without a class index nothing is judged');
  });

  section('nav-target-never-displays: the cache key follows the called class', () => {
    const a = classIndexDeps(caller, classIndexOf([caller, target('    mv_count = 1.')]));
    const b = classIndexDeps(caller, classIndexOf([caller, target('    client->nav_app_leave( ).')]));
    assert(a !== b, 'an edit that makes the target display changes what --cache keys the caller on');
  });
}
