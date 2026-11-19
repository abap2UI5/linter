CLASS zcl_fx_component DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES:
      BEGIN OF ty_s_item,
        name       TYPE string,
        kind       TYPE string,
        number     TYPE abap_bool,
        secret     TYPE abap_bool,
        value_help TYPE abap_bool,
      END OF ty_s_item.

    DATA mt_item TYPE STANDARD TABLE OF ty_s_item WITH EMPTY KEY.

    "! append the fields to node, a container of the caller's view
    METHODS render
      IMPORTING
        node TYPE REF TO z2ui5_cl_ui5_view_builder.

    "! the fields as a complete view
    METHODS stringify
      RETURNING
        VALUE(result) TYPE string.

  PRIVATE SECTION.

    METHODS render_field
      IMPORTING
        node TYPE REF TO z2ui5_cl_ui5_view_builder
        item TYPE ty_s_item.

ENDCLASS.

CLASS zcl_fx_component IMPLEMENTATION.

  METHOD stringify.

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = `View` ns = `mvc`
            )->a( n = `xmlns`     v = `sap.m`
            )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`
            )->a( n = `xmlns:f`   v = `sap.ui.layout.form` ).

    DATA(page) = view->ele( `Page`
        )->a( n = `title` v = `Fields` ).

    render( page ).

    result = view->stringify( ).

  ENDMETHOD.

  METHOD render.

    DATA(lo_form) = node->ele( n = `SimpleForm` ns = `f`
        )->ele( n = `content` ns = `f` ).

    LOOP AT mt_item INTO DATA(ls_item).
      render_field( node = lo_form
                    item = ls_item ).
    ENDLOOP.

  ENDMETHOD.

  METHOD render_field.

    DATA lo_box TYPE REF TO z2ui5_cl_ui5_view_builder.
    DATA lo_input TYPE REF TO z2ui5_cl_ui5_view_builder.

    node->tag( `Label`
        )->a( n = `text` v = `Field` ).

    " the same property in exclusive arms reaches the control once
    node->tag( `Input`
        )->a( n = `value` v = `x` ).
    IF item-number = abap_true.
      node->a( n = `type` v = `Number` ).
    ELSEIF item-secret = abap_true.
      node->a( n = `type` v = `Password` ).
    ELSE.
      node->a( n = `type` v = `Text` ).
    ENDIF.
    CASE item-kind.
      WHEN `WIDE`.
        node->a( n = `width` v = `100%` ).
      WHEN OTHERS.
        node->a( n = `width` v = `10rem` ).
    ENDCASE.

    " the field handle is the new Input in one arm, its container in the other
    IF item-value_help = abap_true.
      lo_box = node->ele( `HBox` ).
      lo_input = lo_box->ele( `Input` ).
    ELSE.
      lo_input = node->tag( `Input` ).
    ENDIF.
    lo_input->a( n = `showValueHelp` b = abap_true ).
    IF item-value_help = abap_false.
      RETURN.
    ENDIF.
    lo_input->ele( `layoutData`
        )->tag( `FlexItemData`
        )->a( n = `growFactor` v = `1` ).
    lo_box->tag( `Button`
        )->a( n = `icon` v = `sap-icon://filter` ).

  ENDMETHOD.

ENDCLASS.
