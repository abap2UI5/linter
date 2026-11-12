/*
 * Review round 2026-11-12 - four reasons a relative path in a row template
 * was never judged, none of them about the path:
 *
 *   the attribute sat on a member newer than the floor (member-too-new ended
 *   the attribute there);
 *   the attribute names an aggregation - `tooltip="{NAME}"`, a nested
 *   `items="{T_ITEMS}"`;
 *   the nested table is declared inside its structure, with no TYPES entry of
 *   its own;
 *   the table is bound with _bind_tab( ).
 *
 * Measured by renaming every relative template path in the three sample
 * corpora: 2,305 of 2,604 caught before (89 %), 2,444 after (94 %), no new
 * finding on the unchanged corpora. What is left is mostly SAPUI5-only
 * libraries the snapshot has no metadata for. See test/review/README.md for
 * the harness.
 */

const frame = ({ types = '', data = '', view = '' } = {}) =>
  'CLASS zcl_review_round1112 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
  + types + data
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_round1112 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->a( n = `xmlns:f`   v = `sap.f`\n'
  + view
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';

const ITEM = '    TYPES: BEGIN OF ty_s_item, name TYPE string, END OF ty_s_item.\n';

export default async function ({ section, assert, checkAbapSource }) {
  const judge = (src) => checkAbapSource(src, { render: false, properties: true }).findings;
  const paths = (src) => judge(src).filter((x) => x.type === 'unknown-binding-path').map((x) => x.value);
  const types = (src) => judge(src).map((x) => x.type);

  section('unknown-binding-path: a path on a member newer than the floor is still judged', () => {
    /* sap.f.AvatarGroupItem.initials is newer than 1.71 (samples-controls 662) */
    const src = (field) => frame({
      types: ITEM, data: '    DATA t_rows TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY.\n',
      view: '        )->ele( n = `AvatarGroup` ns = `f` )->a( n = `items` v = client->_bind( t_rows )\n'
        + '          )->tag( n = `AvatarGroupItem` ns = `f` )->a( n = `initials` v = `{' + field + '}`\n',
    });
    assert(types(src('NAMEX')).includes('member-too-new'), 'the member is still reported as too new');
    assert(paths(src('NAMEX')).includes('NAMEX'), 'and the misspelled field on it is reported as well');
    assert(paths(src('NAME')).length === 0, 'the right field is not');
  });

  section('unknown-binding-path: an attribute that names an aggregation binds relatively too', () => {
    const tooltip = (field) => frame({
      types: ITEM, data: '    DATA t_rows TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY.\n',
      view: '        )->ele( `List` )->a( n = `items` v = client->_bind( t_rows )\n'
        + '          )->tag( `StandardListItem` )->a( n = `title` v = `{NAME}` )->a( n = `tooltip` v = `{' + field + '}`\n',
    });
    assert(paths(tooltip('NAMEX')).includes('NAMEX'), 'tooltip="{NAMEX}" is reported');
    assert(paths(tooltip('NAME')).length === 0, 'tooltip="{NAME}" is not');
  });

  const NESTED_TYPES = ITEM
    + '    TYPES ty_t_item TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY.\n'
    + '    TYPES: BEGIN OF ty_s_row, title TYPE string, t_item TYPE ty_t_item, END OF ty_s_row.\n';
  const nested = (types_, agg, field) => frame({
    types: types_, data: '    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.\n',
    view: '        )->ele( `List` )->a( n = `items` v = client->_bind( t_rows )\n'
      + '          )->ele( `CustomListItem`\n'
      + '            )->ele( `List` )->a( n = `items` v = `{ path: \'' + agg + '\', templateShareable: false }`\n'
      + '              )->tag( `StandardListItem` )->a( n = `title` v = `{' + field + '}`\n',
  });

  section('unknown-binding-path: the path of a nested aggregation is judged against the row', () => {
    assert(paths(nested(NESTED_TYPES, 'T_ITEMX', 'NAME')).includes('T_ITEMX'), 'a nested table the row does not have is reported');
    assert(paths(nested(NESTED_TYPES, 'T_ITEM', 'NAME')).length === 0, 'the right one is not');
    assert(paths(nested(NESTED_TYPES, 'T_ITEM', 'NAMEX')).includes('NAMEX'), 'and the inner template is judged against the inner row');
  });

  section('unknown-binding-path: a table declared inside its structure has rows', () => {
    /* samples app 504: `t_item TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY,` */
    const inline = ITEM
      + '    TYPES: BEGIN OF ty_s_row, title TYPE string, t_item TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY, END OF ty_s_row.\n';
    assert(paths(nested(inline, 'T_ITEM', 'NAMEX')).includes('NAMEX'), 'a misspelled field of the inline table is reported');
    assert(paths(nested(inline, 'T_ITEM', 'NAME')).length === 0, 'the right field is not');
  });

  section('unknown-binding-path: _bind_tab( ) binds the table like _bind( )', () => {
    /* samples app 546, the windowed table */
    const src = (field) => frame({
      types: ITEM, data: '    DATA t_rows TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY.\n',
      view: '        )->ele( `List` )->a( n = `items` v = client->_bind_tab( val    = t_rows\n'
        + '                                                             window = 200 )\n'
        + '          )->tag( `StandardListItem` )->a( n = `title` v = `{' + field + '}`\n',
    });
    assert(paths(src('NAMEX')).includes('NAMEX'), 'a misspelled field under _bind_tab( ) is reported');
    assert(paths(src('NAME')).length === 0, 'the right field is not');
  });

  section('enum-value-too-new: not said a second time on a member that is too new itself', () => {
    /* sap.m.Avatar.badgeIconColor and its values are both newer than 1.71 */
    const src = frame({ view: '        )->tag( `Avatar` )->a( n = `badgeIconColor` v = `Indication1`\n' });
    const t = types(src);
    assert(t.includes('member-too-new'), 'the member is reported');
    assert(!t.includes('enum-value-too-new'), `its value is not reported on top (${t.join()})`);
  });
}
