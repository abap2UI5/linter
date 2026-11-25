import { defineRule } from '../rule.mjs';
import { relativeBindings } from '../binding-paths.mjs';

function check({ attr, bindings, boundElement, ctx, full, member, node, offset, ownerControl, rootFields, value, report }) {
  /* A relative {FIELD} on a control with NO binding context at all.
   * JSONModel._getObject resolves a relative path against the
   * context and returns undefined when there is none - so the
   * control renders EMPTY, silently. Reported only when the name is
   * a field of the model ROOT, which is the flattened-element-binding
   * case (the original did bindElement('/Coll/0'), the port seeded
   * that record at the root and kept the relative form): there the
   * intent is unambiguous and client->_bind( field ) is the fix. A
   * name the root does not have is left to unknown-binding-path, and
   * a popup whose context arrives at runtime through the
   * bind_element action binds ROW fields, which are not root fields. */
  /* The same question on a PROPERTY, over every shape a property
   * binding takes (`relativeBindings`), and every one of them is
   * equally dead: `Model.resolve` with no context returns undefined
   * for all four.
   *
   * Two arms, because the EVIDENCE differs even though the verdict
   * does not. A name the class declares at the model ROOT is the
   * flattened-element-binding case (the original did
   * bindElement('/Coll/0'), the port seeded that record at the root
   * and kept the relative form) - unambiguous, and the fix is
   * client->_bind( field ). A name the root does NOT have used to be
   * "left to unknown-binding-path", except that rule's relative arm
   * needs a `ctx` to check the name against and there is none here
   * by construction - so it fell between the two rules and was
   * accepted in silence, which is the blankest binding there is. It
   * is reported too, under the stricter gate below: the VERDICT does
   * not depend on rootFields at all (a slashless path with no
   * context resolves against nothing whatever the name is), only the
   * confidence THAT THERE IS NO CONTEXT does - and that is what
   * inBoundAgg and boundElement answer.
   *
   * `boundElement` is the slot this class element-binds at runtime
   * (cs_event-bind_element): every relative path in THAT document
   * resolves against a row the document never names, which is the
   * entire point of the idiom and invisible to a static walk. */
  if (!bindings || node.guessedAttrs?.has(attr)) return;
  /* Below a control the snapshot does not know (an `opaque` owner) the
   * context is not known either: that control may be a row template's
   * column, or bind a context itself. "Unknown" is not "none" (rule 5) -
   * an EWM app suite's sap.ui.table Column, its `table:` prefix declared by
   * a helper after stringify( ), reported every cell of its template. */
  if (ownerControl?.opaque) return;
  if (!ctx && !ownerControl?.inTemplate && member.set !== 'aggregations') {
    for (const orphan of relativeBindings(value)) {
      const known = rootFields?.has(orphan.split('/')[0]);
      if (known ? boundElement
        : (boundElement || ownerControl?.inBoundAgg || !rootFields)) continue;
      report({
        control: full, member: attr, value: orphan, offset,
      });
    }
  }
}

export default defineRule({
  id: 'relative-binding-without-context',
  severity: 'error',
  category: 'data',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} binds {${f.value}} relatively, but the control has no binding context — the model resolves it against nothing and the control renders empty; bind the root field with client->_bind( )`,
  check,
});
