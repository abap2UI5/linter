CLASS z2ui5_cl_demo_app_busy_prog DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_busy     TYPE abap_bool.
    DATA mv_progress TYPE i.
    DATA mv_result   TYPE string.

  PRIVATE SECTION.
    METHODS long_running_calculation
      RETURNING VALUE(rv_result) TYPE string.

ENDCLASS.


CLASS z2ui5_cl_demo_app_busy_prog IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mv_progress = 0.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'START'.
        " Show the busy state first, then run the calculation.
        mv_busy     = abap_true.
        mv_progress = 0.
        mv_result   = ''.
        client->view_model_update( ).
        client->follow_up_action( 'CALCULATE' ).

      WHEN 'CALCULATE'.
        mv_result   = long_running_calculation( ).
        mv_progress = 100.
        mv_busy     = abap_false.
        client->view_model_update( ).

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Long Running Calculation'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->button(
      text    = 'Start calculation'
      type    = 'Emphasized'
      enabled = xsdbool( mv_busy = abap_false )
      press   = client->_event( 'START' ) ).

    lo_view->busy_indicator(
      busy  = client->_bind( mv_busy )
      text  = 'Calculating...' ).

    lo_view->progress_indicator(
      percentvalue = client->_bind( mv_progress )
      displayvalue = |{ mv_progress } %|
      state        = 'Information' ).

    lo_view->text( |Result: { mv_result }| ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD long_running_calculation.

    " Placeholder for the real work: a loop over a large data set.
    DATA lv_sum TYPE i.
    DO 1000000 TIMES.
      lv_sum = lv_sum + 1.
    ENDDO.
    rv_result = |Calculated value: { lv_sum }|.

  ENDMETHOD.

ENDCLASS.
