import { defineRule } from '../rule.mjs';

function check({ controlIds, src, report }) {
  /* A sap.ui.comp SmartVariantManagement in the view with no
   * `cs_event-smart_variant_init` wire in the class. A controller would call
   * initialise( ) on it; without the handshake the control keeps no
   * personalizable control, saving a view fails inside sap.ui.fl and stored
   * variants are never loaded - nothing red, the variant just does not come
   * back. Read off the class's own id map (the control needs an id for the
   * wire anyway), so a class that builds ids at runtime is not judged.
   * `filter_bar_variant_init` is the same handshake for a classic FilterBar:
   * the frontend action (z2ui5_cl_ui5f_variants_js) registers the bar with
   * the variant management and then calls its initialise( ) - so a class
   * wiring that one was reported for a handshake it makes (samples-stack
   * app 493). */
  const smart = Object.entries(controlIds ?? {}).filter(([, c]) => /\.SmartVariantManagement$/.test(c));
  if (smart.length && !/cs_event-(?:smart|filter_bar)_variant_init\b|[`'](?:SMART|FILTER_BAR)_VARIANT_INIT[`']/i.test(src)) {
    const at = src.search(/SmartVariantManagement/);
    report({ member: smart[0][0], control: smart[0][1], offset: at === -1 ? 0 : at });
  }
}

export default defineRule({
  id: 'smart-variant-without-init',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a SmartVariantManagement without the `smart_variant_init` handshake',
  detail: 'sap.ui.comp variant management needs a controller\'s `initialise( )` call before it knows the control it personalizes; in abap2UI5 that call is the `cs_event-smart_variant_init` wire, sent with the SmartVariantManagement id (and optionally the personalizable control\'s). Without it the control keeps no personalizable control, saving a view fails inside sap.ui.fl and stored variants are never loaded — nothing red anywhere, the variant simply does not come back. A classic FilterBar makes the same handshake through `cs_event-filter_bar_variant_init` (SmartVariantManagement id, FilterBar id), which registers the bar and then calls `initialise( )` - either wire satisfies the rule. Judged off the class\'s own id map: a SmartVariantManagement in any of its views, and no wire naming either action anywhere in the class. The action waits for the smart control\'s registration itself, so it belongs on the display path, not after a delay.',
  example: `view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->a( n = \`xmlns:smartvariants\` v = \`sap.ui.comp.smartvariants\`
    )->tag( n = \`SmartVariantManagement\` ns = \`smartvariants\` )->a( n = \`id\` v = \`pageVariant\` ).`,
  remedy: `view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->a( n = \`xmlns:smartvariants\` v = \`sap.ui.comp.smartvariants\`
    )->tag( n = \`SmartVariantManagement\` ns = \`smartvariants\` )->a( n = \`id\` v = \`pageVariant\` ).
client->follow_up_action( val = client->cs_event-smart_variant_init t_arg = VALUE #( ( \`pageVariant\` ) ) ).`,
  message: (f) => `${f.control} '${f.member}' is in the view but nothing sends cs_event-smart_variant_init (or filter_bar_variant_init, for a classic FilterBar) — without the initialise( ) handshake the control keeps no personalizable control, saving a variant fails inside sap.ui.fl and stored variants never load; wire client->follow_up_action( val = client->cs_event-smart_variant_init t_arg = VALUE #( ( \`${f.member}\` ) ) ) on the display path`,
  check,
});
