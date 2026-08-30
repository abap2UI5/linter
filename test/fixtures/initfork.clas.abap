CLASS zcl_fixture_initfork DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
  PROTECTED SECTION.
    METHODS render.
    METHODS render_guarded.
    METHODS on_navigation.
ENDCLASS.

CLASS zcl_fixture_initfork IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " reported (redundant-init-display, OR) - check_on_init( ) implies
    " check_on_navigated( ), so the OR can never change the verdict
    IF client->check_on_init( ) OR client->check_on_navigated( ).
      render( ).
    ENDIF.

  ENDMETHOD.

  METHOD render.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Input` )->a( n = `value` v = client->_bind( name ) ) ).

    " reported (redundant-init-display, fork) - both arms are the same
    " display call, so the init branch decides nothing
    IF client->check_on_init( ).
      client->view_display( view->stringify( ) ).
    ELSEIF client->check_on_navigated( ).
      client->view_display( view->stringify( ) ).
    ENDIF.

  ENDMETHOD.

  METHOD render_guarded.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    " NOT reported - the navigated arm does something else first, so the fork
    " really does decide something and the init arm has to stay
    IF client->check_on_init( ).
      client->view_display( view->stringify( ) ).
    ELSEIF client->check_on_navigated( ).
      on_navigation( ).
      client->view_display( view->stringify( ) ).
    ENDIF.

  ENDMETHOD.

  METHOD on_navigation.
    name = `back`.
  ENDMETHOD.

ENDCLASS.
