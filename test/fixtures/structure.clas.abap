CLASS zcl_fixture_structure DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_structure IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " every defect the metadata gates are meant to catch, in one view:
    "   Buton              - control that does not exist
    "   typ                - property that does not exist on Button
    "   type="Emphasised"  - value outside sap.m.ButtonType
    "   percentValue="42%" - not a float
    "   contentt           - aggregation that does not exist on Page
    "   two children in Page/customHeader - a 0..1 aggregation
    "   the trailing shut( ) chain runs past the root
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`
            )->a( n = `title` v = `Structure`

            )->ele( `customHeader`
                )->tag( `Bar`
                )->tag( `Bar`
            )->end(

            )->ele( `contentt`
                )->tag( `Buton`
                )->tag( `Button`
                    )->a( n = `typ`  v = `wrong`
                    )->a( n = `type` v = `Emphasised`
                )->tag( `ProgressIndicator`
                    )->a( n = `percentValue` v = `42%`
            )->end( )->end( )->end( )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
