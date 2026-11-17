import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-icon',
  summary: '`sap-icon://textFormatting` — a glyph the font has in no release',
  detail: 'An unknown icon name is not an error anywhere: `IconPool` resolves it at render time, finds nothing, and the control renders with **no icon at all**. Nothing is logged — not in the browser console, not in ui5lint, not in abaplint — so it ships and surfaces months later as "not all icons are shown". Case matters and not in the way it looks: `IconPool.getIconInfo` parses the URI and reads `parts.hostname`, which is lower-cased, so `textFormatting` is not "nearly right" — it matches nothing, in every release, forever. The name is `text-formatting`. Judged against `data/icons.json`, the icon registry of every OpenUI5 minor from 1.71 up; a collection-qualified name (`sap-icon://tnt/actor`) belongs to a custom font and is never judged.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://textFormatting` )',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://text-formatting` )',
  fixNote: 'Where exactly one glyph of the font is the written name up to letter case and hyphens — `textFormatting` for `text-formatting`, the camelCase miss the message describes — the finding names it and `--fix` rewrites the name after `sap-icon://`. Wherever the name is written: an attribute value, a constant, a row of a status table.',
});
