import { defineRule } from '../rule.mjs';

function check({ node, parentKind, ownerControl, report }) {
  /* An aggregation must sit inside a CONTROL. One directly inside another
   * aggregation is invalid XML and the signature of a missing shut( ):
   * the tag lands in the wrong place, and UI5 goes looking for a control
   * class by that name ("failed to load sap/ui/table/footer.js"). */
  if (parentKind === 'aggregation') {
    report({
      control: ownerControl?.control ?? '(unknown control)',
      member: node.name,
      parentAggregation: ownerControl?.aggregation,
      offset: node.offset,
    });
  } else if (parentKind === 'root') {
    report({
      control: '(view root)',
      member: node.name,
      offset: node.offset,
    });
  }
}

export default defineRule({
  id: 'aggregation-in-aggregation',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  message: (f) => {
    return f.parentAggregation
      ? `${f.member} is an aggregation nested directly inside the aggregation ${f.parentAggregation} of ${f.control} — a missing shut( )?`
      : `${f.member} is an aggregation sitting at the view root — an aggregation belongs inside a control`;
  },
  check,
});
