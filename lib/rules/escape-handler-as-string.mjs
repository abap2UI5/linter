import { defineRule } from '../rule.mjs';
import { isA, isBinding, withinUi5Floor } from '../ui5-meta.mjs';

/* The release by which sap.m.Dialog.escapeHandler is a `function`-typed
 * property, so the XML template processor resolves a `.onEscape` against the
 * controller. 1.71 declares it `{type: "any"}` (sap/m/Dialog.js of
 * @openui5/sap.m@1.71.0) and 1.120 `"function"` (abap2UI5's ui5-check skill,
 * read in both packages); the release in between that changed it is not
 * pinned down, so the rule answers for every target below the release it is
 * KNOWN to work on. */
const RESOLVED_FROM = '1.120';

function check({ attr, data, fromAbap, full, minUi5, node, offset, value, report }) {
  /* An `escapeHandler="…"` attribute on a sap.m.Dialog in a raw view or
   * fragment, below the release where the property is a function: on 1.71
   * the attribute is parsed as DataType "any", which keeps the literal
   * string. Nothing resolves it against the controller, nothing logs, and
   * Escape takes the dialog's plain close branch because the property holds
   * no function - shipped in abap2UI5's DeveloperTools.fragment.xml and
   * passed every leg but 1.71. Raw XML only: a view the builder produces
   * has no controller method to name (the skill entry's own scope). */
  if (fromAbap || attr !== 'escapeHandler' || isBinding(value) || !String(value).trim()) return;
  if (!isA(data, full, 'sap.m.Dialog')) return;
  if (withinUi5Floor(RESOLVED_FROM, minUi5)) return;
  report({ control: full, member: attr, value: String(value).trim(), since: RESOLVED_FROM, minUi5, offset });
}

export default defineRule({
  id: 'escape-handler-as-string',
  severity: 'warning',
  category: 'version',
  scope: 'node',
  summary: '`escapeHandler=".onEscape"` on a Dialog below 1.120 — kept as a string, and Escape closes the dialog anyway',
  detail: '`sap.m.Dialog.escapeHandler` is declared `{type: "any"}` on 1.71 and `"function"` on newer releases (1.120 has it so). The XML template processor parses an attribute of type `any` with `DataType("any").parseValue`, which keeps the literal `".onEscape"`: nothing resolves it against the controller, nothing logs, and `Dialog.onsapescape` takes its plain close branch because the property holds no function. Newer releases resolve the attribute to the controller method, so every test leg but the old one passes. Set the handler in code after the fragment is loaded - `oDialog.setEscapeHandler((p) => this.onEscape(p))` - instead of in the XML. Raw views and fragments only: a view the builder produces has no controller to name.',
  example: '<Dialog xmlns="sap.m" title="Tools" escapeHandler=".onEscape"/>',
  remedy: '<Dialog xmlns="sap.m" title="Tools"/>\n<!-- after Fragment.load: oDialog.setEscapeHandler((p) => this.onEscape(p)) -->',
  message: (f) => `${f.control} escapeHandler="${f.value}" is a string below UI5 ${f.since}: on the ${f.minUi5} target the property is typed "any", nothing resolves it against the controller, and Escape closes the dialog through the plain branch — set it in code after the load (setEscapeHandler)`,
  check,
});
