CLASS zcl_fixture_viewbuilder DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA editable TYPE abap_bool.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

    METHODS view_display.
    " the handle-helper idiom, typed with the successor builder - parseHelpers
    " has to follow the dialect, not a fixed class name
    METHODS render_button
      IMPORTING
        box           TYPE REF TO z2ui5_cl_ui5_view_builder
      RETURNING
        VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_viewbuilder IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_event( `GO` ).
      RETURN.
    ENDIF.

    me->client = client.
    IF client->check_on_init( ).
      name = `world`.
      editable = abap_true.
      view_display( ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    DATA(content) = view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`
            )->a( n = `title` v = `Fixture`

            )->ele( `content`
                )->tag( `Input`
                    )->a( n = `value`    v = client->_bind( name )
                    )->a( n = `editable` b = editable ).

    render_button( content ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.


  METHOD render_button.

    result = box->tag( `Button`
        )->a( n = `text`  v = `Go`
        )->a( n = `press` v = client->_event( `GO` ) ).

  ENDMETHOD.

ENDCLASS.
