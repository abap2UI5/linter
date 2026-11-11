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
  summary: '`formatter: \'Formatter.round2DP\'` — not in the curated module',
  detail: 'The framework ships ONE formatter module (`z2ui5/model/formatter`), and its export surface is deliberately tiny: a function is admitted only when it formats exactly the value handed to it and there is a technical reason it cannot be done in ABAP (a JS type the JSON model cannot carry, an icon-font glyph). UI5 resolves the formatter string at binding time, and an unknown name **silently yields no value** — the property is simply never set, the cell renders blank, nothing turns red. The demo-kit pack (`round2DP`, `dimensions`, `stockStatusState`, `stockStatusIcon`, `deliveryStatusState`) and `weightState` were shipped and then removed upstream, breaking their users exactly this way. If the value you need is not in the curated list, it is not a formatting problem: compute it in `model_init` and bind the finished field. Judged only for the framework\'s own alias (`Formatter` via `core:require`, or the `z2ui5.Formatter` global) — an alias pointed at your own module is left alone. In a class, a CONTROLLER formatter (`formatter: \'.weightState\'`, the form the demo kit samples use) is reported too, and it is worse than blank: the view\'s controller is abap2UI5\'s own, which defines no formatter, so the view fails to load with *formatter function .weightState not found*.',
  example: 'a( n = `state` v = |\\{ path: \'STATUS\', formatter: \'Formatter.stockStatusState\' \\}| )   " blank cell',
  remedy: 'a( n = `state` v = `{STATUS_STATE}` )   " computed in ABAP, bound finished',
  fixNote: 'Only when the written name is a curated formatter up to letter case: the name is rewritten. Any other name keeps the finding — the remedy is to compute the value in ABAP.',
  message: (f) => {
    if (String(f.value).startsWith('.')) {
      return `${f.control} ${f.member}: '${f.value}' is a controller formatter, and the view's controller is abap2UI5's, which defines none — the view fails to load (formatter function ${f.value} not found); compute it in ABAP and bind the finished field`;
    }
    return `${f.control} ${f.member}: 'Formatter.${f.value}' is not in the curated formatter module — UI5 resolves the name at binding time and an unknown one silently yields no value; compute it in ABAP and bind the finished field` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : '');
  },
  check,
});
