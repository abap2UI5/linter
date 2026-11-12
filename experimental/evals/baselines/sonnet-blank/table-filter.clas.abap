CLASS z2ui5_cl_app_table_filter DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_booking,
        carrid    TYPE s_carr_id,
        connid    TYPE s_conn_id,
        fldate    TYPE s_date,
        loccuram  TYPE s_l_cur_pr,
        loccurkey TYPE s_currcode,
      END OF ty_s_booking.
    TYPES ty_t_booking TYPE STANDARD TABLE OF ty_s_booking WITH DEFAULT KEY.

    DATA mv_carrid TYPE string.
    DATA mt_booking TYPE ty_t_booking.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS load_data.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_table_filter IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      load_data( ).
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.
      WHEN 'FILTER'.
        load_data( ).
        client->view_model_update( ).
    ENDCASE.

  ENDMETHOD.


  METHOD load_data.

    DATA lv_carrid TYPE s_carr_id.
    lv_carrid = to_upper( mv_carrid ).
    CLEAR mt_booking.

    IF lv_carrid IS INITIAL.
      SELECT carrid, connid, fldate, loccuram, loccurkey
        FROM sbook
        INTO CORRESPONDING FIELDS OF TABLE @mt_booking
        UP TO 200 ROWS.
    ELSE.
      SELECT carrid, connid, fldate, loccuram, loccurkey
        FROM sbook
        WHERE carrid = @lv_carrid
        INTO CORRESPONDING FIELDS OF TABLE @mt_booking
        UP TO 200 ROWS.
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).

    DATA(page) = view->shell( )->page( title = 'Flight Bookings' ).

    page->input(
        value           = client->_bind_edit( mv_carrid )
        description     = 'Carrier'
        placeholder     = 'e.g. LH'
        submit          = client->_event( 'FILTER' )
        width           = '15rem' ).

    page->button(
        text  = 'Filter'
        type  = 'Emphasized'
        press = client->_event( 'FILTER' ) ).

    DATA(tab) = page->table( items = client->_bind( mt_booking ) ).

    tab->columns(
        )->column( )->text( 'Carrier' )->get_parent(
        )->column( )->text( 'Connection' )->get_parent(
        )->column( )->text( 'Date' )->get_parent(
        )->column( )->text( 'Price' ).

    tab->items( )->column_list_item( )->cells(
        )->text( '{CARRID}'
        )->text( '{CONNID}'
        )->text( '{FLDATE}'
        )->text( '{LOCCURAM} {LOCCURKEY}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
