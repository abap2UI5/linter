CLASS z2ui5_cl_app_nav_list DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_cc,
        id    TYPE string,
        name  TYPE string,
        owner TYPE string,
      END OF ty_s_cc.
    TYPES ty_t_cc TYPE STANDARD TABLE OF ty_s_cc WITH DEFAULT KEY.

    DATA mt_cc TYPE ty_t_cc.
    DATA mv_selected TYPE string.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_nav_list IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_cc = VALUE #(
          ( id = '1000' name = 'Sales'      owner = 'MUELLER' )
          ( id = '2000' name = 'Marketing'  owner = 'SMITH' )
          ( id = '3000' name = 'IT'         owner = 'MEIER' )
          ( id = '4000' name = 'Logistics'  owner = 'JONES' ) ).
      view_display( client ).
      RETURN.
    ENDIF.

    IF client->check_on_navigated( ).
      " returned from the detail app, the instance and mv_selected are still intact
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.
      WHEN 'OPEN'.
        mv_selected = client->get_event_arg( 1 ).
        DATA(ls_cc) = VALUE #( mt_cc[ id = mv_selected ] OPTIONAL ).
        client->nav_app_call( NEW z2ui5_cl_app_nav_detail( is_cc = ls_cc ) ).
    ENDCASE.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Cost Centres' ).

    page->text( text = `Last selected: ` && mv_selected ).

    DATA(tab) = page->table( items = client->_bind( mt_cc ) ).

    tab->columns(
        )->column( )->text( 'ID' )->get_parent(
        )->column( )->text( 'Name' )->get_parent(
        )->column( )->text( 'Owner' ).

    tab->items( )->column_list_item(
        type     = 'Navigation'
        selected = abap_false
        press    = client->_event( val = 'OPEN' t_arg = VALUE #( ( `${ID}` ) ) )
        )->cells(
            )->text( '{ID}'
            )->text( '{NAME}'
            )->text( '{OWNER}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
