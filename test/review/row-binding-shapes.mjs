/*
 * Two ways a row template's binding is wrong although the XML is valid
 * (2026-11-25):
 *
 *   namespaced-row-binding - a namespaced column (`/CWM/XCWMAT`) is a level
 *   of its row in the model (abap2UI5 40e8a073), so `{/CWM/XCWMAT}` and a
 *   run-time `|\{{ comp-name }\}|` bind an absolute path: the cell is empty
 *   and an edit is lost (EWM apps over /SCWM/ tables; table-maintenance
 *   880fc2d, layout-management 0ca56e3);
 *
 *   enum-binding-no-fallback - an enum-typed property bound straight to a
 *   column: an initial cell ships "", which no enum accepts, and the view
 *   fails to render (layout-management a6da435, `{ROW/TYPE}` on a Switch
 *   and a Button).
 */
import { applyFixes } from '../../lib/fix.mjs';

const frame = ({ data = '', locals = '', view = '', extra = '' } = {}) =>
  'CLASS zcl_row_shapes DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
  + '    TYPES: BEGIN OF ty_s_row, name TYPE string, type TYPE string, END OF ty_s_row.\n'
  + '    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.\n'
  + '    DATA mv_title TYPE string.\n'
  + data
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_row_shapes IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    DATA lt_comp TYPE abap_component_tab.\n'
  + locals
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    DATA(cells) = view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`       v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc`   v = `sap.ui.core.mvc`\n'
  + '        )->a( n = `xmlns:table` v = `sap.ui.table`\n'
  + '        )->ele( `Page`\n'
  + '        )->ele( `List` )->a( n = `items` v = client->_bind( t_rows )\n'
  + '        )->ele( `CustomListItem` ).\n'
  + view
  + extra
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';

/* one cell of the row template, written on the CustomListItem */
const cell = (control, attr, v) => `    cells->tag( \`${control}\` )->a( n = \`${attr}\` v = ${v} ).\n`;
/* the same cell built per column of an RTTI component table */
const loop = (control, attr, v) => '    LOOP AT lt_comp INTO DATA(comp).\n'
  + `      cells->tag( \`${control}\` )->a( n = \`${attr}\` v = ${v} ).\n    ENDLOOP.\n`;
/* the same attribute OUTSIDE any row template, on the page */
const root = (control, attr, v) => `    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`\n`
  + '        )->a( n = `xmlns` v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + `        )->ele( \`Page\` )->tag( \`${control}\` )->a( n = \`${attr}\` v = ${v} ).\n`
  + '    client->view_display( page->stringify( ) ).\n';

export default async function ({ section, assert, checkAbapSource, checkXmlSource }) {
  const judge = (src) => checkAbapSource(src, { render: false, properties: true, minUi5: '1.71' }).findings;
  const of = (src, type) => judge(src).filter((x) => x.type === type);
  const NS = 'namespaced-row-binding';
  const EN = 'enum-binding-no-fallback';

  section('namespaced-row-binding: a literal {/CWM/XCWMAT} in a row template, fixed by dropping the slash', () => {
    const src = frame({ view: cell('Text', 'text', '`{/CWM/XCWMAT}`') });
    const f = of(src, NS);
    assert(f.length === 1 && f[0].value === '/CWM/XCWMAT' && f[0].kind === 'literal', `reported once (${f.length})`);
    assert((f[0].severity ?? 'warning') === 'warning', 'a warning');
    assert(f[0].fixes?.length === 1, 'carries the fix');
    const out = applyFixes(src, f).output;
    assert(out.includes('v = `{CWM/XCWMAT}`'), 'the leading slash is dropped');
    assert(of(out, NS).length === 0, 'the fixed class is silent');

    // in a template, after path:, and in a composite value - each one fixed in place
    const tmpl = frame({ view: cell('Text', 'text', '|\\{/CWM/XCWMAT\\}|') });
    assert(applyFixes(tmpl, of(tmpl, NS)).output.includes('|\\{CWM/XCWMAT\\}|'), 'inside a string template');
    const info = frame({ view: cell('Input', 'value', "`{ path: '/SCWM/QTY', type: 'sap.ui.model.type.Float' }`") });
    const fi = of(info, NS);
    assert(fi.length === 1 && fi[0].value === '/SCWM/QTY', 'a binding info path');
    assert(applyFixes(info, fi).output.includes("path: 'SCWM/QTY'"), 'fixed after path:');
    const comp = frame({ view: cell('Text', 'text', '`{NAME} {/CWM/XCWMAT}`') });
    assert(of(comp, NS).length === 1, 'a composite value');
  });

  section('namespaced-row-binding: a sap.ui.table Column.template is a row template too', () => {
    const src = frame({ extra: '    view->ele( n = `Table` ns = `table` )->a( n = `rows` v = client->_bind( t_rows )\n'
      + '        )->ele( n = `columns` ns = `table` )->ele( n = `Column` ns = `table`\n'
      + '        )->ele( n = `template` ns = `table` )->tag( `Text` )->a( n = `text` v = `{/CWM/XCWMAT}` ).\n' });
    assert(of(src, NS).length === 1, 'reported in the column template');
  });

  section('namespaced-row-binding: a column name known only at run time, without component_path( )', () => {
    const f = of(frame({ view: loop('Text', 'text', '|\\{{ comp-name }\\}|') }), NS);
    assert(f.length === 1 && f[0].kind === 'dynamic' && f[0].value === 'comp-name', `the |\\{{ x }\\}| shape (${f.length})`);
    assert(/component_path/.test(f[0].message ?? ''), 'the message names component_path( )');
    assert(!f[0].fixes, 'no fix: component_path( ) is a method of abap2UI5 DEV');
    assert(of(frame({ view: loop('Text', 'text', "|\\{path:'{ comp-name }'\\}|") }), NS).length === 1, "the |\\{path:'{ x }'…| shape");
    const viaVar = '    LOOP AT lt_comp INTO DATA(comp).\n      DATA(lv_col) = comp-name.\n'
      + '      cells->tag( `Text` )->a( n = `text` v = |\\{{ lv_col }\\}| ).\n    ENDLOOP.\n';
    assert(of(frame({ view: viaVar }), NS).length === 1, 'a variable filled from the component');
  });

  section('namespaced-row-binding: what is not reported', () => {
    const none = (label, src) => assert(of(src, NS).length === 0, label);
    none('a relative namespaced path', frame({ view: cell('Text', 'text', '`{CWM/XCWMAT}`') }));
    none('an absolute path into a public attribute ({/MV_TITLE/…} per row)', frame({ data: '    DATA ms_head TYPE ty_s_row.\n', view: cell('Text', 'text', '`{/MS_HEAD/NAME}`') }));
    none('the window state of the framework', frame({ view: cell('Text', 'text', '`{/__WINDOW/T_ROWS/TOTAL}`') }));
    none('outside a row template - a root binding is absolute on purpose', frame({ extra: root('Text', 'text', '`{/CWM/XCWMAT}`') }));
    none('the dynamic shape outside a row template', frame({ extra: '    LOOP AT lt_comp INTO DATA(comp).\n' + root('Text', 'text', '|\\{{ comp-name }\\}|') + '    ENDLOOP.\n' }));
    none('component_path( ) around the name', frame({ view: loop('Text', 'text', '|\\{{ z2ui5_cl_ui5_view_builder=>component_path( comp-name ) }\\}|') }));
    none('a variable assigned from component_path( )', frame({ view: '    LOOP AT lt_comp INTO DATA(comp).\n      DATA(lv_col) = z2ui5_cl_ui5_view_builder=>component_path( comp-name ).\n'
      + '      cells->tag( `Text` )->a( n = `text` v = |\\{{ lv_col }\\}| ).\n    ENDLOOP.\n' }));
    none('a literal embed', frame({ view: cell('Text', 'text', '|\\{{ `NAME` }\\}|') }));
    none('a constant', frame({ data: '    CONSTANTS c_col TYPE string VALUE `NAME`.\n', view: cell('Text', 'text', '|\\{{ c_col }\\}|') }));
    none('a variable assigned only from literals', frame({ locals: '    DATA lv_fix TYPE string.\n    lv_fix = `NAME`.\n', view: cell('Text', 'text', '|\\{{ lv_fix }\\}|') }));
    none('a path from _bind_path( )', frame({ locals: '    DATA(lv_p) = client->_bind_path( mv_title ).\n', view: cell('Text', 'text', '|\\{{ lv_p }\\}|') }));
    none('the framework\'s cell binding', frame({ view: '    LOOP AT t_rows INTO DATA(row).\n'
      + '      cells->tag( `Input` )->a( n = `value` v = client->_bind( val = row-name tab = t_rows tab_index = sy-tabix ) ).\n    ENDLOOP.\n' }));
    none('an OData default model', frame({ view: cell('Text', 'text', '`{/CWM/XCWMAT}`'), extra: '    client->view_display( val = `` switch_default_model_path = `/sap/opu/odata/X/` ).\n' }));
    // a raw XML view has no class attributes to tell a namespace from a root field
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><List items="{/T_ROWS}"><StandardListItem title="{/CWM/XCWMAT}"/></List></mvc:View>';
    assert(checkXmlSource(xml, { render: false, properties: true }).findings.every((x) => x.type !== NS), 'a raw XML view');
  });

  section('enum-binding-no-fallback: an enum property bound straight to a row field', () => {
    const f = of(frame({ view: cell('Button', 'type', '`{TYPE}`') }), EN);
    assert(f.length === 1 && f[0].value === 'TYPE' && f[0].memberType === 'sap.m.ButtonType', `reported once (${f.length})`);
    assert((f[0].severity ?? 'warning') === 'warning', 'a warning');
    assert(/\{= \$\{TYPE\} \|\| 'Default' \}/.test(f[0].message ?? ''), 'the message shows the fallback binding');
    const state = of(frame({ view: cell('ObjectNumber', 'state', "`{ path: 'TYPE' }`") }), EN);
    assert(state.length === 1 && /'None'/.test(state[0].message ?? ''), 'a path-only binding info; ValueState falls back to None');
    const grid = frame({ extra: '    view->ele( n = `Table` ns = `table` )->a( n = `rows` v = client->_bind( t_rows )\n'
      + '        )->ele( n = `columns` ns = `table` )->ele( n = `Column` ns = `table`\n'
      + '        )->ele( n = `template` ns = `table` )->tag( `Switch` )->a( n = `type` v = `{TYPE}` ).\n' });
    assert(of(grid, EN).length === 1, 'a sap.ui.table Column.template');
    const dyn = of(frame({ view: loop('Switch', 'type', '|\\{{ comp-name }/TYPE\\}|') }), EN);
    assert(dyn.length === 1 && dyn[0].value === '|\\{{ comp-name }/TYPE\\}|', `the run-time |\\{{ path }/TYPE\\}| shape (${dyn[0]?.value})`);
  });

  section('enum-binding-no-fallback: what is not reported', () => {
    const none = (label, src) => assert(of(src, EN).length === 0, label);
    none('an expression binding with a fallback', frame({ view: cell('Button', 'type', "`{= ${TYPE} || 'Default' }`") }));
    none('the run-time expression with a fallback', frame({ view: loop('Switch', 'type', "|\\{= $\\{{ comp-name }/TYPE\\} \\|\\| 'Default' \\}|") }));
    none('a formatter', frame({ view: cell('Button', 'type', "`{ path: 'TYPE', formatter: 'z2ui5.Formatter.x' }`") }));
    none('a root attribute', frame({ extra: root('Button', 'type', 'client->_bind( mv_title )') }));
    none('an absolute path in a row template', frame({ view: cell('Button', 'type', '`{/MV_TITLE}`') }));
    none('a literal', frame({ view: cell('Button', 'type', '`Emphasized`') }));
    none('a non-enum property', frame({ view: cell('Text', 'text', '`{NAME}`') }));
    none('a mixed-case path (no ABAP field: UI5 keeps the default)', frame({ view: cell('Button', 'type', '`{Type}`') }));
    none('a field the row does not have (UI5 keeps the default)', frame({ view: cell('Button', 'type', '`{KIND}`') }));
    none('a path from _bind( )', frame({ locals: '    DATA(lv_p) = client->_bind( val = mv_title path = abap_true ).\n', view: cell('Button', 'type', '|\\{{ lv_p }\\}|') }));
  });
}
