CLASS zcl_fixture_abaphygiene DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_row,
             name       TYPE string,
             selectable TYPE abap_bool,
           END OF ty_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.
    DATA count  TYPE i.
    DATA text   TYPE string.
  PRIVATE SECTION.
    " reported (class-constructor-visibility) - the runtime calls it itself,
    " so the compiler requires it public and the class does not activate
    CLASS-METHODS class_constructor.
ENDCLASS.

CLASS zcl_fixture_abaphygiene IMPLEMENTATION.

  METHOD class_constructor.
  ENDMETHOD.

  METHOD z2ui5_if_app~main.

    " reported (value-header-default-reassigned) - the header assignment is a
    " DEFAULT for all following lines, so the second row re-assigning it is
    " refused by the syntax check
    t_rows = VALUE #( selectable = abap_true
                      ( name = `first` )
                      ( name = `second` selectable = abap_false ) ).

    " reported (into-corresponding-inline-decl) - 7.55 syntax; below that the
    " class is refused with three errors whose cause is this one
    SELECT * FROM scarr INTO CORRESPONDING FIELDS OF TABLE @DATA(lt_carr).

    " reported (redundant-conv-i) - count is already TYPE i, so the
    " assignment converts by itself
    count = CONV i( text ).

    " NOT reported - a CONV inside a string template is a real conversion
    text = |{ CONV i( text ) WIDTH = 2 }|.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Input` )->a( n = `value` v = client->_bind( text ) ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
