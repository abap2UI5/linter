import { defineRule } from '../rule.mjs';
import { isA } from '../ui5-meta.mjs';

function check({ data, full, node, report }) {
  /* Accessibility: only defects that are unambiguous from the markup —
   * and only where UI5 actually uses what is being asked for.
   *
   * An icon-only button has no accessible NAME. Any of the three ways
   * of giving it one counts: the text, the tooltip, or an
   * `ariaLabelledBy` association pointing at a control that carries it.
   *
   * An Image is the case that reads backwards: `decorative` DEFAULTS TO
   * TRUE, and a decorative image has no ALT attribute at all — "if the
   * image is set to decorative, the alt property is ignored" is UI5's
   * own wording. So an image without `decorative` is one the framework
   * hides from screen readers on purpose, and demanding `alt` there
   * asks for an attribute UI5 drops. Only an image the author declared
   * MEANINGFUL (`decorative="false"`) and left unnamed is the defect.
   * A bound `decorative` is a runtime matter and stays unjudged. */
  const attrOf = (n) => node.attrs.find(([a]) => a === n)?.[1];
  /* An attribute WRITTEN but not resolvable is not an empty one. A
   * button whose text is `COND #( WHEN … THEN … ELSE … )` or
   * `|{ error_count }|` reconstructs as the empty string, and reading
   * that as "no text" reported three correct buttons as unnamed - a
   * screen reader gets whatever the expression produces at runtime, and
   * nothing here can say it is blank. */
  const named = (n) => node.unresolvedAttrs?.has(n)
    || (node.attrs.some(([a]) => a === n) && (attrOf(n) || node.guessedAttrs?.has(n)));
  const hasName = () => named('text') || named('tooltip') || named('ariaLabelledBy');
  if (isA(data, full, 'sap.m.Button') && attrOf('icon') && !hasName()) {
    report({ control: full, member: 'tooltip', offset: node.offset });
  }
  if (isA(data, full, 'sap.m.Image')
      && String(attrOf('decorative')).toLowerCase() === 'false'
      && !attrOf('alt') && !attrOf('ariaLabelledBy')) {
    report({ control: full, member: 'alt', offset: node.offset });
  }
}

export default defineRule({
  id: 'missing-accessibility',
  severity: 'hint',
  category: 'data',
  scope: 'node',
  summary: 'an icon-only `Button` with no accessible name, a meaningful `Image` without `alt`',
  detail: 'The control is unusable with a screen reader. Both halves are judged the way UI5 itself treats them. A `Button` with an `icon` and no `text` has no accessible name — unless it carries a `tooltip` or an `ariaLabelledBy` association, either of which gives it one. An `Image` is the case that reads backwards: `decorative` **defaults to true**, and for a decorative image UI5 ignores `alt` entirely ("if the image is set to decorative, this property is ignored"). So an image without `decorative` is one the framework hides from screen readers on purpose, and asking it for an `alt` asks for an attribute UI5 drops — only an image the author declared MEANINGFUL with `decorative="false"` and then left unnamed is reported. Never wrong by itself, so it is a hint — switch it off per repo with `"missing-accessibility": false` if your corpus has made another decision.',
  example: 'view->tag( `Image` )->a( n = `src` v = `logo.png` )->a( n = `decorative` v = `false` )',
  remedy: `view->tag( \`Image\`
    )->a( n = \`src\`        v = \`logo.png\`
    )->a( n = \`decorative\` v = \`false\`
    )->a( n = \`alt\`        v = \`Company logo\` )`,
  message: (f) => `${f.control} has no ${f.member} — not usable with a screen reader`,
  check,
});
