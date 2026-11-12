CLASS z2ui5_cl_app_chart DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_revenue,
        month   TYPE string,
        revenue TYPE i,
      END OF ty_s_revenue.
    TYPES ty_t_revenue TYPE STANDARD TABLE OF ty_s_revenue WITH DEFAULT KEY.

    DATA mt_revenue TYPE ty_t_revenue.

  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_chart IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_revenue = VALUE #(
          ( month = 'Jan' revenue = 120 )
          ( month = 'Feb' revenue = 135 )
          ( month = 'Mar' revenue = 160 )
          ( month = 'Apr' revenue = 145 )
          ( month = 'May' revenue = 180 )
          ( month = 'Jun' revenue = 200 )
          ( month = 'Jul' revenue = 190 )
          ( month = 'Aug' revenue = 170 )
          ( month = 'Sep' revenue = 210 )
          ( month = 'Oct' revenue = 230 )
          ( month = 'Nov' revenue = 250 )
          ( month = 'Dec' revenue = 300 ) ).
      view_display( client ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = 'Monthly Revenue' ).

    " sap.suite.ui.microchart bar chart, one bar per month
    DATA(chart) = page->vbox( class = 'sapUiSmallMargin'
        )->text( 'Revenue per month (in thousand EUR)'
        )->get_parent( ).

    DATA(bars) = page->vbox( class = 'sapUiSmallMargin'
        )->micro_chart_bar( )->get_parent( ).

    page->_generic(
        name   = 'ColumnMicroChart'
        ns     = 'mchart'
        t_prop = VALUE #(
            ( n = 'height' v = '20rem' )
            ( n = 'width'  v = '40rem' )
            ( n = 'columns' v = `` ) )
        )->_generic(
            name = 'columns'
            ns   = 'mchart'
        )->_generic(
            name   = 'ColumnMicroChartData'
            ns     = 'mchart'
            t_prop = VALUE #(
                ( n = 'label' v = '{MONTH}' )
                ( n = 'value' v = '{REVENUE}' ) ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
