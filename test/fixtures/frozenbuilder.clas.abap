CLASS zcl_frozen_app DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_name TYPE string.

ENDCLASS.

CLASS zcl_frozen_app IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).

    view->page(
        )->simple_form(
            )->content( `form`
                )->label( `Name`
                )->input( client->_bind_edit( mv_name ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
