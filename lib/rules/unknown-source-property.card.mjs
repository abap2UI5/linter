import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'unknown-source-property',
  summary: 'a `$source>/name` the event\'s source control does not have',
  detail: 'The twin of `unknown-event-parameter` for the other model an event handler can read: UI5 binds the control that fired the event as `$source>`, a ManagedObjectModel whose paths are the control\'s own properties, aggregations and associations. `${$source>/txt}` on a Button resolves to undefined in the browser and arrives as an empty argument in ABAP — no error anywhere. Judged only where the control\'s metadata chain is complete, like `unknown-property`; `@`-prefixed names and `id` are the model\'s own. A did-you-mean and a fix where the written name is a member up to letter case.',
  example: 'view->tag( `Button` )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/txt}` ) ) ) )',
  remedy: 'view->tag( `Button` )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/text}` ) ) ) )',
  fixNote: 'Where exactly one property, aggregation or association of the source control is the written name up to letter case and separators (`Text` for `text`), the finding names it and `--fix` rewrites the segment in the `$source>` path. `txt` for `text` is an edit, not a case miss, and keeps the finding without a suggestion.',
});
