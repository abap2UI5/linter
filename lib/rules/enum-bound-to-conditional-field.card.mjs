import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'enum-bound-to-conditional-field',
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
});
