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
  summary: 'an enum-typed attribute whose value the reconstructor could not follow',
  detail: 'A builder attribute written with a value this gate cannot resolve — a `COND #( )`, a variable, a concatenation — is DROPPED from the reconstructed document, so every rule downstream is blind to it. That blind spot is mostly paid for: the attribute NAME is still known, which is all a version check needs, so `member-too-new` judges it anyway. What cannot be paid for is a CLOSED SET. An enum-typed property is the one member whose value the gate would otherwise have decided outright, and UI5 rejects a value outside the enum by taking the whole view down — so the one check that mattered here went with the value. Deliberately scoped to enum-typed properties: reporting every unresolved attribute would name a blind spot on almost every conditional attribute in a corpus, which is a statistic rather than a finding. A `COND #( )` or `SWITCH #( )` whose every branch is a literal and which has an `ELSE` is not a blind spot: each of its values is judged the way a literal is (`invalid-property-value` names a wrong one), and nothing is said when all of them pass. Nor is a name the class writes exactly once, with a string template: its value is the template\'s, resolved where the name is used.',
  example: 'view->tag( `Button` )->a( n = `type` v = COND #( WHEN ok THEN `Accept` ELSE mv_type ) )   " ButtonType, unchecked',
  remedy: 'view->tag( `Button` )->a( n = `type` v = client->_bind( button_type ) )   " …and set BUTTON_TYPE to a ButtonType in ABAP',
  message: (f) => `${f.control} ${f.member} is written with a value this gate cannot follow, so the ${f.memberType} it declares is NOT checked — UI5 rejects a value outside that enum and takes the view down, and the check that would have caught it was dropped with the value`,
  check,
});
