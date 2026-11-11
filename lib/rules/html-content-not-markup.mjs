import { defineRule, short } from '../rule.mjs';
import { isBinding, lt } from '../ui5-meta.mjs';

function check({ attr, fromAbap, full, node, offset, value, report }) {
  /* sap.ui.core.HTML builds its DOM with `new jQuery(content)`, and
   * jQuery reads a string that does not open with a tag as a
   * SELECTOR: plain text renders nothing, or throws a selector syntax
   * error out of onAfterRendering ("the content must be enclosed in
   * tags, pure text is not supported" - the property's own doc). A
   * value the reconstructor had to guess at is not judged. The fix
   * wraps the text in a <span>, written for the source it is in: the
   * builder escapes a literal itself, raw XML needs the entities. */
  if (full === 'sap.ui.core.HTML' && attr === 'content' && !isBinding(value) && !node.guessedAttrs?.has(attr)) {
    const text = String(value).trim();
    if (text && !text.startsWith('<')) {
      const span = fromAbap ? `<span>${text}</span>` : `&lt;span&gt;${text}&lt;/span&gt;`;
      report({
        control: full, member: attr, value: text, offset,
        ...(/^[^<>&"'`|{}\\\n]+$/.test(text) ? { written: text, suggestion: span } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'html-content-not-markup',
  severity: 'error',
  category: 'structure',
  scope: 'node',
  summary: '`sap.ui.core.HTML` content that does not open with a tag',
  detail: 'The control turns its `content` into DOM with `new jQuery(content)`, and jQuery treats a string that does not start with a tag as a SELECTOR, not as HTML. Plain text therefore renders nothing at all, and text with markup further in (`Total: <b>3</b>`) makes the selector engine throw out of `onAfterRendering`. The property\'s own documentation says it: "the content must be enclosed in tags, pure text is not supported". Leading blanks are fine; a binding and a value the reconstruction had to guess at are not judged. For text, a `Text` or a `FormattedText` is the control; for markup, wrap it in an element.',
  example: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `Welcome back` )   " renders nothing',
  remedy: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<span>Welcome back</span>` )',
  fixNote: 'Plain text with no markup characters in it (no `<`, `>`, `&`, quotes, braces or line breaks) is wrapped in a `<span>` inside its literal — written as the tag in a builder class, whose `a( )` escapes the value itself, and as `&lt;span&gt;` entities in a raw XML view. Text that already carries markup keeps the finding: where the element should begin is the author\'s call.',
  message: (f) => `${f.control} content is text, not markup (${short(f.value, 40)}) — the control builds its DOM with new jQuery(content), which reads a string that does not open with a tag as a SELECTOR: nothing renders, or the selector throws; enclose it in a tag${f.suggestion ? ` (${f.suggestion})` : ''}, or show text with a Text or FormattedText`,
  check,
});
