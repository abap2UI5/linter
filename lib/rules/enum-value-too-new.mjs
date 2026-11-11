import { defineRule } from '../rule.mjs';
import { withinFloor } from '../ui5-meta.mjs';

/* Called for a value of the closed set (invalid-property-value accepted
 * it); `tooNewMembers` are the attributes member-too-new reported - their
 * values are not judged a second time. */
function check({ allowed, attr, control, data, floor, minUi5, offset, tooNewMembers, type, value, report }) {
  const written = value;
  const at = allowed.indexOf(written);
  const enums = data.__enums || {};
  const enumSince = data.__enumSince || {};
  /* The value exists — but since WHEN? An enum VALUE introduced after
   * the floor was invisible to every gate (the member-level @since sits
   * on the property, not the value) — samples-controls carried this as a
   * documented residual limit and a by-policy manual check. The
   * generator now keeps the per-value @since from the enum's JSDoc.
   * Keyed by the runtime VALUE, which is what the attribute parses to -
   * so the written key is translated back through the same index. */
  const since = enumSince[type]?.[enums[type]?.[at] ?? written];
  if (since && !withinFloor(since, floor) && !tooNewMembers.has(`${offset}:${attr}`)) {
    report({
      control, member: attr, value: written, memberType: type, since, minUi5, offset,
    });
  }
}

export default defineRule({
  id: 'enum-value-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'an enum VALUE introduced after your target version',
  detail: 'The property predates version tracking, the type is old — but the specific value is not: `sap.m.ButtonType.Critical` is @since 1.73 on a property that existed forever. The member-level `@since` sits on the property, never on the value, so this was invisible to every gate (and a documented manual-check burden downstream). The snapshot now keeps the per-value `@since` from the enum\'s JSDoc; a value without one predates version tracking and stays silent. Waive a deliberate case with `--allow sap.m.Control.member`, like the other floor rules.',
  example: 'view->tag( `Button` )->a( n = `type` v = `Critical` )   " @since 1.73 on a 1.71 target',
  remedy: 'view->tag( `Button` )->a( n = `type` v = `Reject` )   " in 1.71',
  message: (f) => `${f.control} ${f.member}="${f.value}" is @since ${f.since} — the enum value is newer than the ${f.minUi5} floor`,
  check,
});
