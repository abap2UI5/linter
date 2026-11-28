/*
 * event-read-by-struct: `client->get( )-event` where `client->get_event( )` is
 * the idiom. Added 2026-11-28, from a test of what an assistant without any
 * setup writes for "a todo app with abap2UI5": the struct read beside
 * z2ui5_cl_xml_view, _bind_edit and view_model_update. Every other name of
 * that code had a rule; this one had none, because it is no defect - the
 * field still exists - so the rule is a hint with a mechanical fix.
 */
const app = (body, builder = 'z2ui5_cl_ui5_view_builder') => 'CLASS zcl_er DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
  + 'CLASS zcl_er IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
  + (builder === 'z2ui5_cl_xml_view' ? '    DATA(view) = z2ui5_cl_xml_view=>factory( ).\n' : '')
  + body + '\n  ENDMETHOD.\nENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const { applyFixes } = await import('../../lib/fix.mjs');
  const found = (src) => checkAbapSource(src, { render: false }).findings;
  const of = (src) => found(src).filter((x) => x.type === 'event-read-by-struct');

  section('event-read-by-struct: the struct read is a hint, fixed to get_event( )', () => {
    const src = app('    CASE client->get( )-event.\n      WHEN `GO`.\n    ENDCASE.');
    const hits = of(src);
    assert(hits.length === 1 && hits[0].severity === 'hint', `one hint for the read (${JSON.stringify(hits.map((x) => x.severity))})`);
    const fixed = applyFixes(src, found(src)).output;
    assert(/CASE client->get_event\( \)\./.test(fixed), 'the fix writes CASE client->get_event( ).');
    assert(of(fixed).length === 0, 'the fixed source reports nothing again');
  });

  section('event-read-by-struct: every handle and spelling, every read its own finding', () => {
    const src = app('    DATA(e) = me->client->get( )-event.\n    IF li_client->GET( ) - EVENT = `X`.\n    ENDIF.\n'
      + '    IF client->get( )-event = `A` OR client->get( )-event = `B`.\n    ENDIF.');
    assert(of(src).length === 4, `four reads, four findings (${of(src).length})`);
    const fixed = applyFixes(src, found(src)).output;
    assert(/me->client->get_event\( \)\./.test(fixed) && /li_client->get_event\( \) = `X`/.test(fixed),
      'the handle in front stays, any case and spacing of the read is replaced');
  });

  section('event-read-by-struct: the argument list, a longer component, a comment and a literal are left alone', () => {
    const src = app('    DATA(args) = client->get( )-t_event_arg.\n    DATA(x) = client->get( )-event_x.\n'
      + '    " CASE client->get( )-event.\n    DATA(t) = `client->get( )-event`.');
    assert(of(src).length === 0, `nothing reported (${JSON.stringify(of(src).map((x) => x.line))})`);
  });

  section('event-read-by-struct: a class on the frozen builder is told too - that is where the read is', () => {
    const src = app('    CASE client->get( )-event.\n      WHEN `GO`.\n    ENDCASE.', 'z2ui5_cl_xml_view');
    assert(found(src).some((x) => x.type === 'frozen-view-builder'), 'the frozen builder is reported');
    assert(of(src).length === 1, 'and the struct read beside it (FROZEN_APP_RULE)');
  });
}
