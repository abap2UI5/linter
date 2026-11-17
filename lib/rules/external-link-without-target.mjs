import { defineRule, short } from '../rule.mjs';
import { documentFacts } from '../view-document.mjs';

function check({ root, prefixOf, resolve, localName, report }) {
  const { links } = documentFacts(root, prefixOf);
  /* An absolute hyperlink with no `target`. An abap2UI5 app is ONE page: the
   * browser navigates the document itself, the UI5 runtime and every open
   * view with it, and the backend session behind them is orphaned. A link
   * that means to leave the app says so with target="_blank". Any control
   * with an href is judged - sap.m.Link, sap.tnt.NavigationListItem, an
   * html:a - because the navigation is the browser's, not the control's. A
   * bound href is not judged: what the model holds is a runtime question.
   * The ObjectHeader pairs (`titleHref`/`titleTarget`, `introHref`/
   * `introTarget`) are judged against their own target attribute. */
  for (const { node, member, value, offset } of links) {
    const control = resolve(node) || localName(node);
    report({ control, member, value, offset });
  }
}

export default defineRule({
  id: 'external-link-without-target',
  severity: 'hint',
  category: 'data',
  scope: 'document',
  fixable: true,
  message: (f) => `${f.control} ${f.member}="${short(f.value, 50)}" is an absolute link with no ${f.member.slice(0, -4)}${f.member.length > 4 ? 'T' : 't'}arget — an abap2UI5 app is one page, so the navigation replaces the document and orphans the session; add ${f.member.slice(0, -4)}${f.member.length > 4 ? 'T' : 't'}arget="_blank" to leave the app in a new tab`,
  check,
});
