CLASS zcl_unplacedns DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_text TYPE string.
  PROTECTED SECTION.
    DATA mv_ns TYPE string VALUE `f`.
    METHODS add_title
      IMPORTING
        io TYPE REF TO object.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_unplacedns IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ) OR client->check_on_navigated( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = `View` ns = `mvc`
          )->a( n = `xmlns`     v = `sap.m`
          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
          )->a( n = `xmlns:f`   v = `sap.f`
          )->ele( `Page`
              )->tag( `Input`
                  )->a( n = `value` v = client->_bind( mv_text )
          )->end( ).
      client->view_display( view->stringify( ) ).
    ENDIF.

  ENDMETHOD.

  METHOD add_title.

    io->tag( n = `Avatar` ns = mv_ns ).

  ENDMETHOD.

ENDCLASS.
