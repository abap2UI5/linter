CLASS zcl_fixture_inlinestruct DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    " an INLINE structure - variable and structure declared in one go, with no
    " type name of its own. Both spellings occur in the wild: the one-line
    " DATA: BEGIN OF, and the READ-ONLY one that starts on the next line
    DATA: BEGIN OF message,
            text TYPE string,
            type TYPE string VALUE `None`,
          END OF message.

    DATA:
      BEGIN OF error READ-ONLY,
        text TYPE string,
        flag TYPE abap_bool,
      END OF error.
ENDCLASS.


CLASS zcl_fixture_inlinestruct IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`

            " every path below goes through an inline structure and resolves
            )->tag( `MessageStrip`
                )->a( n = `text`    v = client->_bind( message-text )
                )->a( n = `type`    v = client->_bind( message-type )

            " the boolean field reaches the renderer as a boolean, not as ''
            )->tag( `MessageStrip`
                )->a( n = `text`    v = client->_bind( error-text )
                )->a( n = `visible` v = client->_bind( error-flag )
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
