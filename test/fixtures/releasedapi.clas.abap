CLASS zcl_fixture_releasedapi DEFINITION PUBLIC.
  PUBLIC SECTION.
    " src/02 - the released package, never reported
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    " src/00/01 - a renamed vendored copy of ajson
    DATA json TYPE REF TO z2ui5_if_ajson.
ENDCLASS.

CLASS zcl_fixture_releasedapi IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    " tolerated: the RELEASED z2ui5_if_client~get( ) returns this very type
    DATA ls_get TYPE z2ui5_if_types=>ty_s_get.
    ls_get = client->get( ).

    " somebody else's class - not a framework object, never judged
    name = z2ui5_cl_demo_app_042=>get_title( ).

    json = z2ui5_cl_ajson=>create_empty( ).
    name = z2ui5_cl_util=>get_uuid( ).
    DATA(engine) = NEW z2ui5_cl_ui5_client( ).

    IF client->check_on_event( `CONFIRM` ).
      client->nav_app_call( z2ui5_cl_pop_to_confirm=>factory( ) ).
    ENDIF.

    " tolerated: the builder this linter reads
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Text`
            )->a( n = `text` v = `z2ui5_cl_util_log wrote this line once` ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
