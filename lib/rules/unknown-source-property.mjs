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
  fixable: true,
  message: (f) => `${f.control} ${f.event}: $source>/${f.member} names no property, aggregation or association of the control — the argument arrives empty` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
