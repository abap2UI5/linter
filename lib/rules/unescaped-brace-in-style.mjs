import { defineRule, short } from '../rule.mjs';
import { STYLE_OPEN, insideSegments, literalSegments, styleCloseAt } from '../abap-helpers.mjs';

function check({ src, report }) {
  /* Literal CSS braces in a view. UI5's XMLView parser reads an unescaped
   * `{` in an attribute value as the start of a binding, so a stylesheet
   * injected through a core:HTML content attribute takes the whole view down
   * with a binding parse error. Every brace has to be written `\{` / `\}`.
   * Caught the hard way in samples-controls (apps 026, 028 and 031, all by the
   * render gate).
   *
   * The unit is the span between <style> and </style>, not the literal and
   * not the statement. A stylesheet is written as a `&&` chain whose first
   * literal alone carries the opening tag, so checking literal by literal
   * sees that line and misses every rule below it - and a whole builder chain
   * is ONE ABAP statement, so widening to the statement swallows the entire
   * view (on the samples-controls corpus that produced ten false positives at once:
   * `{0}` toast templates and `${$parameters>/…}` wires that merely shared a
   * statement with a stylesheet). Between the two tags there is only CSS.
   *
   * The opening tag is read with its attributes and in any case - `<style
   * type="text/css">` is the same stylesheet, and a bare `<style>` match left
   * every sheet written that way unjudged (the same shape css-classes.mjs
   * reads). */
  for (const open of src.matchAll(STYLE_OPEN)) {
    const from = open.index + open[0].length;
    const to = styleCloseAt(src, from);
    if (to === -1) continue; // no closing tag in sight - not a stylesheet we can bound
    // one finding per stylesheet, at its first unescaped brace: a sheet with
    // twenty rules has forty braces and exactly one thing to do about them
    const css = src.slice(from, to);
    const first = css.search(/(?<!\\)[{}]/);
    if (first === -1) continue;
    const braces = [...css.matchAll(/(?<!\\)[{}]/g)];
    /* The fix writes the backslash in front of every brace — but only where
     * ALL of them sit inside `backtick` literals, which take the backslash
     * verbatim. A brace inside a |…| template is either an embedded
     * expression or already a syntax error, and a brace outside any literal
     * is code; neither is CSS to escape, so a sheet mixing them gets no fix. */
    const inBacktick = insideSegments(literalSegments(src).filter((s) => s.kind === '`'));
    const fixable = braces.every((b) => inBacktick(from + b.index));
    report({
      count: braces.length,
      value: css.slice(Math.max(0, first - 15), first + 25).replace(/\s+/g, ' ').trim(),
      offset: from + first,
      ...(fixable ? { fixes: braces.map((b) => ({ start: from + b.index, end: from + b.index, text: '\\' })) } : {}),
    });
  }
}

export default defineRule({
  id: 'unescaped-brace-in-style',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'literal CSS braces in a `<style>` block',
  detail: 'UI5\'s XMLView parser reads an unescaped `{` in an attribute value as the start of a binding, so a stylesheet injected through a `core:HTML` content attribute takes the whole view down with a binding parse error. Write every brace as `\\{` and `\\}`. Judged between `<style>` and `</style>`, so a `{0}` toast template or a `${$parameters>/…}` wire elsewhere in the same builder chain is never mistaken for CSS.',
  example: 'DATA(css) = `<style>.box {color:red}</style>`.',
  remedy: 'DATA(css) = `<style>.box \\{color:red\\}</style>`.',
  fixNote: 'A backslash is inserted in front of every unescaped brace between `<style>` and `</style>` — but only where every one of them sits inside a `backtick` literal, which takes the backslash verbatim. A brace inside a |…| template is an embedded expression, and one outside any literal is code, so a stylesheet mixing them is reported without a fix rather than half-escaped.',
  message: (f) => `${f.count} unescaped brace(s) in a <style> block (…${short(f.value, 40)}…) — the XMLView parser reads them as bindings; write \\{ and \\}`,
  check,
});
