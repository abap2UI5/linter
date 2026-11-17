import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'collapsed-brace-in-style',
  summary: 'an escaped CSS brace written inside a `|…|` template',
  detail: 'An escape only reaches the serialized attribute when the backslash is taken verbatim, which is what a backtick literal does. Inside an ABAP string template the backslash is the template\'s own escape: `\\{` collapses to a bare `{` before the builder ever sees it, and the view dies exactly as if nothing had been escaped. Write the stylesheet in a backtick literal — or, if it has to be a template, double the backslash (`\\\\\\{`). Invisible to `unescaped-brace-in-style`, which reads the source and sees a backslash in front of every brace; only the literal\'s kind tells the two apart.',
  example: 'DATA(css) = |<style>.a \\{color:red\\}</style>|.   " the template collapses \\{ to {',
  remedy: 'DATA(css) = `<style>.a \\{color:red\\}</style>`.   " a backtick literal survives',
  fixNote: 'A `\\\\` is inserted in front of every `\\{` and `\\}` inside the |…| template segments of the stylesheet — the doubled form a template needs to deliver the escaped brace — and one pass covers every segment of the sheet. The literal is not turned into a backtick literal: a template may carry other escapes and embedded expressions whose meaning would change with the delimiter, and rewriting those would be a guess.',
});
