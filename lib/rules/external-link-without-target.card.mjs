import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'external-link-without-target',
  summary: 'an absolute `href` with no `target`',
  detail: 'An abap2UI5 app is ONE page. A link the browser follows in the same window navigates the document itself — the UI5 runtime, every open view and the draft state go with it, and the backend session behind them is orphaned; the back button reloads the app from scratch. A link that means to leave the app says so with `target="_blank"`. Judged on any control carrying an absolute `http(s)://` href without a target on the same element — `sap.m.Link`, `sap.tnt.NavigationListItem`, an `html:a` alike, and the ObjectHeader\'s `titleHref`/`introHref` against their own `titleTarget`/`introTarget`. A relative or bound href is not judged. A hint: the navigation is what the author wrote.',
  example: 'view->tag( `Link` )->a( n = `text` v = `Documentation` )->a( n = `href` v = `https://sdk.openui5.org/` )',
  remedy: 'view->tag( `Link` )->a( n = `text` v = `Documentation` )->a( n = `href` v = `https://sdk.openui5.org/` )->a( n = `target` v = `_blank` )',
  fixNote: 'A `target` attribute call with the value `_blank` is written right behind the href\'s own `a( )` call (`titleTarget` / `introTarget` for the ObjectHeader pairs) — on a line of its own in the house layout, appended in the compact one. ABAP classes only; a raw XML view has no fix.',
});
