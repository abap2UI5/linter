CLASS zcl_fixture_obsolete DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA mapper TYPE REF TO z2ui5_if_ajson_mapping.
ENDCLASS.

CLASS zcl_fixture_obsolete IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ai_xml=>factory( ).
    view->open( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->open( `Page`
          )->leaf( `Input`
            )->a( n = `value` v = client->_bind_edit( name )
          )->leaf( `Input`
            )->a( n = `value` v = client->_bind_edit( val = name custom_mapper_back = mapper ) ).

    client->view_display( view->stringify( ) ).

    " every one of these is an EMPTY method - the model is pushed automatically
    client->view_model_update( ).
    client->nest_view_model_update( ).
    client->nest2_view_model_update( ).
    client->popup_model_update( ).
    client->popover_model_update( ).

    client->_event_frontend( val   = client->cs_event-set_title
                             t_arg = VALUE #( ( `Title` ) ) ).

  ENDMETHOD.
ENDCLASS.
