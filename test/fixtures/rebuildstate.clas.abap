CLASS zcl_fixture_rebuildstate DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA section     TYPE string.
    DATA min_value   TYPE i.
    DATA active_page TYPE string.
    DATA next_step   TYPE string.
    DATA expanded    TYPE abap_bool.
  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.
    METHODS view_display.
    METHODS on_event.
    METHODS page_apply.
ENDCLASS.

CLASS zcl_fixture_rebuildstate IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    me->client = client.
    IF client->check_on_init( ).
      view_display( ).
    ELSEIF client->check_on_navigated( ).
      view_display( ).
    ELSEIF client->check_on_event( ).
      on_event( ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`      v = `sap.m`
        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
        )->a( n = `xmlns:uxap` v = `sap.uxap`

        )->ele( `Page`
            )->ele( `content`

                )->ele( `Panel`
                    )->a( n = `id`       v = `panel`
                    )->a( n = `expanded` v = client->_bind( expanded )
                    )->tag( `Button`
                        )->a( n = `id` v = `badged`
                )->end(

                )->ele( `Carousel`
                    )->a( n = `id` v = `carousel`
                )->end(

                )->ele( `Wizard`
                    )->a( n = `id` v = `wizard`
                    )->ele( `steps`
                        )->tag( `WizardStep`
                            )->a( n = `id`    v = `step1`
                            )->a( n = `title` v = `One`
                    )->end(
                )->end(

                )->tag( n = `ObjectPageLayout` ns = `uxap`
                    )->a( n = `id` v = `objectPage` ).

    client->view_display( view->stringify( ) ).

    " NOT reported - the same id+setter is re-issued from the display path, so
    " the rebuilt WizardStep gets its branch back
    client->follow_up_action( val   = client->cs_event-control_by_id
                              t_arg = VALUE #( ( `step1` ) ( `setNextStep` ) ( next_step ) ) ).

    page_apply( ).

  ENDMETHOD.


  METHOD page_apply.

    " NOT reported - view_display( ) ends on this method, so the wire runs on
    " every rebuild although the method itself displays nothing
    client->follow_up_action( val   = client->cs_event-control_by_id
                              t_arg = VALUE #( ( `carousel` ) ( `setActivePage` ) ( active_page ) ) ).

  ENDMETHOD.


  METHOD on_event.

    CASE client->get_event( ).

      WHEN `SECTION`.
        " reported - selectedSection is an ASSOCIATION, no binding can carry it,
        " and nothing on the display path re-issues it
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `objectPage` ) ( `setSelectedSection` ) ( section ) ) ).

      WHEN `BADGE`.
        " reported - badgeMinValue is no member at all: sap.m.Button declares
        " badgeStyle and keeps the bounds in private fields
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `badged` ) ( `setBadgeMinValue` ) ( |{ min_value }| ) ) ).

      WHEN `STEP`.
        " NOT reported - view_display( ) issues the same wire
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `step1` ) ( `setNextStep` ) ( next_step ) ) ).

      WHEN `EXPAND`.
        " NOT reported HERE - expanded is a bindable property, so this wire is
        " settable-property-via-action's finding, not this one
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `setExpanded` ) ( expanded ) ) ).

      WHEN `CURRENT`.
        " NOT reported - a LITERAL value carries no class state, so there is
        " nothing for the rebuilt view to contradict (a one-shot corrective jump)
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `wizard` ) ( `setCurrentStep` ) ( `step1` ) ) ).

      WHEN `FOCUS`.
        " NOT reported - not a set…( ) at all
        client->follow_up_action( val   = client->cs_event-control_by_id
                                  t_arg = VALUE #( ( `panel` ) ( `focus` ) ) ).

    ENDCASE.

  ENDMETHOD.

ENDCLASS.
