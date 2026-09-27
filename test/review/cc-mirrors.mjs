/*
 * The companion-control mirrors of lib/cc-controls.mjs, as both gates use
 * them. InputExt, UploadSetExt and SmartMultiInputExt are live abap2UI5
 * controls (app/webapp/cc/*.js) that a view could name and the render harness
 * could not create until 2026-09-27 - a module 404, excused by file in
 * abap2UI5/samples (apps 516, 517, 530) and samples-stack (app 319). And the
 * property walk judges every MIRRORED companion control like a UI5 control
 * now, over its real base class, where it used to look away from the whole
 * z2ui5.cc namespace. Fixtures: test/fixtures/ccmirrors.clas.abap (the three
 * written right - silent in both gates) and ccmirrors.view.xml (each written
 * wrong once, beside an unmirrored z2ui5.cc control and the neighbours written
 * right). check-upstream's readers for the events and the base class are
 * pinned here too. See test/review/README.md for the harness.
 */
import fs from 'fs';
import path from 'path';
import { CC_CONTROLS, CC_METADATA, ccMirrorScript } from '../../lib/cc-controls.mjs';
import { parseCcEvents, parseCcBase } from '../../scripts/check-upstream.mjs';

/* One wrong attribute per control, as a replacement in the builder fixture:
 * the case slip the did-you-mean catches, a letter off that it does not. */
const WRONG = {
  InputExt: ['n = `inputMode`', 'n = `inputmode`', 'inputmode', 'inputMode'],
  UploadSetExt: ['n = `fileData`', 'n = `fileDate`', 'fileDate', undefined],
  SmartMultiInputExt: ['n = `multiInputId`', 'n = `multiInputID`', 'multiInputID', 'multiInputId'],
};

export default async function ({ section, assert, f, tempDir, checkAbapSource, checkXmlSource, checkFiles }) {
  const opts = { render: false };
  const good = fs.readFileSync(f('ccmirrors.clas.abap'), 'utf8');
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;
  const show = (findings) => findings.map((x) => `${x.type}:${x.control}.${x.member}@${x.line}`).join(', ') || 'none';

  section('cc mirrors: InputExt, UploadSetExt and SmartMultiInputExt, as upstream declares them', () => {
    const input = CC_CONTROLS.InputExt;
    assert(input.base === 'sap/m/Input' && input.renderer === 'sap/m/InputRenderer'
      && Object.keys(input.properties).join() === 'inputMode' && input.properties.inputMode.defaultValue === ''
      && Object.keys(input.events).length === 0,
    'InputExt is a sap.m.Input with one property of its own, rendered by InputRenderer');
    assert(!CC_CONTROLS.UploadSetExt.base && !CC_CONTROLS.SmartMultiInputExt.base,
      'the other two are invisible Controls that find their UploadSet / SmartMultiInput by id - not subclasses of it');
    assert(Object.keys(CC_CONTROLS.UploadSetExt.properties).join() === 'uploadSetId,fileData,fileName,mediaType,fileSize,removedFileName,checkInit'
      && Object.keys(CC_CONTROLS.UploadSetExt.events).join() === 'change,remove',
    'UploadSetExt: the file properties and both events - the removal is an event of its own');
    assert(Object.keys(CC_CONTROLS.SmartMultiInputExt.properties).join() === 'multiInputId,addedTokens,removedTokens,rangeData,checkInit'
      && Object.keys(CC_CONTROLS.SmartMultiInputExt.events).join() === 'change',
    'SmartMultiInputExt: the token and range properties and change');

    // the property walk's view of the mirrors: one snapshot entry each, the base as parent
    assert(Object.keys(CC_METADATA).join() === Object.keys(CC_CONTROLS).map((n) => `z2ui5.cc.${n}`).join(),
      'one metadata entry per mirror, under its class name');
    assert(CC_METADATA['z2ui5.cc.InputExt'].parent === 'sap.m.Input'
      && CC_METADATA['z2ui5.cc.CameraSelector'].parent === 'sap.m.ComboBox'
      && CC_METADATA['z2ui5.cc.UploadSetExt'].parent === 'sap.ui.core.Control',
    'the parent is the base class in dotted form, sap.ui.core.Control by default');
    assert(JSON.stringify(CC_METADATA['z2ui5.cc.UploadSetExt'].events) === '{"change":{"params":{}},"remove":{"params":{}}}'
      && JSON.stringify(CC_METADATA['z2ui5.cc.CameraPicture'].events.OnPhoto) === '{"params":{"photo":{"type":"string"}}}',
    'events in the snapshot\'s shape, their parameters under params');
    assert(Object.values(CC_METADATA).every((m) => !m.since && Object.keys(m.members).length === 0),
      'no release on anything of their own: a companion control ships whole with the framework');

    // the harness: created as what they are
    const script = ccMirrorScript('');
    assert(script.includes("sap.ui.define('z2ui5/cc/InputExt', ['sap/m/Input', 'sap/m/InputRenderer'], function (Input, InputRenderer) {")
      && /Input\.extend\('z2ui5\.cc\.InputExt', \{\n[^\n]*\n\s*renderer: InputRenderer,\n/.test(script),
    'InputExt extends sap.m.Input in the harness and renders with InputRenderer, as upstream does');
    for (const name of ['UploadSetExt', 'SmartMultiInputExt']) {
      assert(script.includes(`sap.ui.define('z2ui5/cc/${name}', ['sap/ui/core/Control'], function (Control) {`)
        && new RegExp(`Control\\.extend\\('z2ui5\\.cc\\.${name}', \\{\\n[^\\n]*\\n\\s*renderer: \\{ apiVersion: 2, render: function \\(\\) \\{\\} \\},\\n`).test(script),
      `${name} is a Control that renders nothing, in the harness as upstream`);
    }
  });

  section('cc mirrors: the three written right are silent in the property gate', () => {
    const r = checkAbapSource(good, opts);
    assert(r.docs.length === 1 && ['InputExt', 'UploadSetExt', 'SmartMultiInputExt'].every((n) => r.docs[0].includes(`<z2ui5:${n} `)),
      'all three reconstruct');
    assert(r.findings.length === 0,
      `value, placeholder, width and submit are sap.m.Input's, the rest the controls' own - nothing is reported (got ${show(r.findings)})`);
  });

  section('cc mirrors: a wrong attribute on each is still reported, by the property gate', () => {
    const xml = fs.readFileSync(f('ccmirrors.view.xml'), 'utf8');
    const r = checkXmlSource(xml, opts);
    const got = r.findings.map((x) => `${x.type}:${x.control}.${x.member}${x.suggestion ? `>${x.suggestion}` : ''}@${x.line}`);
    assert(got.join(' ') === [
      `unknown-property:z2ui5.cc.InputExt.inputmode>inputMode@${lineOf(xml, 'inputmode=')}`,
      `member-too-new:z2ui5.cc.InputExt.showClearIcon@${lineOf(xml, 'showClearIcon=')}`,
      `unknown-property:z2ui5.cc.UploadSetExt.fileDate@${lineOf(xml, 'fileDate=')}`,
      `unknown-property:z2ui5.cc.SmartMultiInputExt.multiInputID>multiInputId@${lineOf(xml, 'multiInputID=')}`,
    ].join(' '), `the three wrong attributes and the inherited property newer than the floor, nothing on the unmirrored ExportSpreadsheet or the neighbours written right (got ${got.join(' ') || 'none'})`);
    const [slip] = r.findings;
    assert(slip.fixes?.length === 1 && xml.slice(slip.fixes[0].start, slip.fixes[0].end) === 'inputmode'
      && slip.fixes[0].text === 'inputMode', 'the case slip carries the rename fix, as on any control');
    assert(/the linter's copy of the abap2UI5 control, over UI5 /.test(slip.message) && !/metadata pinned at/.test(slip.message),
      `the message says where a companion control's metadata comes from (${slip.message})`);
    assert(r.findings[1].severity === 'warning' && r.findings[1].since === '1.94',
      'showClearIcon is sap.m.Input\'s, @since 1.94: InputExt inherits the release with the property');
  });

  section('cc mirrors: the builder spelling is judged the same way', () => {
    for (const [name, [from, to, attr, suggestion]] of Object.entries(WRONG)) {
      const src = good.replace(from, to);
      const hits = checkAbapSource(src, opts).findings;
      assert(hits.length === 1 && hits[0].type === 'unknown-property' && hits[0].control === `z2ui5.cc.${name}`
        && hits[0].member === attr && hits[0].suggestion === suggestion && hits[0].line === lineOf(src, to),
      `${name}: \`${attr}\` is reported on its line${suggestion ? ` with ${suggestion} offered` : ''} (got ${show(hits)})`);
    }
    /* the walk looks at a companion control only through its mirror: a
     * z2ui5.cc control nobody mirrored keeps no verdict, whatever it carries */
    const unmirrored = good.replace('n = `InputExt` ns = `z2ui5`', 'n = `ScanField` ns = `z2ui5`');
    assert(checkAbapSource(unmirrored, opts).findings.length === 0, 'an unmirrored z2ui5.cc control is still looked away from');
  });

  section('cc mirrors: check-upstream reads the events and the base class of a companion control', () => {
    const arrow = `sap.ui.define(
  ["sap/m/Input", "sap/m/InputRenderer", "z2ui5/core/Lib"],
  (Input, InputRenderer, Lib) => {
    // this.events: { fake: 1 } in a comment is no metadata
    return Input.extend("z2ui5.cc.InputExt", {
      metadata: {
        properties: { inputMode: { type: "string", defaultValue: "" } },
        events: {
          // a comment carrying a fake: pair
          change: { allowPreventDefault: true, parameters: {} },
          remove: { parameters: { item: { type: "object" } } },
        },
      },
      renderer: InputRenderer,
    });
  },
);`;
    assert(parseCcBase(arrow) === 'sap/m/Input', `the dependency the .extend( ) receiver names (got ${parseCcBase(arrow)})`);
    assert(parseCcEvents(arrow).join() === 'change,remove',
      `the keys of metadata.events, nested parameters and comments skipped (got ${parseCcEvents(arrow).join()})`);
    const classic = `sap.ui.define(['sap/ui/core/Control', 'z2ui5/core/Lib'], function (Control, Lib) {
  var Helper = Lib.extend('z2ui5.core.Helper', {});
  return Control.extend('z2ui5.cc.Plain', { metadata: { properties: { a: { type: 'string' } } } });
});`;
    assert(parseCcBase(classic) === 'sap/ui/core/Control' && parseCcEvents(classic).length === 0,
      'the function form, a helper class extended on the way, and no events block');
    assert(parseCcBase('return Control.extend("z2ui5.cc.X", {});') === null,
      'no sap.ui.define: unreadable, reported as drift rather than guessed');
    assert(parseCcBase(`sap.ui.define(["sap/ui/core/Control"], (Control) => Base.extend("z2ui5.cc.X", {}));`) === null,
      'a receiver that is no dependency: unreadable too');
  });

  section('cc mirrors: the render gate creates each view, and still reports a wrong attribute on each', async () => {
    /* View creation stops at the first unknown setting, so each wrong
     * attribute gets a view of its own; one browser renders all four. */
    const dir = tempDir('cc-mirrors-');
    const files = [path.join(dir, 'zcl_fixture_ccmirrors.clas.abap')];
    fs.writeFileSync(files[0], good);
    for (const [name, [from, to]] of Object.entries(WRONG)) {
      files.push(path.join(dir, `zcl_wrong_${name.toLowerCase()}.clas.abap`));
      fs.writeFileSync(files.at(-1), good.replace(from, to));
    }
    const [right, ...wrong] = await checkFiles(files, { minUi5: '1.71' });
    assert(right.renderErrors.length === 0,
      `InputExt, UploadSetExt and SmartMultiInputExt create and render - no module 404 (got ${right.renderErrors.join(' | ') || 'none'})`);
    Object.entries(WRONG).forEach(([name, [, , attr]], i) => {
      const r = wrong[i];
      assert(r.renderErrors.some((e) => e.includes(`unknown setting '${attr}' for class z2ui5.cc.${name}`)),
        `${name}: UI5 refuses \`${attr}\` at view creation (got ${r.renderErrors.join(' | ').slice(0, 300) || 'none'})`);
      assert(r.findings.some((x) => x.type === 'unknown-property' && x.member === attr),
        `${name}: and the property gate names it without a browser`);
    });
  });
}
