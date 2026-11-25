/*
 * A `TYPE REF TO data` attribute of an app class outside the PUBLIC SECTION.
 *
 * abap2UI5-addons/table-maintenance 9c8f911 gave z2ui5_cl_tm_pop a PROTECTED
 * `DATA mr_row_org TYPE REF TO data`, filled with `CREATE DATA mr_row_org
 * LIKE <row>` for a row of an RTTI table. Every first roundtrip of the popup
 * failed on the system (APP_SERIALIZATION_ERROR, CX_REFERENCE_NOT_SERIALIZABLE,
 * 2026-11-25); every gate passed, and private-app-attribute's remedy said
 * "PROTECTED for a helper". Fixed upstream in ca6da36 by making it PUBLIC.
 *
 *   - nonpublic-data-reference reports it (an error when the class types the
 *     target at run time), and moves the declaration to PUBLIC;
 *   - private-app-attribute no longer moves a REF TO data to PROTECTED, nor
 *     widens a PRIVATE SECTION holding one to PROTECTED.
 */
import { applyFixes } from '../../lib/fix.mjs';

const app = ({ pub = '', prot = '', priv = '', main = '', intf = true } = {}) =>
  'CLASS zcl_data_refs DEFINITION PUBLIC.\n\n  PUBLIC SECTION.\n'
  + (intf ? '    INTERFACES z2ui5_if_app.\n' : '')
  + '    DATA name TYPE string.\n' + pub + '\n'
  + (prot ? '  PROTECTED SECTION.\n' + prot + '\n' : '')
  + (priv ? '  PRIVATE SECTION.\n' + priv + '\n' : '')
  + 'ENDCLASS.\n\n\nCLASS zcl_data_refs IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    FIELD-SYMBOLS <row> TYPE any.\n' + main + '\n  ENDMETHOD.\n\nENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const opts = { render: false, properties: true, minUi5: '1.71' };
  const judge = (src) => checkAbapSource(src, opts).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, judge(src).filter((x) => x.fixes?.length && x.type === type)).output;

  section('nonpublic-data-reference: a PROTECTED REF TO data typed at run time is an error, moved to PUBLIC', () => {
    const src = app({ prot: '    DATA mr_row_org TYPE REF TO data.\n', main: '    CREATE DATA mr_row_org LIKE <row>.\n' });
    const nd = of(src, 'nonpublic-data-reference');
    assert(nd.length === 1 && nd[0].member === 'mr_row_org', `reported once (${nd.length})`);
    assert(nd[0].severity === 'error', `an error with CREATE DATA … LIKE (${nd[0].severity})`);
    assert(nd[0].fixes?.length === 2, 'carries the move');
    const out = fixed(src, 'nonpublic-data-reference');
    assert(out.includes('    DATA name TYPE string.\n    DATA mr_row_org TYPE REF TO data.\n'), 'moved under the PUBLIC SECTION\'s last declaration');
    assert(of(out, 'nonpublic-data-reference').length === 0, 'the fixed class is silent');
  });

  section('nonpublic-data-reference: TYPE HANDLE is an error too, a static type a warning', () => {
    const handle = app({ prot: '    DATA mr_any TYPE REF TO data.\n', main: '    DATA lo_type TYPE REF TO cl_abap_datadescr.\n    CREATE DATA me->mr_any TYPE HANDLE lo_type.\n' });
    assert(of(handle, 'nonpublic-data-reference')[0]?.severity === 'error', 'TYPE HANDLE: error');
    const stat = app({ prot: '    DATA mr_s TYPE REF TO data.\n', main: '    CREATE DATA mr_s TYPE string.\n' });
    const w = of(stat, 'nonpublic-data-reference');
    assert(w.length === 1 && (w[0].severity ?? 'warning') === 'warning', `a static type: a warning (${w[0]?.severity})`);
  });

  section('nonpublic-data-reference: what is not reported', () => {
    assert(of(app({ pub: '    DATA mr_pub TYPE REF TO data.\n' }), 'nonpublic-data-reference').length === 0, 'PUBLIC');
    assert(of(app({ prot: '    CLASS-DATA sr TYPE REF TO data.\n' }), 'nonpublic-data-reference').length === 0, 'CLASS-DATA');
    assert(of(app({ prot: '    DATA mo TYPE REF TO object.\n    DATA mt TYPE string_table.\n' }), 'nonpublic-data-reference').length === 0, 'other types');
    assert(of(app({ intf: false, prot: '    DATA mr TYPE REF TO data.\n' }), 'nonpublic-data-reference').length === 0, 'not an app class');
  });

  section('private-app-attribute: a PRIVATE REF TO data is moved to PUBLIC, the section is not widened to PROTECTED', () => {
    const src = app({ priv: '    DATA mr_priv TYPE REF TO data.\n    DATA mv_helper TYPE string.\n' });
    const pa = of(src, 'private-app-attribute');
    assert(pa.length === 2, `both private attributes reported (${pa.length})`);
    const ref = pa.find((x) => x.member === 'mr_priv');
    assert(/REF TO data in PUBLIC/.test(ref.message ?? ''), 'the message does not send a data reference to PROTECTED');
    const out = fixed(src, 'private-app-attribute');
    assert(!/PROTECTED SECTION/.test(out), 'no rename of PRIVATE SECTION to PROTECTED while it holds a data reference');
    assert(out.includes('    DATA name TYPE string.\n    DATA mr_priv TYPE REF TO data.\n'), 'the data reference is moved to PUBLIC');

    const plain = app({ priv: '    DATA mv_helper TYPE string.\n' });
    assert(/PROTECTED SECTION/.test(fixed(plain, 'private-app-attribute')), 'without a data reference the rename is still offered');
  });
}
