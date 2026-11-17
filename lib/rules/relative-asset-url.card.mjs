import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'relative-asset-url',
  summary: 'a document-relative asset URL, which an abap2UI5 app has no root to resolve',
  detail: 'A UI5 demo-kit sample is served from the SDK page, so `./test-resources/sap/uxap/images/x.png` resolves there. An abap2UI5 app is served from the ABAP ICF node and has no such document root: the request 404s and the control silently falls back to its placeholder — the view renders, and nothing is logged where anyone looks. Judged on the metadata type (`sap.ui.core.URI`), not on attribute names, so `src`, `icon`, `backgroundImage`, `objectImageURI` and `fontURI` are reached alike. Scoped to the two demo-kit trees that are always wrong (`test-resources/…`, `resources/sap/…`): a project serving its own ICF resources may legitimately write a relative path. A binding is never judged — what the model holds is a runtime question.',
  example: 'a( n = `src` v = `./test-resources/sap/uxap/images/imageID.png` )',
  remedy: 'a( n = `src` v = `https://sdk.openui5.org/test-resources/sap/uxap/images/imageID.png` )',
});
