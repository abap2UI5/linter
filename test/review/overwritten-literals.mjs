/*
 * A literal the class writes into a name, and a later write that is NOT a
 * literal - from a review of 2026-11-27, every section failing on the code as
 * it was. See test/review/README.md for the harness.
 *
 * The value resolver (makeResolver in lib/reconstruct.mjs) took the last
 * LITERAL write of a name as its value and read every other write as
 * nothing: `DATA(lv_type) = \`Acc\`. lv_type &&= \`ept\`.` reconstructed
 * `type="Acc"`, and invalid-property-value reported a Button type the
 * running app never has. A write that is not a literal after the chosen one
 * - before the use, for a method's variable; anywhere after it, for an
 * attribute - leaves the name unresolved instead.
 */
const app = (body, { defs = '', other = '' } = {}) => 'CLASS zcl_ol DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n' + defs
  + 'ENDCLASS.\n\nCLASS zcl_ol IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n' + body
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page`\n'
  + '        )->tag( `Button` )->a( n = `type` v = lv_type ).\n'
  + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\n' + other + 'ENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const typeOf = (src) => prepareAbap(src).docs.join('').match(/<Button([^>]*)\/>/)?.[1].trim() ?? '';
  const invalid = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'invalid-property-value').map((x) => x.value).join();

  section('overwritten literals: a later write that is no literal leaves a method variable unresolved', () => {
    const writes = [
      'lv_type &&= `ept`.',
      'lv_type = lv_type && `ept`.',
      'lv_type = to_upper( lv_type ).',
      'lv_type = COND #( WHEN 1 = 1 THEN `Accept` ELSE `Reject` ).',
      'lv_type = |{ lv_type }ept|.',
      'CONCATENATE lv_type `ept` INTO lv_type.',
      'TRANSLATE lv_type TO UPPER CASE.',
      'REPLACE `Acc` IN lv_type WITH `Accept`.',
      'CONDENSE lv_type.',
      'CLEAR lv_type.',
      'CLEAR: lv_other, lv_type.',
    ];
    for (const w of writes) {
      const src = app(`    DATA lv_other TYPE string.\n    DATA(lv_type) = \`Acc\`.\n    ${w}\n`);
      assert(typeOf(src) === '' && invalid(src) === '', `${w} - the literal \`Acc\` is no longer the value (${typeOf(src) || 'unresolved'}; ${invalid(src) || 'no invalid value'})`);
    }
  });

  section('overwritten literals: what still resolves', () => {
    // a write AFTER the use says nothing about the value at the use
    const after = app('    DATA(lv_type) = `Bogus`.\n', { other: '' }).replace('    client->view_display', '    lv_type = to_upper( lv_type ).\n    client->view_display');
    assert(typeOf(after) === 'type="Bogus"' && invalid(after) === 'Bogus', `a method variable rewritten after the use keeps the literal at the use (${typeOf(after)})`);
    // a literal written after the non-literal one is the value again
    const again = app('    DATA(lv_type) = `Acc`.\n    lv_type &&= `ept`.\n    lv_type = `Bogus`.\n');
    assert(invalid(again) === 'Bogus', `the last literal after the rewrite is the value (${invalid(again) || 'none'})`);
    // a write to ANOTHER name is not a write to this one
    const other = app('    DATA(lv_type) = `Bogus`.\n    DATA(lv_other) = to_upper( lv_type ).\n    CONCATENATE lv_type `x` INTO lv_other.\n');
    assert(invalid(other) === 'Bogus', `reading the name into another is no write to it (${invalid(other) || 'none'})`);
  });

  section('overwritten literals: an attribute is unresolved by a non-literal write anywhere after its literal', () => {
    const defs = '    DATA lv_type TYPE string.\n';
    const later = app('    lv_type = `Bogus`.\n', { defs, other: '  METHOD on_event.\n    lv_type = to_upper( lv_type ).\n  ENDMETHOD.\n' })
      .replace('ENDCLASS.\n\nCLASS', '    METHODS on_event.\nENDCLASS.\n\nCLASS');
    assert(invalid(later) === '', `another method rewriting the attribute after its literal (${invalid(later) || 'no invalid value'})`);
    const plain = app('    lv_type = `Bogus`.\n', { defs });
    assert(invalid(plain) === 'Bogus', `an attribute written one literal is still that literal (${invalid(plain) || 'none'})`);
  });
}
