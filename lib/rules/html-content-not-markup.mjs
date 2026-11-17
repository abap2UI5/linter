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
  fixable: true,
  message: (f) => `${f.control} content is text, not markup (${short(f.value, 40)}) — the control builds its DOM with new jQuery(content), which reads a string that does not open with a tag as a SELECTOR: nothing renders, or the selector throws; enclose it in a tag${f.suggestion ? ` (${f.suggestion})` : ''}, or show text with a Text or FormattedText`,
  check,
});
