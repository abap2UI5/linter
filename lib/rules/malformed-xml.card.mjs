import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'malformed-xml',
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
});
