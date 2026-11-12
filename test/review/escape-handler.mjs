/*
 * escape-handler-as-string - the ui5-check skill's "escapeHandler as an XML
 * attribute is a string on 1.71" entry, the one it marked ready to move.
 * Added 2026-11-12.
 */
export default async function ({ section, assert, checkXmlSource, checkAbapSource }) {
  const frag = (attrs, control = 'Dialog') => `<core:FragmentDefinition xmlns="sap.m" xmlns:core="sap.ui.core"><${control} title="T" ${attrs}/></core:FragmentDefinition>`;
  const hits = (xml, minUi5) => checkXmlSource(xml, { render: false, minUi5, file: 'x.fragment.xml' }).findings
    .filter((x) => x.type === 'escape-handler-as-string');

  section('escape-handler-as-string: a string handler on a Dialog below 1.120', () => {
    assert(hits(frag('escapeHandler=".onEscape"'), '1.71').length === 1, 'reported on 1.71');
    assert(hits(frag('escapeHandler=".onEscape"'), '1.120').length === 0, 'not on 1.120, where the property is a function');
    assert(hits(frag('escapeHandler="{/handler}"'), '1.71').length === 0, 'a binding is not a string handler');
    assert(hits(frag('escapeHandler=".onEscape"', 'Popover'), '1.71').length === 0, 'and a control that is no Dialog is not judged');
    const src = 'CLASS zcl_esc DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\nCLASS zcl_esc IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    client->popup_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( `Dialog` )->a( n = `xmlns` v = `sap.m` )->a( n = `escapeHandler` v = `.onEscape` )->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    assert(!checkAbapSource(src, { render: false }).findings.some((x) => x.type === 'escape-handler-as-string'), 'a builder class is not judged: its view has no controller');
  });
}
