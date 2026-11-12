CLASS z2ui5_cl_app_busy_progress DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_percent TYPE i.
    DATA mv_result TYPE string.
    DATA mv_display TYPE string.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS calculate.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_busy_progress IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mv_display = '0 %'.
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'START'.
        " show busy state in the frontend, then trigger the calculation in a second roundtrip
        client->busy_indicator_display( ).
        client->follow_up_action( client->_event_client( val = 'CALL_BACKEND' t_arg = VALUE #( ( `CALC` ) ) ) ).

      WHEN 'CALC'.
        calculate( ).
        client->busy_indicator_hide( ).
        client->view_model_update( ).

    ENDCASE.

  ENDMETHOD.


  METHOD calculate.

    DATA lv_sum TYPE i.

    DO 5 TIMES.
      WAIT UP TO 1 SECONDS.
      lv_sum = lv_sum + sy-index * 100.
    ENDDO.

    mv_percent = 100.
    mv_display = |{ mv_percent } %|.
    mv_result = |Result of the calculation: { lv_sum }|.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).

    DATA(page) = view->shell( )->page( title = 'Long Running Calculation' ).

    page->button(
        text  = 'Start calculation'
        type  = 'Emphasized'
        press = client->_event( 'START' ) ).

    page->progress_indicator(
        percentvalue = client->_bind( mv_percent )
        displayvalue = client->_bind( mv_display )
        showvalue    = abap_true
        state        = 'Success'
        width        = '20rem' ).

    page->text( client->_bind( mv_result ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
