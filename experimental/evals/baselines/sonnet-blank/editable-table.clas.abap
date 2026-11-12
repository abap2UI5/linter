CLASS z2ui5_cl_app_editable_table DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_row,
        selected TYPE abap_bool,
        product  TYPE string,
        quantity TYPE string,
        price    TYPE string,
      END OF ty_s_row.
    TYPES ty_t_row TYPE STANDARD TABLE OF ty_s_row WITH DEFAULT KEY.

    DATA mt_row TYPE ty_t_row.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_editable_table IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_row = VALUE #(
          ( product = 'Laptop'  quantity = '2'  price = '999' )
          ( product = 'Monitor' quantity = '5'  price = '199' ) ).
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'ADD'.
        APPEND INITIAL LINE TO mt_row.
        client->view_model_update( ).

      WHEN 'DELETE'.
        DELETE mt_row WHERE selected = abap_true.
        client->view_model_update( ).

    ENDCASE.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Editable Table' ).

    DATA(tab) = page->table(
        items = client->_bind_edit( mt_row )
        mode  = 'MultiSelect' ).

    tab->header_toolbar(
        )->overflow_toolbar(
            )->title( 'Items'
            )->toolbar_spacer(
            )->button( text = 'Add' icon = 'sap-icon://add' press = client->_event( 'ADD' )
            )->button( text = 'Delete selected' icon = 'sap-icon://delete' type = 'Reject' press = client->_event( 'DELETE' ) ).

    tab->columns(
        )->column( )->text( 'Product' )->get_parent(
        )->column( )->text( 'Quantity' )->get_parent(
        )->column( )->text( 'Price' ).

    tab->items( )->column_list_item( selected = '{SELECTED}' )->cells(
        )->input( value = '{PRODUCT}'
        )->input( value = '{QUANTITY}'
        )->input( value = '{PRICE}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
