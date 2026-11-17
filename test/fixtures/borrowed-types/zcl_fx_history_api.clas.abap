CLASS zcl_fx_history_api DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES:
      BEGIN OF ty_s_meta,
        author TYPE string,
        stamp  TYPE timestampl,
      END OF ty_s_meta.

    TYPES:
      BEGIN OF ty_s_entry,
        uuid        TYPE c LENGTH 32,
        tabname     TYPE c LENGTH 20,
        counter     TYPE c LENGTH 20,
        sql_command TYPE string,
        meta        TYPE ty_s_meta,
      END OF ty_s_entry.
    TYPES ty_t_entry TYPE STANDARD TABLE OF ty_s_entry WITH EMPTY KEY.

    CLASS-METHODS read
      RETURNING
        VALUE(result) TYPE ty_t_entry.

ENDCLASS.

CLASS zcl_fx_history_api IMPLEMENTATION.

  METHOD read.
    result = VALUE #( ( uuid = `1` tabname = `T100` ) ).
  ENDMETHOD.

ENDCLASS.
