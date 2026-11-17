import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'enum-value-too-new',
  summary: 'an enum VALUE introduced after your target version',
  detail: 'The property predates version tracking, the type is old — but the specific value is not: `sap.m.ButtonType.Critical` is @since 1.73 on a property that existed forever. The member-level `@since` sits on the property, never on the value, so this was invisible to every gate (and a documented manual-check burden downstream). The snapshot now keeps the per-value `@since` from the enum\'s JSDoc; a value without one predates version tracking and stays silent. Waive a deliberate case with `--allow sap.m.Control.member`, like the other floor rules.',
  example: 'view->tag( `Button` )->a( n = `type` v = `Critical` )   " @since 1.73 on a 1.71 target',
  remedy: 'view->tag( `Button` )->a( n = `type` v = `Reject` )   " in 1.71',
});
