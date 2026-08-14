" abap2ui5lint-disable non-released-api -- the dialect is not what this fixture is about
CLASS zcl_fixture_chainlayout DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

    METHODS moved_sibling   RETURNING VALUE(result) TYPE string.
    METHODS outdented_attr  RETURNING VALUE(result) TYPE string.
    METHODS crammed_line    RETURNING VALUE(result) TYPE string.
    METHODS two_space_house RETURNING VALUE(result) TYPE string.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_chainlayout IMPLEMENTATION.

  METHOD z2ui5_if_app~main.
    client->view_display( two_space_house( ) ).
  ENDMETHOD.


  METHOD moved_sibling.
    " the Button is a sibling of the Input, but it is written a level out -
    " it reads as if the Page had closed
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
            )->tag( `Input`
          )->tag( `Button` ).
    result = view->stringify( ).
  ENDMETHOD.


  METHOD outdented_attr.
    " the attribute belongs to the Input and is written left of it
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
            )->tag( `Input`
    )->a( n = `value` v = `x` ).
    result = view->stringify( ).
  ENDMETHOD.


  METHOD crammed_line.
    " three controls on one line of a chain that is otherwise one per line
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
            )->tag( `Input` )->tag( `Button` )->tag( `Text` ) ).
    result = view->stringify( ).
  ENDMETHOD.


  METHOD two_space_house.
    " a chain that keeps its own two-space step throughout: house style, and
    " never reported - the step is not what the rule is about
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
      )->a( n = `xmlns`     v = `sap.m`
      )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
      )->ele( `Page`
        )->a( n = `title` v = `Fixture`
        )->tag( `Input`
          )->a( n = `value` v = `x`
        )->tag( `Button`
          )->a( n = `text` v = `Go` ).
    result = view->stringify( ).
  ENDMETHOD.

ENDCLASS.
