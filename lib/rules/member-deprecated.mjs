import { defineRule, short } from '../rule.mjs';
import { deprecationApplies, deprecationSince, deprecationWithinHorizon, replacementOf } from '../ui5-meta.mjs';

function check({ attr, data, floor, full, horizon, member, offset, reportAfterTarget, report }) {
  if (member.decl?.deprecated && deprecationApplies(member.decl.deprecated, floor)) {
    report({
      control: full,
      member: attr,
      deprecated: member.decl.deprecated,
      offset,
    });
  } else if (member.decl?.deprecated && deprecationWithinHorizon(member.decl.deprecated, horizon)) {
    reportAfterTarget({
      kind: 'member', control: full, member: attr, since: deprecationSince(member.decl.deprecated),
      deprecated: member.decl.deprecated, offset,
    }, replacementOf(data, full, member.decl.deprecated));
  }
}

export default defineRule({
  id: 'member-deprecated',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'property or event already deprecated at your target version',
  detail: 'As `control-deprecated`, per member. The replacement is usually named in the deprecation text the finding quotes.',
  example: 'view->tag( `Bar` )->a( n = `translucent` v = `true` )   " deprecated since 1.18.6',
  remedy: 'view->tag( `Bar` )   " the property has no effect any more - drop it',
  message: (f) => `${f.control} ${f.member} is deprecated (${short(f.deprecated?.text || f.deprecated, 70)})`,
  check,
});
