import { defineRule } from '../rule.mjs';
import { sinceOf, withinFloor } from '../ui5-meta.mjs';

/* Called for every attribute the document carries, and for every one the
 * reconstructor had to drop (`unresolvedAttrs`): the NAME is known even
 * when the value is not, and that is all a version check needs. Returns
 * whether it reported. */
function check({ attr, data, floor, full, minUi5, offset, report }) {
  const since = sinceOf(data, full, attr);
  if (!since || withinFloor(since, floor)) return false;
  report({ control: full, member: attr, since, minUi5, offset });
  return true;
}

export default defineRule({
  id: 'member-too-new',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'property, event or aggregation introduced after your target version',
  detail: 'Same as `control-too-new`, one level down. Members without an `@since` count as always available — they predate version tracking. Waive with `--allow sap.m.Control.member`. A member that shipped with a base class younger than the control (a base class UI5 extracted later, taking the member with it) is dated at the control\'s own release.',
  example: 'view->tag( `GenericTile` )->a( n = `systemInfo` v = `PRD` )   " @since 1.92',
  remedy: 'view->tag( `GenericTile` )->a( n = `header` v = `PRD` )   " or raise the floor: "ui5": "1.92"',
  message: (f) => `${f.control} ${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`,
  check,
});
