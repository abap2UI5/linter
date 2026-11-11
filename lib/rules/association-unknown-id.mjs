import { defineRule } from '../rule.mjs';
import { caseMatch } from '../suggest.mjs';
import { isBinding } from '../ui5-meta.mjs';

function check({ attr, full, literalIds, member, node, offset, value, report }) {
  /* An association naming an id no control of THIS document carries.
   * The other half of the rule above: written right (no braces), the
   * value is looked up as an id when the control needs it - a
   * Label's `labelFor`, a Dialog's `initialFocus`, an
   * `ariaLabelledBy` list - and a miss is nothing: no focus, no
   * label association, no log line. Judged against the document's
   * own ids, and only when every id in it is a literal (a bound or
   * unresolved id voids the set, the same caution
   * frontend-action-unknown-id takes with the class). A `$`-prefixed
   * value is resolved client-side and not a static id. Nor is one of
   * the form `<id>-<suffix>` for a literal id: a control creates its
   * internal parts under its own id plus a suffix (sap.m.Page's title
   * is `<page>-title`, a Dialog's `<dialog>-title`), and pointing an
   * ariaLabelledBy at one of them is the documented way to label by a
   * control's own title - the rule cannot see those ids, so it does
   * not claim they are missing. */
  if (member.set === 'associations' && !isBinding(value) && literalIds && !node.unresolvedAttrs?.has(attr)) {
    for (const id of String(value).split(/[\s,]+/).filter(Boolean)) {
      if (id.startsWith('$') || literalIds.has(id)) continue;
      if ([...literalIds].some((known) => id.startsWith(`${known}-`))) continue;
      const suggestion = caseMatch(id, [...literalIds]);
      report({
        control: full, member: attr, value: id, allowed: [...literalIds].sort(), offset,
        ...(suggestion ? { written: id, suggestion } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'association-unknown-id',
  severity: 'warning',
  category: 'data',
  scope: 'node',
  summary: 'an association naming an id no control of the view carries',
  detail: 'The other half of `binding-on-association`. Written right — a plain id, no braces — an association is looked up by that id when the control needs it: a Label\'s `labelFor`, a Dialog\'s `initialFocus`, an `ariaLabelledBy` list. A miss is nothing at all: no focus, no label association, no log line, which is why a renamed id or a ported sample\'s leftover survives. Judged against the document\'s own literal ids, and only when every id in it is a literal — a bound or unresolved id voids the set, the same caution `frontend-action-unknown-id` takes with the class. A `$`-prefixed value is resolved client-side and not a static id. A did-you-mean and a fix where the written id is a real one up to letter case. An id of the form `<known id>-<suffix>` is not reported either: a control creates its internal parts under its own id plus a suffix (`sap.m.Page`\'s title is `<page>-title`), and labelling by a control\'s own title that way is legitimate.',
  example: 'view->tag( `Label` )->a( n = `text` v = `Name` )->a( n = `labelFor` v = `nameInput` )->tag( `Input` )->a( n = `id` v = `name_input` )',
  remedy: 'view->tag( `Label` )->a( n = `text` v = `Name` )->a( n = `labelFor` v = `name_input` )->tag( `Input` )->a( n = `id` v = `name_input` )',
  fixNote: 'Where exactly one id a control of the document carries is the written id up to letter case and the `-`/`_` separators (`nameInput` for `name_input`), the finding names it and `--fix` rewrites the id in the builder call (or the XML attribute). An id no single declared id matches that way is reported without a suggestion.',
  message: (f) => `${f.control} ${f.member} names '${f.value}', which no control of this view declares (known: ${[].concat(f.allowed || []).join(', ') || 'none'}) — UI5 resolves an association by id and a miss is silent` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ''),
  check,
});
