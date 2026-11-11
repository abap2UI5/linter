import { defineRule } from '../rule.mjs';
import { bindingPath } from '../binding-paths.mjs';

function check({ attr, enums, full, initialFields, member, model, offset, value, report }) {
  /* An enum-typed property bound to a root field nothing on the start
   * path gives a value. The first display ships it as "", which is a
   * member of no enum: validateProperty throws and the view is never
   * shown - whether the control is visible or not, since the binding
   * is resolved either way. The root-field twin of
   * enum-field-unset-on-insert, and only for a document the first
   * display shows (initialFields is null for every other one): an
   * event handler that fills the field has run before a popup it
   * opens is built. Read off `model`, the RENDER model, so a field
   * left out under omit_initial - UI5 then keeps the default - is
   * not reported. */
  if (initialFields?.size && member.set === 'properties' && model
      && enums[member.decl?.type]) {
    const ip = bindingPath(value);
    const seg = ip && /^\/[A-Z_][A-Z0-9_]*$/.test(ip) ? ip.slice(1) : null;
    if (seg && initialFields.has(seg) && model[seg] === '') {
      report({
        control: full,
        member: attr,
        value: seg,
        memberType: member.decl.type,
        offset,
      });
    }
  }
}

export default defineRule({
  id: 'enum-bound-to-initial-field',
  severity: 'error',
  category: 'bindings',
  scope: 'node',
  summary: 'an enum-typed property bound to an attribute nothing gives a value before the first display — "" terminates the app',
  detail: 'The root-field twin of `enum-field-unset-on-insert`. A `type`, `state`, `design` or any other enum-typed property bound to a `TYPE string` attribute receives `""` when the attribute is still initial, and `""` is a member of no enum: `ManagedObject.validateProperty` throws and the app terminates before the view is shown — **also while the control is invisible**, because a hidden control still resolves its bindings. The typical shape is a result strip that only an event handler fills: `type = `Error`` in a `CATCH`, `type = `Success`` after a save, nothing at all on the first display. The view is judged against what the **start path** leaves in the attributes: the statements of `main( )` ahead of its dispatch `IF`, the `check_on_init( )` branch (or, in a chain with no init arm, the `check_on_navigated( )` branch — init implies navigated), the constructor and every method those call. An attribute counts as given a value by a literal seed there, by a declared `VALUE`, or by any other write there (an expression, a `SELECT … INTO`, an `IMPORTING` actual) — the last one is a runtime value and not judged. Only a document built on the start path is judged; a popup built in an event handler is shown after that handler ran. A class whose `main( )` has neither branch has no start path to read and is not judged, nor is a field the bind leaves out under `omit_initial` (UI5 then keeps the property default). The render gate renders the same documents against the same start-path model, so with it on the view also fails there; this finding names the attribute.',
  example: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA result_type TYPE string.   " only the TEST event fills it
  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      view_display( client ).
    ELSEIF client->check_on_event( \`TEST\` ).
      result_type = \`Error\`.
    ENDIF.
  ENDMETHOD.

  METHOD view_display.
    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\` ).
    page->tag( \`MessageStrip\`
        )->a( n = \`type\` v = client->_bind( result_type ) ).
    client->view_display( page->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
  remedy: `CLASS zcl_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA result_type TYPE string VALUE \`Information\`.
  PROTECTED SECTION.
    METHODS view_display IMPORTING client TYPE REF TO z2ui5_if_client.
ENDCLASS.

CLASS zcl_app IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      view_display( client ).
    ELSEIF client->check_on_event( \`TEST\` ).
      result_type = \`Error\`.
    ENDIF.
  ENDMETHOD.

  METHOD view_display.
    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\` ).
    page->tag( \`MessageStrip\`
        )->a( n = \`type\` v = client->_bind( result_type ) ).
    client->view_display( page->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`,
  message: (f) => `${f.control} ${f.member} binds ${f.value}, which nothing on the start path gives a value — the first display ships it as "", which is no ${f.memberType}, so validateProperty throws and the app terminates before the view is shown (hidden or not). Give the attribute a valid start value: DATA ${String(f.value).toLowerCase()} TYPE string VALUE \`…\`, or a seed in the check_on_init( ) branch`,
  check,
});
