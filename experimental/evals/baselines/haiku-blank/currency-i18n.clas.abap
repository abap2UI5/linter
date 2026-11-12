CLASS z2ui5_cl_demo_app_currency DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_invoice,
        invoice_id TYPE c LENGTH 10,
        customer   TYPE string,
        amount     TYPE p LENGTH 15 DECIMALS 2,
        currency   TYPE waers,
        amount_txt TYPE string,
      END OF ty_invoice,
      tt_invoice TYPE STANDARD TABLE OF ty_invoice WITH EMPTY KEY.

    DATA mt_invoices TYPE tt_invoice.

  PRIVATE SECTION.
    METHODS load_invoices.

ENDCLASS.


CLASS z2ui5_cl_demo_app_currency IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      load_invoices( ).
    ENDIF.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Invoices'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    " Column headers are taken from the i18n resource bundle (translatable).
    lo_view->table(
      items = client->_bind( mt_invoices ) )->columns(
        )->column( )->text( '{i18n>colInvoiceId}'
        )->get_parent(
        )->column( )->text( '{i18n>colCustomer}'
        )->get_parent(
        )->column( )->text( '{i18n>colAmount}'
        )->get_parent(
        )->column( )->text( '{i18n>colCurrency}' ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD load_invoices.

    SELECT vbeln AS invoice_id, kunnr AS customer, netwr AS amount, waerk AS currency
      FROM vbrk
      INTO CORRESPONDING FIELDS OF TABLE @mt_invoices
      UP TO 200 ROWS.

    " Format the amounts as currency text for display, e.g. '1,234.50 EUR'.
    LOOP AT mt_invoices ASSIGNING FIELD-SYMBOL(<ls_invoice>).
      <ls_invoice>-amount_txt = |{ <ls_invoice>-amount CURRENCY = <ls_invoice>-currency } { <ls_invoice>-currency }|.
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.
