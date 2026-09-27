CLASS zcl_fixture_ccmirrors DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_range,
        exclude   TYPE abap_bool,
        operation TYPE string,
        value1    TYPE string,
        value2    TYPE string,
      END OF ty_s_range,
      ty_t_range TYPE STANDARD TABLE OF ty_s_range WITH EMPTY KEY.

    DATA scan      TYPE string.
    DATA mode      TYPE string.
    DATA file_name TYPE string.
    DATA file_data TYPE string.
    DATA file_type TYPE string.
    DATA file_size TYPE string.
    DATA removed   TYPE string.
    DATA ranges    TYPE ty_t_range.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

    METHODS view_display.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_ccmirrors IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    IF client->check_on_event( `SCAN` ) OR client->check_on_event( `FILE_ADDED` )
        OR client->check_on_event( `FILE_REMOVED` ) OR client->check_on_event( `RANGES` ).
      RETURN.
    ENDIF.

    me->client = client.
    IF client->check_on_init( ).
      mode = `none`.
      view_display( ).
    ELSEIF client->check_on_navigated( ).
      view_display( ).
    ENDIF.

  ENDMETHOD.


  METHOD view_display.

    " The three live companion controls the render harness did not mirror
    " before 2026-09-27, written the way abap2UI5/samples apps 516 and 530
    " (InputExt) and 517 (UploadSetExt) and samples-stack app 319
    " (SmartMultiInputExt) write them. InputExt IS a sap.m.Input: value,
    " placeholder, width and submit are the Input's own. The SmartMultiInput
    " app 319 pairs its companion with is SAPUI5-only, so a sap.m.MultiInput
    " carries the id here.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`        v = `sap.m`
        )->a( n = `xmlns:mvc`    v = `sap.ui.core.mvc`
        )->a( n = `xmlns:upload` v = `sap.m.upload`
        )->a( n = `xmlns:z2ui5`  v = `z2ui5.cc`

        )->ele( `Page`
            )->a( n = `title` v = `Companion controls`

            )->ele( `content`
                )->tag( n = `InputExt` ns = `z2ui5`
                    )->a( n = `value`       v = client->_bind( scan )
                    )->a( n = `inputMode`   v = client->_bind( mode )
                    )->a( n = `placeholder` v = `scan here`
                    )->a( n = `width`       v = `20rem`
                    )->a( n = `submit`      v = client->_event( `SCAN` )
                )->tag( n = `UploadSetExt` ns = `z2ui5`
                    )->a( n = `uploadSetId`     v = `files`
                    )->a( n = `fileName`        v = client->_bind( file_name )
                    )->a( n = `fileData`        v = client->_bind( file_data )
                    )->a( n = `mediaType`       v = client->_bind( file_type )
                    )->a( n = `fileSize`        v = client->_bind( file_size )
                    )->a( n = `removedFileName` v = client->_bind( removed )
                    )->a( n = `change`          v = client->_event( `FILE_ADDED` )
                    )->a( n = `remove`          v = client->_event( `FILE_REMOVED` )
                )->tag( n = `UploadSet` ns = `upload`
                    )->a( n = `id`            v = `files`
                    )->a( n = `instantUpload` v = `false`
                    )->a( n = `uploadEnabled` v = `false`
                )->tag( n = `SmartMultiInputExt` ns = `z2ui5`
                    )->a( n = `multiInputId` v = `types`
                    )->a( n = `rangeData`    v = client->_bind( ranges )
                    )->a( n = `change`       v = client->_event( `RANGES` )
                )->tag( `MultiInput`
                    )->a( n = `id`          v = `types`
                    )->a( n = `placeholder` v = `product type`
                    )->a( n = `change`      v = client->_event( `RANGES` )

            )->end(
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
