import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'deprecated-after-target',
  summary: 'deprecated after your target version, within the deprecation horizon you set',
  detail: 'Reported only when the config sets a deprecation horizon (`"deprecatedAt": "1.136"`, `--deprecated-at 1.136`), and only for what took effect AFTER the target (`ui5`) and up to the horizon — what is deprecated at the target already is `control-deprecated` / `member-deprecated`, and every other rule keeps judging against the target. It answers the question the target cannot: an abap2UI5 app held to 1.71 so that it runs on old systems is still meant to be legacy-free code, and SAP measures that against 1.136, the baseline its own UI5 linter, the UI5 Modernization Plugin and the 2.x migration all target — none of which ever see a view built in ABAP. Controls, their properties and events, and native XHTML/SVG markup (deprecated in an XML view since 1.120) are judged. When the deprecation names a replacement the snapshot knows (`{@link sap.m.IllustratedMessage}`, `{@link #event:press}`), the finding says whether the target already has it: often it does not — `sap.m.MessagePage` (deprecated 1.112) is replaced by `IllustratedMessage`, which needs 1.98 — and then the deprecated control is the right code until the target moves, which is why this is a hint. Never fixed automatically: rewriting to a replacement the target lacks would break exactly the systems the target protects.',
  example: 'view->tag( `MessagePage` )   " deprecated since 1.112 - judged with ui5 1.71, deprecatedAt 1.136',
  remedy: 'view->tag( `IllustratedMessage` )   " once the target reaches 1.98',
});
