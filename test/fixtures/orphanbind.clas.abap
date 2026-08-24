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

    DATA(agg_binding) = client->_bind( val = t_rows path = abap_true ).

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

            " reported - a ROOT-level aggregation bound relatively: nothing to
            " resolve against, so the list renders empty
            )->ele( `List`
                )->a( n = `items` v = `{path: 'T_ROWS'}`
            )->end(

            " not judged - the outer aggregation's value is a VARIABLE the
            " reconstructor cannot resolve, so it lands in unresolvedAttrs and
            " appears in no aggRows. The inner list is a row template all the
            " same (app 585's shared nav_list( ) fragment shape)
            )->ele( `List`
                )->a( n = `items` v = agg_binding

                )->ele( `items`
                    )->ele( `CustomListItem`
                        )->ele( `List`
                            )->a( n = `items` v = `{T_CHILDREN}`
                        )->end(
                    )->end(
                )->end(
            )->end(

            " not judged - a NAMED model rides in front of the path, and
            " `message>/` is absolute once the model name is off it
            )->ele( `MessagePopover`
                )->a( n = `items` v = `{path: 'message>/'}`
            )->end(

            " not judged - inside a bound aggregation the row is the context,
            " and the nested aggregation's relative path is the normal form
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
