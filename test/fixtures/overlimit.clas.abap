CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DO 400 TIMES.
        APPEND VALUE #( name = |row { sy-index }| ) TO t_rows.
      ENDDO.
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc`
          )->a( n = `xmlns` v = `sap.m`
          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
          )->ele( `Page` ).
      page->ele( `List`
          )->a( n = `items` v = client->_bind( t_rows )
          )->ele( `items`
              )->tag( `StandardListItem`
                  )->a( n = `title` v = `{NAME}` ).
      client->view_display( page->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
