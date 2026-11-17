import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'html-content-not-markup',
  summary: '`sap.ui.core.HTML` content that does not open with a tag',
  detail: 'The control turns its `content` into DOM with `new jQuery(content)`, and jQuery treats a string that does not start with a tag as a SELECTOR, not as HTML. Plain text therefore renders nothing at all, and text with markup further in (`Total: <b>3</b>`) makes the selector engine throw out of `onAfterRendering`. The property\'s own documentation says it: "the content must be enclosed in tags, pure text is not supported". Leading blanks are fine; a binding and a value the reconstruction had to guess at are not judged. For text, a `Text` or a `FormattedText` is the control; for markup, wrap it in an element.',
  example: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `Welcome back` )   " renders nothing',
  remedy: 'view->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<span>Welcome back</span>` )',
  fixNote: 'Plain text with no markup characters in it (no `<`, `>`, `&`, quotes, braces or line breaks) is wrapped in a `<span>` inside its literal — written as the tag in a builder class, whose `a( )` escapes the value itself, and as `&lt;span&gt;` entities in a raw XML view. Text that already carries markup keeps the finding: where the element should begin is the author\'s call.',
});
