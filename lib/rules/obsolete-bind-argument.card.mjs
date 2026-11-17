import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'obsolete-bind-argument',
  summary: '`_bind( view = … )` and the `custom_mapper`/`custom_filter` pair',
  detail: 'Two arguments the binder still ACCEPTS and should no longer be given. `view` is "inactive, not passed on internally": a call scoping a binding to `cs_view-popup` reads as if the binding belonged to that slot, and nothing reads the value at all — so it is dead weight that documents a behaviour the framework does not have. `custom_mapper` and `custom_filter` are the opposite, and worse: they are still evaluated, but both hand the app a reference to the AJSON copy bundled in `src/00` — a mirror of an external project, not a contract abap2UI5 owns — so an app implementing `z2ui5_if_ajson_mapping`/`_filter` binds itself to whatever that mirror looks like today. That is the `non-released-api` argument one level down, at a parameter rather than a class name. Everything they were reached for is declarative on the method now: `omit_initial`/`omit_initial_paths` drop initial fields and `json` splices a JSON node.',
  example: 'a( n = `value` v = client->_bind( val = name view = client->cs_view-popup ) )',
  remedy: 'a( n = `value` v = client->_bind( name ) )',
  fixNote: 'The inactive `view` argument is deleted, together with the spaces behind it; a value carrying parentheses is an expression whose end this pass does not measure and is reported without a fix. The mapper pair never carries one — they are still evaluated, so dropping one changes what the model carries.',
});
