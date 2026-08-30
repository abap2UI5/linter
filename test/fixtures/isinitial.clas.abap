CLASS zcl_fixture_isinitial DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
  PROTECTED SECTION.
    TYPES: BEGIN OF ty_s_row,
             ready TYPE string,
           END OF ty_s_row.
    DATA mv_ready TYPE abap_bool.
    DATA ms_row   TYPE ty_s_row.
ENDCLASS.

CLASS zcl_fixture_isinitial IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    " reported - the lifecycle call asked with IS NOT INITIAL instead of
    " being used as the predicative call it is
    IF client->check_on_init( ) IS NOT INITIAL.
      mv_ready = abap_true.
    ENDIF.

    " reported - a declared abap_bool asked whether it is EMPTY
    IF mv_ready IS NOT INITIAL.
      name = `go`.
    ENDIF.

    " NOT reported - the predicative call, which is the documented form
    IF client->check_on_navigated( ).
      name = `back`.
    ENDIF.

    " NOT reported - a negative branch is spelled out as = abap_false
    IF mv_ready = abap_false.
      name = `wait`.
    ENDIF.

    " NOT reported - a structure component may be any type, and the class's
    " own attribute names are no evidence about it
    IF ms_row-ready IS INITIAL.
      name = `x`.
    ENDIF.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Input` )->a( n = `value` v = client->_bind( name ) ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
