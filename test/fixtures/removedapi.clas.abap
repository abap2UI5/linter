CLASS zcl_removed_api DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_name TYPE string.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_removed_api IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( `Page`
          )->tag( `Input`
              )->a( n = `value` v = client->_bind( mv_name )
              )->a( n = `liveChange`
                    v = client->_event( val    = `LIVE`
                                        s_ctrl = VALUE #( check_allow_multi_req = abap_true ) ) ).
      client->view_display( view->stringify( ) ).
    ENDIF.

    IF z2ui5_if_app~check_initialized = abap_false.
      client->set_push_state( `&state=detail` ).
    ENDIF.

    CASE client->get_event( ).
      WHEN `LIVE`.
        client->follow_up_action( client->cs_event-set_nav_routing ).
      WHEN `BACK`.
        client->set_nav_back( `X` ).
      WHEN `LOAD`.
        client->nav_app_call( z2ui5_cl_pop_js_loader=>factory( `x` ) ).
      WHEN `TEXT`.
        " a name in a comment is no use of it: client->set_nav_routing( )
        client->message_toast_display( `client->set_nav_routing( ) and z2ui5_cl_pop_bal are gone` ).
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
