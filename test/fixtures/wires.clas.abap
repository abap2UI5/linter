CLASS zcl_fixture_wires DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA title TYPE string.
    DATA section TYPE string.
ENDCLASS.

CLASS zcl_fixture_wires IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    CASE client->get( )-event.

      WHEN `KILL`.
        " reported - `destroy` is denied by exact name
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `destroy` ) ) ).

      WHEN `REPARENT`.
        " reported - `addAggregation` is a generic reflection mutator
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `addAggregation` ) ( `content` ) ) ).

      WHEN `REBIND`.
        " reported - the `bind` prefix is hostile in every spelling
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `bindProperty` ) ( `text` ) ) ).

      WHEN `CLEAR`.
        " NOT reported - a NAMED per-aggregation mutator, which the runtime
        " allows; only the generic removeAllAggregation is denied
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `removeAllContent` ) ) ).

      WHEN `ODATA`.
        client->_event_client( val   = client->cs_event-set_odata_model
                               t_arg = VALUE #( ( `/sap/opu/odata/sap/SRV` ) ( `srv` ) ) ).

    ENDCASE.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`      v = `sap.m`
        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
        )->a( n = `xmlns:uxap` v = `sap.uxap`

        )->ele( `Panel`
          )->a( n = `id` v = `panel`

          " reported - i18n> is no model of this app
          )->tag( `Text` )->a( n = `text` v = `{i18n>welcome}`
          " reported - the sample's own named model, left behind by the port
          )->tag( `Text` )->a( n = `text` v = `{ui>/rowMode}`
          " NOT reported - device> and message> are framework models, and srv>
          " is registered by this class's SET_ODATA_MODEL wire above
          )->tag( `Text` )->a( n = `text` v = `{device>/system/phone}`
          )->tag( `Text` )->a( n = `text` v = `{message>/length}`
          )->tag( `Text` )->a( n = `text` v = `{srv>/Products(1)/Name}`
          " NOT reported - the default model, which is what a bind produces
          )->tag( `Text` )->a( n = `text` v = client->_bind( title )

        )->end(

        )->tag( n = `ObjectPageLayout` ns = `uxap`
            )->a( n = `id` v = `objectPage`
            " reported - selectedSection is an ASSOCIATION, never a binding
            )->a( n = `selectedSection` v = client->_bind( section ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
