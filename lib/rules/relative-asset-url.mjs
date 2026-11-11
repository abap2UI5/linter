import { defineRule } from '../rule.mjs';

/* Scoped to the UI5 resource trees on purpose. A relative path is only
 * WRONG when it addresses something the app does not serve, and a project
 * that ships its own ICF resources may legitimately write one - so this
 * matches the two demo-kit shapes that are always broken and nothing else.
 * `sap-icon://`, `data:`, `http(s)://` and protocol-relative `//host/` all
 * fail it by construction. */
const RELATIVE_ASSET_RE = /^(?:\.\.?\/)*(?:test-resources|resources\/sap)\//;

function check({ attr, control, offset, type, value, report }) {
  /* A DOCUMENT-RELATIVE asset URL. A UI5 demo-kit sample is served from the
   * SDK page, so `./test-resources/sap/uxap/images/x.png` resolves there; an
   * abap2UI5 app is served from the ABAP ICF node and has no such document
   * root, so the request 404s and the control silently falls back to its
   * placeholder. The view renders, nothing is logged where anyone looks.
   * Typed through the metadata rather than matched on attribute names, so
   * src, icon, backgroundImage, objectImageURI and fontURI are all reached
   * by the same check. Bindings never get here - checkValue returns early on
   * them - which is deliberate: what a model holds is a runtime question. */
  if (type === 'sap.ui.core.URI' && RELATIVE_ASSET_RE.test(String(value).trim())) {
    report({ control, member: attr, value: String(value), offset });
  }
}

export default defineRule({
  id: 'relative-asset-url',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: 'a document-relative asset URL, which an abap2UI5 app has no root to resolve',
  detail: 'A UI5 demo-kit sample is served from the SDK page, so `./test-resources/sap/uxap/images/x.png` resolves there. An abap2UI5 app is served from the ABAP ICF node and has no such document root: the request 404s and the control silently falls back to its placeholder — the view renders, and nothing is logged where anyone looks. Judged on the metadata type (`sap.ui.core.URI`), not on attribute names, so `src`, `icon`, `backgroundImage`, `objectImageURI` and `fontURI` are reached alike. Scoped to the two demo-kit trees that are always wrong (`test-resources/…`, `resources/sap/…`): a project serving its own ICF resources may legitimately write a relative path. A binding is never judged — what the model holds is a runtime question.',
  example: 'a( n = `src` v = `./test-resources/sap/uxap/images/imageID.png` )',
  remedy: 'a( n = `src` v = `https://sdk.openui5.org/test-resources/sap/uxap/images/imageID.png` )',
  message: (f) => `${f.control} ${f.member}="${f.value}" is document-relative — an abap2UI5 app is served from the ICF node and has no document root to resolve it against, so the asset 404s and the control falls back to its placeholder; absolutize it onto the OpenUI5 host`,
  check,
});
