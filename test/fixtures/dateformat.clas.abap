CLASS zcl_fixture_dateformat DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA valid_from TYPE d.
    DATA start_time TYPE t.
    DATA iso_stamp  TYPE string.
ENDCLASS.

CLASS zcl_fixture_dateformat IMPLEMENTATION.
  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`      v = `sap.m`
        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`
        )->a( n = `xmlns:core` v = `sap.ui.core`
        )->ele( `Page`

          " reported - TYPE d reaches the model as `20240101`, which
          " new Date( ) does not parse; DateAbapDateToDateObject is the one
          )->tag( `DatePicker`
            )->a( n = `dateValue` v = `{ path: '/VALID_FROM', formatter: 'Formatter.DateCreateObject' }`

          " reported - TYPE t reaches the model as `120000`
          )->tag( `DatePicker`
            )->a( n = `dateValue` v = `{ formatter: 'Formatter.DateCreateObject', path: '/START_TIME' }`

          " NOT reported - the ABAP helper is exactly the right one here
          )->tag( `DatePicker`
            )->a( n = `dateValue` v = `{ path: '/VALID_FROM', formatter: 'Formatter.DateAbapDateToDateObject' }`

          " NOT reported - a string field may well carry an ISO date, which is
          " what new Date( ) parses; nothing here says otherwise
          )->tag( `DatePicker`
            )->a( n = `dateValue` v = `{ path: '/ISO_STAMP', formatter: 'Formatter.DateCreateObject' }` ) ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
