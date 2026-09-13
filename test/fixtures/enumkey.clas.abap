CLASS zcl_fixture_enumkey DEFINITION PUBLIC.

* An enum whose KEY differs from its runtime VALUE, written the way an XML
* view has to write it: as the key.
*
*   CalendarIntervalType         OneMonth = "One Month"
*   FileUploaderHttpRequestMethod  Post   = "POST"
*   IllustratedMessageType         NoData = "sapIllus-NoData"
*
* Every attribute below is CORRECT and this fixture must produce no
* invalid-property-value at all - the property gate used to report all three,
* because it judged the values. The test rewrites each one into its value form
* in turn, which is the spelling that really breaks: XMLTemplateProcessor runs
* parseValue( ) (key -> value) before isValid( ), so the value parses to
* undefined and the property silently keeps its default.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

    METHODS view_display.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_enumkey IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    me->client = client.
    IF client->check_on_init( ).
      view_display( ).
    ELSEIF client->check_on_navigated( ).
      view_display( ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`         v = `sap.m`
        )->a( n = `xmlns:mvc`     v = `sap.ui.core.mvc`
        )->a( n = `xmlns:unified` v = `sap.ui.unified`

        )->ele( `Page`
            )->a( n = `title` v = `Enum keys`

            )->ele( `content`
                )->ele( `PlanningCalendar`
                    )->a( n = `viewKey` v = `OneMonth`

                    )->ele( `views`
                        )->tag( `PlanningCalendarView`
                            )->a( n = `key`          v = `OneMonth`
                            )->a( n = `intervalType` v = `OneMonth`
                            )->a( n = `description`  v = `One month`
                            )->a( n = `intervalsS`   v = `1`
                    )->end(
                )->end(

                )->tag( n = `FileUploader` ns = `unified`
                    )->a( n = `name`              v = `upload`
                    )->a( n = `httpRequestMethod` v = `Post`

                )->tag( `Button`
                    )->a( n = `text` v = `an enum whose key IS its value, left alone`
                    )->a( n = `type` v = `Emphasized`

            )->end(
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
