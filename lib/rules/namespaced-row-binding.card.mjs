import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'namespaced-row-binding',
  summary: 'a row template binds a namespaced column as {/CWM/XCWMAT}, or builds the braces around a run-time column name without component_path( ) — an absolute path: the cell is empty and an edit is lost',
  detail: 'A DDIC column whose name carries a namespace — `/CWM/XCWMAT`, the fields an industry solution or a customer appends to a table — is written into the model as a **level** of its row (`"CWM":{"XCWMAT":…}`), so its row-relative path is `CWM/XCWMAT`. Written as it is named, `{/CWM/XCWMAT}`, the leading slash makes it an absolute path from the model root: the cell renders empty, a user\'s edit is written where nobody reads it, and nothing logs anything. Two shapes are reported, both only inside a row template (the controls a bound aggregation clones per row, and a `sap.ui.table` `Column.template`): **a literal path** of the shape `/SEG/NAME` whose first segment is not an attribute of the class (`{/MV_TITLE}` in a row template is the documented way to show a root value per row) — fixed by dropping the slash; and **a binding built at run time** around one variable or component — `|\\{{ comp-name }\\}|`, `|\\{path:\'{ comp-name }\'…\\}|`, the generic table maintenance and layout builders — which is right for `MATNR` and wrong for `/CWM/XCWMAT`: wrap the name in `z2ui5_cl_ui5_view_builder=>component_path( )` (abap2UI5 40e8a073, on DEV until the next release), which returns the row-relative path for a namespaced name and every other name unchanged. Not reported: a root binding outside a row template; a name the reconstructor resolves (a literal, a constant, a variable assigned only from literals — then the literal shape decides); an embedded call, `component_path( )` above all; a variable the class fills from `_bind( )`/`_bind_path( )` or `component_path( )`; a cell bound with `_bind( val = … tab = … tab_index = … )`, whose path the framework writes; a class that switches its default model to an OData service (`switch_default_model`), whose namespaced entity sets are absolute by design; and a raw XML view, which has no class attributes to tell a namespace from a root field.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mt_rows TYPE STANDARD TABLE OF zcwm_material WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( n = \`Page\`
            )->ele( n = \`List\`
                )->a( n = \`items\` v = client->_bind( mt_rows )
                )->ele( n = \`StandardListItem\`
                    )->a( n = \`title\` v = \`{/CWM/XCWMAT}\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mt_rows TYPE STANDARD TABLE OF zcwm_material WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( n = \`Page\`
            )->ele( n = \`List\`
                )->a( n = \`items\` v = client->_bind( mt_rows )
                )->ele( n = \`StandardListItem\`
                    )->a( n = \`title\` v = \`{CWM/XCWMAT}\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
  fixNote: 'For a literal path written in the attribute call itself, deletes the leading slash (`{/CWM/XCWMAT}` → `{CWM/XCWMAT}`, also inside a template and after `path:`). A path that arrives through a variable or a constant, and the run-time shape (which needs `component_path( )`, a method of abap2UI5 DEV), keep the finding.',
});
