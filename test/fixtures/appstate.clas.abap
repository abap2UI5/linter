CLASS zcl_fixture_appstate DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA name TYPE string.
  PROTECTED SECTION.
    " NOT reported - the dynamic ASSIGN reaches a PROTECTED attribute, which
    " is what the 53 working ports were written with
    DATA helper_state TYPE string.
  PRIVATE SECTION.
    " reported (private-app-attribute) - the serializer cannot reach it, so
    " every roundtrip answers ASSERTION_FAILED
    DATA t_all TYPE string_table.
    " NOT reported - a static attribute is not instance state and is not
    " serialized with the app
    CLASS-DATA registry TYPE string.
ENDCLASS.

CLASS zcl_fixture_appstate IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    " reported (escape-sequence-in-backtick) - a backtick literal is raw, so
    " this renders the two characters instead of breaking the line
    client->message_toast_display( `saved, \n and closed` ).

    " NOT reported - the |…| string template is the ABAP form that HAS escapes
    client->message_toast_display( `saved,` && |\n| && ` and closed` ).

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
        )->ele( `Page`

          " reported - the same defect in an attribute value
          )->tag( `Text` )->a( n = `text` v = `line one \n line two`

          " NOT reported - a DOUBLED backslash is a backslash on purpose
          )->tag( `Text` )->a( n = `text` v = `the escape \\n stays visible`

          )->tag( `Input` )->a( n = `value` v = client->_bind( name ) ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
