CLASS zcl_fixture_deadlib DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.

CLASS zcl_fixture_deadlib IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    " sap.ui.commons went whole in 1.38, and its Button has the same NAME as
    " the sap.m one - which is how a copied tutorial keeps the dead namespace.
    " sap.viz.ui5.Bar is the legacy chart; VizFrame beside it is its
    " replacement and must NOT be reported.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`       v = `sap.m`
        )->a( n = `xmlns:mvc`   v = `sap.ui.core.mvc`
        )->a( n = `xmlns:c`     v = `sap.ui.commons`
        )->a( n = `xmlns:viz`   v = `sap.viz.ui5`
        )->a( n = `xmlns:vizc`  v = `sap.viz.ui5.controls`
        )->tag( n = `Button` ns = `c`
        )->tag( n = `Bar` ns = `viz`
        )->tag( n = `VizFrame` ns = `vizc` ).
    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
