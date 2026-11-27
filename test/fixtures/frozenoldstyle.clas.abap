CLASS zcl_frozen_old_style DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA check_initialized TYPE abap_bool.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_frozen_old_style IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF check_initialized = abap_false.
      check_initialized = abap_true.
      DATA(view) = z2ui5_cl_xml_view=>factory( ).
      view->shell(
          )->page( title = `Old style`
              )->input( client->_bind_edit( name )
              )->button( text  = `Post`
                         press = client->_event( `POST` ) ).
      client->view_display( view->stringify( ) ).
    ENDIF.

    CASE client->get( )-event.
      WHEN `POST`.
        client->nav_app_call( z2ui5_cl_pop_to_confirm=>factory( `Sure?` ) ).
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
