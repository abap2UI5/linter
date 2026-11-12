import { defineRule } from '../rule.mjs';
import { bindingPath } from '../binding-paths.mjs';

function check({ attr, conditionalFields, enums, full, member, offset, value, report }) {
  /* The branch half of enum-bound-to-initial-field. That rule reports an
   * enum-typed property bound to a root field nothing on the start path
   * seeds; a field seeded in ONE arm of an IF (or a CASE without WHEN
   * OTHERS, or inside a LOOP) used to count as seeded, because the start
   * path was read as one flat text. It is initial whenever the other arm is
   * taken - samples-stack app 013's shape, one branch further in. A warning,
   * not an error: whether the other arm is taken on the first display is a
   * runtime matter (an IF on a parameter that is always set), and the
   * reader of the condition knows that, this rule does not.
   * conditionalFields is null for every document the first display does
   * not show, as initialFields is. */
  if (!conditionalFields?.size || member.set !== 'properties' || !enums[member.decl?.type]) return;
  const ip = bindingPath(value);
  const seg = ip && /^\/[A-Z_][A-Z0-9_]*$/.test(ip) ? ip.slice(1) : null;
  if (seg && conditionalFields.has(seg)) {
    report({ control: full, member: attr, value: seg, memberType: member.decl.type, offset });
  }
}

export default defineRule({
  id: 'enum-bound-to-conditional-field',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  summary: 'an enum-typed property bound to an attribute the start path seeds in one branch only — "" terminates the app when the other branch runs',
  detail: 'The branch half of `enum-bound-to-initial-field`. The start path — `main( )` ahead of its dispatch `IF`, the `check_on_init( )` arm, the constructor and what they call — seeds the attribute, but only inside one arm of an `IF` without an `ELSE` that seeds it too, a `CASE` without `WHEN OTHERS`, or a `LOOP` / `WHILE` / `DO` that may not run. On every first display that takes another way the attribute is still `""`, which is a member of no enum: `ManagedObject.validateProperty` throws and the app terminates before the view is shown. A seed counts as given when every arm of a complete `IF … ELSE` or `CASE … WHEN OTHERS` gives one, and a `TRY` body counts as running. A warning, because whether the other arm is taken on the first display is a runtime matter this source does not show. Give the attribute a valid start value in its declaration, or seed it in every arm.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_state TYPE string.
    DATA mv_failed TYPE abap_bool.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      IF mv_failed = abap_true.
        mv_state = \`Error\`.
      ENDIF.
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->tag( \`MessageStrip\`
          )->a( n = \`type\` v = client->_bind( mv_state ) ).
      client->view_display( page->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mv_state TYPE string.
    DATA mv_failed TYPE abap_bool.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      IF mv_failed = abap_true.
        mv_state = \`Error\`.
      ELSE.
        mv_state = \`Success\`.
      ENDIF.
      DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\` ).
      page->tag( \`MessageStrip\`
          )->a( n = \`type\` v = client->_bind( mv_state ) ).
      client->view_display( page->stringify( ) ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`,
  message: (f) => `${f.control} ${f.member} binds ${f.value}, which the start path seeds only in some of its branches — whenever another branch runs, the first display ships "", which is no ${f.memberType}, and validateProperty terminates the app. Give the attribute a start value (DATA ${String(f.value).toLowerCase()} TYPE string VALUE \`…\`) or seed it in every arm (an ELSE, a WHEN OTHERS)`,
  check,
});
