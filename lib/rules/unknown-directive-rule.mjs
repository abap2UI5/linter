import { defineRule, RENDER_RULE } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';

/* Called once per directive of a source (applyDirectives( ) in
 * findings.mjs), with the rule ids the linter knows (`known`) - a rule file
 * does not read the registry itself. `about` carries the directive, for the
 * caller to strip. */
function check({ directive, known, renderRule, report }) {
  for (const x of directive.ids.filter((y) => !known.includes(y.id))) {
    const suggestion = x.id === renderRule ? null : caseMatch(x.id, known);
    report({
      value: x.id, offset: x.start, about: directive,
      ...(suggestion ? { suggestion, fixes: [{ start: x.start, end: x.end, text: suggestion }] } : {}),
    });
  }
}

export default defineRule({
  id: 'unknown-directive-rule',
  severity: 'warning',
  category: 'directives',
  scope: 'directive',
  fixable: true,
  message: (f) => {
    return f.value === RENDER_RULE
      ? `the directive names ${f.value}, which is not a rule a directive can address — a render error has no source line; waive the gate per file with rules['render-error'] in abap2ui5lint.jsonc instead`
      : `the directive names '${f.value}', which is not a rule id, so it waives nothing` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ' — abap2ui5lint --explain lists every id');
  },
  check,
});
