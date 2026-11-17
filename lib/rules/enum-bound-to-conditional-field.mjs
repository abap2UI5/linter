import { defineRule } from '../rule.mjs';
import { bindingPath } from '../binding-paths.mjs';

function check({ attr, conditionalFields, enums, full, member, offset, value, report }) {
  /* The branch half of enum-bound-to-initial-field. That rule reports an
   * enum-typed property bound to a root field nothing on the start path
   * seeds; a field seeded in ONE arm of an IF (or a CASE without WHEN
   * OTHERS, or inside a LOOP) used to count as seeded, because the start
   * path was read as one flat text. It is initial whenever the other arm is
   * taken - samples-stack app 013's shape, one branch further in. A warning,
   * not an error: whether the other arm is taken on the first display is a
   * runtime matter (an IF on a parameter that is always set), and the
   * reader of the condition knows that, this rule does not.
   * conditionalFields is null for every document the first display does
   * not show, as initialFields is. */
  if (!conditionalFields?.size || member.set !== 'properties' || !enums[member.decl?.type]) return;
  const ip = bindingPath(value);
  const seg = ip && /^\/[A-Z_][A-Z0-9_]*$/.test(ip) ? ip.slice(1) : null;
  if (seg && conditionalFields.has(seg)) {
    report({ control: full, member: attr, value: seg, memberType: member.decl.type, offset });
  }
}

export default defineRule({
  id: 'enum-bound-to-conditional-field',
  severity: 'warning',
  category: 'bindings',
  scope: 'node',
  message: (f) => `${f.control} ${f.member} binds ${f.value}, which the start path seeds only in some of its branches — whenever another branch runs, the first display ships "", which is no ${f.memberType}, and validateProperty terminates the app. Give the attribute a start value (DATA ${String(f.value).toLowerCase()} TYPE string VALUE \`…\`) or seed it in every arm (an ELSE, a WHEN OTHERS)`,
  check,
});
