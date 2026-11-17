import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'commercial-ui5-host',
  summary: 'a URL pinned to the commercial SAPUI5 host',
  detail: 'The same portability family as `sapui5-only-control`: `sdk.openui5.org` serves the open distribution, `ui5.sap.com` / `*.hana.ondemand.com` serve SAPUI5. An app whose assets or bootstrap point at the commercial host breaks the moment it runs against an OpenUI5-only landscape.',
  example: 'DATA(url) = `https://ui5.sap.com/resources/sap-ui-core.js`.',
  remedy: 'DATA(url) = `https://sdk.openui5.org/resources/sap-ui-core.js`.',
});
