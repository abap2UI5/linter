CLASS zcl_obsolete_cc DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_title TYPE string.

ENDCLASS.

CLASS zcl_obsolete_cc IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " the companion controls abap2UI5 marks OBSOLETE, three spellings of the
    " prefix: the conventional z2ui5, the name form and a custom cc - and the
    " neighbours that must stay silent: the live companion controls, sap.m
    " and core Titles, a History in an in-house namespace
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`       v = `sap.m`
        )->a( n = `xmlns:mvc`   v = `sap.ui.core.mvc`
        )->a( n = `xmlns:core`  v = `sap.ui.core`
        )->a( n = `xmlns:form`  v = `sap.ui.layout.form`
        )->a( n = `xmlns:z2ui5` v = `z2ui5.cc`
        )->a( n = `xmlns:cc`    v = `z2ui5.cc`
        )->a( n = `xmlns:app`   v = `zmy.controls`
        )->ele( `Page`
            )->a( n = `title` v = client->_bind( mv_title )
            )->tag( n = `Timer` ns = `z2ui5`
                )->a( n = `delayMS`  v = `2000`
                )->a( n = `finished` v = client->_event( `TICK` )
            )->tag( `z2ui5:Focus`
                )->a( n = `focusId` v = `input`
            )->tag( n = `History` ns = `cc`
                )->a( n = `search` v = `?x=1`
            )->tag( n = `Storage` ns = `z2ui5`
                )->a( n = `key` v = `k`
            )->tag( n = `MessageManager` ns = `z2ui5`
            )->tag( `Title`
                )->a( n = `text` v = `sap.m Title`
            )->ele( n = `SimpleForm` ns = `form`
                )->tag( n = `Title` ns = `core`
                    )->a( n = `text` v = `core Title`
                )->tag( `Label`
                    )->a( n = `text` v = `Name`
            )->end(
            )->tag( n = `History` ns = `app`
            )->tag( `Input`
                )->a( n = `id`    v = `input`
                )->a( n = `value` v = client->_bind( mv_title )
        )->end( ).

    client->view_display( view->stringify( ) ).

    CASE client->get( )-event.
      WHEN `TICK`.
        client->message_toast_display( `tick` ).
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
