/*
 * Review round 2026-09 - the property gate (lib/properties.mjs): aggregation
 * cardinality, the harvested `widensAggregation` flag, dotted and in-name
 * namespace prefixes, a field read straight off a table, the dedupe key,
 * members relocated into a younger base class, an aggregation tag in a
 * foreign namespace, an association written as a tag, and directives inside
 * literals. See test/review/README.md for the harness.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyFixes } from '../../lib/fix.mjs';
import { parseXml } from '../../lib/properties.mjs';

const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'properties.json');

/* A class in the house layout whose root declares every prefix the sections
 * below use - except `core`, which the undeclared-namespace section wants
 * missing. `body` continues the chain, `decl` goes into the PUBLIC SECTION,
 * `pre` is a statement before the chain (a directive's line). */
const cls = (body, { decl = '', pre = '' } = {}) => `CLASS zcl_props DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
${decl}
ENDCLASS.


CLASS zcl_props IMPLEMENTATION.

  METHOD z2ui5_if_app~main.
${pre}
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).

    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`            v = \`sap.m\`
        )->a( n = \`xmlns:mvc\`        v = \`sap.ui.core.mvc\`
        )->a( n = \`xmlns:f\`          v = \`sap.f\`
        )->a( n = \`xmlns:card\`       v = \`sap.f.cards\`
        )->a( n = \`xmlns:uxap\`       v = \`sap.uxap\`
        )->a( n = \`xmlns:table\`      v = \`sap.ui.table\`
        )->a( n = \`xmlns:plugins\`    v = \`sap.m.plugins\`
        )->a( n = \`xmlns:columnmenu\` v = \`sap.m.table.columnmenu\`
${body}

    client->view_display( view->stringify( ) ).

  ENDMETHOD.

ENDCLASS.
`;

const XML_ROOT = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc" xmlns:f="sap.f" xmlns:table="sap.ui.table" xmlns:core="sap.ui.core">';
const xmlView = (inner) => `${XML_ROOT}\n${inner}\n</mvc:View>`;

export default async function ({ section, assert, f, tempDir, checkAbapSource, checkXmlSource }) {
  const o = { render: false };
  const only = (result, type) => result.findings.filter((x) => x.type === type);
  const readSnapshot = () => JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  /* A snapshot the committed one does not have, written to a temp dir and
   * handed in through the `snapshot` option - the way to assert a metadata
   * shape without hand-editing data/properties.json. */
  const syntheticSnapshot = (patch) => {
    const data = readSnapshot();
    patch(data.controls);
    const file = path.join(tempDir('abap2ui5lint-props-'), 'properties.json');
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };

  section('too-many-children: an absent `multiple` is 0..n, only an explicit false is 0..1', () => {
    const real = readSnapshot().controls;
    /* ManagedObjectMetadata: `multiple = typeof info.multiple === 'boolean' ?
     * info.multiple : true`. The UI5 sources omit the flag on these four
     * public aggregations, so a Menu with two actions used to be reported. */
    const menu = real['sap.m.table.columnmenu.Menu'].aggregations;
    assert(menu.items.multiple !== false && menu.quickActions.multiple !== false,
      'premise: Menu.items and Menu.quickActions are not 0..1 in the snapshot');
    const twoActions = checkAbapSource(cls(`        )->ele( n = \`Menu\` ns = \`columnmenu\`
            )->ele( n = \`quickActions\` ns = \`columnmenu\`
                )->tag( n = \`QuickAction\` ns = \`columnmenu\`
                )->tag( n = \`QuickAction\` ns = \`columnmenu\`
            )->end(
            )->ele( n = \`items\` ns = \`columnmenu\`
                )->tag( n = \`ActionItem\` ns = \`columnmenu\`
                )->tag( n = \`ActionItem\` ns = \`columnmenu\` ).`), { ...o, minUi5: '1.120' });
    assert(!only(twoActions, 'too-many-children').length,
      `a Menu with two quick actions and two items is not 0..1 overflow (got ${only(twoActions, 'too-many-children').map((x) => x.member).join(',') || 'nothing'})`);

    /* The same rule read off the snapshot: Page.customHeader IS 0..1 in UI5,
     * and it is reported exactly when the metadata says so. With a snapshot
     * that never wrote `false` nothing is 0..1; once the generator writes the
     * flag explicitly the finding is back. Both states of the file pass. */
    const custom = real['sap.m.Page'].aggregations.customHeader;
    const twoBars = only(checkAbapSource(cls(`        )->ele( \`Page\`
            )->ele( \`customHeader\`
                )->tag( \`Bar\`
                )->tag( \`Bar\` ).`), o), 'too-many-children');
    assert((twoBars.length === 1) === (custom.multiple === false),
      `Page customHeader with two Bars is reported exactly when the snapshot says multiple: false (snapshot ${JSON.stringify(custom.multiple)}, ${twoBars.length} finding(s))`);

    const snapshot = syntheticSnapshot((c) => {
      c['sap.m.Page'].aggregations.customHeader.multiple = false;
      c['sap.m.Page'].aggregations.content.multiple = true;
      c['sap.ui.table.Column'].aggregations.label.multiple = false;
      c['sap.m.table.columnmenu.Menu'].aggregations.items.multiple = true;
    });
    const s = { ...o, snapshot };
    const explicit = only(checkAbapSource(cls(`        )->ele( \`Page\`
            )->ele( \`customHeader\`
                )->tag( \`Bar\`
                )->tag( \`Bar\` ).`), s), 'too-many-children');
    assert(explicit.length === 1 && explicit[0].member === 'customHeader' && explicit[0].count === 2,
      `an explicit multiple: false is 0..1 - two Bars are reported (got ${explicit.map((x) => `${x.member}:${x.count}`).join(',') || 'nothing'})`);
    assert(!only(checkAbapSource(cls(`        )->ele( \`Page\` )->ele( \`customHeader\` )->tag( \`Bar\` ).`), s), 'too-many-children').length,
      'one Bar in it is fine');
    assert(!only(checkAbapSource(cls(`        )->ele( \`Page\` )->ele( \`content\` )->tag( \`Button\` )->tag( \`Button\` ).`), s), 'too-many-children').length,
      'an explicit multiple: true takes as many as it likes');
    assert(!only(checkAbapSource(cls(`        )->ele( n = \`Menu\` ns = \`columnmenu\`
            )->ele( n = \`items\` ns = \`columnmenu\`
                )->tag( n = \`ActionItem\` ns = \`columnmenu\`
                )->tag( n = \`ActionItem\` ns = \`columnmenu\` ).`), { ...s, minUi5: '1.120' }), 'too-many-children').length,
      'Menu.items written with the flag is 0..n');

    /* The DEFAULT aggregation has a cardinality too: two controls straight
     * under a table:Column fill `label` (0..1) twice, UI5 logs "multiple
     * aggregates defined for aggregation label with cardinality 0..1" and
     * keeps the last. Only the explicit-tag form was ever checked. */
    const column = (children) => xmlView(`  <table:Table>\n    <table:columns>\n      <table:Column>\n${children}\n      </table:Column>\n    </table:columns>\n  </table:Table>`);
    const twoLabels = only(checkXmlSource(column('        <Label text="a"/>\n        <Text text="b"/>'), s), 'too-many-children');
    assert(twoLabels.length === 1 && twoLabels[0].member === 'label' && twoLabels[0].count === 2 && twoLabels[0].control === 'sap.ui.table.Column',
      `two controls in a 0..1 default aggregation are reported under the aggregation's name (got ${twoLabels.map((x) => `${x.control} ${x.member}:${x.count}`).join(',') || 'nothing'})`);
    assert(twoLabels[0]?.line === 6, `the finding points at the second child, the one that overflows (line ${twoLabels[0]?.line})`);
    assert(!only(checkXmlSource(column('        <Label text="a"/>'), s), 'too-many-children').length, 'one child in it is fine');
    assert(!only(checkXmlSource(column('        <template:if test="{/X}" xmlns:template="http://schemas.sap.com/sapui5/extension/sap.ui.core.template/1">\n          <Label text="a"/>\n        </template:if>\n        <Label text="b"/>'), s), 'too-many-children').length,
      'a templating instruction is not a control and does not count');
    assert(!only(checkAbapSource(cls(`        )->ele( \`Page\` )->tag( \`Button\` )->tag( \`Button\` ).`), s), 'too-many-children').length,
      'a 0..n default aggregation (Page content) takes as many as it likes');
    // the committed snapshot: the same invariant as for the explicit tag
    const realLabel = only(checkXmlSource(column('        <Label text="a"/>\n        <Text text="b"/>'), o), 'too-many-children');
    assert((realLabel.length === 1) === (real['sap.ui.table.Column'].aggregations.label.multiple === false),
      `Column label with two children is reported exactly when the snapshot says multiple: false (snapshot ${JSON.stringify(real['sap.ui.table.Column'].aggregations.label.multiple)})`);
  });

  section('invalid-aggregation-child: an owner that overrides addAggregation( ) is not judged by its declared types', () => {
    const real = readSnapshot().controls;
    assert(real['sap.uxap.ObjectPageSubSection'].widensAggregation === true,
      'premise: the harvest flags ObjectPageSubSection as widening its aggregations');
    /* blocks is declared as sap.ui.core.Control; ObjectPageLazyLoader is an
     * Element, and ObjectPageSubSection.addAggregation( ) stashes or unwraps
     * it. samples-controls app 592 carries a property_gate.skip for exactly
     * this finding. */
    const lazy = checkAbapSource(cls(`        )->ele( n = \`ObjectPageLayout\` ns = \`uxap\`
            )->ele( n = \`sections\` ns = \`uxap\`
                )->ele( n = \`ObjectPageSection\` ns = \`uxap\`
                    )->ele( n = \`subSections\` ns = \`uxap\`
                        )->ele( n = \`ObjectPageSubSection\` ns = \`uxap\`
                            )->ele( n = \`blocks\` ns = \`uxap\`
                                )->ele( n = \`ObjectPageLazyLoader\` ns = \`uxap\`
                                    )->a( n = \`stashed\` v = \`true\`
                                    )->tag( \`Text\`
                                        )->a( n = \`text\` v = \`lazy\` ).`), o);
    assert(!only(lazy, 'invalid-aggregation-child').length,
      `an ObjectPageLazyLoader in ObjectPageSubSection blocks is accepted (got ${only(lazy, 'invalid-aggregation-child').map((x) => x.control).join(',') || 'nothing'})`);
    // positive control: where nothing widens the aggregation the declared type still rules
    const button = only(checkAbapSource(cls(`        )->ele( \`Table\` )->ele( \`columns\` )->tag( \`Button\` ).`), o), 'invalid-aggregation-child');
    assert(button.length === 1 && button[0].expected === 'sap.m.Column' && button[0].parentControl === 'sap.m.Table',
      `a Button in sap.m.Table columns is still reported (got ${button.map((x) => `${x.control} in ${x.parentControl}`).join(',') || 'nothing'})`);
    // the flag is read along the chain: sap.ui.table.Table writes the override, a TreeTable inherits it
    assert(real['sap.ui.table.Table'].widensAggregation === true && !real['sap.ui.table.TreeTable'].widensAggregation
      && real['sap.ui.table.TreeTable'].parent === 'sap.ui.table.Table', 'premise: the flag sits on Table, not on its subclass TreeTable');
    const tree = checkXmlSource(xmlView('  <table:TreeTable>\n    <table:columns>\n      <Button text="x"/>\n    </table:columns>\n  </table:TreeTable>'), o);
    assert(!only(tree, 'invalid-aggregation-child').length, 'a subclass of a widening control inherits the override');
    // the flag, not the control, decides
    const widened = { ...o, snapshot: syntheticSnapshot((c) => { c['sap.m.Table'].widensAggregation = true; }) };
    assert(!only(checkAbapSource(cls(`        )->ele( \`Table\` )->ele( \`columns\` )->tag( \`Button\` ).`), widened), 'invalid-aggregation-child').length,
      'the same Button is accepted once the snapshot flags sap.m.Table');
    /* ManagedObject is where addAggregation( ) is DEFINED; a harvest that
     * records the flag on it must not switch the check off for every control */
    const rooted = { ...o, snapshot: syntheticSnapshot((c) => { c['sap.ui.base.ManagedObject'].widensAggregation = true; }) };
    assert(only(checkAbapSource(cls(`        )->ele( \`Table\` )->ele( \`columns\` )->tag( \`Button\` ).`), rooted), 'invalid-aggregation-child').length === 1,
      'a flag on sap.ui.base.ManagedObject itself changes nothing');
  });

  section('parseXml: a dotted namespace prefix is a prefix, not a tag name', () => {
    const xml = fs.readFileSync(f('vizframe.view.xml'), 'utf8');
    const tree = parseXml(xml);
    const find = (node, name) => (node.name === name ? node : node.children.map((c) => find(c, name)).find(Boolean));
    const dataset = find(tree, 'FlattenedDataset');
    assert(dataset?.ns === 'viz.data', `the tag is FlattenedDataset in viz.data (got name ${dataset?.name}, ns ${dataset?.ns}; a viz.data node: ${Boolean(find(tree, 'viz.data'))})`);
    assert(dataset?.attrs.some(([n, v]) => n === 'data' && v === '{/T_SALES}'), 'its attributes are its own, not swallowed into the name');
    assert(find(tree, 'FeedItem')?.ns === 'viz.feeds', 'the second dotted prefix parses the same way');
    const r = checkXmlSource(xml, { ...o, distribution: 'sapui5' });
    assert(r.findings.length === 0,
      `a VizFrame view is clean (got ${r.findings.map((x) => `${x.type} ${x.control ?? ''}/${x.member ?? ''}`).join(', ') || 'nothing'})`);
    // and the prefix is JUDGED like any other: undeclared, it is reported under its dotted name
    const undeclared = checkXmlSource(xml.replace('xmlns:viz.data="sap.viz.ui5.data"', ''), { ...o, distribution: 'sapui5' });
    assert(only(undeclared, 'undeclared-namespace').some((x) => x.member === 'viz.data' && x.control === 'FlattenedDataset'),
      `a missing xmlns:viz.data is an undeclared-namespace on the dotted prefix (got ${only(undeclared, 'undeclared-namespace').map((x) => x.member).join(',') || 'nothing'})`);
    assert(!only(undeclared, 'aggregation-in-aggregation').length, 'never an aggregation-in-aggregation at the view root');
  });

  section('undeclared-namespace: the prefix inside the name (`core:Icon`) is judged like the ns form', () => {
    const nameForm = cls(`        )->ele( \`Page\`
            )->tag( \`core:Icon\`
                )->a( n = \`src\` v = \`sap-icon://add\` ).`);
    const nsForm = cls(`        )->ele( \`Page\`
            )->tag( n = \`Icon\` ns = \`core\`
                )->a( n = \`src\` v = \`sap-icon://add\` ).`);
    for (const [label, src] of [['name form', nameForm], ['ns form', nsForm]]) {
      const und = only(checkAbapSource(src, o), 'undeclared-namespace');
      assert(und.length === 1 && und[0].member === 'core' && und[0].control === 'Icon',
        `${label}: the undeclared core prefix is reported on Icon (got ${und.map((x) => `${x.control}/${x.member}`).join(',') || 'nothing'})`);
      assert(und[0]?.fixes?.length === 1 && !only(checkAbapSource(applyFixes(src, und).output, o), 'undeclared-namespace').length,
        `${label}: the conventional prefix carries a fix that declares it`);
      // declared, the node is judged - a typo'd property on it is seen in both forms
      const declared = src.replace(')->ele( `Page`', ')->a( n = `xmlns:core` v = `sap.ui.core`\n        )->ele( `Page`').replace('`src`', '`srcc`');
      const r = checkAbapSource(declared, o);
      assert(!only(r, 'undeclared-namespace').length && only(r, 'unknown-property').some((x) => x.control === 'sap.ui.core.Icon' && x.member === 'srcc'),
        `${label}: with the declaration the control resolves and its members are judged (got ${r.findings.map((x) => `${x.type} ${x.control ?? ''}/${x.member ?? ''}`).join(', ') || 'nothing'})`);
    }
    const xml = only(checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Page><core:Icon src="sap-icon://add"/></Page></mvc:View>', o), 'undeclared-namespace');
    assert(xml.length === 1 && xml[0].member === 'core' && xml[0].control === 'Icon', 'XML: <core:Icon> without xmlns:core is reported the same way');
    // an aggregation tag with an undeclared prefix is the same defect
    const agg = only(checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Page><l:content><Text text="x"/></l:content></Page></mvc:View>', o), 'undeclared-namespace');
    assert(agg.length === 1 && agg[0].member === 'l', `an aggregation tag with an undeclared prefix is reported too (got ${agg.map((x) => x.member).join(',') || 'nothing'})`);
  });

  section('unknown-binding-path: a field read straight off a table needs a row index', () => {
    const decl = `    TYPES: BEGIN OF ty_row,
             field TYPE string,
           END OF ty_row.
    DATA t TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
    DATA: BEGIN OF s,
            field TYPE string,
          END OF s.`;
    const probe = (value) => only(checkAbapSource(cls(`        )->ele( \`List\`
            )->a( n = \`items\`      v = client->_bind( t )
            )->a( n = \`headerText\` v = client->_bind( s-field )
            )->tag( \`Text\`
                )->a( n = \`text\` v = \`${value}\` ).`, { decl }), o), 'unknown-binding-path');
    /* the JSONModel reads /T/FIELD as the property FIELD of the array, which is
     * undefined - the walk used to step into row 0 and accept it */
    for (const value of ['{/T/FIELD}', '{= ${/T/FIELD} }', "{ path: '/T/FIELD' }"]) {
      const found = probe(value);
      assert(found.length === 1 && found[0].value === '/T/FIELD' && found[0].table === '/T',
        `${value}: a field on the table is reported, naming the table (got ${found.map((x) => `${x.value} table=${x.table}`).join(',') || 'nothing'})`);
      assert(/row index/.test(found[0]?.message || ''), `${value}: the message says a row index is missing (${found[0]?.message})`);
    }
    const rowTypo = probe('{/T/0/NOPE}');
    assert(rowTypo.length === 1 && rowTypo[0].value === '/T/0/NOPE' && rowTypo[0].table === undefined && !/row index/.test(rowTypo[0].message),
      `{/T/0/NOPE}: a wrong field behind a row index is a plain missing path (got ${rowTypo.map((x) => `${x.value} table=${x.table}`).join(',') || 'nothing'})`);
    const structTypo = probe('{/S/NOPE}');
    assert(structTypo.length === 1 && structTypo[0].value === '/S/NOPE' && structTypo[0].table === undefined,
      `{/S/NOPE}: a wrong field of a structure is a plain missing path (got ${structTypo.map((x) => x.value).join(',') || 'nothing'})`);
    for (const value of ['{/T}', '{/T/0/FIELD}', '{/T/length}', '{/S/FIELD}']) {
      assert(!probe(value).length, `${value} resolves (got ${probe(value).map((x) => x.value).join(',') || 'nothing'})`);
    }
  });

  section('dedupe: two controls with the same wrong value are two findings, fixed in one --fix pass', () => {
    const two = `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">
  <Button type="emphasized" text="a"/>
  <Button type="emphasized" text="b"/>
</mvc:View>`;
    const r = checkXmlSource(two, o);
    const bad = only(r, 'invalid-property-value');
    assert(bad.length === 2 && bad[0].line === 2 && bad[1].line === 3,
      `XML: both Buttons are reported (got ${bad.map((x) => `${x.value}@${x.line}`).join(',')})`);
    const fixed = applyFixes(two, bad);
    assert(fixed.applied === 2 && fixed.deferred === 0 && checkXmlSource(fixed.output, o).findings.length === 0,
      `XML: one --fix pass corrects both (applied ${fixed.applied}, deferred ${fixed.deferred}, left ${checkXmlSource(fixed.output, o).findings.length})`);

    const abap = cls(`        )->ele( \`Page\`
            )->tag( \`Button\`
                )->a( n = \`type\` v = \`emphasized\`
            )->tag( \`Button\`
                )->a( n = \`type\` v = \`emphasized\` ).`);
    const twice = only(checkAbapSource(abap, o), 'invalid-property-value');
    assert(twice.length === 2 && twice[0].line !== twice[1].line,
      `ABAP: two builder calls with the same wrong value are two findings (got ${twice.map((x) => x.line).join(',')})`);
    assert(only(checkAbapSource(applyFixes(abap, twice).output, o), 'invalid-property-value').length === 0,
      'ABAP: one --fix pass corrects both calls');

    /* What the dedupe still exists for: a void helper method replayed at
     * every call site builds its nodes at the helper body's offsets, so its
     * one defect is one finding - and one fix that corrects every replay. */
    const helper = `CLASS zcl_helper DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
  PROTECTED SECTION.
    METHODS render_button
      IMPORTING
        box TYPE REF TO z2ui5_cl_ui5_view_builder.
ENDCLASS.

CLASS zcl_helper IMPLEMENTATION.

  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    DATA(page) = view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\` ).
    render_button( page ).
    render_button( page ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.

  METHOD render_button.
    box->tag( \`Button\`
        )->a( n = \`type\` v = \`emphasized\` ).
  ENDMETHOD.

ENDCLASS.
`;
    const rh = checkAbapSource(helper, o);
    assert((rh.docs[0].match(/<Button/g) || []).length === 2, `premise: the helper is replayed twice (${rh.docs[0]})`);
    const replayed = only(rh, 'invalid-property-value');
    assert(replayed.length === 1, `a helper replayed twice is one finding (got ${replayed.length})`);
    assert(only(checkAbapSource(applyFixes(helper, replayed).output, o), 'invalid-property-value').length === 0,
      'and its one fix corrects every replay');
  });

  section('member-too-new: a member relocated into a younger base class keeps the subclass\'s release', () => {
    const real = readSnapshot().controls;
    assert(real['sap.m.ListItemActionBase'].since === '1.137' && String(real['sap.m.FeedListItemAction'].since).startsWith('1.52')
      && real['sap.m.ListItemActionBase'].properties.text && !real['sap.m.FeedListItemAction'].properties?.text,
      'premise: text lives on the @1.137 ListItemActionBase, the @1.52 FeedListItemAction inherits it');
    const feed = (minUi5) => only(checkAbapSource(cls(`        )->ele( \`List\`
            )->ele( \`items\`
                )->ele( \`FeedListItem\`
                    )->ele( \`actions\`
                        )->tag( \`FeedListItemAction\`
                            )->a( n = \`text\` v = \`x\`
                            )->a( n = \`icon\` v = \`sap-icon://add\` ).`), { ...o, minUi5 }), 'member-too-new');
    assert(!feed('1.100').length,
      `FeedListItemAction text and icon are within a 1.100 floor (got ${feed('1.100').map((x) => `${x.member}@${x.since}`).join(',') || 'nothing'})`);
    const below = feed('1.51');
    assert(below.length === 2 && below.every((x) => x.since === real['sap.m.FeedListItemAction'].since),
      `below the control's own release the clamped date is what is reported (got ${below.map((x) => `${x.member}@${x.since}`).join(',') || 'nothing'})`);
    /* sap.f.cards.Header is @1.64 and declares press at 1.64 (the tagged
     * 1.64.0 source); BaseHeader @1.86 took the event over untagged. The
     * earlier reading - "a member cannot predate the class that declares it" -
     * reported press as 1.86 on two corpus ports. */
    assert(!only(checkAbapSource(fs.readFileSync(f('inheritedsince.clas.abap'), 'utf8'), o), 'member-too-new').length,
      'press on a card Header is not newer than the Header');
    // a member the younger base class gained AFTER its own release is new for the subclass too
    const stamp = only(checkAbapSource(cls(`        )->tag( n = \`Header\` ns = \`card\` )->a( n = \`dataTimestamp\` v = \`x\` ).`), o), 'member-too-new');
    assert(stamp.some((x) => x.member === 'dataTimestamp' && x.since === '1.89'),
      `BaseHeader.dataTimestamp (@1.89 on the @1.86 class) stays 1.89 for the Header (got ${stamp.map((x) => `${x.member}@${x.since}`).join(',') || 'nothing'})`);
    // a member tagged on the control itself keeps its own date
    const own = only(checkAbapSource(cls(`        )->tag( n = \`Header\` ns = \`card\` )->a( n = \`iconAlt\` v = \`x\` ).`), o), 'member-too-new');
    assert(own.some((x) => x.member === 'iconAlt' && x.since === '1.81'), `Header.iconAlt keeps its 1.81 (got ${own.map((x) => `${x.member}@${x.since}`).join(',') || 'nothing'})`);
    // the OLDER-base shape is untouched: a member without its own @since on a
    // base class older than the control still takes the base class's release
    assert(real['sap.m.plugins.PluginBase'].since === '1.73' && real['sap.m.plugins.ColumnResizer'].since === '1.91'
      && real['sap.m.plugins.PluginBase'].members.enabled === undefined, 'premise: PluginBase @1.73 declares enabled untagged, ColumnResizer @1.91 inherits it');
    const plugin = only(checkAbapSource(cls(`        )->ele( \`Table\`
            )->ele( \`dependents\`
                )->tag( n = \`ColumnResizer\` ns = \`plugins\`
                    )->a( n = \`enabled\` v = \`true\` ).`), o), 'member-too-new');
    assert(plugin.length === 1 && plugin[0].since === '1.73', `ColumnResizer.enabled is PluginBase's 1.73 (got ${plugin.map((x) => `${x.member}@${x.since}`).join(',') || 'nothing'})`);
  });

  section('unknown-aggregation: a tag in a foreign namespace, and an association written as a tag', () => {
    /* XMLTemplateProcessor recognizes an aggregation only where
     * childNode.namespaceURI === the parent tag's namespace; anything else is
     * resolved as a control class and the view fails to load */
    const foreign = only(checkXmlSource(xmlView('  <f:Card>\n    <content>\n      <Text text="x"/>\n    </content>\n  </f:Card>'), o), 'unknown-aggregation');
    assert(foreign.length === 1 && foreign[0].control === 'sap.f.Card' && foreign[0].member === 'content'
      && foreign[0].namespace === 'sap.m' && foreign[0].expected === 'sap.f',
      `<content> in the default sap.m namespace under an f:Card is reported (got ${foreign.map((x) => `${x.control}/${x.member} ns=${x.namespace}`).join(',') || 'nothing'})`);
    assert(/parent tag/.test(foreign[0]?.message || '') && /sap\.m\.content/.test(foreign[0]?.message || ''),
      `the message names the namespace rule and what UI5 makes of the tag (${foreign[0]?.message})`);
    assert(!only(checkXmlSource(xmlView('  <f:Card>\n    <f:content>\n      <Text text="x"/>\n    </f:content>\n  </f:Card>'), o), 'unknown-aggregation').length,
      '<f:content> under an f:Card is fine');
    // an INHERITED aggregation is still written in the parent tag's namespace
    assert(!only(checkXmlSource(xmlView('  <f:GridList>\n    <f:items>\n      <CustomListItem/>\n    </f:items>\n  </f:GridList>'), o), 'unknown-aggregation').length,
      'f:items on an f:GridList (items is declared on sap.m.ListBase) is fine');
    assert(only(checkXmlSource(xmlView('  <f:GridList>\n    <items>\n      <CustomListItem/>\n    </items>\n  </f:GridList>'), o), 'unknown-aggregation').length === 1,
      '<items> in sap.m under an f:GridList is reported');
    const abap = only(checkAbapSource(cls(`        )->ele( \`Page\`
            )->ele( n = \`content\` ns = \`f\`
                )->tag( \`Text\` ).`), o), 'unknown-aggregation');
    assert(abap.length === 1 && abap[0].namespace === 'sap.f' && abap[0].expected === 'sap.m',
      `ABAP: ele( n = content ns = f ) under a Page is reported (got ${abap.map((x) => `${x.member} ns=${x.namespace}`).join(',') || 'nothing'})`);
    // the typo reading is unchanged, and it is one finding
    const typo = only(checkXmlSource(xmlView('  <Page>\n    <contentt>\n      <Text text="x"/>\n    </contentt>\n  </Page>'), o), 'unknown-aggregation');
    assert(typo.length === 1 && !typo[0].namespace && !typo[0].association, `a misspelled aggregation is one typo finding (got ${typo.length})`);

    /* an association is an attribute; as a child tag UI5 knows no such
     * aggregation and resolves it as a control */
    const assoc = only(checkXmlSource(xmlView('  <Label id="lbl" text="x"/>\n  <Button text="b">\n    <ariaLabelledBy>lbl</ariaLabelledBy>\n  </Button>'), o), 'unknown-aggregation');
    assert(assoc.length === 1 && assoc[0].member === 'ariaLabelledBy' && assoc[0].association === true && !assoc[0].suggestion && !assoc[0].fixes,
      `<ariaLabelledBy> as a child tag is reported, with no did-you-mean and no fix (got ${assoc.map((x) => `${x.member} assoc=${x.association} suggestion=${x.suggestion}`).join(',') || 'nothing'})`);
    assert(/association/.test(assoc[0]?.message || '') && /attribute/.test(assoc[0]?.message || ''), `the message says what to write instead (${assoc[0]?.message})`);
    assert(!checkXmlSource(xmlView('  <Label id="lbl" text="x"/>\n  <Button text="b" ariaLabelledBy="lbl"/>'), o).findings.length,
      'the attribute form is fine');
    const abapAssoc = only(checkAbapSource(cls(`        )->ele( \`Button\`
            )->ele( \`ariaLabelledBy\` ).`), o), 'unknown-aggregation');
    assert(abapAssoc.length === 1 && abapAssoc[0].association === true, 'ABAP: ele( `ariaLabelledBy` ) under a Button is the same finding');
    // a tag that is an association up to case is not "fixed" into the association-as-tag shape
    const almost = only(checkXmlSource(xmlView('  <Button text="b">\n    <ariaLabelledby>lbl</ariaLabelledby>\n  </Button>'), o), 'unknown-aggregation');
    assert(almost.length === 1 && !almost[0].suggestion && !almost[0].fixes,
      `a misspelled association as a tag gets no association suggestion (got suggestion ${almost[0]?.suggestion})`);
  });

  section('directives: a directive inside a literal of any form is text, in a comment it counts', () => {
    const typo = (pre) => cls(`        )->ele( \`Page\` )->tag( \`Buton\` ).`, { pre });
    const base = only(checkAbapSource(typo(''), o), 'unknown-control').length;
    assert(base === 1, 'premise: the class carries one unknown-control');
    for (const line of ["    DATA(lv_char) = 'abap2ui5lint-disable'.", '    DATA(lv_tmpl) = |abap2ui5lint-disable|.', '    DATA(lv_tick) = `abap2ui5lint-disable`.']) {
      assert(only(checkAbapSource(typo(line), o), 'unknown-control').length === 1, `a literal carrying the directive text suppresses nothing: ${line.trim()}`);
    }
    for (const line of ['    " abap2ui5lint-disable', '* abap2ui5lint-disable', "    DATA(lv_x) = 'x'. \" abap2ui5lint-disable"]) {
      assert(checkAbapSource(typo(line), o).findings.length === 0, `a comment opens the block: ${line.trim()}`);
    }
    const xml = (pre) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">\n  ${pre}\n  <Button type="Emphasised" text="x"/>\n</mvc:View>`;
    assert(only(checkXmlSource(xml('<Text text="abap2ui5lint-disable"/>'), o), 'invalid-property-value').length === 1,
      'XML: an attribute value carrying the directive text suppresses nothing');
    assert(checkXmlSource(xml('<!-- abap2ui5lint-disable -->'), o).findings.length === 0, 'XML: a comment opens the block');
  });
}
