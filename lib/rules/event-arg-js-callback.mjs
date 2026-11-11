import { defineRule, short } from '../rule.mjs';
import { isCall } from '../abap-helpers.mjs';
import { blankLiterals, parenRegion } from '../abap.mjs';

function check({ src, report }) {
  /* Only an argument the frontend RESOLVES is parsed as an expression. One
   * that does not open with $ or { is shipped as a JS string literal, so the
   * word "function" inside a toast template is not this rule's business. */
  const judge = (raw, offset) => {
    const lit = String(raw ?? '').trim();
    if (!lit.startsWith('$') && !lit.startsWith('{') && !lit.startsWith('\\{')) return;
    if (!/\bfunction\s*\(|=>/.test(lit)) return;
    report({ value: lit.slice(0, 60), offset });
  };

  for (const m of src.matchAll(/\bt_arg\s*=\s*VALUE\s+(?:(?:#|\w+)\s*)?\(/gi)) {
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    for (const el of body.matchAll(/\(\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)\s*\)/g)) {
      judge(el[3] !== undefined ? el[3] : el[2], open + 1 + el.index);
    }
  }

  /* The `arg` shorthand carries exactly the same value into exactly the same
   * string_table, so a callback smuggled through it fails identically — and
   * only `client->_event( )` has the parameter, which is why this is a
   * separate scan rather than a widened regex above. The two other event-arg
   * rules learned the spelling in #78; this one was the third and was missed. */
  const code = blankLiterals(src);
  for (const ev of src.matchAll(/client->_event\s*\(/gi)) {
    if (!isCall(code, ev.index, 'client->')) continue;
    const evOpen = src.indexOf('(', ev.index + ev[0].length - 1);
    const { body: evBody } = parenRegion(src, evOpen);
    if (evBody === undefined) continue;
    const am = evBody.match(/\barg\s*=\s*(?:([`'])([^`']*)\1|\|([^|]*)\|)/i);
    if (am) judge(am[3] !== undefined ? am[3] : am[2], evOpen + 1 + am.index);
  }
}

export default defineRule({
  id: 'event-arg-js-callback',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a JS callback in a `t_arg` — the whole event handler fails to parse',
  detail: 'A `$`- or `{`-opening argument is sent to the frontend verbatim and resolved by UI5, which parses the **entire** handler string with `BindingParser.parseExpression`. `ExpressionParser` has no `function` keyword — its token table knows only `false`/`null`/`true`/`in`/`typeof` — and `{` is the object-literal `nud`, so `.map(function (o) { … })` throws before any argument is read. This is not a wrong argument value: the exception is on the handler, so every argument is lost and the event never reaches the backend. An arrow function fails identically (`=>` is not a token). An argument that does not open with `$` or `{` is shipped as a JS string literal, so the word "function" inside a toast template is not reported.',
  example: 't_arg = VALUE #( ( `$event.oSource.getSelectedRows().map(function(r){return r.getId();})` ) )',
  remedy: 't_arg = VALUE #( ( `${$source>/id}` ) )   " …and bind the row\'s own `selected` property',
  message: (f) => `the argument (…${short(f.value, 50)}…) contains a JS callback — UI5's ExpressionParser has no 'function' keyword and reads { as an object literal, so the WHOLE handler fails to parse and every argument of this event is lost`,
  check,
});
