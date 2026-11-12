/*
 * What the reconstructor reaches - the views it used to give up on, and
 * the start-path values it used to take for granted:
 *
 *   a RETURNING helper whose body is more than `result = io_x->chain`, and
 *   a call that captures its result (`DATA(form) = create_layout_form( page )`)
 *   - abap2UI5's own start app lost its whole render to it;
 *   a handle a factory method leaves in an ATTRIBUTE and another method
 *   builds on and stringifies - unless the attribute escapes to code the
 *   source does not show (the nested-view host of sample 338);
 *   a call on a receiver that is no builder (`t->end( )` on a transaction);
 *   a structure that INCLUDEs a type the class does not declare;
 *   a start-path seed inside one arm of a branch;
 *   a COND #( ) with literal branches and no ELSE on an enum property.
 *
 * Measured on samples-controls, samples, samples-stack, app-template,
 * abap2UI5 and seven abap2UI5-addons: the start app and layout-management's
 * popups now reconstruct whole (182 -> 245 and 108 -> 188 controls), the
 * render skips fall from 3 to 2 (abap2UI5) and 1 to 0 (sql-console), and
 * the only new findings are abap2UI5's two directives that excused the
 * linter for not following create_layout_form( ).
 */

const HEAD = (name, defs = '') => `CLASS ${name} DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${defs}ENDCLASS.\n\nCLASS ${name} IMPLEMENTATION.\n`;
const VIEW = '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    DATA(page) = view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns` v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page` ).\n';

export default async function ({ section, assert, checkAbapSource, prepareAbap }) {
  const judge = (src) => checkAbapSource(src, { render: false, properties: true }).findings;
  const types = (src) => judge(src).map((x) => x.type);

  const rowHelper = (prop) => HEAD('zcl_reach_ret',
    '  PROTECTED SECTION.\n'
    + '    METHODS row IMPORTING form TYPE REF TO z2ui5_cl_ui5_view_builder label TYPE string\n'
    + '      RETURNING VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.\n')
    + '  METHOD z2ui5_if_app~main.\n    IF client->check_on_navigated( ).\n' + VIEW
    + '      DATA(box) = row( form = page label = `Name` ).\n'
    + '      box->tag( `Text` )->a( n = `' + prop + '` v = `x` ).\n'
    + '      client->view_display( view->stringify( ) ).\n    ENDIF.\n  ENDMETHOD.\n\n'
    + '  METHOD row.\n    form->tag( `Label` )->a( n = `text` v = label ).\n'
    + '    result = form->ele( `HBox` ).\n    result->tag( `Icon` ns = `core` ).\n  ENDMETHOD.\nENDCLASS.\n';

  section('reconstruct: a RETURNING helper with a body of several statements is replayed', () => {
    const prep = prepareAbap(rowHelper('text'));
    assert(prep.helperTokens === 0, 'no builder call is left outside a chain');
    assert(prep.docs.length === 1, 'one document');
    const xml = JSON.stringify(prep.docs[0]);
    assert(xml.includes('HBox') && xml.includes('Text'), 'the captured result is built on: the Text lands in the HBox');
    assert(types(rowHelper('txt')).includes('unknown-property'), 'and is judged: a typo on it is reported');
    assert(!types(rowHelper('text')).includes('unknown-property'), 'the right name is not');
  });

  const attrView = (escape) => HEAD('zcl_reach_attr',
    '  PROTECTED SECTION.\n    DATA mo_page TYPE REF TO z2ui5_cl_ui5_view_builder.\n    METHODS build.\n    METHODS show IMPORTING client TYPE REF TO z2ui5_if_client.\n')
    + '  METHOD z2ui5_if_app~main.\n    IF client->check_on_navigated( ).\n      build( ).\n      show( client ).\n    ENDIF.\n  ENDMETHOD.\n\n'
    + '  METHOD build.\n' + VIEW + '    mo_page = page.\n  ENDMETHOD.\n\n'
    + '  METHOD show.\n'
    + (escape ? '    FIELD-SYMBOLS <p> TYPE any.\n    ASSIGN mo_page TO <p>.\n' : '')
    + '    mo_page->tag( `Button` )->a( n = `typ` v = `Emphasized` ).\n'
    + '    client->view_display( mo_page->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';

  section('reconstruct: a handle held in an attribute is built on in another method', () => {
    const prep = prepareAbap(attrView(false));
    assert(prep.docs.length === 1 && prep.helperTokens === 0, 'the view built in build( ) and finished in show( ) is one document');
    assert(types(attrView(false)).includes('unknown-property'), 'what show( ) adds is judged');
    const esc = prepareAbap(attrView(true));
    assert(esc.docs.length === 0 && esc.helperTokens > 0, 'an attribute handed to a field symbol stays unreconstructed - the render is skipped');
  });

  section('reconstruct: a call on a receiver that is no builder is no builder call', () => {
    const src = HEAD('zcl_reach_foreign') + '  METHOD z2ui5_if_app~main.\n'
      + '    DATA(t) = cl_os_system=>get_transaction_manager( )->create_transaction( ).\n    t->start( ).\n    t->end( ).\n'
      + '    client->view_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->stringify( ) ).\n'
      + '  ENDMETHOD.\nENDCLASS.\n';
    const prep = prepareAbap(src);
    assert(prep.docs.length === 1, 'the view is reconstructed');
    assert(prep.helperTokens === 0, 't->end( ) does not skip the render');
  });

  section('reconstruct: a structure that includes an undeclared type is an open shape', () => {
    const src = (field) => HEAD('zcl_reach_incl',
      '    TYPES BEGIN OF ty_s_layo.\n            INCLUDE TYPE z2ui5_t_11.\n    TYPES   selkz TYPE abap_bool.\n    TYPES END OF ty_s_layo.\n'
      + '    TYPES ty_t_layo TYPE STANDARD TABLE OF ty_s_layo WITH EMPTY KEY.\n    DATA mt_head TYPE ty_t_layo.\n')
      + '  METHOD z2ui5_if_app~main.\n' + VIEW
      + '    page->ele( `List` )->a( n = `items` v = client->_bind( mt_head )\n'
      + '        )->tag( `StandardListItem` )->a( n = `title` v = `{' + field + '}` ).\n'
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const paths = (s) => judge(s).filter((x) => x.type === 'unknown-binding-path');
    assert(paths(src('DESCR')).length === 0, 'a field the DDIC include may carry is not reported');
    assert(paths(src('SELKZ')).length === 0, 'nor a field the class lists');
  });

  const branchSeed = (arms) => HEAD('zcl_reach_branch', '    DATA mv_state TYPE string.\n    DATA mv_flag TYPE abap_bool.\n')
    + '  METHOD z2ui5_if_app~main.\n    IF client->check_on_init( ).\n' + arms
    + VIEW + '      page->tag( `MessageStrip` )->a( n = `type` v = client->_bind( mv_state ) ).\n'
    + '      client->view_display( view->stringify( ) ).\n    ENDIF.\n  ENDMETHOD.\nENDCLASS.\n';

  section('enum-bound-to-conditional-field: a start-path seed in one arm only', () => {
    const one = branchSeed('      IF mv_flag = abap_true.\n        mv_state = `Error`.\n      ENDIF.\n');
    const both = branchSeed('      IF mv_flag = abap_true.\n        mv_state = `Error`.\n      ELSE.\n        mv_state = `Success`.\n      ENDIF.\n');
    const kase = branchSeed('      CASE mv_flag.\n        WHEN abap_true.\n          mv_state = `Error`.\n        WHEN OTHERS.\n          mv_state = `None`.\n      ENDCASE.\n');
    const loop = branchSeed('      DO 3 TIMES.\n        mv_state = `Error`.\n      ENDDO.\n');
    const flat = branchSeed('      mv_state = `Error`.\n');
    assert(types(one).includes('enum-bound-to-conditional-field'), 'an IF without ELSE is reported');
    assert(types(loop).includes('enum-bound-to-conditional-field'), 'a seed inside a DO is reported');
    assert(!types(both).includes('enum-bound-to-conditional-field'), 'every arm of IF … ELSE seeding it is not');
    assert(!types(kase).includes('enum-bound-to-conditional-field'), 'nor a CASE with WHEN OTHERS');
    assert(!types(flat).includes('enum-bound-to-conditional-field'), 'nor a seed at the span level');
    assert(!types(one).includes('enum-bound-to-initial-field'), 'and the initial-field rule stays silent on it');
  });

  section('enum-cond-without-else: literal branches and no ELSE on an enum property', () => {
    const src = (cond) => HEAD('zcl_reach_cond') + '  METHOD z2ui5_if_app~main.\n    DATA(failed) = abap_false.\n' + VIEW
      + '    page->tag( `MessageStrip` )->a( n = `type` v = ' + cond + ' ).\n'
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    assert(types(src('COND #( WHEN failed = abap_true THEN `Error` )')).includes('enum-cond-without-else'), 'no ELSE is reported');
    assert(!types(src('COND #( WHEN failed = abap_true THEN `Error` ELSE `None` )')).includes('enum-cond-without-else'), 'with an ELSE it is not');
    assert(types(src('COND #( WHEN failed = abap_true THEN `Eror` )')).includes('invalid-property-value'), 'the literal branch is still judged');
  });
}
