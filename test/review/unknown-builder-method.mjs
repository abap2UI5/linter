/*
 * unknown-builder-method - the frozen builder's per-control API written on
 * the current builder. Found by the eval pack (experimental/evals,
 * 2026-11-12): a model answering from memory wrote
 * `z2ui5_cl_ui5_view_builder=>page( )` and `->input( )` in all twelve answers,
 * and each one passed as "no view built". 0 findings on every corpus.
 */
export default async function ({ section, assert, checkAbapSource }) {
  const app = (body, defs = '') => `CLASS zcl_ubm DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${defs}ENDCLASS.\n\nCLASS zcl_ubm IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n${body}\n  ENDMETHOD.\nENDCLASS.\n`;
  const hits = (src) => checkAbapSource(src, { render: false }).findings.filter((x) => x.type === 'unknown-builder-method').map((x) => x.member);

  section('unknown-builder-method: per-control methods on the current builder', () => {
    assert(hits(app('    DATA(view) = z2ui5_cl_ui5_view_builder=>page( title = `T` ).\n    view->input( value = client->_bind( mv ) )->button( text = `Go` ).\n    client->view_display( view->stringify( ) ).')).join() === 'page,input,button',
      'a static per-control call, and the chain on the handle it captured');
    assert(hits(app('    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind( mv ) ).\n    client->view_display( view->stringify( ) ).')).length === 0,
      'the verbs, stringify( ) and an argument `client->_bind( )` are fine');
    assert(hits(app('    mo_view->text( `x` ).', '    DATA mo_view TYPE REF TO z2ui5_cl_ui5_view_builder.\n')).join() === 'text', 'an attribute typed as the builder is a handle');
    assert(hits(app('    DATA(lo) = CAST zcl_popup( client->get_app_prev( ) ).\n    DATA(r) = lo->result( ).')).length === 0, 'another class\'s method on another handle is not judged');
    assert(hits(app('    DATA(x) = z2ui5_cl_ui5_view_builder=>escape_literal( `{a}` ).')).length === 0, 'escape_literal( ) is a static method of the builder');
  });
}
