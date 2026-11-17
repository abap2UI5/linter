import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'escape-handler-as-string',
  summary: '`escapeHandler=".onEscape"` on a Dialog below 1.120 — kept as a string, and Escape closes the dialog anyway',
  detail: '`sap.m.Dialog.escapeHandler` is declared `{type: "any"}` on 1.71 and `"function"` on newer releases (1.120 has it so). The XML template processor parses an attribute of type `any` with `DataType("any").parseValue`, which keeps the literal `".onEscape"`: nothing resolves it against the controller, nothing logs, and `Dialog.onsapescape` takes its plain close branch because the property holds no function. Newer releases resolve the attribute to the controller method, so every test leg but the old one passes. Set the handler in code after the fragment is loaded - `oDialog.setEscapeHandler((p) => this.onEscape(p))` - instead of in the XML. Raw views and fragments only: a view the builder produces has no controller to name.',
  example: '<Dialog xmlns="sap.m" title="Tools" escapeHandler=".onEscape"/>',
  remedy: '<Dialog xmlns="sap.m" title="Tools"/>\n<!-- after Fragment.load: oDialog.setEscapeHandler((p) => this.onEscape(p)) -->',
});
