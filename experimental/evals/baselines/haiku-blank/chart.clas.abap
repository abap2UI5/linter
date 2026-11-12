CLASS z2ui5_cl_demo_app_chart DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_month,
        month   TYPE string,
        revenue TYPE p LENGTH 15 DECIMALS 2,
      END OF ty_month,
      tt_month TYPE STANDARD TABLE OF ty_month WITH EMPTY KEY.

    DATA mt_revenue TYPE tt_month.

  PRIVATE SECTION.
    METHODS load_revenue.

ENDCLASS.


CLASS z2ui5_cl_demo_app_chart IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      load_revenue( ).
    ENDIF.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Monthly Revenue'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    " Bar chart bound to the monthly revenue data.
    lo_view->viz_frame(
      vizType = 'info/bar'
      height  = '400px'
      )->dataset(
        )->feeds( uid = 'valueAxis' type = 'Measure' values = 'Revenue'
        )->feeds( uid = 'categoryAxis' type = 'Dimension' values = 'Month'
        )->data( client->_bind( mt_revenue ) ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

  METHOD load_revenue.

    " Sample data; in a real app this comes from the database.
    mt_revenue = VALUE #(
      ( month = 'Jan' revenue = '12000.00' )
      ( month = 'Feb' revenue = '15500.00' )
      ( month = 'Mar' revenue = '14200.00' )
      ( month = 'Apr' revenue = '17800.00' ) ).

  ENDMETHOD.

ENDCLASS.
