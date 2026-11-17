import { defineRule } from '../rule.mjs';
import { documentFacts } from '../view-document.mjs';
import { isUi5Class } from '../css-classes.mjs';

function check({ root, prefixOf, resolve, localName, report }) {
  const { classes, styles, opaqueStyle } = documentFacts(root, prefixOf);
  /* A class token that is neither UI5's nor defined by a stylesheet this
   * document carries. Two shapes are reported: a document with NO style
   * block at all (every custom token is then undefined as far as the view
   * can tell) and one whose blocks define OTHER tokens. A document whose
   * stylesheet the reconstructor could not read is not judged. A hint,
   * because CSS can arrive from outside the class - an app that serves its
   * own stylesheet, a theme - and the view has no way of saying so. */
  if (!opaqueStyle) {
    for (const { node, token, offset } of classes) {
      if (isUi5Class(token) || styles?.has(token)) continue;
      const control = resolve(node) || localName(node);
      report({ control, member: 'class', value: token, offset });
    }
  }
}

export default defineRule({
  id: 'undefined-css-class',
  severity: 'hint',
  category: 'data',
  scope: 'document',
  message: (f) => `${f.control} class="…${f.value}…" names a class neither UI5 nor a <style> block in this document defines — it styles nothing unless a stylesheet outside the class serves it`,
  check,
});
