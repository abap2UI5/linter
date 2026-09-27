CLASS zcl_obsolete_cc_legacy DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_title TYPE string.

ENDCLASS.

CLASS zcl_obsolete_cc_legacy IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " the frozen builder's helpers that write the obsolete controls -
    " _z2ui5( )->focus( ) in a comment is prose, not a call
    DATA(view) = z2ui5_cl_xml_view=>factory( ).
    DATA(page) = view->shell( )->page( title = `legacy` ).

    page->_z2ui5( )->timer( finished = client->_event( `TICK` )
                            delayms  = `2000` ).
    page->_z2ui5( )->lp_title( client->_bind( mv_title ) ).

    DATA(cc) = page->_z2ui5( ).
    cc->info_frontend( finished = client->_event( `INFO` ) ).

    " the live companion controls and sap.m's own Title stay silent
    page->_z2ui5( )->storage( key = `k` ).
    page->_z2ui5( )->message_manager( client->_bind( mv_title ) ).
    page->title( `sap.m Title` ).
    page->text( `_z2ui5( )->history( ) in a string` ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
