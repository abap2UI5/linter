CLASS z2ui5_cl_app_currency_i18n DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_invoice,
        invoice  TYPE string,
        customer TYPE string,
        amount   TYPE p LENGTH 15 DECIMALS 2,
        currency TYPE waers,
      END OF ty_s_invoice.
    TYPES ty_t_invoice TYPE STANDARD TABLE OF ty_s_invoice WITH DEFAULT KEY.

    DATA mt_invoice TYPE ty_t_invoice.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_currency_i18n IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_invoice = VALUE #(
          ( invoice = '90001' customer = 'ACME'   amount = '1234.50'  currency = 'EUR' )
          ( invoice = '90002' customer = 'Globex' amount = '99999.99' currency = 'USD' )
          ( invoice = '90003' customer = 'Initech' amount = '15000'   currency = 'JPY' ) ).
      view_display( client ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Invoices' ).

    DATA(tab) = page->table( items = client->_bind( mt_invoice ) ).

    " column headers are translated through text elements of the class (text symbols)
    tab->columns(
        )->column( )->text( text-001 )->get_parent(
        )->column( )->text( text-002 )->get_parent(
        )->column( halign = 'End' )->text( text-003 ).

    tab->items( )->column_list_item( )->cells(
        )->text( '{INVOICE}'
        )->text( '{CUSTOMER}'
        )->object_number(
            number = `{parts:[{path:'AMOUNT'},{path:'CURRENCY'}], type:'sap.ui.model.type.Currency', formatOptions:{showMeasure:false}}`
            unit   = '{CURRENCY}' ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.

" Text symbols (translatable via SE63):
" 001 Invoice
" 002 Customer
" 003 Amount
