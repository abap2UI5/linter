import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'rows-hidden-by-visible',
  summary: `rows filtered on the client through the template's visible binding — hidden rows still count against the model's 100-row limit`,
  detail: 'A JSONModel hands a bound aggregation at most **100** entries — its size limit — and a row hidden through `visible` is still one of them. A list filtered that way stops short of its data without a word: with 622 rows and most of them hidden, samples-controls\' overview app showed a few dozen ports under a title that said 622, behind three default-on "Hide …" checkboxes. Nothing fails, nothing is logged; the list just ends. Two repairs: raise the limit for the view slot (`client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( |{ lines( t ) }| ) ( client->cs_view-main ) ) )`, after the display), or filter the BINDING rather than hiding rows (`cs_event-binding_call … filter`), which the limit then applies after. Judged on the rows of a list — the `items` of a `sap.m.ListBase` (List, Table, GridList, Tree) — and only where the limit applies: a growing list pages with lengths of its own and a binding info with a `length` passes it, so neither is capped, and a growing that is not a literal is not guessed; the tokens of a MultiInput or the repeated items of a layout container are a value set or a repeater, not data rows, and are not judged. Judged only for an ABAP class that raises no size limit anywhere — the constant outside a literal, or the action name as one; a raw view has no class to ask and is not judged. The general "a bound aggregation seeded past 100 rows" rule was built and dropped in 0.3 (101 findings on 637 files, about one worth having — ports whose original caps at 100 too); this shape is the one the limit makes wrong rather than merely capped. Narrowed to lists after its first version reported hidden MultiInput tokens - its only hits on seven corpora.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, hidden TYPE abap_bool, END OF ty_s_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
    DATA hide TYPE abap_bool VALUE abap_true.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->ele( \`List\`
          )->a( n = \`items\` v = client->_bind( t_rows )
          )->ele( \`items\`
              )->tag( \`StandardListItem\`
                  )->a( n = \`title\` v = \`{NAME}\`
                  )->a( n = \`visible\` v = |\\{= !(\${ client->_bind( hide ) } && $\\{HIDDEN\\}) \\}| ).
      client->view_display( page->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, hidden TYPE abap_bool, END OF ty_s_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
    DATA hide TYPE abap_bool VALUE abap_true.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->ele( \`List\`
          )->a( n = \`items\` v = client->_bind( t_rows )
          )->ele( \`items\`
              )->tag( \`StandardListItem\`
                  )->a( n = \`title\` v = \`{NAME}\`
                  )->a( n = \`visible\` v = |\\{= !(\${ client->_bind( hide ) } && $\\{HIDDEN\\}) \\}| ).
      client->view_display( page->stringify( ) ).
      client->follow_up_action( val   = client->cs_event-set_size_limit
                                t_arg = VALUE #( ( |{ lines( t_rows ) }| ) ( client->cs_view-main ) ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
});
