CLASS z2ui5_cl_app_confirm_delete DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_doc,
        id    TYPE string,
        title TYPE string,
        date  TYPE string,
      END OF ty_s_doc.
    TYPES ty_t_doc TYPE STANDARD TABLE OF ty_s_doc WITH DEFAULT KEY.

    DATA mt_doc TYPE ty_t_doc.

  PROTECTED SECTION.
    DATA mv_delete_id TYPE string.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS popup_confirm IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_confirm_delete IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_doc = VALUE #(
          ( id = '1' title = 'Invoice 4711'  date = '2026-01-10' )
          ( id = '2' title = 'Contract ABC'  date = '2026-02-03' )
          ( id = '3' title = 'Offer 2026-17' date = '2026-03-21' ) ).
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'DELETE'.
        mv_delete_id = client->get_event_arg( 1 ).
        popup_confirm( client ).

      WHEN 'CONFIRM_YES'.
        DELETE mt_doc WHERE id = mv_delete_id.
        CLEAR mv_delete_id.
        client->popup_destroy( ).
        client->message_toast_display( 'Document deleted' ).
        client->view_model_update( ).

      WHEN 'CONFIRM_NO'.
        CLEAR mv_delete_id.
        client->popup_destroy( ).

    ENDCASE.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Documents' ).

    DATA(tab) = page->table( items = client->_bind( mt_doc ) ).

    tab->columns(
        )->column( )->text( 'ID' )->get_parent(
        )->column( )->text( 'Title' )->get_parent(
        )->column( )->text( 'Date' )->get_parent(
        )->column( )->text( '' ).

    tab->items( )->column_list_item( )->cells(
        )->text( '{ID}'
        )->text( '{TITLE}'
        )->text( '{DATE}'
        )->button(
            icon  = 'sap-icon://delete'
            type  = 'Reject'
            press = client->_event( val = 'DELETE' t_arg = VALUE #( ( `${ID}` ) ) ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.


  METHOD popup_confirm.

    DATA(lv_title) = VALUE #( mt_doc[ id = mv_delete_id ]-title OPTIONAL ).

    DATA(popup) = z2ui5_cl_xml_view=>factory_popup( ).

    popup->dialog( title = 'Confirm deletion' type = 'Message' state = 'Warning'
        )->content(
            )->text( `Do you really want to delete "` && lv_title && `"?`
        )->get_parent(
        )->buttons(
            )->button( text = 'Delete' type = 'Reject' press = client->_event( 'CONFIRM_YES' )
            )->button( text = 'Cancel' press = client->_event( 'CONFIRM_NO' ) ).

    client->popup_display( popup->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
