import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'frontend-action-unknown-id',
  summary: 'an id-addressed wire naming an id no view declares',
  detail: 'The frontend resolves the first `t_arg` as a control id. When no view of the class gives a control that id — a typo, a renamed control, an id that only ever existed in another app — the lookup fails and the wire does **nothing**: no exception, no failed render, a button that looks connected. `CONTROL_BY_ID` at least logs the miss; `SET_FOCUS`, `SCROLL_TO` and `SCROLL_INTO_VIEW` `return` without even a console line. Judged only when every `id` attribute of the class is a literal; a class that builds ids at runtime is left alone.',
  example: `a( n = \`id\` v = \`messageView\` )
" … t_arg = VALUE #( ( \`messageview\` ) ( \`navigateBack\` ) )   " no control answers to it`,
  remedy: `a( n = \`id\` v = \`messageView\` )
" … t_arg = VALUE #( ( \`messageView\` ) ( \`navigateBack\` ) )`,
  fixNote: 'Where exactly one id a view of this class declares is the written id up to letter case (`messageview` for `messageView`), the finding names it and `--fix` rewrites the literal inside its own quotes. An id no declared id matches that way is reported without a suggestion.',
});
