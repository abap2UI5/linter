import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'nonserializable-attribute',
  summary: 'an instance attribute of a `z2ui5_if_app` class typed `REF TO` a class that does not implement `if_serializable_object`',
  detail: 'abap2UI5 writes the app into the draft after every roundtrip and restores it before the next. An object reference survives that only when its class implements `if_serializable_object`; when it does not, the framework leaves the reference out without raising or logging anything, on purpose, and the attribute is **initial** on the next roundtrip. Code that sets and reads it within one roundtrip works; the same code one roundtrip later dereferences a null reference. Judged only where the answer is known: a class of the checked paths whose whole chain - its superclasses and the interfaces of each, and the interfaces those include - is in the paths and implements neither `if_serializable_object` nor `z2ui5_if_app` (which includes it), and the framework classes known not to be serializable, today `z2ui5_cl_ui5_view_builder`. Not reported: a class the run does not hold (SAP standard, an addon outside the paths - unknown is not "not serializable"), a `REF TO` an interface, `REF TO data` and `REF TO object`, `REF TO z2ui5_if_client` (`client-handle-capture`), `CLASS-DATA`, and an attribute of a class that is not an app.',
  example: `CLASS zcl_my_app DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
  PROTECTED SECTION.
    DATA mo_form TYPE REF TO z2ui5_cl_ui5_view_builder.   " initial on the next roundtrip
ENDCLASS.`,
  remedy: `METHOD view_display.
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).   " a local, built per roundtrip
  client->view_display( view->stringify( ) ).
ENDMETHOD.`,
});
