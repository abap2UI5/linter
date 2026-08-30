CLASS zcl_fixture_stalepath DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_row,
             product_name TYPE string,
             price        TYPE string,
           END OF ty_row.
    " WITH DEFAULT KEY is the commonest spelling there is, and it used to make
    " the whole declaration unparseable: the attribute fell through to the
    " scalar branch, the model carried '' where the row array belongs, and
    " every rule that resolves against a ROW went silent for lack of a context
    DATA t_items TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY.
ENDCLASS.

CLASS zcl_fixture_stalepath IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    t_items = VALUE #( ( product_name = `Pen` price = `1.50` ) ).

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->ele( `List` )->a( n = `items` v = client->_bind( t_items )
            )->ele( `StandardListItem`

              " NOT reported - a row field, in the simple relative form
              )->a( n = `title` v = `{PRODUCT_NAME}`

              " reported (unknown-binding-path) - the original's camelCase
              " path copied verbatim into a COMPLEX binding info. The row has
              " no such field, and until now nothing checked the complex form
              " against the row it resolves in
              )->a( n = `description` v = `{ path: 'exchangeRate', type: 'sap.ui.model.type.Float' }`

              " NOT reported - the same complex form over a real row field
              )->a( n = `info` v = `{ path: 'PRICE', type: 'sap.ui.model.type.Float' }`

            )->end(
          )->end( ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
