CLASS zcl_fixture_condattr DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA growing TYPE abap_bool.
ENDCLASS.
CLASS zcl_fixture_condattr IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        " the value is a COND, so the reconstructor drops the attribute - the
        " member is still initialFocus, @since 1.117 on sap.m.SelectDialogBase
        )->tag( `TableSelectDialog`
            )->a( n = `title`        v = `Products`
            )->a( n = `initialFocus` v = COND #( WHEN growing = abap_true THEN `SearchField` ELSE `List` ) ).

    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
