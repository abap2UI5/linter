import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called by checkIcons( ) (lib/icons.mjs) for every literal sap-icon://
 * name, in ABAP and in view XML alike; returns whether it reported - the
 * name is then not judged further. */
function check({ written, since, offset, at, data, report }) {
  /* Not in any release the scan covers. The name is wrong — a typo, or
   * camelCase for a hyphenated name. Reported whatever the target is:
   * there is no release on which it renders. */
  /* did you mean: the one glyph this is up to case and hyphens —
   * `textFormatting` for `text-formatting`, the camelCase miss the
   * message already describes. The fix rewrites the name in place. */
  if (since !== undefined) return false;
  const suggestion = caseMatch(written, data.since.keys());
  report({
    value: written, offset,
    ...(suggestion ? { written, suggestion, fixes: [{ start: at, end: at + written.length, text: suggestion }] } : {}),
  });
  return true;
}

export default defineRule({
  id: 'unknown-icon',
  severity: 'error',
  category: 'version',
  scope: 'app',
  summary: '`sap-icon://textFormatting` — a glyph the font has in no release',
  detail: 'An unknown icon name is not an error anywhere: `IconPool` resolves it at render time, finds nothing, and the control renders with **no icon at all**. Nothing is logged — not in the browser console, not in ui5lint, not in abaplint — so it ships and surfaces months later as "not all icons are shown". Case matters and not in the way it looks: `IconPool.getIconInfo` parses the URI and reads `parts.hostname`, which is lower-cased, so `textFormatting` is not "nearly right" — it matches nothing, in every release, forever. The name is `text-formatting`. Judged against `data/icons.json`, the icon registry of every OpenUI5 minor from 1.71 up; a collection-qualified name (`sap-icon://tnt/actor`) belongs to a custom font and is never judged.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://textFormatting` )',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://text-formatting` )',
  fixNote: 'Where exactly one glyph of the font is the written name up to letter case and hyphens — `textFormatting` for `text-formatting`, the camelCase miss the message describes — the finding names it and `--fix` rewrites the name after `sap-icon://`. Wherever the name is written: an attribute value, a constant, a row of a status table.',
  message: (f) => {
    return `sap-icon://${f.value} is in no release of the SAP icon font — the control renders with NO icon and nothing is logged${
      /[A-Z]/.test(f.value) ? '; icon names are lower-case (IconPool reads them as a URI hostname), so a camelCase name never matches' : ' — typo?'}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
