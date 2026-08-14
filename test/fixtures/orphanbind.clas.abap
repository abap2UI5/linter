CLASS zcl_fixture_orphanbind DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_row,
        productid TYPE string,
      END OF ty_s_row.

    " the record the original reached with bindElement( '/ProductCollection/0' ),
    " seeded at the model root by the port
    DATA name     TYPE string.
    DATA supplier TYPE string.
    DATA t_rows   TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
ENDCLASS.


CLASS zcl_fixture_orphanbind IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    name     = `Notebook`.
    supplier = `Very Best Screens`.
    t_rows   = VALUE #( ( productid = `HT-1000` ) ).

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`

            " reported - no binding context, NAME is a root field: renders empty
            )->tag( `Text`
                )->a( n = `text` v = `{NAME}`

            " correct - the same field bound absolutely
            )->tag( `Text`
                )->a( n = `text` v = client->_bind( supplier )

            " not judged - inside a bound aggregation the row is the context
            )->ele( `List`
                )->a( n = `items` v = client->_bind( t_rows )

                )->ele( `items`
                    )->tag( `StandardListItem`
                        )->a( n = `title` v = `{PRODUCTID}`
                )->end(
            )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
