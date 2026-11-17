import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-arg-js-callback',
  summary: 'a JS callback in a `t_arg` — the whole event handler fails to parse',
  detail: 'A `$`- or `{`-opening argument is sent to the frontend verbatim and resolved by UI5, which parses the **entire** handler string with `BindingParser.parseExpression`. `ExpressionParser` has no `function` keyword — its token table knows only `false`/`null`/`true`/`in`/`typeof` — and `{` is the object-literal `nud`, so `.map(function (o) { … })` throws before any argument is read. This is not a wrong argument value: the exception is on the handler, so every argument is lost and the event never reaches the backend. An arrow function fails identically (`=>` is not a token). An argument that does not open with `$` or `{` is shipped as a JS string literal, so the word "function" inside a toast template is not reported.',
  example: 't_arg = VALUE #( ( `$event.oSource.getSelectedRows().map(function(r){return r.getId();})` ) )',
  remedy: 't_arg = VALUE #( ( `${$source>/id}` ) )   " …and bind the row\'s own `selected` property',
});
