CLASS zcl_fixture_review_gen DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA code TYPE string.
    DATA icon TYPE string.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

    METHODS view_display.

ENDCLASS.


CLASS zcl_fixture_review_gen IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    me->client = client.

    CASE client->get( )-event.

      WHEN `GO`.
        code = `pressed`.

      WHEN `SORT`.
        " the two hash_* constants the server consumes itself - released
        " cs_event values, spelled as literals so the dispatch check sees them
        client->follow_up_action( val   = `HASH_REPLACE`
                                  t_arg = VALUE #( ( `#/sorted` ) ) ).
        client->follow_up_action( val = `HASH_ATTACH_CHANGED` ).
        " a name nothing upstream knows - the positive control
        client->follow_up_action( val = `HASH_TYPO` ).
        RETURN.

    ENDCASE.

    IF client->check_on_init( ).
      code = `ok`.
      view_display( ).
    ELSEIF client->check_on_navigated( ).
      view_display( ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    " an icon name composed at runtime: `status-` is the prefix of a name the
    " template builds, not a glyph of its own
    icon = |sap-icon://status-{ code }|.
    " a literal typo - the positive control
    DATA(lv_bad) = `sap-icon://status-typo`.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`            v = `sap.m`
        )->a( n = `xmlns:mvc`        v = `sap.ui.core.mvc`
        )->a( n = `xmlns:columnmenu` v = `sap.m.table.columnmenu`

        )->ele( `Page`
            )->ele( `content`
                )->tag( `Button`
                    )->a( n = `icon`    v = client->_bind( icon )
                    )->a( n = `tooltip` v = lv_bad
                    )->a( n = `press`   v = client->_event( `GO` )
            )->end(

            )->ele( `headerContent`
                )->ele( n = `Menu` ns = `columnmenu`
                    )->ele( n = `quickActions` ns = `columnmenu`
                        )->tag( n = `QuickSort` ns = `columnmenu`
                            " `item` is what QuickSort fires, `typo` is nothing
                            )->a( n = `change` v = client->_event( val   = `SORT`
                                                                   t_arg = VALUE #( ( `${$parameters>/item}` )
                                                                                    ( `${$parameters>/typo}` ) ) )
                    )->end(
                )->end(
            )->end(
        )->end(
    )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
