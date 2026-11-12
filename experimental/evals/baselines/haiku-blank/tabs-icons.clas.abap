CLASS z2ui5_cl_demo_app_tabs DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_selected_tab TYPE string VALUE 'overview'.
    DATA mv_overview     TYPE string.
    DATA mv_notes        TYPE string.
    DATA mt_items        TYPE string_table.

ENDCLASS.


CLASS z2ui5_cl_demo_app_tabs IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mv_overview = 'Overview of the current order.'.
      mt_items    = VALUE #( ( |Item 1| ) ( |Item 2| ) ).
    ENDIF.

    CASE client->get( )-event.
      WHEN 'TAB_SELECT'.
        mv_selected_tab = client->get( )-t_event_arg[ 1 ].
    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Tabs'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    DATA(lo_tabs) = lo_view->icon_tab_bar(
      selectedkey = client->_bind_edit( mv_selected_tab )
      select      = client->_event( 'TAB_SELECT' ) ).

    " Overview tab
    lo_tabs->items(
      )->icon_tab_filter(
        key  = 'overview'
        text = 'Overview'
        icon = 'sap-icon://hint' )->content(
          )->text( mv_overview ).

    " Items tab
    lo_tabs->items(
      )->icon_tab_filter(
        key  = 'items'
        text = 'Items'
        icon = 'sap-icon://list' )->content(
          )->list( items = client->_bind_edit( mt_items ) ).

    " Notes tab
    lo_tabs->items(
      )->icon_tab_filter(
        key  = 'notes'
        text = 'Notes'
        icon = 'sap-icon://notes' )->content(
          )->text_area( value = client->_bind_edit( mv_notes ) ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
