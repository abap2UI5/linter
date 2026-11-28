import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'obsolete-bind-argument',
  summary: '`_bind( view = … )`',
  detail: 'An argument the binder still ACCEPTS and should no longer be given. `view` is "inactive, not passed on internally": a call scoping a binding to `cs_view-popup` reads as if the binding belonged to that slot, and nothing reads the value at all — so it is dead weight that documents a behaviour the framework does not have. `custom_mapper` and `custom_filter`, the pair this rule reported as well, were removed from `_bind( )` in abap2UI5 1.152.0; `removed-api` reports a call that still passes one.',
  example: 'a( n = `value` v = client->_bind( val = name view = client->cs_view-popup ) )',
  remedy: 'a( n = `value` v = client->_bind( name ) )',
  fixNote: 'The inactive `view` argument is deleted, together with the spaces behind it; a value carrying parentheses is an expression whose end this pass does not measure and is reported without a fix.',
});
