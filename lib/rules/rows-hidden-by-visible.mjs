import { defineRule } from '../rule.mjs';
import { isA, isAggregationTag, isBinding } from '../ui5-meta.mjs';

function check({ data, full, node, sizeLimitRaised, report }) {
  /* A bound aggregation whose row template carries a binding-valued
   * `visible` - rows filtered on the client by hiding them. A JSONModel
   * hands a bound aggregation at most 100 entries (its size limit), and
   * the hidden rows are among them: the list stops short of the data,
   * and with most rows hidden it shows a handful where the table's own
   * count says hundreds. samples-controls app 000 lost almost all of its
   * 622 ports that way behind three default-on "Hide …" checkboxes.
   * Judged only for a class that never raises the limit
   * (`sizeLimitRaised === false`, read by index.mjs off the source - a
   * raw view has no class to ask, so null leaves it alone). The general
   * "bound past 100 rows" rule was built and dropped in 0.3 for noise;
   * this shape is the one the size limit makes WRONG rather than merely
   * capped.
   *
   * Only where the 100 applies and the aggregation is a list of data
   * rows: a sap.m.ListBase's `items` (List, Table, GridList, Tree…).
   * The JSONModel caps a list binding only when the control asks for no
   * length (ClientListBinding: `iLength || min(length, iSizeLimit)`) -
   * a growing list pages with explicit lengths (GrowingEnablement), and
   * ManagedObject passes a binding info's own `length`, so neither is
   * judged; a growing that is not a literal is a runtime matter. Any
   * other bound aggregation - MultiInput tokens, a layout container's
   * repeated items - is a value set or a repeater nobody fills past
   * 100: samples app 078 and popups sample 19 hide tokens that way, and
   * all four hits the first version had on seven corpora were such. */
  const growing = node.attrs.find(([a]) => a === 'growing');
  if (sizeLimitRaised === false && isA(data, full, 'sap.m.ListBase')
    && (growing ? growing[1] === 'false' : !node.unresolvedAttrs?.has('growing'))) {
    for (const [agg, value, aggOffset] of node.attrs) {
      if (agg !== 'items' || !isBinding(value) || /\blength\s*:/.test(value)) continue;
      const tag = node.children.find((c) => c.name !== null && isAggregationTag(c.name)
        && String(c.name).replace(/^.*:/, '') === agg);
      for (const template of tag ? tag.children.filter((c) => c.name !== null && !isAggregationTag(c.name)) : []) {
        const visible = template.attrs.find(([a, v]) => a === 'visible' && isBinding(v));
        if (visible) {
          report({ control: full, member: agg, value: String(value), offset: visible[2] ?? template.offset ?? aggOffset });
        }
      }
    }
  }

}

export default defineRule({
  id: 'rows-hidden-by-visible',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
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
  message: (f) => `${f.control} ${f.member} hides rows through the template's visible binding — a JSONModel hands a bound aggregation at most 100 entries and the hidden rows are among them, so the list stops short of the data and shows only the visible part of the first 100. Raise the limit (client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( |{ lines( t ) }| ) ( client->cs_view-main ) ) )), or filter the binding instead of hiding rows`,
  check,
});
