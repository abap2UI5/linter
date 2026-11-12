CLASS z2ui5_cl_demo_app_value_help DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_customer,
        kunnr TYPE kna1-kunnr,
        name1 TYPE kna1-name1,
        ort01 TYPE kna1-ort01,
      END OF ty_customer,
      tt_customer TYPE STANDARD TABLE OF ty_customer WITH EMPTY KEY.

    DATA mv_customer     TYPE kna1-kunnr.
    DATA mt_customers    TYPE tt_customer.
    DATA mv_popup_open   TYPE abap_bool.

ENDCLASS.


CLASS z2ui5_cl_demo_app_value_help IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).

      DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
        title          = 'Customer'
        navbuttonpress = client->_event_nav_app_leave( ) ).

      lo_view->input(
        value            = client->_bind_edit( mv_customer )
        showvaluehelp    = abap_true
        valuehelprequest = client->_event( 'VH_OPEN' ) ).

      " Popup list with the customers, shown only while it is open.
      IF mv_popup_open = abap_true.
        DATA(lo_dialog) = lo_view->dialog(
          title = 'Select Customer'
          afterclose = client->_event( 'VH_CLOSE' ) ).

        lo_dialog->table(
          items = client->_bind_edit( mt_customers )
          mode  = 'SingleSelectMaster'
          itemPress = client->_event( 'VH_SELECT' )
          )->columns(
            )->column( )->text( 'Customer' )->get_parent(
            )->column( )->text( 'Name' )->get_parent(
            )->column( )->text( 'City' ).

        lo_dialog->get_parent( )->footer( )->button(
          text  = 'Cancel'
          press = client->_event( 'VH_CLOSE' ) ).
      ENDIF.

      client->view_display( lo_view->stringify( ) ).

    ENDIF.

    CASE client->get( )-event.

      WHEN 'VH_OPEN'.
        SELECT kunnr, name1, ort01
          FROM kna1
          INTO TABLE @mt_customers
          UP TO 200 ROWS.
        mv_popup_open = abap_true.
        client->view_model_update( ).

      WHEN 'VH_SELECT'.
        DATA(lv_selected) = client->get( )-s_actual-kunnr.
        mv_customer = lv_selected.
        mv_popup_open = abap_false.
        client->view_model_update( ).

      WHEN 'VH_CLOSE'.
        mv_popup_open = abap_false.
        client->view_model_update( ).

    ENDCASE.

  ENDMETHOD.

ENDCLASS.
