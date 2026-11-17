import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'icon-removed',
  summary: 'an icon that left the font again',
  detail: 'The font is nearly, but not quite, additive. `binary` was in the font for exactly one release — 1.104 — and gone again after it; the glyph is spelled `non-binary` (in the font since 1.96) everywhere else. A view written against that one release renders no icon on every release after it. Since a target version is a **floor**, the app also runs on the releases where the name is gone, which is why this is reported independently of the target.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://binary` )   " in the font for 1.104 only',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://source-code` )',
});
