import { defineRule } from '../rule.mjs';

function check({ RUNTIME_PATH, bootstrap, src, report }) {
  /* The subdomain branch starts only where a run of name characters starts
   * (`(?<![\w-])`): `\b(?:[\w-]+\.)?hana…` was tried at every word boundary
   * inside such a run - after every `-` - and each try read to the run's
   * end, quadratic on one long hyphenated token. The matches are the same:
   * a subdomain match from inside a run is also one from its start. */
  for (const m of src.matchAll(/\b(?:ui5\.sap\.com|hana\.ondemand\.com|(?<![\w-])[\w-]+\.hana\.ondemand\.com)\b([^\s`'"|)]*)/g)) {
    const urlPath = m[1] || '';
    if (!RUNTIME_PATH.test(urlPath) && !bootstrap(urlPath)) continue;
    report({ value: m[0].slice(0, 60), offset: m.index });
  }
}

export default defineRule({
  id: 'commercial-ui5-host',
  severity: 'warning',
  category: 'version',
  scope: 'app',
  message: (f) => `${f.value} is the commercial SAPUI5 host — use sdk.openui5.org, or the app breaks on an OpenUI5-only landscape`,
  check,
});
