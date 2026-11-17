import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'enum-field-unset-on-insert',
  summary: 'a row built at runtime without a field the view binds to an enum — the empty string takes the view down',
  detail: 'The demo-kit originals push a JS object with the key **absent**, and UI5 falls back to the property default. ABAP has no absent: an unset field ships as `""`, which is not a member of any enum, so `ManagedObject.validateProperty` throws — and `ManagedObjectBindingSupport` re-throws anything that is not a `FormatException`, so the binding update dies and takes the view with it. Both repairs are already in the framework: seed the default (`type = \'None\'`), or name the field in `omit_initial_paths`. Three construction sites are judged, because a port picks between them for reasons that have nothing to do with this defect: an `INSERT`/`APPEND` of a `VALUE #( … )` literal, the `t = VALUE #( ( … ) ( … ) )` seed a `model_init` writes (including the nested `elements = VALUE #( … )` inside one), and a row assembled in a work area and inserted a few statements later. A row copied wholesale — `VALUE #( FOR row IN t_all … ( row ) )` — has no field list to read and is not judged. Fields are keyed on the table each **bound aggregation** names, absolute (`{/T_PAGES}`) and relative (`{path: \'T_APPOINTMENTS\'}`) alike, and each key gets only the fields of its OWN row template: a PlanningCalendar binds `rows`, `specialDates` and a nested `appointments` at once, and only the innermost carries `ariaHasPopup`. Not reported where the class fills the field afterwards — a `LOOP … r->state = …` completing a seed is how half this corpus moves an original\'s frontend formatter server-side — nor for a mixed-case path, which is not an ABAP component name at all (`type="{Text}"` is the demo kit\'s own quirk, ported verbatim: it resolves to nothing, so UI5 keeps the default). The widening came from a corpus sweep in 2026-08, where the `INSERT`-only reading had missed ten real defects across seven ports, every one of which took its view down.',
  example: `TYPES: BEGIN OF ty_appointment, title TYPE string, type TYPE string, END OF ty_appointment.
DATA t_appointments TYPE STANDARD TABLE OF ty_appointment WITH DEFAULT KEY.
INSERT VALUE #( title = \`New\` ) INTO TABLE t_appointments.   " type unset -> "" -> throws
view->ele( n = \`CalendarRow\` ns = \`u\` )->a( n = \`appointments\` v = client->_bind( t_appointments )
    )->ele( n = \`appointments\` ns = \`u\`
        )->ele( n = \`CalendarAppointment\` ns = \`u\`
            )->a( n = \`title\` v = \`{TITLE}\`
            )->a( n = \`type\` v = \`{TYPE}\` )`,
  remedy: `TYPES: BEGIN OF ty_appointment, title TYPE string, type TYPE string, END OF ty_appointment.
DATA t_appointments TYPE STANDARD TABLE OF ty_appointment WITH DEFAULT KEY.
INSERT VALUE #( title = \`New\` type = \`Type01\` ) INTO TABLE t_appointments.
view->ele( n = \`CalendarRow\` ns = \`u\` )->a( n = \`appointments\` v = client->_bind( t_appointments )
    )->ele( n = \`appointments\` ns = \`u\`
        )->ele( n = \`CalendarAppointment\` ns = \`u\`
            )->a( n = \`title\` v = \`{TITLE}\`
            )->a( n = \`type\` v = \`{TYPE}\` )`,
});
