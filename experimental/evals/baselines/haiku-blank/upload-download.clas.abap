CLASS z2ui5_cl_demo_app_csv_file DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_line,
        col1 TYPE string,
        col2 TYPE string,
        col3 TYPE string,
      END OF ty_line,
      tt_line TYPE STANDARD TABLE OF ty_line WITH EMPTY KEY.

    DATA mt_rows     TYPE tt_line.
    DATA mv_csv      TYPE xstring.
    DATA mv_filename TYPE string VALUE 'export.csv'.

  PRIVATE SECTION.
    METHODS parse_csv
      IMPORTING iv_csv  TYPE string
      EXPORTING et_rows TYPE tt_line.

ENDCLASS.


CLASS z2ui5_cl_demo_app_csv_file IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      " Start with an empty table.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'UPLOAD'.
        " The uploaded file arrives as base64 in the event args; decode it to text.
        DATA(lv_b64) = client->get( )-t_event_arg[ 1 ].
        DATA(lv_text) = z2ui5_cl_util=>base64_decode( lv_b64 ).
        parse_csv(
          EXPORTING iv_csv  = lv_text
          IMPORTING et_rows = mt_rows ).
        client->view_model_update( ).

      WHEN 'DOWNLOAD'.
        " Rebuild the CSV from the table and hand it to the browser.
        DATA lv_out TYPE string.
        LOOP AT mt_rows INTO DATA(ls_row).
          lv_out = lv_out && |{ ls_row-col1 },{ ls_row-col2 },{ ls_row-col3 }| && cl_abap_char_utilities=>cr_lf.
        ENDLOOP.
        mv_csv = z2ui5_cl_util=>string_to_xstring( lv_out ).
        client->nav_app_leave( ).
        client->view_display( z2ui5_cl_util=>xstring_to_base64_url_file(
          iv_data     = mv_csv
          iv_filename = mv_filename ) ).

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'CSV Upload and Download'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->file_uploader(
      change = client->_event( 'UPLOAD' )
      accept = '.csv' ).

    lo_view->table(
      items = client->_bind_edit( mt_rows ) )->columns(
        )->column( )->text( 'Column 1'
        )->get_parent(
        )->column( )->text( 'Column 2'
        )->get_parent(
        )->column( )->text( 'Column 3' ).

    lo_view->button(
      text  = 'Download CSV'
      press = client->_event( 'DOWNLOAD' ) ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD parse_csv.

    CLEAR et_rows.
    SPLIT iv_csv AT cl_abap_char_utilities=>cr_lf INTO TABLE DATA(lt_lines).
    LOOP AT lt_lines INTO DATA(lv_line).
      CHECK lv_line IS NOT INITIAL.
      DATA(lt_cols) = VALUE string_table( ).
      SPLIT lv_line AT ',' INTO TABLE lt_cols.
      APPEND VALUE #(
        col1 = VALUE #( lt_cols[ 1 ] OPTIONAL )
        col2 = VALUE #( lt_cols[ 2 ] OPTIONAL )
        col3 = VALUE #( lt_cols[ 3 ] OPTIONAL ) ) TO et_rows.
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.
