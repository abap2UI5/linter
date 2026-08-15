CLASS barefragment DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.

CLASS barefragment IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    me->client = client.

    " a popup whose root is a BARE CONTROL rather than core:FragmentDefinition.
    " Fragment.load accepts that - display-root-mismatch says so in as many
    " words ( "a bare control root is a legitimate fragment and is never
    " reported" ) - so the render gate must load it as a fragment too. Sniffing
    " the root tag sent it to XMLView.create and failed it with "XMLView's root
    " node must be 'View'", against correct code.
    DATA(popup) = z2ui5_cl_ui5_view_builder=>factory( ).
    popup->ele( `Dialog`
        )->a( n = `xmlns` v = `sap.m`
        )->a( n = `title` v = `My Dialog`
        )->ele( `content`
            )->tag( `Text`
                )->a( n = `text` v = `Dialog content`
        )->end(
        )->ele( `buttons`
            )->tag( `Button`
                )->a( n = `text` v = `Close` ).

    client->popup_display( popup->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
