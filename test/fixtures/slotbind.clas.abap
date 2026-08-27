CLASS zcl_fixture_slotbind DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_item,
        name TYPE string,
      END OF ty_s_item,
      BEGIN OF ty_s_product,
        name   TYPE string,
        t_item TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY,
      END OF ty_s_product.

    DATA headline  TYPE string.
    DATA t_product TYPE STANDARD TABLE OF ty_s_product WITH EMPTY KEY.
ENDCLASS.


CLASS zcl_fixture_slotbind IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    headline  = `Products`.
    t_product = VALUE #( ( name = `Notebook`
                           t_item = VALUE #( ( name = `SSD 1 TB` ) ) ) ).

    " the MAIN slot. It is NOT the slot the wire at the end binds, so both of
    " these resolve against nothing and render empty - which is the whole point
    " of scoping the suppression to a slot instead of to the class
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`
            )->tag( `Title`
                )->a( n = `text` v = `{HEADLINE}`
            )->ele( `List`
                )->a( n = `items` v = `{path: 'T_PRODUCT'}`
            )->end(
        )->end( ).

    client->view_display( view->stringify( ) ).

    " the POPUP slot, and the one the wire DOES bind: every relative path in
    " this document resolves against the row the frontend sets on the slot
    DATA(popup) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = `FragmentDefinition` ns = `core`
            )->a( n = `xmlns`      v = `sap.m`
            )->a( n = `xmlns:core` v = `sap.ui.core` ).

    popup->ele( `Dialog`
        )->a( n = `title` v = `{NAME}`

        )->ele( `List`
            )->a( n = `items` v = `{T_ITEM}`
            )->tag( `StandardListItem`
                )->a( n = `title` v = `{NAME}`
        )->end( ).

    client->popup_display( popup->stringify( ) ).

    client->follow_up_action(
        val   = client->cs_event-bind_element
        view  = client->cs_view-popup
        t_arg = VALUE #( ( `0` ) ( client->_bind( t_product ) ) ) ).

  ENDMETHOD.
ENDCLASS.
