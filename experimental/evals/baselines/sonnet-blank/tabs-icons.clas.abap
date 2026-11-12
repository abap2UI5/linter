CLASS z2ui5_cl_app_tabs_icons DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_item,
        id   TYPE string,
        name TYPE string,
        qty  TYPE string,
      END OF ty_s_item.
    TYPES ty_t_item TYPE STANDARD TABLE OF ty_s_item WITH DEFAULT KEY.

    DATA mt_item TYPE ty_t_item.
    DATA mv_notes TYPE string.
    DATA mv_selected_key TYPE string.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_tabs_icons IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mv_selected_key = 'overview'.
      mt_item = VALUE #(
          ( id = '1' name = 'Pen'      qty = '10' )
          ( id = '2' name = 'Notebook' qty = '4' )
          ( id = '3' name = 'Stapler'  qty = '1' ) ).
      view_display( client ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Tabs with Icons' ).

    DATA(tabbar) = page->icon_tab_bar( selectedkey = client->_bind_edit( mv_selected_key ) ).

    tabbar->items(
        )->icon_tab_filter( key = 'overview' text = 'Overview' icon = 'sap-icon://home'
            )->text( 'This is the overview of the application.'
        )->get_parent(
        )->icon_tab_filter( key = 'items' text = 'Items' icon = 'sap-icon://list'
            )->table( items = client->_bind( mt_item )
                )->columns(
                    )->column( )->text( 'ID' )->get_parent(
                    )->column( )->text( 'Name' )->get_parent(
                    )->column( )->text( 'Quantity' )->get_parent(
                )->get_parent(
                )->items( )->column_list_item( )->cells(
                    )->text( '{ID}'
                    )->text( '{NAME}'
                    )->text( '{QTY}' ).

    tabbar->items(
        )->icon_tab_filter( key = 'notes' text = 'Notes' icon = 'sap-icon://notes'
            )->text_area(
                value = client->_bind_edit( mv_notes )
                rows  = `8`
                width = '100%' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
