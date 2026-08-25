CLASS zcl_fixture_elementbind DEFINITION PUBLIC.

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

    DATA t_product TYPE STANDARD TABLE OF ty_s_product WITH EMPTY KEY.
ENDCLASS.


CLASS zcl_fixture_elementbind IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    t_product = VALUE #( ( name = `Notebook`
                           t_item = VALUE #( ( name = `SSD 1 TB` ) ) ) ).

    DATA(popup) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = `FragmentDefinition` ns = `core`
            )->a( n = `xmlns`      v = `sap.m`
            )->a( n = `xmlns:core` v = `sap.ui.core` ).

    " relative, and correct: the whole slot is element-bound below, so the
    " context is a row the document never names
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
