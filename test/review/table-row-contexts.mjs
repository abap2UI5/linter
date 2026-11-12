/*
 * Review round 2026-11-11 - unknown-binding-path follows two row contexts it
 * used to treat as opaque: the rows of a sap.ui.table table reaching the
 * per-row templates of its columns, and an element binding
 * (`binding="{/T/0}"`) on a row of a declared table. Measured by renaming
 * every relative template path in the three sample corpora: 78 % caught
 * before, 89 % after, no new finding on the unchanged corpora. See
 * test/review/README.md for the harness.
 */

/* A complete app class: `types` and `data` in the PUBLIC SECTION, `view` as
 * the chain after the View element. */
const frame = ({ types = '', data = '', view = '' } = {}) =>
  'CLASS zcl_review_round1111 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
  + types + data
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_round1111 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`       v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc`   v = `sap.ui.core.mvc`\n'
  + '        )->a( n = `xmlns:table` v = `sap.ui.table`\n'
  + view
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';

const ROW_TYPES = '    TYPES: BEGIN OF ty_s_row, name TYPE string, price TYPE string, END OF ty_s_row.\n';
const ROWS = '    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const judge = (src) => checkAbapSource(src, { render: false, properties: true }).findings;
  const paths = (src) => judge(src).filter((x) => x.type === 'unknown-binding-path').map((x) => x.value);

  const gridTable = (field) => frame({
    types: ROW_TYPES, data: ROWS,
    view: '        )->ele( n = `Table` ns = `table` )->a( n = `rows` v = client->_bind( t_rows )\n'
      + '          )->ele( n = `columns` ns = `table` )->ele( n = `Column` ns = `table`\n'
      + '            )->ele( n = `template` ns = `table` )->tag( `Text` )->a( n = `text` v = `{' + field + '}`\n',
  });

  section('unknown-binding-path: a sap.ui.table column template is judged against the table rows', () => {
    assert(paths(gridTable('NAMEX')).includes('NAMEX'), 'a misspelled field in Column.template is reported');
    assert(paths(gridTable('NAME')).length === 0, 'the right field is not');
  });

  section('unknown-binding-path: a TreeTable bound to a structure keeps its templates unjudged', () => {
    /* `rows` names the ROOT of a tree (arrayNames: ['CHILDREN']); the rows
     * are the nodes, not the structure - samples-controls sapui5_013/_014 */
    const src = frame({
      types: '    TYPES: BEGIN OF ty_s_node, text TYPE string, END OF ty_s_node.\n'
        + '    TYPES: BEGIN OF ty_s_root, children TYPE STANDARD TABLE OF ty_s_node WITH EMPTY KEY, END OF ty_s_root.\n',
      data: '    DATA s_root TYPE ty_s_root.\n',
      view: "        )->ele( n = `TreeTable` ns = `table` )->a( n = `rows` v = |\\{ path: '{ client->_bind_path( s_root ) }', parameters: \\{ arrayNames: ['CHILDREN'] \\} \\}|\n"
        + '          )->ele( n = `columns` ns = `table` )->ele( n = `Column` ns = `table`\n'
        + '            )->ele( n = `template` ns = `table` )->tag( `Text` )->a( n = `text` v = `{TEXT}`\n',
    });
    assert(paths(src).length === 0, `no field of the node judged against the root (${paths(src).join()})`);
  });

  const elementBound = (field) => frame({
    types: ROW_TYPES, data: ROWS,
    view: '        )->ele( `Page`\n'
      + "          )->tag( `ObjectNumber` )->a( n = `binding` v = |\\{{ client->_bind_path( t_rows ) }/3\\}| )->a( n = `unit` v = `{" + field + "}`\n",
  });

  section('unknown-binding-path: an element binding on a table row is judged against the row type', () => {
    assert(paths(elementBound('PRICEX')).includes('PRICEX'), 'a misspelled field under binding="{/T_ROWS/3}" is reported - the index need not be seeded');
    assert(paths(elementBound('PRICE')).length === 0, 'the right field is not');
  });
}
