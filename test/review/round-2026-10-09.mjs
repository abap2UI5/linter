/*
 * The 2026-10-09 round: an adversarial read of the 2026-10-08 branch as a
 * whole, the extension's corpus fuzz, and the render harness's attribution.
 * See test/review/README.md for the harness.
 *
 *   1. a name written once with a template resolves only where it is ONE
 *      variable - a method parameter of the same name is another
 */

export default function ({ section, assert, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const app = (definition, body) => `CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${definition}`
    + '    DATA mv TYPE string.\nENDCLASS.\nCLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + `${body}\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n`
    + '    view->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv ) ).\n'
    + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';

  /* ── 1. one template, one variable ───────────────────────────────────── */

  /* The 2026-10-08 corpus round resolved a name the class writes once with a
   * string template to that template, class-wide. A helper's parameter of the
   * same name is a different variable: `v = type` in `add( )` came out as
   * main's `DATA(type) = |Bogus|`, and the Button was reported (and rendered)
   * with a type nobody passed. */
  section('round 2026-10-09: a template name shadowed by a parameter is not resolved', () => {
    const src = 'CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_type TYPE string.\n'
      + '    METHODS add IMPORTING page TYPE REF TO z2ui5_cl_ui5_view_builder type TYPE string.\nENDCLASS.\n'
      + 'CLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(type) = |Bogus|.\n'
      + '    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    add( page = page type = mv_type ).\n    client->view_display( page->stringify( ) ).\n  ENDMETHOD.\n'
      + '  METHOD add.\n    page->tag( `Button` )->a( n = `type` v = type ).\n  ENDMETHOD.\nENDCLASS.\n';
    const docs = prepareAbap(src).docs.join('');
    assert(!docs.includes('Bogus'), `the parameter is not main's template (${docs})`);
    const found = checkAbapSource(src, opts).findings.filter((x) => x.type === 'invalid-property-value').map((x) => x.value);
    assert(!found.length, `no invalid-property-value for a value nobody passes (${found.join() || 'none'})`);
    // the shape the resolution exists for still resolves
    const one = src.replace('type TYPE string.', 'kind TYPE string.').replace('v = type', 'v = expr')
      .replace('DATA(type) = |Bogus|.', 'DATA(expr) = |Emphasized|.');
    assert(prepareAbap(one).docs.join('').includes('type="Emphasized"'), 'a name declared once still resolves to its template');
  });
}
