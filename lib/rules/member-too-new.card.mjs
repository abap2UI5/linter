import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'member-too-new',
  summary: 'property, event or aggregation introduced after your target version',
  detail: 'Same as `control-too-new`, one level down. Members without an `@since` count as always available — they predate version tracking. Waive with `--allow sap.m.Control.member`. A member that shipped with a base class younger than the control (a base class UI5 extracted later, taking the member with it) is dated at the control\'s own release.',
  example: 'view->tag( `GenericTile` )->a( n = `systemInfo` v = `PRD` )   " @since 1.92',
  remedy: 'view->tag( `GenericTile` )->a( n = `header` v = `PRD` )   " or raise the floor: "ui5": "1.92"',
});
