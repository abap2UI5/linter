import { defineRule } from '../rule.mjs';
import { hasInlineHandler } from '../view-document.mjs';
import { isBinding } from '../ui5-meta.mjs';

/* Code shipped to the frontend, in the five shapes it travels in, by
 * `shape`: a follow_up_action( ) custom_js (the wire dispatcher), a <script>
 * or an inline handler in markup, a literal on an event, a javascript: URL
 * in a URI-typed property (the property walk). Returns whether it decided
 * the value - the URI shape is then not judged as an asset. */
function check({ shape, fromAbap, control, attr, member, type, value, offset, report }) {
  if (shape === 'custom-js') {
    /* The val of a follow_up_action( ) queued as a statement that is not
     * name-shaped: inserted VERBATIM as custom_js, the raw-JavaScript escape
     * hatch, run unchecked in the browser (checkFrontendWires( ) says which
     * val reaches this). The frontend is a renderer: logic that needs code
     * belongs in ABAP or in a cs_event- action that travels as data. */
    report({ member: 'follow_up_action', value: value.replace(/\s+/g, ' ').slice(0, 40), offset });
    return true;
  }
  // the view-side shapes are judged for reconstructed classes only: a raw
  // .view.xml has a controller of its own
  if (!fromAbap) return false;
  if (shape === 'markup') {
    /* A <script> tag written into an attribute value — the core:HTML
     * content route for shipping JavaScript inside the view. Same
     * verdict as the handler-string and follow_up_action forms: the
     * frontend is a renderer, code does not travel in the view. Judged
     * for reconstructed classes only; <style> stays fine. */
    if (/<script\b/i.test(String(value))) {
      report({ control, member: attr, value: 'script tag', offset });
    } else if (hasInlineHandler(String(value))) {
      /* The same route without the tag: an `onclick=`/`onerror=` on an
       * element of the markup. The default CSP has no 'unsafe-inline',
       * so the browser refuses it and says so only in the console. */
      report({ control, member: attr, value: 'inline handler', offset });
    }
    return false;
  }
  if (shape === 'event') {
    /* The cell of the matrix binding-for-event and event-for-property
     * leave: a LITERAL on an event. In an
     * abap2UI5 class that is a hand-written handler string — UI5's
     * XMLView evaluates it as JavaScript in the browser, code the
     * backend never sees. The frontend is a renderer: wire events
     * with client->_event*( ) so behaviour travels as data. (A raw
     * .view.xml has a controller whose handler names belong there,
     * which is why this only judges reconstructed classes.) */
    const isHandler = String(value).trim().startsWith('.eB(');
    if (member.set === 'events' && !isHandler && !isBinding(value) && String(value).trim() !== '') {
      report({ control, member: attr, value: String(value).slice(0, 40), offset });
    }
    return false;
  }
  // shape 'uri'
  /* A `javascript:` URL: code written into a URI-typed property - a link
   * that runs a script when pressed, an image source that runs one when it
   * loads. The fourth shape of raw-javascript-to-frontend, and as dead as
   * the inline handler: the default CSP refuses it. Judged for classes,
   * like the other view-side shapes of that rule. */
  if (type === 'sap.ui.core.URI' && /^javascript:/i.test(String(value).trim())) {
    report({ control, member: attr, value: 'javascript: URL', offset });
    return true;
  }
  return false;
}

export default defineRule({
  id: 'raw-javascript-to-frontend',
  severity: 'warning',
  category: 'frontend-wires',
  scope: 'app',
  message: (f) => {
    return f.member === 'follow_up_action'
      ? `follow_up_action carries raw JavaScript (…${f.value}…) — it runs unchecked in the browser; use a cs_event- frontend action, which travels as data`
      : f.value === 'script tag'
        ? `${f.control} ${f.member} carries a <script> tag — code does not travel in the view; move the logic to ABAP or a cs_event- frontend action`
        : f.value === 'inline handler'
          ? `${f.control} ${f.member} carries markup with an inline on…= handler — the default CSP refuses inline script, so it never runs (the console says so, nothing else); wire the behaviour as a client->_event*( ) or a cs_event- frontend action`
          : f.value === 'javascript: URL'
            ? `${f.control} ${f.member} is a javascript: URL — code in a URI the default CSP refuses to run; a link that acts is a press wired with client->_event*( ) or a cs_event- frontend action`
            : `${f.control} ${f.member} carries a JavaScript handler string (…${f.value}…) — wire the event with client->_event*( ) so behaviour travels as data, not code`;
  },
  check,
});
