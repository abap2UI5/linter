CLASS zcl_helpercalls DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.
    METHODS view_display.
    METHODS add_form IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder.
    METHODS add_footer CHANGING co_parent TYPE REF TO z2ui5_cl_ui5_view_builder.
    METHODS add_title IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder
                      EXPORTING ev_count  TYPE i.
    CLASS-METHODS add_static IMPORTING io_parent TYPE REF TO z2ui5_cl_ui5_view_builder.
ENDCLASS.

CLASS zcl_helpercalls IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_navigated( ).
      view_display( ).
    ENDIF.
    IF client->check_on_event( `GO` ).
      RETURN.
    ENDIF.
  ENDMETHOD.

  METHOD add_form.
    io_parent->tag( `Input` )->a( n = `valeu` v = client->_bind( name ) ).
  ENDMETHOD.

  METHOD add_footer.
    co_parent->tag( `Button` )->a( n = `txet` v = `Go` )->a( n = `press` v = client->_event( `GO` ) ).
  ENDMETHOD.

  METHOD add_title.
    io_parent->tag( `Title` )->a( n = `levle` v = `H2` ).
    ev_count = 1.
  ENDMETHOD.

  METHOD add_static.
    io_parent->tag( `Text` )->a( n = `wrapp` v = `true` ).
  ENDMETHOD.

  METHOD view_display.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    DATA(content) = view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
            )->a( n = `title` v = `Helper calls`
            )->ele( `content` ).
    me->add_form( content ).
    add_footer( CHANGING co_parent = content ).
    CALL METHOD add_title EXPORTING io_parent = content.
    zcl_helpercalls=>add_static( content ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
