import { defineRule } from '../rule.mjs';
import { CURATED_FORMATTERS } from '../formatters.mjs';
import { caseMatch } from '../suggest.mjs';

function check({ attr, formatterRef, fromAbap, full, offset, value, report }) {
  /* A formatter reference outside the curated module. UI5 resolves
   * the string at binding time; an unknown name silently yields no
   * value, so the property is simply never set — nothing red
   * anywhere. Judged only for the framework's own alias (`Formatter`
   * via core:require, or the `z2ui5.Formatter` global): when the
   * class points the alias at a module of its own, its exports are
   * not ours to know. The call form allows no space before the
   * paren, so prose mentioning a formatter never matches. */
  if (formatterRef) {
    for (const fm of String(value).matchAll(formatterRef)) {
      const alias = fm[1] ?? fm[3];
      const fn = fm[2] ?? fm[4];
      if (!CURATED_FORMATTERS.includes(fn)) {
        // a curated name up to letter case is a typo the fix can write
        const suggestion = caseMatch(fn, CURATED_FORMATTERS);
        // written WITH the alias, so the did-you-mean fix finds the
        // token (`Formatter.x` is one dotted name to the span search)
        report({
          control: full, member: attr, value: fn, offset,
          ...(suggestion ? { written: `${alias}.${fn}`, suggestion: `${alias}.${suggestion}` } : {}),
        });
      }
    }
  }

  /* A CONTROLLER formatter - `formatter: '.weightState'`, the demo
   * kit's own form, which every port meets. The view's controller is
   * abap2UI5's, and it defines no formatter: the XMLTemplateProcessor
   * throws "formatter function .weightState not found!" and the view
   * does not load. Until now only the render gate saw it, so the
   * editor and every --no-render run passed it. A class only: a raw
   * view may be a freestyle app's, with a controller of its own. */
  if (fromAbap) for (const fm of String(value).matchAll(/\bformatter\s*:\s*(['"])(\.[\w$]+(?:\.[\w$]+)*)\1/g)) {
    report({ control: full, member: attr, value: fm[2], offset });
  }
}

export default defineRule({
  id: 'uncurated-formatter',
  severity: 'error',
  category: 'data',
  scope: 'node',
  fixable: true,
  message: (f) => {
    if (String(f.value).startsWith('.')) {
      return `${f.control} ${f.member}: '${f.value}' is a controller formatter, and the view's controller is abap2UI5's, which defines none — the view fails to load (formatter function ${f.value} not found); compute it in ABAP and bind the finished field`;
    }
    return `${f.control} ${f.member}: 'Formatter.${f.value}' is not in the curated formatter module — UI5 resolves the name at binding time and an unknown one silently yields no value; compute it in ABAP and bind the finished field` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
