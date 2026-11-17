import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-directive-rule',
  summary: '`" abap2ui5lint-disable-next-line binding-to-locl` — no such rule',
  detail: 'A directive names a rule id nothing emits, so it waives nothing — and the finding it was written for is still reported one line down, which reads as the linter ignoring the comment. It used to be exactly that silent. The same closed set the config\'s `rules` block is checked against decides it: a rule id is the name printed at the end of every reported line (`abap2ui5lint --explain` lists them all). `render-error` is named separately, because a directive can never address it: a render failure has no source line, and the way to waive the gate per file is `rules[\'render-error\']` in `abap2ui5lint.jsonc`. A warning rather than an error - the code is fine, the suppression is not.',
  example: `" abap2ui5lint-disable-next-line Unknown-Property
view->tag( \`Button\` )->a( n = \`typ\` v = \`Emphasized\` ).`,
  remedy: `" abap2ui5lint-disable-next-line unknown-property
view->tag( \`Button\` )->a( n = \`typ\` v = \`Emphasized\` ).`,
  fixNote: 'Where exactly one rule id is the written name up to letter case and `-`/`_` (lib/suggest.mjs, the same did-you-mean the config and `--explain` make), the finding names it and `--fix` rewrites the id inside the directive. Anything less exact than that is reported without a suggestion; the linter does not guess at edit distances.',
});
