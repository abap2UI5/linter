CLASS zcl_review_seeds DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES:
      BEGIN OF ty_row,
        title TYPE string,
        descr TYPE string,
        state TYPE string,
      END OF ty_row.
    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    DATA mv_title TYPE string.
    DATA mv_sub TYPE string.
ENDCLASS.
CLASS zcl_review_seeds IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      mt_rows = VALUE #(
        ( title = `a` descr = |Price (net)| state = `Success` )
        ( title = `b` descr = |x)|          state = `Warning` )
        ( title = `c` descr = 'it''s (ok)'  state = `Error` )
        ( title = `d` descr = |{ mv_title } (runtime)| state = `None` ) ).
      mv_title = |Header|.
      mv_sub = |Sub|.
      IF mv_title = `open`.
        mv_title = `closed`.
      ENDIF.
      client->view_display( z2ui5_cl_ui5_view_builder=>factory(
        )->ele( `View` ns = `mvc`
          )->a( n = `xmlns` v = `sap.m`
          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
          )->ele( `Page` )->a( n = `title` v = |{ mv_title }|
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_sub )
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_rows )
              )->tag( `ObjectListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `number` v = `{DESCR}` )->a( n = `numberState` v = `{STATE}`
          )->end( )->end( )->end( )->stringify( ) ).
    ELSEIF client->check_on_navigated( ).
      client->view_display( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
