import { defineRule } from '../rule.mjs';
import { bindingPath, relativePath } from '../binding-paths.mjs';

function check({ attr, bindings, ctx, full, member, offset, value, report }) {
  /* A property whose hand-written setter THROWS, bound to a field that
   * arrives as the ABAP initial 0.
   *
   * The declared type is not the whole domain: UI5 lets a control write
   * its own `setXxx`, and a few of them refuse a value the type allows
   * — `sap.ui.unified.RecurringCalendarAppointment` declares
   * `recurrencePattern` as `int` and throws for anything below 1. An
   * unfilled ABAP `TYPE i` serializes as exactly that 0, and
   * `ManagedObject.updateProperty` rethrows anything that is not a
   * FormatException, so the WHOLE render dies rather than this one
   * property being dropped. Reported by a user on UI5 1.150.
   *
   * Its own block rather than a line inside the one below, because it
   * has to resolve a RELATIVE path against the row as well: the shape
   * that actually breaks is a row template, where the attribute cannot
   * be omitted per row. Widening the block below would have started
   * judging every relative binding with the two rules already in it.
   *
   * The snapshot carries the setter's LOWER BOUND, not the bare fact
   * that it throws, and that is what makes the rule quiet: 23
   * properties throw somewhere in their setter, and for most of them
   * the initial 0 is perfectly legal (`MonthPicker.month` 0 is
   * January; `TimesRow.intervalMinutes` guards `>= 720`). Only a guard
   * of the shape `if (v < N) throw` is harvested, which is exactly
   * what makes an unfilled ABAP field illegal — two properties in the
   * whole snapshot. A field the seed fills with an accepted number is
   * never reported, and an OPAQUE row resolves to nothing at all. */
  if (member.decl?.setterMin !== undefined && bindings) {
    const abs = bindingPath(value);
    const rel = abs ? null : (ctx ? relativePath(value) : null);
    const from = abs ? bindings : ctx?.row;
    const p = abs || rel;
    let at = p && from ? from : undefined;
    if (p && from) {
      for (const seg of p.split('/').filter(Boolean)) {
        at = at && typeof at === 'object' ? at[seg] : undefined;
      }
    }
    if (typeof at === 'number' && at < member.decl.setterMin) {
      report({
        control: full, member: attr, value: p,
        count: member.decl.setterMin, offset,
      });
    }
  }
}

export default defineRule({
  id: 'validating-setter-out-of-range',
  severity: 'error',
  category: 'data',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} refuses anything below ${f.count}, and '${f.value}' reaches it as the ABAP initial 0 — the setter throws, ManagedObject.updateProperty rethrows anything that is not a FormatException, and the WHOLE render dies rather than this one property being dropped; seed the field with a value the setter accepts`,
  check,
});
