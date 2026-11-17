import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'uncurated-formatter',
  summary: '`formatter: \'Formatter.round2DP\'` — not in the curated module',
  detail: 'The framework ships ONE formatter module (`z2ui5/model/formatter`), and its export surface is deliberately tiny: a function is admitted only when it formats exactly the value handed to it and there is a technical reason it cannot be done in ABAP (a JS type the JSON model cannot carry, an icon-font glyph). UI5 resolves the formatter string at binding time, and an unknown name **silently yields no value** — the property is simply never set, the cell renders blank, nothing turns red. The demo-kit pack (`round2DP`, `dimensions`, `stockStatusState`, `stockStatusIcon`, `deliveryStatusState`) and `weightState` were shipped and then removed upstream, breaking their users exactly this way. If the value you need is not in the curated list, it is not a formatting problem: compute it in `model_init` and bind the finished field. Judged only for the framework\'s own alias (`Formatter` via `core:require`, or the `z2ui5.Formatter` global) — an alias pointed at your own module is left alone. In a class, a CONTROLLER formatter (`formatter: \'.weightState\'`, the form the demo kit samples use) is reported too, and it is worse than blank: the view\'s controller is abap2UI5\'s own, which defines no formatter, so the view fails to load with *formatter function .weightState not found*.',
  example: 'a( n = `state` v = |\\{ path: \'STATUS\', formatter: \'Formatter.stockStatusState\' \\}| )   " blank cell',
  remedy: 'a( n = `state` v = `{STATUS_STATE}` )   " computed in ABAP, bound finished',
  fixNote: 'Only when the written name is a curated formatter up to letter case: the name is rewritten. Any other name keeps the finding — the remedy is to compute the value in ABAP.',
});
