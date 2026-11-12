CLASS z2ui5_cl_demo_app_edit_table DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_row,
        selected TYPE abap_bool,
        item     TYPE string,
        quantity TYPE i,
        note     TYPE string,
      END OF ty_row,
      tt_row TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.

    DATA mt_rows TYPE tt_row.

ENDCLASS.


CLASS z2ui5_cl_demo_app_edit_table IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_rows = VALUE #( ( item = 'Pen' quantity = 2 note = '' ) ).
    ENDIF.

    CASE client->get( )-event.

      WHEN 'ADD_ROW'.
        APPEND VALUE #( ) TO mt_rows.
        client->view_model_update( ).

      WHEN 'DELETE_SELECTED'.
        " Remove all rows where the checkbox is ticked.
        DELETE mt_rows WHERE selected = abap_true.
        client->view_model_update( ).

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Editable Table'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->table(
      items = client->_bind_edit( mt_rows )
      mode  = 'MultiSelect' )->columns(
        )->column( )->text( 'Item'
        )->get_parent(
        )->column( )->text( 'Quantity'
        )->get_parent(
        )->column( )->text( 'Note'
      )->get_parent( )->items( )->column_list_item(
        )->checkbox( selected = client->_bind_edit( mt_rows-selected )
        )->input( value = client->_bind_edit( mt_rows-item )
        )->input( value = client->_bind_edit( mt_rows-quantity ) type = 'Number'
        )->input( value = client->_bind_edit( mt_rows-note ) ).

    lo_view->footer( )->overflow_toolbar(
      )->button( text = 'Add row'  press = client->_event( 'ADD_ROW' )
      )->button( text = 'Delete selected' type = 'Reject' press = client->_event( 'DELETE_SELECTED' ) ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
