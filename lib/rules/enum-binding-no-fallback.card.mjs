import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'enum-binding-no-fallback',
  summary: 'an enum-typed property (type, state, design, valueColor …) bound straight to a column of a bound table — an initial cell is "", no member of the enum, and the whole view fails to render',
  detail: 'A property typed with an enum — `sap.m.ButtonType`, `sap.m.SwitchType`, `sap.ui.core.ValueState`, `sap.m.ValueColor` … — validates every value the model hands it: `ManagedObject.validateProperty` calls the enum\'s `isValid( )`, which tests membership in its values, and `ManagedObjectBindingSupport` rethrows everything but a `FormatException`. Bound to a column of a bound table, the value is whatever the ABAP row holds, and an initial field ships `""` (or `0`): UI5 throws and the whole view fails to render, not just the cell. The XML is valid, so abaplint, the transpiled tests and a review stay green. Reported: an enum-typed property under a bound aggregation\'s template (or a `sap.ui.table` row template) whose value is a plain relative binding — `{TYPE}`, `{ROW/TYPE}`, `{ path: \'TYPE\' }` — or the same binding built at run time around one variable, component or `component_path( )` call (`|\\{{ path }/TYPE\\}|`, the generic table builder\'s shape). Which enums accept the empty value is read off the metadata snapshot (an enum one of whose values is `""`); none of UI5\'s does, so every enum is judged. Not reported: an expression binding or a binding info with a formatter, a type or any other key (that is the fallback); a root binding `{/X}` — the app\'s own attribute, judged by `enum-bound-to-initial-field`; a literal (judged as a value); a variable the class fills from `_bind( )`, whose path is absolute. Not reported either: a table whose rows the class builds from literals it shows (`VALUE #( ( type = … ) )`) — `enum-field-unset-on-insert` judges those rows, an error where one leaves the field out. A hint: whether a cell is ever initial is the data\'s, which the source does not show — a column the app fills in every row is correct as written; the fallback costs nothing and survives the row that is not.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_row,
             text TYPE string,
             type TYPE string,
           END OF ty_row.
    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
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
                )->ele( n = \`CustomListItem\`
                    )->ele( n = \`Button\`
                        )->a( n = \`text\` v = \`{TEXT}\`
                        )->a( n = \`type\` v = \`{TYPE}\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_row,
             text TYPE string,
             type TYPE string,
           END OF ty_row.
    DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
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
                )->ele( n = \`CustomListItem\`
                    )->ele( n = \`Button\`
                        )->a( n = \`text\` v = \`{TEXT}\`
                        )->a( n = \`type\` v = \`{= \${TYPE} || 'Default' }\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
});
