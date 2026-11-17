import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'insecure-asset-url',
  summary: 'an `http://` URL where the page is https',
  detail: 'Every system that is not a developer\'s laptop serves the app over HTTPS, and a secure page may not LOAD an insecure resource: the browser blocks the request as mixed content, the image, font or icon URI never arrives, the control shows its placeholder, and the block is logged only in the console. Judged on the metadata type (`sap.ui.core.URI`), like `relative-asset-url` beside it, so `src`, `icon`, `backgroundImage`, `objectImageURI` and `fontURI` are reached alike — an error for all of them. A hyperlink (`href`, and the ObjectHeader\'s `titleHref`/`introHref`) is the one URI the page does not load but navigates to; the browser merely warns, so that finding carries `hint`. A binding is never judged.',
  example: 'a( n = `src` v = `http://upload.wikimedia.org/wikipedia/commons/x.jpg` )',
  remedy: 'a( n = `src` v = `https://upload.wikimedia.org/wikipedia/commons/x.jpg` )',
  fixNote: 'For a LOADED URI (`src`, `icon`, an image or font) the scheme is rewritten to `https://` — the browser blocks the http load outright, so https is the one scheme under which the asset can arrive. The `href` hint keeps the finding: where a link goes is the author\'s.',
});
