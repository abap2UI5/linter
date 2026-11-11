import { defineRule, short } from '../rule.mjs';
import { STYLE_OPEN, literalSegments, styleCloseAt } from '../abap-helpers.mjs';

function check({ src, report }) {
  /* The other half of the same defect. An escape only survives to the
   * serialized attribute when the backslash is taken verbatim - which is what
   * a `backtick` literal does. Inside a |…| template the backslash is ABAP's
   * own escape: `\{` collapses to a bare `{` before the builder ever sees it,
   * and the view crashes exactly as if nothing had been escaped. Written in a
   * template the form has to be `\\\{`.
   *
   * Invisible to the rule above, which reads the SOURCE and sees a backslash
   * in front of every brace. Only the literal's kind tells the two apart. */
  const templates = literalSegments(src).filter((s) => s.kind === '|');
  for (const open of src.matchAll(STYLE_OPEN)) {
    const from = open.index + open[0].length;
    const to = styleCloseAt(src, from);
    if (to === -1) continue;
    /* One finding per stylesheet, as above — but the fix covers every
     * template segment of the sheet, so one `--fix` pass settles it: each
     * `\{` gains a `\\` in front, the form a template needs to deliver `\{`. */
    let first = null;
    const fixes = [];
    for (const segment of templates) {
      if (segment.end <= from || segment.start >= to) continue;
      const base = Math.max(segment.start, from);
      const text = src.slice(base, Math.min(segment.end, to));
      for (const b of text.matchAll(/(?<!\\)\\[{}]/g)) {
        fixes.push({ start: base + b.index, end: base + b.index, text: '\\\\' });
        first ??= { text, at: b.index, base };
      }
    }
    if (!first) continue;
    report({
      count: fixes.length,
      value: first.text.slice(Math.max(0, first.at - 15), first.at + 25).replace(/\s+/g, ' ').trim(),
      offset: first.base + first.at,
      fixes,
    });
  }
}

export default defineRule({
  id: 'collapsed-brace-in-style',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'an escaped CSS brace written inside a `|…|` template',
  detail: 'An escape only reaches the serialized attribute when the backslash is taken verbatim, which is what a backtick literal does. Inside an ABAP string template the backslash is the template\'s own escape: `\\{` collapses to a bare `{` before the builder ever sees it, and the view dies exactly as if nothing had been escaped. Write the stylesheet in a backtick literal — or, if it has to be a template, double the backslash (`\\\\\\{`). Invisible to `unescaped-brace-in-style`, which reads the source and sees a backslash in front of every brace; only the literal\'s kind tells the two apart.',
  example: 'DATA(css) = |<style>.a \\{color:red\\}</style>|.   " the template collapses \\{ to {',
  remedy: 'DATA(css) = `<style>.a \\{color:red\\}</style>`.   " a backtick literal survives',
  fixNote: 'A `\\\\` is inserted in front of every `\\{` and `\\}` inside the |…| template segments of the stylesheet — the doubled form a template needs to deliver the escaped brace — and one pass covers every segment of the sheet. The literal is not turned into a backtick literal: a template may carry other escapes and embedded expressions whose meaning would change with the delimiter, and rewriting those would be a guess.',
  message: (f) => `${f.count} escaped brace(s) inside a |…| template in a <style> block (…${short(f.value, 40)}…) — the template collapses \\{ to { before the view is built; use a backtick literal, or write \\\\\\{ in the template`,
  check,
});
