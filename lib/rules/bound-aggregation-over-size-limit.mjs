import { defineRule } from '../rule.mjs';
import { isA, isBinding, rootBindingPath } from '../ui5-meta.mjs';

function check({ data, full, node, seededRows, sizeLimitRaised, report }) {
  const growing = node.attrs.find(([a]) => a === 'growing');
  /* The opt-in bound-aggregation-over-size-limit: a bound list whose
   * table the class is SEEN to seed past the JSONModel's 100 entries -
   * the one literal seed's rows, or the APPENDs of literal DO loops
   * (`seededRows`, a lower bound read by check.mjs off the source, and
   * only when the rule is asked for and the class raises no size limit
   * anywhere). The list stops at 100 without a word. Judged where the
   * 100 applies, as for rows-hidden-by-visible above: the `items` of a
   * non-growing sap.m.ListBase bound without a `length` - and the
   * `items` of a Select or a ComboBoxBase, which bind their whole value
   * list the same way and have no growing to page with. Opt-in because
   * the corpus that measured it is ports: 101 findings on 637 files in
   * 0.3, almost all a 123-row mock whose ORIGINAL caps at 100 too - a
   * faithful port the rule cannot tell from a broken one. In an app's
   * own code 123 rows showing 100 is the defect itself. */
  if (seededRows?.size && sizeLimitRaised === false
    && (isA(data, full, 'sap.m.Select') || isA(data, full, 'sap.m.ComboBoxBase')
      || (isA(data, full, 'sap.m.ListBase') && (growing ? growing[1] === 'false' : !node.unresolvedAttrs?.has('growing'))))) {
    for (const [agg, value, aggOffset] of node.attrs) {
      if (agg !== 'items' || !isBinding(value) || /\blength\s*:/.test(value)) continue;
      const table = rootBindingPath(value);
      const rows = table ? seededRows.get(table) : undefined;
      if (rows > 100) {
        report({ control: full, member: agg, value: String(value), count: rows, offset: aggOffset ?? node.offset });
      }
    }
  }

}

export default defineRule({
  id: 'bound-aggregation-over-size-limit',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  summary: `a list bound to a table the class seeds past the model's 100-entry size limit — it stops at 100 (opt-in)`,
  detail: 'Off until a config asks for it — `"rules": { "bound-aggregation-over-size-limit": "warning" }`. A JSONModel hands a bound aggregation at most **100** entries — its size limit — so a list bound to a table of 400 rows shows 100 of them. Nothing fails and nothing is logged; the list just ends, and a test that asks whether some rows rendered passes. The repair is the one `rows-hidden-by-visible` names: raise the limit for the view slot after the display (`client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( |{ lines( t ) }| ) ( client->cs_view-main ) ) )`), or let a list page (`growing="true"`). Reported only where the count is SEEN, as a lower bound: the class\'s one literal seed of the table (`t = VALUE #( ( … ) ( … ) )`, its rows), or, for a table with no seed, the APPEND/INSERT statements directly inside `DO <n> TIMES` (n each, nested literal DOs multiplied). A table the class also deletes from, clears, refreshes, selects into, reassigns, seeds twice or hands to a method or a FORM has no count this source decides and is not judged — an unknown count is not a large one — and an APPEND under an IF, a CASE, a LOOP, a WHILE or a TRY is not counted, since it may not run. Judged where the 100 applies: the `items` of a non-growing `sap.m.ListBase` (List, Table, GridList, Tree) bound without a `length`, and the `items` of a `Select` or a `ComboBoxBase` (ComboBox, MultiComboBox), which have no growing; only for an ABAP class that raises no size limit anywhere, and never for a raw view. Opt-in because it is right about an app and wrong about a port: built in 0.3 and measured on the samples-controls ports, it gave 101 findings on 637 files, about one worth having — almost all a 123-row shared mock whose ORIGINAL UI5 sample binds it to a JSONModel with the same 100 and shows the same 100. Whether the original raised its limit is in no source the linter reads; in an app\'s own code, 123 rows showing 100 is the defect.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DO 400 TIMES.
        APPEND VALUE #( name = |row { sy-index }| ) TO t_rows.
      ENDDO.
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->ele( \`List\`
          )->a( n = \`items\` v = client->_bind( t_rows )
          )->ele( \`items\`
              )->tag( \`StandardListItem\`
                  )->a( n = \`title\` v = \`{NAME}\` ).
      client->view_display( page->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.
    DATA t_rows TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DO 400 TIMES.
        APPEND VALUE #( name = |row { sy-index }| ) TO t_rows.
      ENDDO.
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->ele( \`List\`
          )->a( n = \`items\` v = client->_bind( t_rows )
          )->ele( \`items\`
              )->tag( \`StandardListItem\`
                  )->a( n = \`title\` v = \`{NAME}\` ).
      client->view_display( page->stringify( ) ).
      client->follow_up_action( val   = client->cs_event-set_size_limit
                                t_arg = VALUE #( ( |{ lines( t_rows ) }| ) ( client->cs_view-main ) ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  optIn: true,
  message: (f) => `${f.control} ${f.member} is bound to ${f.value}, which the class seeds with at least ${f.count} rows — a JSONModel hands a bound aggregation at most 100 entries, so the list stops at 100 without a word. Raise the limit after the display (client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( |{ lines( t ) }| ) ( client->cs_view-main ) ) )), or let the list page (growing="true")`,
  check,
});
