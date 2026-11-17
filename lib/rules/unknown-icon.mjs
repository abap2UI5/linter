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
  fixable: true,
  message: (f) => {
    return `sap-icon://${f.value} is in no release of the SAP icon font — the control renders with NO icon and nothing is logged${
      /[A-Z]/.test(f.value) ? '; icon names are lower-case (IconPool reads them as a URI hostname), so a camelCase name never matches' : ' — typo?'}` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
