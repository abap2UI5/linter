CLASS zcl_fixture_pickerformat DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    " authored by the class from a template — a date the backend produces
    DATA start_at   TYPE string.
    " authored by a method result — the class is an author, the shape is runtime
    DATA end_at     TYPE string.
    " authored as the neutral empty string — `` certifies nothing
    DATA rec_end    TYPE string.
    " these two are fine and must stay quiet
    DATA typed_at   TYPE string.
    DATA formatted  TYPE string.
    " plain display text the class writes — not a date at all
    DATA made_on    TYPE string.
    " the class never writes it: the picker is the only author of the string
    DATA expires    TYPE string.
    DATA note       TYPE string.
    METHODS iso_of RETURNING VALUE(result) TYPE string.
ENDCLASS.

CLASS zcl_fixture_pickerformat IMPLEMENTATION.
  METHOD iso_of.
    result = |{ sy-datlo DATE = ISO }T09:00:00|.
  ENDMETHOD.

  METHOD z2ui5_if_app~main.

    start_at = |{ sy-datlo DATE = ISO }T09:00:00|.
    end_at   = iso_of( ).
    rec_end  = ``.
    typed_at = |{ sy-datlo DATE = ISO }T09:00:00|.
    formatted = |{ sy-datlo DATE = ISO }T09:00:00|.
    made_on  = `n/a`.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`     v = `sap.m`
        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`

        )->ele( `Page`

          " reported - the class writes an ISO string, the picker writes a locale one back
          )->tag( `DateTimePicker`
            )->a( n = `value` v = client->_bind( start_at )

          " reported - a method result is a value the class authors all the same
          )->tag( `DatePicker`
            )->a( n = `value` v = client->_bind( end_at )

          " reported - an EMPTY seed is "not set yet", never proof of plain text
          )->tag( `DateRangeSelection`
            )->a( n = `value` v = client->_bind( rec_end )

          " ok - the binding TYPE owns the pattern, valueFormat is moot
          )->tag( `DateTimePicker`
            )->a( n = `value` v = |\{ 'path': '{ client->_bind( val = typed_at path = abap_true ) }', 'type': 'sap.ui.model.type.DateTime', 'formatOptions': \{ 'source': \{ 'pattern': 'yyyy-MM-dd''T''HH:mm:ss' \} \} \}|

          " ok - the format is declared
          )->tag( `DateTimePicker`
            )->a( n = `valueFormat` v = `yyyy-MM-dd'T'HH:mm:ss`
            )->a( n = `value`       v = client->_bind( formatted )

          " ok - the class writes `n/a`: a digit-free literal is not a date in any locale
          )->tag( `DatePicker`
            )->a( n = `value` v = client->_bind( made_on )

          " ok - the class never writes it, so the picker is the only author
          )->tag( `DatePicker`
            )->a( n = `value` v = client->_bind( expires )

          " ok - no value binding at all, nothing can be written back
          )->tag( `TimePicker`
            )->a( n = `displayFormat` v = `HH:mm`

          " ok - an Input is not a picker, even bound to the same field
          )->tag( `Input`
            )->a( n = `value` v = client->_bind( note )

        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
