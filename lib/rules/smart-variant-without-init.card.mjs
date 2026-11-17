import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'smart-variant-without-init',
  summary: 'a SmartVariantManagement without the `smart_variant_init` handshake',
  detail: 'sap.ui.comp variant management needs a controller\'s `initialise( )` call before it knows the control it personalizes; in abap2UI5 that call is the `cs_event-smart_variant_init` wire, sent with the SmartVariantManagement id (and optionally the personalizable control\'s). Without it the control keeps no personalizable control, saving a view fails inside sap.ui.fl and stored variants are never loaded — nothing red anywhere, the variant simply does not come back. A classic FilterBar makes the same handshake through `cs_event-filter_bar_variant_init` (SmartVariantManagement id, FilterBar id), which registers the bar and then calls `initialise( )` - either wire satisfies the rule. Judged off the class\'s own id map: a SmartVariantManagement in any of its views, and no wire naming either action anywhere in the class. The action waits for the smart control\'s registration itself, so it belongs on the display path, not after a delay.',
  example: `view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->a( n = \`xmlns:smartvariants\` v = \`sap.ui.comp.smartvariants\`
    )->tag( n = \`SmartVariantManagement\` ns = \`smartvariants\` )->a( n = \`id\` v = \`pageVariant\` ).`,
  remedy: `view->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->a( n = \`xmlns:smartvariants\` v = \`sap.ui.comp.smartvariants\`
    )->tag( n = \`SmartVariantManagement\` ns = \`smartvariants\` )->a( n = \`id\` v = \`pageVariant\` ).
client->follow_up_action( val = client->cs_event-smart_variant_init t_arg = VALUE #( ( \`pageVariant\` ) ) ).`,
});
