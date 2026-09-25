CLASS zcl_guiderules DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_row,
             title   TYPE string,
             enabled TYPE abap_bool,
           END OF ty_row.
    DATA t_rows    TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    DATA mv_search TYPE string.
    METHODS render_nest RETURNING VALUE(result) TYPE string.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_guiderules IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      t_rows = VALUE #( ( title = `a` enabled = abap_true ) ( title = `b` enabled = abap_false ) ).
    ENDIF.

    CASE client->get_event( ).
      WHEN `SEARCH`.
        DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
        popup->ele( n = `FragmentDefinition` ns = `core`
            )->a( n = `xmlns` v = `sap.m`
            )->a( n = `xmlns:core` v = `sap.ui.core`
            )->ele( `Dialog`
                )->a( n = `title` v = `Result`
                )->tag( `Button`
                    )->a( n = `text` v = `Close`
                    )->a( n = `press` v = client->_event( client->cs_event-popup_close )
            )->end( ).
        client->popup_display( xml = popup->stringify( ) ).
        RETURN.
      WHEN `NEST`.
        client->nest_view_display( val = render_nest( ) id = `host` method_insert = `addContent` ).
        client->nest2_view_display( val = render_nest( ) id = `host2` method_insert = `addMidColumnPage` ).
        RETURN.
    ENDCASE.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns` v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
            )->a( n = `id` v = `mainPage`
            )->tag( `SearchField`
                )->a( n = `value` v = client->_bind( mv_search )
                )->a( n = `liveChange` v = client->_event( val = `SEARCH` s_ctrl = VALUE #( check_queue_last = abap_true ) )
            )->tag( `Button`
                )->a( n = `text` v = `Nest`
                )->a( n = `press` v = client->_event( `NEST` )
            )->tag( `VBox`
                )->a( n = `id` v = `host`
            )->tag( `VBox`
                )->a( n = `id` v = `host2`
            )->ele( `List`
                )->a( n = `items` v = client->_bind( val = t_rows omit_initial = abap_true )
                )->tag( `StandardListItem`
                    )->a( n = `title` v = `{TITLE}`
                    )->a( n = `visible` v = `{ENABLED}`
        )->end( ).
    client->view_display( view->stringify( ) ).

  ENDMETHOD.

  METHOD render_nest.
    DATA(nest) = z2ui5_cl_ui5_view_builder=>factory( ).
    nest->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns` v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->tag( `Text`
            )->a( n = `text` v = `nested`
        )->end( ).
    result = nest->stringify( ).
  ENDMETHOD.

ENDCLASS.
