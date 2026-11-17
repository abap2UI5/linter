import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'validating-setter-out-of-range',
  summary: 'a property whose setter refuses low values, bound to a field that arrives as `0`',
  detail: 'The declared type is not the whole domain. UI5 lets a control write its own `setXxx`, and a few of them refuse a value the type allows — `sap.ui.unified.RecurringCalendarAppointment` declares `recurrencePattern` as `int` and throws for anything below 1. An unfilled ABAP `TYPE i` serializes as exactly that `0`, and `ManagedObject.updateProperty` rethrows anything that is not a `FormatException`, so the WHOLE render dies rather than this one property being dropped. Reported by a user on UI5 1.150. What keeps the rule quiet is that the snapshot carries the setter\'s LOWER BOUND rather than the bare fact that it throws: 23 properties throw somewhere in their setter, and for most of them the initial `0` is perfectly legal (`MonthPicker.month` 0 is January, `TimesRow.intervalMinutes` guards `>= 720`). Only a guard of the shape `if (v < N) throw` is harvested — exactly what makes an unfilled ABAP field illegal — which is two properties in the whole snapshot. A field the seed fills with an accepted number is never reported, and an opaque row resolves to nothing at all.',
  example: `TYPES: BEGIN OF ty_appointment, title TYPE string, recurrence_pattern TYPE i, END OF ty_appointment.
DATA t_appointments TYPE STANDARD TABLE OF ty_appointment WITH DEFAULT KEY.
t_appointments = VALUE #( ( title = \`Review\` ) ).   " recurrence_pattern unseeded -> 0
view->ele( n = \`CalendarRow\` ns = \`u\` )->a( n = \`appointments\` v = client->_bind( t_appointments )
    )->ele( n = \`appointments\` ns = \`u\`
        )->ele( n = \`RecurringCalendarAppointment\` ns = \`u\`
            )->a( n = \`title\` v = \`{TITLE}\`
            )->a( n = \`recurrencePattern\` v = \`{RECURRENCE_PATTERN}\` )`,
  remedy: `TYPES: BEGIN OF ty_appointment, title TYPE string, recurrence_pattern TYPE i, END OF ty_appointment.
DATA t_appointments TYPE STANDARD TABLE OF ty_appointment WITH DEFAULT KEY.
t_appointments = VALUE #( ( title = \`Review\` recurrence_pattern = 1 ) ).
view->ele( n = \`CalendarRow\` ns = \`u\` )->a( n = \`appointments\` v = client->_bind( t_appointments )
    )->ele( n = \`appointments\` ns = \`u\`
        )->ele( n = \`RecurringCalendarAppointment\` ns = \`u\`
            )->a( n = \`title\` v = \`{TITLE}\`
            )->a( n = \`recurrencePattern\` v = \`{RECURRENCE_PATTERN}\` )`,
});
