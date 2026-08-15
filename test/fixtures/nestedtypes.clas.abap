CLASS zcl_fixture_nestedtypes DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    " a structure declared INSIDE another one. It is a field of its parent and
    " a structure in its own right, so {S_DETAILS/CREATE_DATE} is a path the
    " model has - and {S_DETAILS/CREATE_DAT} is the typo that is not.
    TYPES:
      BEGIN OF ty_s_row,
        id TYPE string,
        BEGIN OF s_details,
          create_date TYPE d,
          BEGIN OF s_who,
            uname TYPE string,
          END OF s_who,
        END OF s_details,
      END OF ty_s_row.

    DATA t_rows  TYPE STANDARD TABLE OF ty_s_row.
    DATA s_head  TYPE ty_s_row.
ENDCLASS.


CLASS zcl_fixture_nestedtypes IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    t_rows = VALUE #( ( id = `4711` ) ).

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`
            )->a( n = `title` v = `Nested`

            )->tag( `Input`
                )->a( n = `value` v = client->_bind( s_head-s_details-create_date )
            )->tag( `Input`
                )->a( n = `value` v = client->_bind( s_head-s_details-s_who-uname )

            )->ele( `Table`
                )->a( n = `items` v = client->_bind( t_rows )

                )->ele( `columns`
                    )->ele( `Column`
                        )->tag( `Text`
                            )->a( n = `text` v = `Detail`
                    )->end(
                )->end(

                )->ele( `items`
                    )->ele( `ColumnListItem`
                        )->tag( `Text`
                            )->a( n = `text` v = `{S_DETAILS/CREATE_DATE}`
                        )->tag( `Text`
                            )->a( n = `text` v = `{S_DETAILS/CREATE_DAT}`
                    )->end(
                )->end(
            )->end(
        )->end( )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
