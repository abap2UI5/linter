CLASS z2ui5_cl_demo_app_table_filter DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_booking,
        carrid    TYPE s_carr_id,
        connid    TYPE s_conn_id,
        fldate    TYPE d,
        price     TYPE p LENGTH 12 DECIMALS 2,
      END OF ty_booking,
      tt_booking TYPE STANDARD TABLE OF ty_booking WITH EMPTY KEY.

    DATA mt_bookings TYPE tt_booking.
    DATA mv_carrier  TYPE s_carr_id.

  PRIVATE SECTION.
    METHODS load_bookings
      IMPORTING iv_carrier TYPE s_carr_id OPTIONAL.

ENDCLASS.


CLASS z2ui5_cl_demo_app_table_filter IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).

      load_bookings( ).

      DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
        title          = 'Flight Bookings'
        navbuttonpress = client->_event_nav_app_leave( ) ).

      lo_view->input(
        value       = client->_bind_edit( mv_carrier )
        placeholder = 'Filter by carrier'
        submit      = client->_event( 'FILTER' ) ).

      lo_view->button(
        text  = 'Filter'
        press = client->_event( 'FILTER' ) ).

      lo_view->table(
        items = client->_bind_edit( mt_bookings ) )->columns(
          )->column( )->text( 'Carrier' )->get_parent(
          )->column( )->text( 'Connection' )->get_parent(
          )->column( )->text( 'Date' )->get_parent(
          )->column( )->text( 'Price' ).

      client->view_display( lo_view->stringify( ) ).

    ENDIF.

    CASE client->get( )-event.
      WHEN 'FILTER'.
        load_bookings( mv_carrier ).
        client->view_model_update( ).
    ENDCASE.

  ENDMETHOD.

  METHOD load_bookings.

    " Filtering happens in the backend: the SELECT carries the carrier condition.
    IF iv_carrier IS INITIAL.
      SELECT carrid, connid, fldate, price
        FROM sbook
        INTO TABLE @mt_bookings
        UP TO 500 ROWS.
    ELSE.
      SELECT carrid, connid, fldate, price
        FROM sbook
        WHERE carrid = @iv_carrier
        INTO TABLE @mt_bookings
        UP TO 500 ROWS.
    ENDIF.

  ENDMETHOD.

ENDCLASS.
