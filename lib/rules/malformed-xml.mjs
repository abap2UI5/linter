import { defineRule } from '../rule.mjs';

/* Run before the walk resolves any control, not after it like the other
 * rules of the document. */
function check({ root, report }) {
  /* The document parseXml( ) could not read as XML at all - reported first,
   * and before any control is resolved: every other finding on such a
   * document is about a tree the browser never builds. */
  for (const m of root.malformed ?? []) {
    report({ control: m.name, member: m.kind, value: m.other ?? '', offset: m.offset });
  }
}

export default defineRule({
  id: 'malformed-xml',
  severity: 'error',
  category: 'structure',
  scope: 'document',
  summary: 'a raw `*.view.xml` / `*.fragment.xml` that is not well-formed XML — a mismatched or unclosed tag, a duplicate or unquoted attribute, a stray `&` or `<`',
  detail: 'The browser parses a view with its XML parser before UI5 sees a single control, and that parser refuses the WHOLE document on the first well-formedness error: a closing tag that names another element than the open one (`</contnt>` for `<content>`), an element never closed, a closing tag with nothing open, the same attribute twice on one tag, an attribute value without quotes (`text=x`), a raw `<` inside an attribute value, or a `&` that starts no XML reference — a bare `&`, or `&nbsp;` and every other HTML entity name, which a view (it has no DTD) does not declare; only `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` and numeric references (`&#160;`) exist. The view does not load at all. The property gate reads the document leniently so that one typo does not hide every other finding, and until this rule it said nothing about the typo itself: such a view passed `--no-render` - and every consumer without a render gate, the VS Code extension and mcp-server among them - with "Success!". A closing tag naming nothing open is read as the misspelt close of the innermost element, so one typo is one finding; an element skipped by a closing tag further out is reported as unclosed. Tags inside a CDATA section are text and are not judged. A builder class cannot produce any of this - it serializes a tree - so the rule is about hand-written XML only; the builder\'s own twin of the duplicate attribute is `duplicate-property`.',
  example: `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">
  <Page title="One" title="Two">
    <content>
      <Text text="hello"/>
    </contnt>
  </Page>`,
  remedy: `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">
  <Page title="One">
    <content>
      <Text text="hello"/>
    </content>
  </Page>
</mvc:View>`,
  message: (f) => {
    const refused = 'not well-formed XML, the browser\'s parser refuses the whole document and the view never loads';
    if (f.member === 'bad-entity') {
      return f.value === '&'
        ? `<${f.control}> holds a bare & — ${refused}; write &amp;`
        : `<${f.control}> holds the entity ${f.value}, which XML does not declare (only &amp; &lt; &gt; &quot; &apos; and numeric references) — ${refused}; write the character itself or a numeric reference (&#160; for &nbsp;)`;
    }
    if (f.member === 'unquoted-attribute') return `<${f.control}> writes the attribute ${f.value} without quotes — ${refused}; write ${f.value}="…"`;
    if (f.member === 'lt-in-attribute') return `<${f.control}> has a raw < in the attribute ${f.value} — ${refused}; write &lt;`;
    return f.member === 'duplicate-attribute'
      ? `<${f.control}> carries the attribute ${f.value} twice — not well-formed XML, the browser's parser refuses the whole document and the view never loads; keep one`
      : f.member === 'mismatched-tag'
        ? `</${f.control}> closes nothing that is open — <${f.value}> is — not well-formed XML, the browser's parser refuses the whole document and the view never loads; close <${f.value}> with </${f.value}>`
        : f.member === 'stray-close'
          ? `</${f.control}> with no element open — not well-formed XML, the browser's parser refuses the whole document and the view never loads; remove it`
          : `<${f.control}> is never closed${f.value ? ` before </${f.value}>` : ''} — not well-formed XML, the browser's parser refuses the whole document and the view never loads; add </${f.control}> or write it self-closing`;
  },
  check,
});
