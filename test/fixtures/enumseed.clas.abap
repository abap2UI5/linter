CLASS zcl_fixture_enumseed DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_appointment,
        start_at TYPE string,
        title    TYPE string,
        type     TYPE string,
        aria     TYPE string,
      END OF ty_s_appointment,
      BEGIN OF ty_s_special,
        start_at TYPE string,
        type     TYPE string,
      END OF ty_s_special,
      BEGIN OF ty_s_person,
        name           TYPE string,
        t_appointments TYPE STANDARD TABLE OF ty_s_appointment WITH EMPTY KEY,
      END OF ty_s_person,
      BEGIN OF ty_s_product,
        name        TYPE string,
        weight      TYPE string,
        weightstate TYPE string,
      END OF ty_s_product.

    DATA t_people   TYPE STANDARD TABLE OF ty_s_person WITH EMPTY KEY.
    DATA t_special  TYPE STANDARD TABLE OF ty_s_special WITH EMPTY KEY.
    DATA t_products TYPE STANDARD TABLE OF ty_s_product WITH EMPTY KEY.
ENDCLASS.


CLASS zcl_fixture_enumseed IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    " ---- the seeds -------------------------------------------------------
    " a nested aggregation seeded in model_init: T_APPOINTMENTS is bound
    " RELATIVELY, one row deeper than the table the view names
    t_people = VALUE #(
      ( name = `Max`
        t_appointments = VALUE #(
          ( start_at = `2017-01-01T10:00:00` title = `Team meeting` type = `Type01` aria = `Dialog` )
          ( start_at = `2017-01-02T10:00:00` title = `Reminder` type = `Type06` aria = `None` ) ) ) ).

    " the same aggregation reached through a field symbol
    READ TABLE t_people ASSIGNING FIELD-SYMBOL(<person>) INDEX 1.
    INSERT VALUE #( start_at = `2017-01-03T10:00:00`
                    title    = `new appointment`
                    type     = `Type09`
                    aria     = `None` ) INTO TABLE <person>-t_appointments.

    " …and through a work area built by its own VALUE constructor
    DATA(appointment) = VALUE ty_s_appointment( start_at = `2017-01-04T10:00:00`
                                                title    = `another one`
                                                type     = `Type09`
                                                aria     = `None` ).
    INSERT appointment INTO TABLE <person>-t_appointments.

    " ---- shapes that are NOT the defect ----------------------------------
    " a sibling aggregation of the same control whose template binds a
    " DIFFERENT enum field: t_special has no ariaHasPopup to omit
    APPEND VALUE #( start_at = `2017-01-05T00:00:00` type = `NonWorking` ) TO t_special.

    " a seed a LOOP completes afterwards - the port computes the state in the
    " backend because the original computes it in a frontend formatter
    t_products = VALUE #( ( name = `Notebook` weight = `4.2` )
                          ( name = `Flyer`    weight = `0.01` ) ).
    LOOP AT t_products REFERENCE INTO DATA(lr_product).
      lr_product->weightstate = COND #( WHEN lr_product->weight < `1` THEN `Success` ELSE `Warning` ).
    ENDLOOP.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`         v = `sap.m`
        )->a( n = `xmlns:mvc`     v = `sap.ui.core.mvc`
        )->a( n = `xmlns:unified` v = `sap.ui.unified`

        )->ele( `Page`
            )->a( n = `title` v = `Enum seeds`

            )->ele( `PlanningCalendar`
                )->a( n = `rows`         v = client->_bind( t_people )
                )->a( n = `specialDates` v = client->_bind( t_special )

                )->ele( `specialDates`
                    )->tag( n = `DateTypeRange` ns = `unified`
                        )->a( n = `type` v = `{TYPE}`

                )->end(
                )->ele( `rows`
                    )->ele( `PlanningCalendarRow`
                        )->a( n = `title`        v = `{NAME}`
                        )->a( n = `appointments` v = `{path: 'T_APPOINTMENTS', templateShareable: false}`

                        )->ele( `appointments`
                            )->tag( n = `CalendarAppointment` ns = `unified`
                                )->a( n = `title`        v = `{TITLE}`
                                )->a( n = `type`         v = `{TYPE}`
                                )->a( n = `ariaHasPopup` v = `{ARIA}`

                        )->end(
                    )->end(
                )->end(
            )->end(

            )->ele( `Table`
                )->a( n = `items` v = client->_bind( t_products )

                )->ele( `columns`
                    )->tag( `Column`
                    )->tag( `Column`

                )->end(
                )->ele( `items`
                    )->ele( `ColumnListItem`

                        )->ele( `cells`
                            )->tag( `ObjectNumber`
                                )->a( n = `number` v = `{WEIGHT}`
                                )->a( n = `state`  v = `{WEIGHTSTATE}`
                            " the demo kit's own quirk, ported verbatim: a binding
                            " where the sample meant the literal enum value. It
                            " resolves to nothing, so UI5 keeps the default
                            )->tag( `Input`
                                )->a( n = `value` v = `{NAME}`
                                )->a( n = `type`  v = `{Text}`

                        )->end(
                    )->end(
                )->end(
            )->end(
        )->end(
    )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
