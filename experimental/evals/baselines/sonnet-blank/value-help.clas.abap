CLASS z2ui5_cl_app_value_help DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_customer,
        id   TYPE s_customer,
        name TYPE s_custname,
        city TYPE s_city,
      END OF ty_s_customer.
    TYPES ty_t_customer TYPE STANDARD TABLE OF ty_s_customer WITH DEFAULT KEY.

    DATA mv_customer TYPE string.
    DATA mt_customer TYPE ty_t_customer.

  PROTECTED SECTION.
    DATA mv_popup_open TYPE abap_bool.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS popup_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_value_help IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      SELECT id, name, city FROM scustom INTO CORRESPONDING FIELDS OF TABLE @mt_customer UP TO 100 ROWS.
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'OPEN_VH'.
        popup_display( client ).

      WHEN 'VH_SELECT'.
        DATA(lv_id) = client->get_event_arg( 1 ).
        mv_customer = lv_id.
        client->popup_destroy( ).
        client->view_model_update( ).

      WHEN 'VH_CANCEL'.
        client->popup_destroy( ).

    ENDCASE.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).

    view->shell( )->page( title = 'Customer Value Help'
        )->simple_form( editable = abap_true
            )->content( 'form'
                )->label( 'Customer'
                )->input(
                    value            = client->_bind_edit( mv_customer )
                    showvaluehelp    = abap_true
                    valuehelprequest = client->_event( 'OPEN_VH' ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.


  METHOD popup_display.

    DATA(popup) = z2ui5_cl_xml_view=>factory_popup( ).

    DATA(dialog) = popup->dialog( title = 'Select Customer' contentwidth = '40rem' ).

    DATA(tab) = dialog->table(
        items = client->_bind( mt_customer )
        mode  = 'SingleSelectMaster' ).

    tab->columns(
        )->column( )->text( 'ID' )->get_parent(
        )->column( )->text( 'Name' )->get_parent(
        )->column( )->text( 'City' ).

    tab->items( )->column_list_item(
        type  = 'Active'
        press = client->_event( val = 'VH_SELECT' t_arg = VALUE #( ( `${ID}` ) ) )
        )->cells(
            )->text( '{ID}'
            )->text( '{NAME}'
            )->text( '{CITY}' ).

    dialog->buttons(
        )->button( text = 'Cancel' press = client->_event( 'VH_CANCEL' ) ).

    client->popup_display( popup->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
