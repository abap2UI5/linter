import { defineRule } from '../rule.mjs';
import { displayPathMethods, methodSpans } from '../abap-source.mjs';

/* Judged once per class, after checkFrontendWires( ) has collected the
 * candidate setters (`stateWires`): the verdict is not a property of one
 * wire but of the whole class. */
function check({ src, stateWires, report }) {
  /* The inverse of settable-property-via-action, and precisely its blind spot: a
   * `set…( )` whose value CANNOT be bound.
   *
   * Three shapes qualify, and none of them can travel in the model:
   * an ASSOCIATION (`setNextStep`, `setSelectedSection`, `setActivePage`,
   * `setCurrentStep`), a FUNCTION-typed property (`setAsyncURLHandler`),
   * and a method that is no member at all (`setBadgeMinValue` — sap.m.Button
   * declares `badgeStyle` as its only badge property and keeps the bounds in
   * private fields). `settable-property-via-action` is silent for all three,
   * on purpose, because "bind it instead" is not available.
   *
   * What is available is re-issuing the call. A bound property survives a
   * rebuild because the binding re-applies; live control state does not —
   * `view_display( )` destroys the slot and `XMLView.create` builds a new
   * control tree from the XML. So a class that sets such state from an event
   * handler and never re-issues it from the display path loses it on the
   * next rebuild (a draft restore, a called app handing control back, any
   * later `view_display( )`), while the ABAP field describing it survives as
   * class state — and the app then claims a state it does not show.
   *
   * Two conditions keep it quiet, both measured on the 637-file corpus:
   *
   *   - the VALUE has to be non-literal. A constant carries no class state,
   *     so there is nothing for the rebuilt view to contradict:
   *     `setCurrentStep( 'ProductInfoStep' )` is a one-shot corrective jump
   *     and `setSelectedSection( '' )` a reset to null — both are right
   *     exactly once, and re-issuing either from view_display( ) would be
   *     the defect.
   *   - the control has to be resolvable, or the member has to be bindable
   *     on NO control in the snapshot. An unresolved id falls back to that
   *     global answer rather than to a guess.
   *
   * ORDER before the argument checks below: this is about the wire's place
   * in the class, not about its payload. */
  /* The rebuild-survival verdict (the candidates checkFrontendWires( ) collected, `stateWires`). A wire
   * is silent when its own method is on the display path, or when the SAME
   * target (id + setter) is issued from a method that is — app 249's remedy,
   * where view_display( ) re-sends setBadgeMinValue/MaxValue from the accepted
   * bounds it kept as class state.
   *
   * A method that displays a POPUP or POPOVER counts too, and that is not a
   * concession: a control-call queued in the same roundtrip as a display runs
   * AFTER it (View1._runSystemActions is awaited before the T_CUSTOM phase
   * runs), so such a wire lands on the freshly built fragment by construction. */
  if (!stateWires.length) return;
  const onDisplayPath = displayPathMethods(src);
  const spans = methodSpans(src);
  const methodOf = (at) => spans.find((s) => at >= s.from && at < s.to)?.name ?? null;
  const reissued = new Set();
  for (const w of stateWires) {
    w.method = methodOf(w.offset);
    if (w.method && onDisplayPath.has(w.method)) reissued.add(`${w.id ?? ''}|${w.setter}`);
  }
  for (const w of stateWires) {
    if (w.method && onDisplayPath.has(w.method)) continue;
    if (reissued.has(`${w.id ?? ''}|${w.setter}`)) continue;
    report({
      control: w.control ?? 'CONTROL_BY_ID', member: w.setter,
      ...(w.id ? { value: w.id } : {}), offset: w.offset,
    });
  }
}

export default defineRule({
  id: 'control-state-lost-on-rebuild',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'app',
  message: (f) => `${f.member}( )${f.value ? ` on '${f.value}'` : ''} sets live ${f.control === 'CONTROL_BY_ID' ? 'control' : f.control} state no binding can carry, and only a handler off the display path issues it — view_display( ) destroys the slot and XMLView.create rebuilds the control tree, so the value is gone on the next rebuild while the ABAP field describing it survives. Re-issue the call from the method that displays the view`,
  check,
});
