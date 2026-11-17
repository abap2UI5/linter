import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'deprecated-library',
  summary: 'a UI5 library SAP deprecated in its entirety',
  detail: 'Five libraries are deprecated whole rather than control by control: `sap.ui.commons` and `sap.ui.ux3` (1.38), `sap.makit` (1.38), `sap.me` (1.34), and the legacy chart classes directly under `sap.viz.ui5` (1.32 — `sap.viz.ui5.controls.VizFrame` is the replacement and is not reported). None of them is in the metadata snapshot every other rule reads, because the harvest only carries what current UI5 documents — so before this rule a view out of `sap.ui.commons` was not merely unjudged, it was invisible, and that is the one library it actually happens with: half its control names (`Button`, `Label`, `Dialog`, `Panel`, `ComboBox`) also exist in `sap.m`, so XML copied from an old tutorial drags the dead namespace along and still renders something. The list is hand-maintained for the same reason it is needed: it cannot be regenerated from data the snapshot does not carry. Held against your target release like any other deprecation — below the deprecating version nothing is reported.',
  example: 'view->tag( n = `Button` ns = `c` )   " xmlns:c="sap.ui.commons" — gone since 1.38',
  remedy: 'view->tag( `Button` )   " sap.m, the library that replaced it',
});
