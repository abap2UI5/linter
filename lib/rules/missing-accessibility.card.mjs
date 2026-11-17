import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'missing-accessibility',
  summary: 'an icon-only `Button` with no accessible name, a meaningful `Image` without `alt`',
  detail: 'The control is unusable with a screen reader. Both halves are judged the way UI5 itself treats them. A `Button` with an `icon` and no `text` has no accessible name — unless it carries a `tooltip` or an `ariaLabelledBy` association, either of which gives it one. An `Image` is the case that reads backwards: `decorative` **defaults to true**, and for a decorative image UI5 ignores `alt` entirely ("if the image is set to decorative, this property is ignored"). So an image without `decorative` is one the framework hides from screen readers on purpose, and asking it for an `alt` asks for an attribute UI5 drops — only an image the author declared MEANINGFUL with `decorative="false"` and then left unnamed is reported. Never wrong by itself, so it is a hint — switch it off per repo with `"missing-accessibility": false` if your corpus has made another decision.',
  example: 'view->tag( `Image` )->a( n = `src` v = `logo.png` )->a( n = `decorative` v = `false` )',
  remedy: `view->tag( \`Image\`
    )->a( n = \`src\`        v = \`logo.png\`
    )->a( n = \`decorative\` v = \`false\`
    )->a( n = \`alt\`        v = \`Company logo\` )`,
});
