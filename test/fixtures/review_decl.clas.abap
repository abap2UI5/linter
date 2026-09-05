CLASS zcl_review_decl DEFINITION PUBLIC CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES:
      BEGIN OF ty_row,
        title TYPE string,
      END OF ty_row,
      ty_t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY,
      ty_t_sorted TYPE SORTED TABLE OF ty_row WITH UNIQUE KEY title.
    TYPES ty_t_plain TYPE TABLE OF ty_row.
    TYPES ty_t_alias TYPE ty_t_rows.
    DATA mt_chained TYPE ty_t_rows.
    DATA mt_sorted TYPE ty_t_sorted READ-ONLY.
    DATA mt_plain TYPE ty_t_plain.
    DATA mt_alias TYPE ty_t_alias.
    DATA mt_inline TYPE TABLE OF ty_row.
    DATA: mt_colon TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY,
          mv_colon TYPE string,
          BEGIN OF ms_colon,
            text TYPE string,
          END OF ms_colon,
          mv_after TYPE string.
    DATA mv_readonly TYPE i VALUE 5 READ-ONLY.
    CLASS-DATA mv_class TYPE string.
    DATA mv_like LIKE mv_colon.
ENDCLASS.
CLASS zcl_review_decl IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      mt_chained = VALUE #( ( title = `a` ) ).
      client->view_display( z2ui5_cl_ui5_view_builder=>factory(
        )->ele( `View` ns = `mvc`
          )->a( n = `xmlns` v = `sap.m`
          )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
          )->ele( `Page`
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_chained )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE1}`
            )->end(
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_sorted )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE2}`
            )->end(
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_plain )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE3}`
            )->end(
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_alias )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE4}`
            )->end(
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_inline )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE5}`
            )->end(
            )->ele( `List` )->a( n = `items` v = client->_bind( mt_colon )
              )->tag( `StandardListItem` )->a( n = `title` v = `{TITLE}` )->a( n = `description` v = `{NOPE6}`
            )->end(
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_colon )
            )->tag( `Text` )->a( n = `text` v = client->_bind( ms_colon-text )
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_after )
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_readonly )
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_class )
            )->tag( `Text` )->a( n = `text` v = client->_bind( mv_like )
          )->end( )->end( )->stringify( ) ).
    ELSEIF client->check_on_navigated( ).
      client->view_display( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
