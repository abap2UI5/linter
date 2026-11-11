import { defineRule } from '../rule.mjs';

function check({ src, report }) {
  /* The mirror image of collapsed-brace-in-style, and the one that bit
   * samples-controls app 166. Brace escaping is a |…| TEMPLATE rule: the backslash
   * is ABAP's escape there, so `\{` reaches the builder as a bare `{`. Inside a
   * `backtick` literal there is no escape processing at all - the backslash is
   * taken verbatim and lands in the serialized attribute, where UI5 sees
   * `\{ path: … \}` instead of a binding and either renders the text raw or
   * fails to parse it. A binding written in a backtick literal needs plain
   * braces; only the |…| form needs the escapes.
   *
   * Scoped to attribute VALUES (`v = ` … `n = `), because a backslash-brace in
   * ordinary text (a core:HTML stylesheet built from backticks) is legitimate. */
  for (const m of src.matchAll(/\bv\s*=\s*`([^`]*)`/gi)) {
    const value = m[1];
    const at = value.search(/\\[{}]/);
    if (at === -1) continue;
    /* A stylesheet injected through a core:HTML content attribute escapes its
     * braces for the same parser and is CORRECT in a backtick literal - the
     * backslash has to survive there. Only a value that is itself a BINDING is
     * the defect: it starts with the escaped brace and carries binding syntax
     * (a binding-info object, a model prefix or an expression). */
    if (!/^\s*\\\{/.test(value)) continue;
    if (!/path\s*:|>\/|\{=|\bmodel\s*:/.test(value)) continue;
    /* Mechanically fixable: the correct form is the same literal with plain
     * braces (see the rule doc), so every backslash in front of a brace is
     * simply deleted. A backtick literal has no escape processing, so the
     * deletion cannot change anything else the literal says. */
    const valueStart = m.index + m[0].indexOf('`') + 1;
    const fixes = [...value.matchAll(/\\(?=[{}])/g)]
      .map((b) => ({ start: valueStart + b.index, end: valueStart + b.index + 1, text: '' }));
    report({
      value: value.slice(Math.max(0, at - 12), at + 28).replace(/\s+/g, ' ').trim(),
      offset: m.index + m[0].indexOf('`') + 1 + at,
      fixes,
    });
  }
}

export default defineRule({
  id: 'escaped-brace-in-backtick',
  severity: 'error',
  category: 'bindings',
  scope: 'app',
  summary: 'a binding written with escaped braces inside a `backtick` literal',
  detail: 'Brace escaping is a |…| TEMPLATE rule. In a template the backslash is ABAP\'s own escape, so `\\{` reaches the builder as a bare `{` — which is exactly what a binding needs. A `backtick` literal has no escape processing at all: the backslash is taken verbatim and lands in the serialized attribute, where UI5 reads `\\{ path: … \\}` as text rather than a binding and either renders it raw or fails to parse the view. Write plain braces in a backtick literal; keep the escapes for the template form.',
  example: 'a( n = `items` v = `\\{ path: \'message>/\' \\}` )   " the backslash reaches the XML',
  remedy: 'a( n = `items` v = `{ path: \'message>/\' }` )   " correct in a backtick literal',
  fixNote: 'Every backslash in front of a brace inside the backtick literal is deleted, leaving the plain-brace form the literal should have carried. Nothing else in the literal is touched — a backtick literal has no escape processing, so the backslashes say nothing.',
  message: (f) => `a binding written with ESCAPED braces inside a \`backtick\` literal (${f.value}) — a backtick literal has no escape processing, so the backslash lands in the attribute and UI5 never sees a binding; escaping is a |…| template rule`,
  check,
});
