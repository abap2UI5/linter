CLASS zcl_fx_history_app DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.

    INTERFACES z2ui5_if_app.

    " the class's own ty_s_meta - the one the borrowed entry is built from
    " is zcl_fx_history_api's, and has other fields
    TYPES:
      BEGIN OF ty_s_meta,
        owner TYPE string,
      END OF ty_s_meta.

    TYPES:
      BEGIN OF ty_s_out,
        s_db TYPE zcl_fx_history_api=>ty_s_entry,
        tag  TYPE zif_fx_types=>ty_s_tag,
        ext  TYPE zcl_fx_not_here=>ty_s_ext,
        date TYPE string,
      END OF ty_s_out.
    TYPES ty_t_out TYPE STANDARD TABLE OF ty_s_out WITH EMPTY KEY.

    DATA mt_out     TYPE ty_t_out.
    DATA mt_history TYPE zcl_fx_history_api=>ty_t_entry.

ENDCLASS.

CLASS zcl_fx_history_app IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_init( ).
      mt_history = zcl_fx_history_api=>read( ).
    ENDIF.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = `View` ns = `mvc`
            )->a( n = `xmlns`     v = `sap.m`
            )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
            )->ele( `Page`
                )->ele( `List`
                    )->a( n = `items` v = client->_bind( mt_out )
                    )->tag( `StandardListItem`
                        )->a( n = `title`       v = `{S_DB/TABNAME} - {DATE}`
                        )->a( n = `description` v = `{S_DB/META/AUTHOR}`
                        )->a( n = `info`        v = `{S_DB/TABNAMX}`
                        )->a( n = `infoState`   v = `{EXT/STATE}`
                        )->a( n = `tooltip`     v = `{S_DB/META/OWNER}`
                        )->a( n = `icon`        v = `{TAG/LABLE}`
                )->end(
                )->ele( `List`
                    )->a( n = `items` v = client->_bind( mt_history )
                    )->tag( `StandardListItem`
                        )->a( n = `title`       v = `{TABNAME}`
                        )->a( n = `description` v = `{TAG/LABEL}`
                        )->a( n = `info`        v = `{COUNTER}` ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
