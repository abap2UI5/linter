import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unescaped-brace-in-style',
  summary: 'literal CSS braces in a `<style>` block',
  detail: 'UI5\'s XMLView parser reads an unescaped `{` in an attribute value as the start of a binding, so a stylesheet injected through a `core:HTML` content attribute takes the whole view down with a binding parse error. Write every brace as `\\{` and `\\}`. Judged between `<style>` and `</style>`, so a `{0}` toast template or a `${$parameters>/…}` wire elsewhere in the same builder chain is never mistaken for CSS. Not judged: the braces of a `|…|` template\'s embedded expression (`{ lv_css }`), and a stylesheet passed with `a( t = … )`, which the builder escapes itself.',
  example: 'DATA(css) = `<style>.box {color:red}</style>`.',
  remedy: 'DATA(css) = `<style>.box \\{color:red\\}</style>`.',
  fixNote: 'A backslash is inserted in front of every unescaped brace between `<style>` and `</style>` — but only where every one of them sits inside a `backtick` literal, which takes the backslash verbatim. A brace inside a |…| template is an embedded expression, and one outside any literal is code, so a stylesheet mixing them is reported without a fix rather than half-escaped.',
});
