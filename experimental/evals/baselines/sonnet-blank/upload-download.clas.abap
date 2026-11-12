CLASS z2ui5_cl_app_upload_download DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_row,
        col1 TYPE string,
        col2 TYPE string,
        col3 TYPE string,
      END OF ty_s_row.
    TYPES ty_t_row TYPE STANDARD TABLE OF ty_s_row WITH DEFAULT KEY.

    DATA mt_row TYPE ty_t_row.
    DATA mv_file_value TYPE string.
    DATA mv_file_name TYPE string.
    DATA mv_csv TYPE string.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS parse_csv.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_upload_download IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'UPLOAD'.
        " file content arrives as data URL: data:text/csv;base64,....
        DATA(lv_data) = mv_file_value.
        SPLIT lv_data AT 'base64,' INTO DATA(lv_head) DATA(lv_b64).
        TRY.
            DATA(lv_xstr) = cl_http_utility=>decode_x_base64( lv_b64 ).
            mv_csv = cl_abap_codepage=>convert_from( lv_xstr ).
            parse_csv( ).
          CATCH cx_root INTO DATA(lx).
            client->message_box_display( text = lx->get_text( ) type = 'error' ).
        ENDTRY.
        client->view_model_update( ).

      WHEN 'DOWNLOAD'.
        IF mv_csv IS INITIAL.
          client->message_toast_display( 'Upload a file first' ).
          RETURN.
        ENDIF.
        TRY.
            DATA(lv_out) = cl_http_utility=>encode_base64(
                cl_abap_codepage=>convert_to( mv_csv ) ).
            client->follow_up_action( client->_event_client(
                val   = client->cs_event-download_b64_file
                t_arg = VALUE #( ( `data:text/csv;base64,` && lv_out ) ( mv_file_name ) ) ) ).
          CATCH cx_root INTO lx.
            client->message_box_display( text = lx->get_text( ) type = 'error' ).
        ENDTRY.

    ENDCASE.

  ENDMETHOD.


  METHOD parse_csv.

    CLEAR mt_row.
    DATA(lv_text) = replace( val = mv_csv sub = cl_abap_char_utilities=>cr_lf with = cl_abap_char_utilities=>newline occ = 0 ).
    SPLIT lv_text AT cl_abap_char_utilities=>newline INTO TABLE DATA(lt_line).

    LOOP AT lt_line INTO DATA(lv_line).
      IF lv_line IS INITIAL.
        CONTINUE.
      ENDIF.
      SPLIT lv_line AT ';' INTO DATA(lv_c1) DATA(lv_c2) DATA(lv_c3).
      IF lv_c2 IS INITIAL AND lv_c3 IS INITIAL.
        SPLIT lv_line AT ',' INTO lv_c1 lv_c2 lv_c3.
      ENDIF.
      APPEND VALUE #( col1 = lv_c1 col2 = lv_c2 col3 = lv_c3 ) TO mt_row.
    ENDLOOP.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'CSV Upload and Download' ).

    page->file_uploader(
        value          = client->_bind_edit( mv_file_value )
        path           = client->_bind_edit( mv_file_name )
        placeholder    = 'Choose a CSV file'
        fileType       = 'csv'
        upload         = client->_event( 'UPLOAD' )
        uploadonpress  = abap_false
        change         = client->_event( 'UPLOAD' ) ).

    page->button( text = 'Download' icon = 'sap-icon://download' press = client->_event( 'DOWNLOAD' ) ).

    DATA(tab) = page->table( items = client->_bind( mt_row ) ).

    tab->columns(
        )->column( )->text( 'Column 1' )->get_parent(
        )->column( )->text( 'Column 2' )->get_parent(
        )->column( )->text( 'Column 3' ).

    tab->items( )->column_list_item( )->cells(
        )->text( '{COL1}'
        )->text( '{COL2}'
        )->text( '{COL3}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
