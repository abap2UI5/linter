CLASS zcl_helperns DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_text TYPE string.
  PROTECTED SECTION.
    METHODS create_layout_form
      IMPORTING
        view          TYPE REF TO z2ui5_cl_ui5_view_builder
      RETURNING
        VALUE(result) TYPE REF TO z2ui5_cl_ui5_view_builder.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_helperns IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ) OR client->check_on_navigated( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      DATA(page) = view->ele( n = `View` ns = `mvc`
          )->a( n = `xmlns`      v = `sap.m`
          )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
          )->a( n = `xmlns:form` v = `sap.ui.layout.form`
          )->ele( `Page` ).
      DATA(form) = create_layout_form( page ).
      form->tag( `Input`
          )->a( n = `value` v = client->_bind( mv_text ) ).
      client->view_display( view->stringify( ) ).
    ENDIF.

  ENDMETHOD.

  METHOD create_layout_form.

    result = view->ele( n = `SimpleForm` ns = `form`
        )->ele( n = `content` ns = `form` ).

  ENDMETHOD.

ENDCLASS.
