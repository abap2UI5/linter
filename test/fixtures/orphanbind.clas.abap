CLASS zcl_fixture_orphanbind DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.

    TYPES:
      BEGIN OF ty_s_row,
        productid TYPE string,
      END OF ty_s_row.

    " the record the original reached with bindElement( '/ProductCollection/0' ),
    " seeded at the model root by the port
    DATA name     TYPE string.
    DATA supplier TYPE string.
    DATA price    TYPE string.
    DATA status   TYPE string.
    DATA t_rows   TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
ENDCLASS.


CLASS zcl_fixture_orphanbind IMPLEMENTATION.

  METHOD z2ui5_if_app~main.

    name     = `Notebook`.
    supplier = `Very Best Screens`.
    price    = `956.00`.
    status   = `E`.
    t_rows   = VALUE #( ( productid = `HT-1000` ) ).

    DATA(agg_binding) = client->_bind( val = t_rows path = abap_true ).

    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = `View` ns = `mvc`
        )->a( n = `xmlns`       v = `sap.m`
        )->a( n = `xmlns:mvc`   v = `sap.ui.core.mvc`
        )->a( n = `xmlns:table` v = `sap.ui.table`

        )->ele( `Page`

            " reported - no binding context, NAME is a root field: renders empty
            )->tag( `Text`
                )->a( n = `text` v = `{NAME}`

            " correct - the same field bound absolutely
            )->tag( `Text`
                )->a( n = `text` v = client->_bind( supplier )

            " reported - a ROOT-level aggregation bound relatively: nothing to
            " resolve against, so the list renders empty
            )->ele( `List`
                )->a( n = `items` v = `{path: 'T_ROWS'}`
            )->end(

            " not judged - the outer aggregation's value is a VARIABLE the
            " reconstructor cannot resolve, so it lands in unresolvedAttrs and
            " appears in no aggRows. The inner list is a row template all the
            " same (app 585's shared nav_list( ) fragment shape)
            )->ele( `List`
                )->a( n = `items` v = agg_binding

                )->ele( `items`
                    )->ele( `CustomListItem`
                        )->ele( `List`
                            )->a( n = `items` v = `{T_CHILDREN}`
                        )->end(
                    )->end(
                )->end(
            )->end(

            " not judged - a NAMED model rides in front of the path, and
            " `message>/` is absolute once the model name is off it
            )->ele( `MessagePopover`
                )->a( n = `items` v = `{path: 'message>/'}`
            )->end(

            " not judged - inside a bound aggregation the row is the context,
            " and the nested aggregation's relative path is the normal form
            )->ele( `List`
                )->a( n = `items` v = client->_bind( t_rows )

                )->ele( `items`
                    )->tag( `StandardListItem`
                        )->a( n = `title` v = `{PRODUCTID}`
                )->end(
            )->end(

            " reported TWICE - the literal shape of samples-controls app 592,
            " whose 21 sections carried 42 of these past a green gate: a
            " COMPOSITE binding is two relative paths in one attribute, and
            " the anchored ^{NAME}$ matcher could see neither of them
            )->tag( `Title`
                )->a( n = `text` v = `{NAME} {SUPPLIER}`

            " reported - the COMPLEX form on a property. The aggregation branch
            " has matched this since it shipped; the property branch never did
            )->tag( `ObjectNumber`
                )->a( n = `number` v = `{ path: 'PRICE', type: 'sap.ui.model.type.Currency' }`

            " reported - an EXPRESSION binding resolves its ${...} paths against
            " the same missing context
            )->tag( `ObjectStatus`
                )->a( n = `text` v = `{= ${STATUS} ? 'Error' : 'None' }`

            " reported - a relative name the model root does NOT have. It used
            " to fall between two rules: unknown-binding-path's relative arm
            " needs a context to check the name against, and there is none
            )->tag( `Label`
                )->a( n = `text` v = `{NOSUCHFIELD}`

            " not judged - `binding` is not a property but a ManagedObject
            " special setting: XMLTemplateProcessor hands it to bindObject( ),
            " so this Panel and everything under it HAS a context. It is the
            " declarative form of the cs_event-bind_element wire
            )->ele( `Panel`
                )->a( n = `binding` v = |\{{ client->_bind( val = t_rows path = abap_true ) }/0\}|
                )->tag( `Text`
                    )->a( n = `text` v = `{PRODUCTID} {NAME}`
            )->end(

            " not judged - a per-row TEMPLATE aggregation. UI5 clones what is
            " inside it once per row and hands the clone the row's context,
            " set by the table's own rows binding in a sibling aggregation
            " this walk never descends into. `template` was the only spelling
            " the rule knew; rowSettingsTemplate is cloned the same way
            )->ele( n = `Table` ns = `table`
                )->ele( n = `rowSettingsTemplate` ns = `table`
                    )->tag( n = `RowSettings` ns = `table`
                        )->a( n = `highlight`     v = `{STATUS}`
                        )->a( n = `highlightText` v = `{STATUSTEXT}`
                )->end(
            )->end(

            " not judged - the CORRECT form of the composite above, which is
            " what app 592 was changed to: two absolute paths, one attribute
            )->tag( `Text`
                )->a( n = `text` v = |{ client->_bind( name ) } { client->_bind( supplier ) }|

            " not judged - a message placeholder and a named model are neither
            " of them a relative path
            )->tag( `Text`
                )->a( n = `tooltip` v = `Item {0} of {1}`
            )->tag( `Text`
                )->a( n = `visible` v = `{device>/system/phone}`
        )->end( ).

    client->view_display( view->stringify( ) ).

  ENDMETHOD.
ENDCLASS.
