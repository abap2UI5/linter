/*
 * Raw *.view.xml / *.fragment.xml: the opt-in layout rule xml-indentation,
 * and the XMLView root settings that are no members of the control.
 * Measured on abap2UI5's own frontend (app/webapp, three files): silent, and
 * App.view.xml's controllerName no longer an unknown-property. Added
 * 2026-11-12. And malformed-xml's character-level half - a bare `&`, an
 * entity XML does not declare (`&nbsp;`), an unquoted attribute value, a raw
 * `<` in one - found by the 2026-11-12 org-wide bug hunt.
 */
export default async function ({ section, assert, checkXmlSource }) {
  const layout = (xml) => checkXmlSource(xml, { render: false, file: 'x.view.xml', rules: { 'xml-indentation': 'hint' } })
    .findings.filter((x) => x.type === 'xml-indentation').map((x) => `${x.member}@${x.line}`);

  section('xml-indentation: judged against the tree, opt-in', () => {
    const good = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">\n  <Page>\n    <Button text="A"/>\n    <Button text="B"/>\n  </Page>\n</mvc:View>\n';
    assert(layout(good).length === 0, 'a consistent file is silent');
    const tabs = good.replace(/^ {2}/gm, '\t').replace(/^\t {2}/gm, '\t\t');
    assert(layout(tabs).length === 0, `its own rhythm (tabs) is silent too (${layout(tabs).join()})`);
    const bad = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">\n  <Page>\n      <Button text="A"/>\n    <Button text="B"/>\n  <Text text="C"/>\n </Page>\n</mvc:View>\n';
    assert(layout(bad).join() === 'sibling@4,child@5,closing@6', `a sibling out of line, a child at its parent's column, a closing tag off its opening (${layout(bad).join()})`);
    assert(!checkXmlSource(bad, { render: false, file: 'x.view.xml' }).findings.some((x) => x.type === 'xml-indentation'), 'and nothing without the rules entry');
  });

  section('unknown-property: the XMLView root settings are no members', () => {
    const xml = '<mvc:View controllerName="a.b.C" resourceBundleName="a.i18n" xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Page/></mvc:View>';
    const hits = checkXmlSource(xml, { render: false, file: 'x.view.xml' }).findings.filter((x) => x.type === 'unknown-property');
    assert(hits.length === 0, `controllerName and resourceBundleName are view settings (${hits.map((x) => x.member).join()})`);
    const typo = checkXmlSource(xml.replace('<Page/>', '<Page titel="x"/>'), { render: false, file: 'x.view.xml' }).findings.filter((x) => x.type === 'unknown-property');
    assert(typo.length === 1, 'a typo on a control is still one');
  });

  section('malformed-xml: a stray & or <, an undeclared entity and an unquoted value', () => {
    const doc = (body) => `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m">\n  <Page title="ok">\n${body}\n  </Page>\n</mvc:View>\n`;
    const kinds = (body) => checkXmlSource(doc(body), { render: false, file: 'x.view.xml' })
      .findings.filter((x) => x.type === 'malformed-xml').map((x) => `${x.member}:${x.value}`).sort().join();
    assert(kinds('    <Text text="a & b"/>') === 'bad-entity:&', `a bare & in an attribute (${kinds('    <Text text="a & b"/>')})`);
    assert(kinds('    <Text text="a&nbsp;b"/>') === 'bad-entity:&nbsp;', 'an HTML entity name XML does not declare');
    assert(kinds('    <Text>fish & chips</Text>') === 'bad-entity:&', 'a bare & in character data');
    assert(kinds('    <Text text=x/>') === 'unquoted-attribute:text', 'an unquoted attribute value');
    assert(kinds('    <Text text="a < b"/>') === 'lt-in-attribute:text', 'a raw < in an attribute value');
    // what XML allows stays silent
    const fine = '    <Text text="A &amp; B &lt; &gt; &quot; &apos; &#169; &#xA9;" tooltip=\'say "hi" > bye\'/>\n'
      + '    <!-- a & b < c -->\n    <core:HTML xmlns:core="sap.ui.core"><![CDATA[ a & b ]]></core:HTML>';
    assert(kinds(fine) === '', `the five entities, numeric references, a > in a value, & in a comment and in CDATA (${kinds(fine)})`);
  });
}
