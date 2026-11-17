import { defineRule, short } from '../rule.mjs';
import { isHrefAttr } from '../view-document.mjs';

function check({ attr, control, offset, type, value, report }) {
  /* A plain-http URL in the same typed slot. An abap2UI5 app is served over
   * HTTPS by every system that is not a developer's laptop, and a secure
   * page may not LOAD an insecure asset: the browser blocks the request as
   * mixed content (an image, a font, an icon URI never arrives — the
   * control shows its placeholder, and the block is logged only in the
   * console). A hyperlink is the one URI a page may still point at: the
   * browser NAVIGATES to it rather than loading it, and merely warns, so
   * `href` is reported as a hint while every loading property is an error.
   * The `severity` on the finding is the same override mechanism
   * sapui5-only-control uses; a `rules` entry still beats it. */
  if (type === 'sap.ui.core.URI' && /^http:\/\//i.test(String(value).trim())) {
    /* The fix, for the LOADED half only: the browser blocks the http load
     * outright, so https is the one scheme under which the asset can
     * arrive at all - and every host that serves an image to a UI5 app
     * serves it over https. A hyperlink (the hint) is left to its author. */
    const v = String(value).trim();
    report({
      control, member: attr, value: String(value), offset,
      ...(isHrefAttr(attr) ? { severity: 'hint' } : { written: v, suggestion: v.replace(/^http:/i, 'https:') }),
    });
  }
}

export default defineRule({
  id: 'insecure-asset-url',
  severity: 'error',
  category: 'data',
  scope: 'node',
  fixable: true,
  message: (f) => {
    return /href$/i.test(f.member)
      ? `${f.control} ${f.member}="${short(f.value, 50)}" is plain http — the browser navigates there with a mixed-content warning; link the https address`
      : `${f.control} ${f.member}="${short(f.value, 50)}" is plain http — on the https page every system serves, the browser BLOCKS the load as mixed content and the control shows its placeholder; load it over https`;
  },
  check,
});
