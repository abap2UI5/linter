import { defineRule } from '../rule.mjs';

/* Called for an attribute the reconstructor dropped (`unresolvedAttrs`)
 * whose conditional is not all literals - `decl` is the property's
 * declaration, if it is one. */
function check({ attr, data, decl, full, node, report }) {
  /* …and SAY that the value was dropped, where dropping it lost a real
   * check rather than merely a value nobody judges.
   *
   * The version pass (member-too-new) is what a dropped attribute costs in the
   * common case, and it is paid. What it cannot pay for is a CLOSED
   * SET: an enum-typed property is the one member whose value the gate
   * would otherwise have decided outright (`invalid-property-value`),
   * and a `COND #( )` behind it means UI5 gets a string this gate never
   * saw. That is a blind spot worth one line, and the reader is the
   * only one who can close it.
   *
   * Scoped to enum-typed properties on purpose. Reporting every
   * unresolved attribute would name a blind spot on almost every
   * conditional attribute in a corpus, which is a statistic, not a
   * finding — and this family's whole precision argument is that a
   * rule lighting up the corpus is wrong before the corpus is. */
  if (decl?.type && (data.__enums || {})[decl.type]) {
    report({
      control: full, member: attr,
      memberType: decl.type, offset: node.offset ?? 0,
    });
  }
}

export default defineRule({
  id: 'unresolved-attribute-value',
  severity: 'hint',
  category: 'metadata',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} is written with a value this gate cannot follow, so the ${f.memberType} it declares is NOT checked — UI5 rejects a value outside that enum and takes the view down, and the check that would have caught it was dropped with the value`,
  check,
});
