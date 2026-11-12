CLASS z2ui5_cl_demo_app_form_valid DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_name   TYPE string.
    DATA mv_email  TYPE string.
    DATA mv_amount TYPE string.

  PRIVATE SECTION.
    METHODS validate
      EXPORTING et_messages TYPE string_table
                ev_valid    TYPE abap_bool.

ENDCLASS.


CLASS z2ui5_cl_demo_app_form_valid IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      " Initial view, nothing to validate yet.
    ENDIF.

    CASE client->get( )-event.

      WHEN 'SAVE'.
        DATA lt_messages TYPE string_table.
        DATA lv_valid    TYPE abap_bool.

        validate(
          IMPORTING et_messages = lt_messages
                    ev_valid    = lv_valid ).

        IF lv_valid = abap_true.
          " Persist the data here.
          client->message_box_display( 'Saved.' ).
        ELSE.
          LOOP AT lt_messages INTO DATA(lv_message).
            client->message_toast_display( lv_message ).
          ENDLOOP.
        ENDIF.

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Form'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->simple_form( title = 'Data' )->content( 'form'
      )->label( 'Name'
      )->input( value = client->_bind_edit( mv_name ) placeholder = 'Required'
      )->label( 'Email'
      )->input( value = client->_bind_edit( mv_email ) placeholder = 'name@example.com'
      )->label( 'Amount'
      )->input( value = client->_bind_edit( mv_amount ) placeholder = 'e.g. 100.00'
      ).

    lo_view->footer( )->overflow_toolbar(
      )->toolbar_spacer( )->button(
        text  = 'Save'
        type  = 'Emphasized'
        press = client->_event( 'SAVE' ) ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD validate.

    CLEAR: et_messages, ev_valid.
    ev_valid = abap_true.

    IF mv_name IS INITIAL.
      APPEND |Name is required.| TO et_messages.
    ENDIF.

    IF mv_email IS INITIAL.
      APPEND |Email is required.| TO et_messages.
    ELSEIF NOT mv_email CP '*@*.*'.
      APPEND |Email is not valid.| TO et_messages.
    ENDIF.

    IF mv_amount IS INITIAL.
      APPEND |Amount is required.| TO et_messages.
    ELSE.
      DATA lv_amount TYPE p LENGTH 16 DECIMALS 2.
      TRY.
          lv_amount = mv_amount.
          IF lv_amount <= 0.
            APPEND |Amount must be greater than zero.| TO et_messages.
          ENDIF.
        CATCH cx_sy_conversion_no_number.
          APPEND |Amount must be a number.| TO et_messages.
      ENDTRY.
    ENDIF.

    IF et_messages IS NOT INITIAL.
      ev_valid = abap_false.
    ENDIF.

  ENDMETHOD.

ENDCLASS.
