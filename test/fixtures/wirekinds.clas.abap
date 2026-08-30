CLASS zcl_fixture_wirekinds DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA title TYPE string.
ENDCLASS.

CLASS zcl_fixture_wirekinds IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    CASE client->get( )-event.

      WHEN `THEME`.
        " reported (frontend-action-too-new) - sap/ui/core/Theming is @since
        " 1.118, so on the 1.71 floor the lazy require returns undefined
        client->follow_up_action( val   = client->cs_event-control_global
                                  t_arg = VALUE #( ( `THEMING` ) ( `setTheme` ) ( `sap_horizon` ) ) ).

      WHEN `SAY`.
        " reported twice, and they are two different defects: announce is
        " @since 1.78 (frontend-action-too-new), and `Loud` is no
        " InvisibleMessageMode (invalid-frontend-action)
        client->follow_up_action( val   = client->cs_event-control_global
                                  t_arg = VALUE #( ( `INVISIBLE_MESSAGE` ) ( `announce` ) ( `Saved` ) ( `Loud` ) ) ).

      WHEN `TOAST`.
        " NOT reported - MessageToast carries no release floor at all
        client->follow_up_action( val   = client->cs_event-control_global
                                  t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `show` ) ( `Saved` ) ) ).

      WHEN `BACK`.
        " reported (control-call-arg-count) - `back` declares no arguments, so
        " castArgs slices the page away and it never reaches the container
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `nav` ) ( `back` ) ( `page2` ) ) ).

      WHEN `BADGE`.
        " reported (control-call-arg-kind, int) - Number( `nine` ) is NaN and
        " every comparison against it is false
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `btn` ) ( `setBadgeMinValue` ) ( `nine` ) ) ).

      WHEN `EXPAND`.
        " reported (control-call-arg-kind, bool) - only `X` and `true` are
        " true, so this arrives as FALSE and collapses the panel
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `setExpanded` ) ( `abap_true` ) ) ).

      WHEN `EXPAND_OK`.
        " NOT reported - `X` is the ABAP boolean token the frontend accepts
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `setExpanded` ) ( `X` ) ) ).

      WHEN `PAGE_BAD_SHAPE`.
        " reported (invalid-aggregation-item) - the index segment is not
        " numeric, so this never enters the aggregation path and is looked up
        " as one plain id
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `carousel` ) ( `setActivePage` ) ( `carousel/pages/first` ) ) ).

      WHEN `PAGE_BAD_AGG`.
        " reported (invalid-aggregation-item) - sap.m.Carousel has no `items`
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `carousel` ) ( `setActivePage` ) ( `carousel/items/0` ) ) ).

      WHEN `PAGE_OK`.
        " NOT reported - the shape matches and `pages` is a real aggregation
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `carousel` ) ( `setActivePage` ) ( `carousel/pages/2` ) ) ).

      WHEN `LINKS`.
        " reported (invalid-frontend-action) - setAsyncURLHandler names one of
        " three built-in policies, and MAYBE is not one of them
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `mp` ) ( `setAsyncURLHandler` ) ( `MAYBE` ) ) ).

      WHEN `SCROLL`.
        " reported (invalid-frontend-action) - `middle` is no scroll block
        client->follow_up_action( val   = client->cs_event-scroll_into_view
                                  t_arg = VALUE #( ( `btn` ) ( `smooth` ) ( `middle` ) ) ).

      WHEN `KEYS`.
        " reported (invalid-frontend-action) - `numerical` is no inputmode, so
        " the browser ignores it and the soft keyboard stays text
        client->follow_up_action( val   = client->cs_event-keyboard_set_mode
                                  t_arg = VALUE #( ( `btn` ) ( `numerical` ) ) ).

      WHEN `ROUTE`.
        " reported (invalid-frontend-action) - cs_nav_mode is DEFAULT, FRESH
        " or KEEP; anything else routes as if routing were off
        client->follow_up_action( val   = client->cs_event-set_nav_routing
                                  t_arg = VALUE #( ( `ALWAYS` ) ) ).

      WHEN `ROUTE_OK`.
        " NOT reported - a released cs_nav_mode value
        client->follow_up_action( val   = client->cs_event-set_nav_routing
                                  t_arg = VALUE #( ( `KEEP` ) ) ).

      WHEN `PUSH`.
        " NOT reported - SET_PUSH_STATE is consumed by the SERVER and queues no
        " frontend action, so it is absent from the dispatch table by design
        client->follow_up_action( val   = `SET_PUSH_STATE`
                                  t_arg = VALUE #( ( `X` ) ) ).

      WHEN `CALL_TEL`.
        " reported (invalid-action-payload) - the second t_arg is an OBJECT the
        " frontend picks named keys out of; a plain string leaves params.TEL
        " undefined and navigates to a bare tel:
        client->follow_up_action( val   = client->cs_event-urlhelper
                                  t_arg = VALUE #( ( `TRIGGER_TEL` ) ( `+49 123` ) ) ).

      WHEN `SEND_SMS`.
        " reported (invalid-action-payload) - TRIGGER_SMS reads params.TEL,
        " the same key as TRIGGER_TEL, and not the SMS anybody would guess
        client->follow_up_action( val   = client->cs_event-urlhelper
                                  t_arg = VALUE #( ( `TRIGGER_SMS` ) ( |\{ "SMS": "+49 123", "TEXT": "hi" \}| ) ) ).

      WHEN `CALL_OK`.
        " NOT reported - an object carrying the key the action reads
        client->follow_up_action( val   = client->cs_event-urlhelper
                                  t_arg = VALUE #( ( `TRIGGER_TEL` ) ( |\{ "TEL": "+49 123" \}| ) ) ).

    ENDCASE.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`
          )->ele( `Panel`
            )->a( n = `id` v = `panel`
            )->tag( `Button` )->a( n = `id` v = `btn` )->a( n = `text` v = client->_bind( title )
          )->end(
          )->ele( `Carousel`
            )->a( n = `id` v = `carousel`
          )->end(
          )->ele( `NavContainer`
            )->a( n = `id` v = `nav`
          )->end(
          )->ele( `MessagePopover`
            )->a( n = `id` v = `mp`
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
