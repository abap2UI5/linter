CLASS z2ui5_cl_app_nav_detail DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_cc,
        id    TYPE string,
        name  TYPE string,
        owner TYPE string,
      END OF ty_s_cc.

    DATA ms_cc TYPE ty_s_cc.

    METHODS constructor IMPORTING is_cc TYPE ty_s_cc OPTIONAL.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.


CLASS z2ui5_cl_app_nav_detail IMPLEMENTATION.

  METHOD constructor.
    ms_cc = is_cc.
  ENDMETHOD.


  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      DATA(view) = z2ui5_cl_xml_view=>factory( ).
      view->shell( )->page(
          title          = 'Cost Centre Detail'
          shownavbutton  = abap_true
          navbuttonpress = client->_event( 'BACK' )
          )->simple_form( editable = abap_false
              )->content( 'form'
                  )->label( 'ID'
                  )->text( client->_bind( ms_cc-id )
                  )->label( 'Name'
                  )->text( client->_bind( ms_cc-name )
                  )->label( 'Owner'
                  )->text( client->_bind( ms_cc-owner ) ).
      client->view_display( view->stringify( ) ).
      RETURN.
    ENDIF.

    CASE client->get( )-event.
      WHEN 'BACK'.
        client->nav_app_leave( ).
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
