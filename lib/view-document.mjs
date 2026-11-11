/*
 * view-document - what the rules of scope 'document' (lib/rules/) read about
 * a whole view: the namespaces it declares and uses, the class tokens it
 * writes and the stylesheets it carries, the hyperlinks that leave the page.
 * Collected in one walk per document (documentFacts( ), kept per root) and
 * read by each rule in turn. An internal module: not in the exports map.
 */
import { walkTree } from './tree.mjs';
import { isBinding, isAggregationTag } from './ui5-meta.mjs';
import { classTokens, definedCssClasses, hasStyleBlock } from './css-classes.mjs';

export const XML_RESERVED_PREFIX = /^(?:xmlns|xml)$/;
export const isHttpUrl = (v) => /^https?:\/\//i.test(String(v).trim());
/* A hyperlink property: `href`, and the prefixed pairs sap.m.ObjectHeader
 * writes (`titleHref`/`titleTarget`, `introHref`/`introTarget`). The browser
 * NAVIGATES to these rather than loading them, which is what separates a
 * link from an asset (the asset-URL rules of the walk read it too). */
export const isHrefAttr = (name) => /href$/i.test(name);
export const targetAttrFor = (hrefAttr) => `${hrefAttr.slice(0, -4)}${hrefAttr.length > 4 ? 'T' : 't'}arget`;

const FACTS = new WeakMap();

/** What the document under `root` declares, uses and links - read once per
 *  root. `prefixOf` is the walk's: the prefix a tag name carries. */
export function documentFacts(root, prefixOf) {
  if (FACTS.has(root)) return FACTS.get(root);
  const declared = []; // [{ prefix, uri, offset, node }] for every xmlns:<prefix> write
  const used = new Set(); // every prefix a tag name or an attribute name carries
  const links = []; // controls carrying an absolute href
  const classes = []; // [node, token, offset] for every literal class token
  let styles = null; // the union of every <style> block's class selectors
  let opaqueStyle = false; // a content attribute the reconstructor could not follow

  walkTree((collect, node) => {
    if (node.name !== null) {
      const prefix = prefixOf(node);
      if (prefix) used.add(prefix);
      const hrefs = []; // every absolute hyperlink on the node, with the target attr it pairs with
      const names = new Set((node.attrs || []).map(([n]) => n));
      for (const [n, v, at] of node.attrs || []) {
        const m = n.match(/^xmlns(?::([\w.-]+))?$/);
        if (m) {
          // the default namespace is never reported: it is what every
          // unprefixed tag in the document resolves against
          if (m[1]) declared.push({ prefix: m[1], uri: String(v), offset: at ?? node.offset, node });
          continue;
        }
        const colon = n.indexOf(':');
        if (colon > 0) {
          const attrPrefix = n.slice(0, colon);
          if (!XML_RESERVED_PREFIX.test(attrPrefix)) used.add(attrPrefix);
        }
        if (isHrefAttr(n) && !isBinding(v) && isHttpUrl(v)) hrefs.push({ member: n, value: String(v), offset: at ?? node.offset });
        /* A value the reconstruction GUESSED (`|state-{ ls-row-state }|` in a
         * LOOP) is not the class that runs: its tokens are the literal parts
         * of a name completed at runtime, and `state-` was reported as a class
         * nothing defines. */
        if (n === 'class' && !isBinding(v) && !node.guessedAttrs?.has('class')) {
          for (const token of classTokens(v)) classes.push({ node, token, offset: at ?? node.offset });
        }
        const text = String(v);
        if (hasStyleBlock(text)) {
          const defined = definedCssClasses(text);
          styles ??= new Set();
          for (const c of defined ?? []) styles.add(c);
          // an opening tag with no closing one in the same value: the sheet
          // continues in a value this walk cannot see
          if (!defined) opaqueStyle = true;
        }
      }
      /* The reconstructor drops a `content` it could not follow (a sheet
       * assembled at runtime, a COND). Judging the class tokens as undefined
       * then would report the one document that most plausibly defines them
       * — a blind spot is not a defect, so the whole document steps aside. */
      if (node.unresolvedAttrs?.has('content')) opaqueStyle = true;
      if (!isAggregationTag(String(node.name))) {
        for (const h of hrefs) if (!names.has(targetAttrFor(h.member))) links.push({ node, ...h });
      }
    }
    for (const c of node.children) collect(c);
  }, root);
  const facts = { declared, used, links, classes, styles, opaqueStyle };
  FACTS.set(root, facts);
  return facts;
}

/** Whether a markup string carries an inline event handler: an `on…=`
 *  attribute inside one of its tags. Read tag by tag, so prose that merely
 *  says "onclick=" outside a tag is not one. */
export function hasInlineHandler(text) {
  if (!text.includes('<')) return false;
  for (const tag of text.matchAll(/<[a-z][^<>]*>/gi)) {
    if (/\son[a-z]+\s*=/i.test(tag[0])) return true;
  }
  return false;
}
