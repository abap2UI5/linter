CLASS zcl_fixture_viewrules DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA tab TYPE STANDARD TABLE OF string WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_fixture_viewrules IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Button`
            )->a( n = `id`    v = `twice`
            )->a( n = `text`  v = `A`
            )->a( n = `press` v = client->_bind( name )
          )->tag( `Button`
            )->a( n = `id`   v = `twice`
            )->a( n = `icon` v = `sap-icon://add`
          )->tag( `Text`
            )->a( n = `text` v = `{= ${/NAME} === 'x' ? 'yes' : 'no' }`
          )->tag( `Text`
            )->a( n = `tooltip` v = client->_event( `WRONG_SLOT` )
          )->tag( n = `Title` ns = `undeclared`
        )->end(
        )->ele( `content`
          )->tag( `Text`
            )->a( n = `text` v = `first`
        )->end(
        )->ele( `content`
          )->tag( `Text`
            )->a( n = `text` v = `second`
          )->tag( `Bar`
            )->a( n = `translucent` v = `true`
          )->ele( `Table`
            )->a( n = `items` v = client->_bind( tab )
            )->a( n = `headerText` v = client->_bind( tab ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
