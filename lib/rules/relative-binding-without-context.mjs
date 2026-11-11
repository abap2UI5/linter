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
  summary: 'a relative `{FIELD}` on a control that has no binding context',
  detail: 'A relative binding is resolved against the control\'s binding context. Inside a bound aggregation that context is the row; outside one there is none, and `JSONModel._getObject` returns `undefined` — the control renders **empty**, with no error anywhere. This is the flattened-element-binding trap: the original did `bindElement(\'/Coll/0\')`, the port seeded that record at the model root and kept the relative `{FIELD}`. Bind the root field instead (`client->_bind( field )`). **All four shapes a property binding takes are judged**, not only the bare `{NAME}` the rule started on: the composite `{STREET} {HOUSENUMBER}`, the complex `{ path: \'PRICE\', type: … }` and the expression `{= ${STATUS} ? … }` each resolve slashless paths against the same missing context and render just as blank. The composite is the shape that pays for the rest — samples-controls app 592 shipped 42 dead address bindings across 21 sections in it, over correctly declared root fields, past a green gate, because the matcher was anchored `^{NAME}$`. A name the model root does NOT have is reported too: the verdict never depended on the name (a slashless path with no context resolves against nothing whatever it says), only the confidence that there is no context does — so that arm additionally stays silent under a bound aggregation whose row shape could not be resolved. Four things ARE a context and none of them is reported: an enclosing bound aggregation, a per-row **template** aggregation (`template`, `rowActionTemplate`, `rowSettingsTemplate` — UI5 clones them per row and the context comes from the parent\'s own rows binding in a sibling aggregation), a `binding="{/PATH}"` attribute (a ManagedObject special setting handed to `bindObject( )` — the declarative form of the wire below), and a `cs_event-bind_element` wire, which is scoped to **the one view slot it names**: one popup wire used to disarm the check for every document of the class, main slot included.',
  example: 'a( n = `title` v = `{NAME}` )   " NAME is a root field -> renders empty',
  remedy: 'a( n = `title` v = client->_bind( name ) )',
  message: (f) => `${f.control} ${f.member} binds {${f.value}} relatively, but the control has no binding context — the model resolves it against nothing and the control renders empty; bind the root field with client->_bind( )`,
  check,
});
