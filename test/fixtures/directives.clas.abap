CLASS zcl_fixture_directives DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
ENDCLASS.

CLASS zcl_fixture_directives IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Button`
            " abap2ui5lint-disable-next-line unknown-property -- waived right here
            )->a( n = `typo1` v = `a`
            )->a( n = `typo2` v = `b`
            )->a( n = `typo3` v = `c`   " abap2ui5lint-disable-line
          " abap2ui5lint-disable unknown-property
            )->a( n = `typo4` v = `d`
          " abap2ui5lint-enable
            )->a( n = `typo5` v = `e`
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
