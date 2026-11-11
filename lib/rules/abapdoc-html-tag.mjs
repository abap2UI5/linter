import { defineRule } from '../rule.mjs';

/* Every `<tag …>` in a line of ABAP Doc as `{ index, name }` - the `<` and
 * the tag name as written - which is what `/<\/?([a-zA-Z][\w-]*)[^<>]*>/g`
 * matched. Read by hand: that regex scanned from every `<` to the end of a
 * tag that never closes, trying each split of the name's run of characters
 * between its `[\w-]*` and its `[^<>]*`. A tag closes at the first `>` with
 * no `<` before it; a `<` first means no tag started at the one before. */
function abapDocTags(text) {
  const tags = [];
  let lt = text.indexOf('<');
  while (lt >= 0) {
    const at = text[lt + 1] === '/' ? lt + 2 : lt + 1;
    if (at >= text.length || !/[a-zA-Z]/.test(text[at])) {
      lt = text.indexOf('<', lt + 1);
      continue;
    }
    let end = at + 1;
    while (end < text.length && /[\w-]/.test(text[end])) end++;
    let stop = end;
    while (stop < text.length && text[stop] !== '<' && text[stop] !== '>') stop++;
    if (stop === text.length) break;
    if (text[stop] === '>') tags.push({ index: lt, end: stop, name: text.slice(at, end) });
    lt = text[stop] === '<' ? stop : text.indexOf('<', stop + 1);
  }
  return tags;
}

export default defineRule({
  id: 'abapdoc-html-tag',
  severity: 'warning',
  category: 'structure',
  scope: 'class',
  summary: 'a raw `<tag>` inside an ABAP Doc line',
  detail: 'ABAP Doc (`"!`) is parsed as HTML. A placeholder written as `<name>` or a control named as `<Button>` is read as markup: it is dropped from the rendered documentation and ADT\'s ABAP Doc check reports it. Only the tags ABAP Doc defines are markup — `p`, `em`, `strong`, `ul`, `ol`, `li`, `br`, `h1`–`h3` (and `{@link}`, which is not a tag) — and they are left alone; anything else has to be written plain or escaped (`&lt;name&gt;`, the spelling `z2ui5_if_client`\'s own documentation uses). Read from the raw source, since the scrubbed copy has the comment blanked. A warning: the code runs, the documentation says something other than what was written.',
  example: '"! Returns the <name> of the selected row',
  remedy: '"! Returns the &lt;name&gt; of the selected row',
  fixNote: 'The two brackets of the tag are escaped in place — `<` to `&lt;`, `>` to `&gt;` — so the documentation renders the characters that were written. Nothing else on the line changes, and the tags ABAP Doc defines are never touched.',
  message: (f) => `<${f.member}> inside an ABAP Doc line — ABAP Doc is parsed as HTML, so the tag is dropped from the rendered documentation and ADT reports it; write the name plain (only p, em, strong, ul, ol, li, br and h1-h3 are markup)`,
  check({ source, report }) {
    /* A raw `<tag>` inside an ABAP Doc line. ABAP Doc is parsed as HTML: a
     * placeholder written as `<name>` or a control named as `<Button>` is read
     * as markup, dropped from the rendered documentation and reported by ADT's
     * ABAP Doc check. Only the tags ABAP Doc defines are markup (p, em,
     * strong, ul, ol, li, br, h1-h3; `{@link}` is not a tag); anything else is
     * prose that has to be written plain. Over the RAW source: the scrubbed
     * copy has the comment blanked. The fix escapes the two brackets as
     * `&lt;`/`&gt;`, which ABAP Doc renders as the characters that were
     * written - the spelling z2ui5_if_client's own documentation uses. */
    const ABAPDOC_TAGS = new Set(['p', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'h1', 'h2', 'h3']);
    for (const line of source.matchAll(/^[ \t]*"!(.*)$/gm)) {
      for (const tag of abapDocTags(line[1])) {
        if (ABAPDOC_TAGS.has(tag.name.toLowerCase())) continue;
        const at = line.index + line[0].length - line[1].length + tag.index;
        const close = at + tag.end - tag.index;
        report({
          member: tag.name, dedupe: String(at), offset: at,
          fixes: [{ start: at, end: at + 1, text: '&lt;' }, { start: close, end: close + 1, text: '&gt;' }],
        });
      }
    }
  },
});
