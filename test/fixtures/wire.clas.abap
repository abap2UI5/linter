CLASS zcl_fixture_wire DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name    TYPE string.
    DATA counter TYPE i.
    DATA ballast TYPE string.
ENDCLASS.

CLASS zcl_fixture_wire IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    " the first line escapes its braces, the second one forgot to - and only
    " the first literal carries the <style> tag
    counter = counter + 1.   " read and written in code: state, not ballast

    DATA(css) = `<style>.ok \{color:red\}` &&
                `.broken {color:blue}</style>`.

    " the same escape written in a template: \{ collapses before the builder
    " sees it, so the attribute crashes exactly as an unescaped one would
    DATA(css2) = |<style>.a \{color:green\}</style>|.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`      v = `sap.m`
        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
        )->a( n = `xmlns:core` v = `sap.ui.core`
        )->ele( `Page`

          " bound in the view: transported for a reason
          )->tag( `Input`
            )->a( n = `value` v = client->_bind( name )

          " correct wires - never reported
          )->tag( `Button`
            )->a( n = `text`  v = `Toast`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-control_global
                                                         t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `show` ) ( `done` ) ) )
          )->tag( `Button`
            )->a( n = `text`  v = `Busy`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-control_global
                                                         t_arg = VALUE #( ( `BUSY_INDICATOR` ) ( `hide` ) ) )

          " a global the runtime does not know
          )->tag( `Button`
            )->a( n = `text`  v = `Typo global`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-control_global
                                                         t_arg = VALUE #( ( `MESSAGE_TOASTER` ) ( `show` ) ( `nope` ) ) )

          " a method that global does not offer
          )->tag( `Button`
            )->a( n = `text`  v = `Typo method`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-control_global
                                                         t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `display` ) ( `nope` ) ) )

          " a binding method that is not filter or sort
          )->tag( `Button`
            )->a( n = `text`  v = `Bad binding`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-binding_call
                                                         t_arg = VALUE #( ( `tab` ) ( `items` ) ( `refresh` ) ) )

          " the obsolete empty view slot
          )->tag( `Button`
            )->a( n = `text`  v = `Shifted`
            )->a( n = `press` v = client->_event_client( val   = client->cs_event-control_by_id
                                                         t_arg = VALUE #( ( `nav` ) ( `` ) ( `to` ) ) )

          )->tag( n = `HTML` ns = `core`
            )->a( n = `content` v = css

        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
