CLASS zcl_fixture_inheritedsince DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.
CLASS zcl_fixture_inheritedsince IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`      v = `sap.m`
        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
        )->a( n = `xmlns:card` v = `sap.f.cards`
        )->tag( n = `Header` ns = `card`
            )->a( n = `title` v = `T`
            )->a( n = `press` v = client->_event( `P` ) ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
