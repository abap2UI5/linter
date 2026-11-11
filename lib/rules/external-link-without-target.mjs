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
  summary: 'an absolute `href` with no `target`',
  detail: 'An abap2UI5 app is ONE page. A link the browser follows in the same window navigates the document itself — the UI5 runtime, every open view and the draft state go with it, and the backend session behind them is orphaned; the back button reloads the app from scratch. A link that means to leave the app says so with `target="_blank"`. Judged on any control carrying an absolute `http(s)://` href without a target on the same element — `sap.m.Link`, `sap.tnt.NavigationListItem`, an `html:a` alike, and the ObjectHeader\'s `titleHref`/`introHref` against their own `titleTarget`/`introTarget`. A relative or bound href is not judged. A hint: the navigation is what the author wrote.',
  example: 'view->tag( `Link` )->a( n = `text` v = `Documentation` )->a( n = `href` v = `https://sdk.openui5.org/` )',
  remedy: 'view->tag( `Link` )->a( n = `text` v = `Documentation` )->a( n = `href` v = `https://sdk.openui5.org/` )->a( n = `target` v = `_blank` )',
  fixNote: 'A `target` attribute call with the value `_blank` is written right behind the href\'s own `a( )` call (`titleTarget` / `introTarget` for the ObjectHeader pairs) — on a line of its own in the house layout, appended in the compact one. ABAP classes only; a raw XML view has no fix.',
  message: (f) => `${f.control} ${f.member}="${short(f.value, 50)}" is an absolute link with no ${f.member.slice(0, -4)}${f.member.length > 4 ? 'T' : 't'}arget — an abap2UI5 app is one page, so the navigation replaces the document and orphans the session; add ${f.member.slice(0, -4)}${f.member.length > 4 ? 'T' : 't'}arget="_blank" to leave the app in a new tab`,
  check,
});
