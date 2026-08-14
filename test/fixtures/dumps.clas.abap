" abap2ui5lint-disable non-released-api -- stays on the old builder on purpose: this fixture is about the ASSERTs both builders raise
CLASS zcl_fixture_dumps DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_dumps IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " the two ways a builder chain dumps although the XML would look fine:
    "   a( ) on the bare factory root - there is no element to carry it
    "   the same attribute name twice on one control
    " z2ui5_cl_ui5_view_builder ASSERTs on both, so the app never reaches the browser
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->a( n = `title` v = `no element yet` ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`
            )->a( n = `title` v = `Dumps`

            )->tag( `Button`
                )->a( n = `text` v = `Save`
                )->a( n = `text` v = `Save and close`

        )->end( )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
