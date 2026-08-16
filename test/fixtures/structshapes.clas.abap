" Four ways an ABAP structure declaration hides its shape from a naive parse.
" Every binding below is CORRECT: the fixture asserts silence.
CLASS zcl_fixture_structshapes DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    " (1) the same name nested at several levels - each level is its own
    "     structure, and `END OF outer` is a prefix of `END OF outer2`
    DATA:
      BEGIN OF ms_deep,
        BEGIN OF ms_deep2,
          BEGIN OF ms_deep2,
            val TYPE string,
          END OF ms_deep2,
          val TYPE string,
        END OF ms_deep2,
        val2 TYPE string,
      END OF ms_deep.

    " (2) the period-terminated form carrying INCLUDE TYPE: the included
    "     fields land FLAT, as components of ms_incl itself
    TYPES:
      BEGIN OF ty_s_part,
        title TYPE string,
      END OF ty_s_part.

    DATA
      BEGIN OF ms_incl.
        INCLUDE TYPE ty_s_part.
    DATA END OF ms_incl.

    " (3) a type owned by another class - the shape is not knowable here, so
    "     every path below it is accepted rather than guessed at
    DATA ms_foreign TYPE z2ui5_cl_other_app=>ty_s_result.

  PROTECTED SECTION.
    DATA client TYPE REF TO z2ui5_if_client.

  PRIVATE SECTION.
ENDCLASS.


CLASS zcl_fixture_structshapes IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`          v = `sap.m`
        )->a( n = `xmlns:mvc`      v = `sap.ui.core.mvc`
        )->a( n = `xmlns:template` v = `http://schemas.sap.com/sapui5/extension/sap.ui.core.template/1`

        )->ele( `Page`
            )->a( n = `title` v = `Shapes`

            )->tag( `Input`
                )->a( n = `value` v = client->_bind( ms_deep-ms_deep2-ms_deep2-val )
            )->tag( `Input`
                )->a( n = `value` v = client->_bind( ms_incl-title )
            )->tag( `Input`
                )->a( n = `value` v = client->_bind( ms_foreign-anything )

            " (4) template:repeat DECLARES the model `L0` for its subtree -
            "     a model created in the view, not wired from ABAP
            )->ele( n = `repeat` ns = `template`
                )->a( n = `list` v = `{template>/MS_DEEP}`
                )->a( n = `var`  v = `L0`

                )->tag( `Text`
                    )->a( n = `text` v = `{L0>VAL2}` ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
