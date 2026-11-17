CLASS zcl_fx_window DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.

    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_row,
        id   TYPE i,
        name TYPE string,
      END OF ty_s_row.
    DATA mt_rows  TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
    DATA mt_plain TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.

ENDCLASS.

CLASS zcl_fx_window IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_event( `HIGHEST_ID` ).
      client->window_bind_tab( val    = mt_rows
                               window = 50
                               t_sort = VALUE #( ( path = `ID` descending = abap_true ) ) ).
      RETURN.
    ENDIF.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = `View` ns = `mvc`
            )->a( n = `xmlns`     v = `sap.m`
            )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
            )->ele( `Page`
                )->tag( `Title`
                    )->a( n = `text` v = |\{/__WINDOW{ client->_bind_path( mt_rows ) }/TOTAL\} rows|
                )->tag( `Text`
                    )->a( n = `text` v = |\{/__WINDOW{ client->_bind_path( mt_rows ) }/COUNT\} of \{/__WINDOW{ client->_bind_path( mt_rows ) }/SIZE\}|
                )->tag( `Text`
                    )->a( n = `text` v = |\{/__WINDOW{ client->_bind_path( mt_rows ) }/Total\}|
                )->tag( `Text`
                    )->a( n = `text` v = |\{/__WINDOW{ client->_bind_path( mt_rows ) }/ROWS\}|
                )->tag( `Text`
                    )->a( n = `text` v = |\{/__WINDOW{ client->_bind_path( mt_plain ) }/TOTAL\}|
                )->ele( `List`
                    )->a( n = `items` v = client->_bind( mt_plain )
                    )->tag( `StandardListItem`
                        )->a( n = `title` v = `{NAME}`
                )->end(
                )->ele( `Table`
                    )->a( n = `items`   v = client->window_bind_tab( val    = mt_rows
                                                                     window = 50 )
                    )->a( n = `growing` v = `true`
                    )->ele( `columns`
                        )->ele( `Column`
                            )->tag( `Text`
                                )->a( n = `text` v = `Name`
                        )->end(
                        )->ele( `Column`
                            )->tag( `Text`
                                )->a( n = `text` v = `Typo`
                        )->end(
                    )->end(
                    )->ele( `items`
                        )->ele( `ColumnListItem`
                            )->ele( `cells`
                                )->tag( `Text`
                                    )->a( n = `text` v = `{NAME}`
                                )->tag( `Text`
                                    )->a( n = `text` v = `{NAEM}` ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
