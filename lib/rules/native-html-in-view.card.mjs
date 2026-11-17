import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'native-html-in-view',
  summary: 'native XHTML or SVG markup in a view, deprecated since UI5 1.120',
  detail: 'UI5 1.120 deprecated native markup in an XML view — an element in the XHTML (`xmlns:html="http://www.w3.org/1999/xhtml"`) or SVG namespace. The XMLView still renders it, but logs a `[FUTURE FATAL]`, and the next major release refuses the view. Reported once per island of markup — on its outermost element — and only when your target (`ui5`) is 1.120 or later; below that the markup is supported, and a deprecation horizon (`deprecatedAt`) reports it as `deprecated-after-target` instead. The replacement exists on every release: a `sap.ui.core.HTML` control carrying the markup in `content`, or a UI5 control for what the markup lays out. A hint for its first release, so a corpus that has long carried `<html:style>` blocks sees the count before it can fail a build.',
  example: 'view->tag( n = `div` ns = `html` )   " xmlns:html="http://www.w3.org/1999/xhtml" - judged with ui5 1.120',
  remedy: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<div>…</div>` )',
});
