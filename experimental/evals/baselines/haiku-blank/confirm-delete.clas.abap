CLASS z2ui5_cl_demo_app_confirm_del DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_document,
        docid TYPE c LENGTH 10,
        title TYPE string,
      END OF ty_document,
      tt_document TYPE STANDARD TABLE OF ty_document WITH EMPTY KEY.

    DATA mt_documents TYPE tt_document.
    DATA ms_selected  TYPE ty_document.
    DATA mv_confirm   TYPE abap_bool.

ENDCLASS.


CLASS z2ui5_cl_demo_app_confirm_del IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_documents = VALUE #(
        ( docid = '0000000001' title = 'Invoice 2026-01' )
        ( docid = '0000000002' title = 'Contract ACME' )
        ( docid = '0000000003' title = 'Offer 4711' ) ).
    ENDIF.

    CASE client->get( )-event.

      WHEN 'ASK_DELETE'.
        " Nothing is deleted yet: only ask the user.
        ms_selected = VALUE #( mt_documents[ docid = client->get( )-t_event_arg[ 1 ] ] OPTIONAL ).
        IF ms_selected IS NOT INITIAL.
          client->popup_message_box_display(
            text         = |Delete document { ms_selected-title }?|
            type         = 'confirm'
            ok_button    = 'Delete'
            cancel_button = 'Cancel'
            ok_event     = 'DELETE_CONFIRMED'
            cancel_event = 'DELETE_CANCELLED' ).
        ENDIF.

      WHEN 'DELETE_CONFIRMED'.
        " Only reached after the user has confirmed.
        DELETE mt_documents WHERE docid = ms_selected-docid.
        CLEAR ms_selected.
        client->message_toast_display( 'Document deleted.' ).
        client->view_model_update( ).

      WHEN 'DELETE_CANCELLED'.
        CLEAR ms_selected.
        client->message_toast_display( 'Deletion cancelled.' ).

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Documents'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->table(
      items = client->_bind_edit( mt_documents ) )->columns(
        )->column( )->text( 'Id' )->get_parent(
        )->column( )->text( 'Title' )->get_parent(
        )->column( )->text( 'Action' ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
