import { defineRule } from '../rule.mjs';
import { chainComplete, memberNames } from '../ui5-meta.mjs';
import { caseMatch } from '../suggest.mjs';

function check({ data, full, node, report }) {
  /* `$source>/name` in an event argument: the first segment is a member
   * of the control that fires the event (UI5 hands the source in as a
   * ManagedObjectModel - properties, aggregations and associations
   * resolve, `/id` too). A name the control does not have is undefined
   * in the browser and an empty argument in ABAP, with nothing logged.
   * Judged only where the metadata chain is complete, like
   * unknown-property; `@`-prefixed names are the model's own. */
  for (const p of node.sourceParams || []) {
    if (p.name.startsWith('@') || p.name === 'id' || !chainComplete(data, full)) continue;
    const names = [...memberNames(data, full, ['properties', 'aggregations', 'associations'])];
    if (names.includes(p.name)) continue;
    const suggestion = caseMatch(p.name, names);
    report({
      control: full, member: p.name, event: p.member,
      offset: p.offset, ...(suggestion ? { written: p.name, suggestion } : {}),
    });
  }

}

export default defineRule({
  id: 'unknown-source-property',
  severity: 'hint',
  category: 'frontend-wires',
  scope: 'node',
  summary: 'a `$source>/name` the event\'s source control does not have',
  detail: 'The twin of `unknown-event-parameter` for the other model an event handler can read: UI5 binds the control that fired the event as `$source>`, a ManagedObjectModel whose paths are the control\'s own properties, aggregations and associations. `${$source>/txt}` on a Button resolves to undefined in the browser and arrives as an empty argument in ABAP — no error anywhere. Judged only where the control\'s metadata chain is complete, like `unknown-property`; `@`-prefixed names and `id` are the model\'s own. A did-you-mean and a fix where the written name is a member up to letter case.',
  example: 'view->tag( `Button` )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/txt}` ) ) ) )',
  remedy: 'view->tag( `Button` )->a( n = `press` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$source>/text}` ) ) ) )',
  fixNote: 'Where exactly one property, aggregation or association of the source control is the written name up to letter case and separators (`Text` for `text`), the finding names it and `--fix` rewrites the segment in the `$source>` path. `txt` for `text` is an edit, not a case miss, and keeps the finding without a suggestion.',
  message: (f) => `${f.control} ${f.event}: $source>/${f.member} names no property, aggregation or association of the control — the argument arrives empty` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
