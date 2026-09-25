CLASS zcl_fixture_directiverules DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.

CLASS zcl_fixture_directiverules IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Button`
            " abap2ui5lint-disable-next-line Unknown-Property -- a case typo: waives nothing, and the linter names the id it can only mean
            )->a( n = `typo1` v = `a`
            " abap2ui5lint-disable-next-line binding-to-locl -- no rule is this name up to case: reported without a suggestion
            )->a( n = `typo2` v = `b`
            " abap2ui5lint-disable-next-line unknown-property -- dead: the line below is fine
            )->a( n = `text` v = `c`
            )->a( n = `type` v = `Emphasized`   " abap2ui5lint-disable-line invalid-property-value, unknown-property -- both dead
          " abap2ui5lint-disable
            )->a( n = `enabled` v = `true`
          " abap2ui5lint-enable
          " abap2ui5lint-disable-next-line render-error -- a render error has no source line
            )->a( n = `icon` v = `sap-icon://accept`
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
