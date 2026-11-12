CLASS z2ui5_cl_app_form_validation DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_name TYPE string.
    DATA mv_email TYPE string.
    DATA mv_amount TYPE string.

    DATA mv_name_state TYPE string.
    DATA mv_name_text TYPE string.
    DATA mv_email_state TYPE string.
    DATA mv_email_text TYPE string.
    DATA mv_amount_state TYPE string.
    DATA mv_amount_text TYPE string.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
    METHODS validate RETURNING VALUE(rv_ok) TYPE abap_bool.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_form_validation IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      view_display( client ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.
      WHEN 'SAVE'.
        IF validate( ) = abap_true.
          client->message_toast_display( 'Saved successfully' ).
        ELSE.
          client->message_box_display( text = 'Please correct the marked fields' type = 'error' ).
        ENDIF.
        client->view_model_update( ).
    ENDCASE.

  ENDMETHOD.


  METHOD validate.

    CLEAR: mv_name_state, mv_name_text, mv_email_state, mv_email_text, mv_amount_state, mv_amount_text.
    rv_ok = abap_true.

    IF mv_name IS INITIAL.
      mv_name_state = 'Error'.
      mv_name_text = 'Name is required'.
      rv_ok = abap_false.
    ENDIF.

    IF mv_email IS INITIAL.
      mv_email_state = 'Error'.
      mv_email_text = 'Email is required'.
      rv_ok = abap_false.
    ELSEIF NOT matches( val = mv_email regex = `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` ).
      mv_email_state = 'Error'.
      mv_email_text = 'Email format is invalid'.
      rv_ok = abap_false.
    ENDIF.

    IF mv_amount IS INITIAL.
      mv_amount_state = 'Error'.
      mv_amount_text = 'Amount is required'.
      rv_ok = abap_false.
    ELSEIF NOT matches( val = mv_amount regex = `\d+(\.\d{1,2})?` ).
      mv_amount_state = 'Error'.
      mv_amount_text = 'Amount must be a positive number'.
      rv_ok = abap_false.
    ELSEIF CONV decfloat34( mv_amount ) <= 0.
      mv_amount_state = 'Error'.
      mv_amount_text = 'Amount must be greater than zero'.
      rv_ok = abap_false.
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).

    view->shell( )->page( title = 'Form Validation'
        )->simple_form( editable = abap_true
            )->content( 'form'
                )->label( text = 'Name' required = abap_true
                )->input(
                    value         = client->_bind_edit( mv_name )
                    valuestate    = client->_bind( mv_name_state )
                    valuestatetext = client->_bind( mv_name_text )
                )->label( text = 'Email' required = abap_true
                )->input(
                    value         = client->_bind_edit( mv_email )
                    type          = 'Email'
                    valuestate    = client->_bind( mv_email_state )
                    valuestatetext = client->_bind( mv_email_text )
                )->label( text = 'Amount' required = abap_true
                )->input(
                    value         = client->_bind_edit( mv_amount )
                    valuestate    = client->_bind( mv_amount_state )
                    valuestatetext = client->_bind( mv_amount_text )
                )->button(
                    text  = 'Save'
                    type  = 'Emphasized'
                    press = client->_event( 'SAVE' ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
