CLASS z2ui5_cl_demo_app_cc_list DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_cost_center,
        kostl TYPE csks-kostl,
        ktext TYPE cskt-ktext,
      END OF ty_cost_center,
      tt_cost_center TYPE STANDARD TABLE OF ty_cost_center WITH EMPTY KEY.

    DATA mt_cost_centers TYPE tt_cost_center.
    DATA ms_selected     TYPE ty_cost_center.

ENDCLASS.


CLASS z2ui5_cl_demo_app_cc_list IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).

      SELECT k~kostl, t~ktext
        FROM csks AS k
        INNER JOIN cskt AS t ON t~kostl = k~kostl
                            AND t~spras = @sy-langu
        INTO TABLE @mt_cost_centers
        UP TO 500 ROWS.

    ENDIF.

    CASE client->get( )-event.

      WHEN 'SELECT_ROW'.
        " Keep the selection in the list app and hand the id to the detail app.
        client->get( )-s_actual.
        DATA(lv_kostl) = client->get( )-t_event_arg[ 1 ].
        DATA(lo_detail) = NEW z2ui5_cl_demo_app_cc_detail( ).
        lo_detail->mv_kostl = lv_kostl.
        client->nav_app_call( lo_detail ).

    ENDCASE.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = 'Cost Centres'
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->table(
      items = client->_bind_edit( mt_cost_centers )
      mode  = 'SingleSelectMaster' )->columns(
        )->column( )->text( 'Cost Centre' )->get_parent(
        )->column( )->text( 'Description' ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.


CLASS z2ui5_cl_demo_app_cc_detail DEFINITION PUBLIC CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    DATA mv_kostl TYPE csks-kostl.
    DATA mv_ktext TYPE cskt-ktext.

ENDCLASS.


CLASS z2ui5_cl_demo_app_cc_detail IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).

      SELECT SINGLE t~ktext
        FROM cskt AS t
        WHERE t~kostl = @mv_kostl
          AND t~spras = @sy-langu
        INTO @mv_ktext.

    ENDIF.

    DATA(lo_view) = z2ui5_cl_ui5_view_builder=>page(
      title          = |Cost Centre { mv_kostl }|
      navbuttonpress = client->_event_nav_app_leave( ) ).

    lo_view->simple_form( title = 'Details' )->content( 'form'
      )->label( 'Cost Centre'
      )->text( mv_kostl
      )->label( 'Description'
      )->text( mv_ktext ).

    client->view_display( lo_view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
