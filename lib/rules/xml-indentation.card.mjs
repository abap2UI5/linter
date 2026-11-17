import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'xml-indentation',
  summary: 'a raw view or fragment whose indentation does not follow its tree',
  detail: 'The raw-XML half of `chain-indentation`: in a `*.view.xml` or `*.fragment.xml`, an element that begins a line has to stand deeper than the line of its parent, every sibling that begins a line in the column of the first one, and a closing tag on a line of its own in the column of its opening tag. Judged against the tree, never against a number of spaces - a file that keeps its own rhythm is silent. Opt-in, like the house layout of a builder chain: most raw views in a repository are vendored or generated, and the rule belongs where a team writes its own (abap2UI5\'s frontend). Ask for it with `"rules": { "xml-indentation": "hint" }`.',
  example: `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">
  <Page>
      <Button text="A"/>
    <Button text="B"/>
  </Page>
</mvc:View>`,
  remedy: `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">
  <Page>
    <Button text="A"/>
    <Button text="B"/>
  </Page>
</mvc:View>`,
});
