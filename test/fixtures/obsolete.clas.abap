CLASS zcl_fixture_obsolete DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
    DATA mapper TYPE REF TO z2ui5_if_ajson_mapping.
ENDCLASS.

CLASS zcl_fixture_obsolete IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->tag( `Input`
            )->a( n = `value` v = client->_bind_edit( name )
          )->tag( `Input`
            )->a( n = `value` v = client->_bind_edit( val = name custom_mapper_back = mapper )
          )->tag( `Input`
            " reported (obsolete-bind-argument) - `view` is inactive, not
            " passed on internally; the fix deletes the argument
            )->a( n = `value` v = client->_bind( val = name view = client->cs_view-popup )
          )->tag( `Input`
            " reported (obsolete-bind-argument) - custom_mapper is still
            " evaluated, so it carries no fix
            )->a( n = `value` v = client->_bind( val = name custom_mapper = mapper )
          )->tag( `Button`
            )->a( n = `text`  v = `Close`
            )->a( n = `press` v = client->_event_client( val = client->cs_event-popup_close ) ) ).

    client->view_display( view->stringify( ) ).

    " every one of these is an EMPTY method - the model is pushed automatically
    client->view_model_update( ).
    client->nest_view_model_update( ).
    client->nest2_view_model_update( ).
    client->popup_model_update( ).
    client->popover_model_update( ).

  ENDMETHOD.
ENDCLASS.
