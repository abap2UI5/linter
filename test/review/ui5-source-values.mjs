/*
 * The 2026-10-03 round: three rules out of the UI5 sources the snapshot did
 * not read yet, staged by abap2UI5's ui5-check skill ("names that do not exist
 * in the oldest supported release ... modules"; "views that fail to LOAD").
 * See test/review/README.md for the harness.
 *
 *   1. invalid-css-value: a CSS size/colour/percentage literal the type's own
 *      regex refuses - the setter throws and the view is never created.
 *   2. unknown-binding-type: a model type no release has, by global name in a
 *      binding info or as a core:require module path.
 *   3. binding-type-too-new: a model type newer than the floor.
 *   4. the generator: `typePatterns` (single-regex DataTypes) and
 *      `modelTypes` (the two model-type directories), and a snapshot without
 *      either section leaving all three rules silent.
 */
import { applyFixes } from '../../lib/fix.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATOR = path.join(ROOT, 'scripts', 'generate-metadata.mjs');

/* An app class whose view is one chain; `chain` goes inside the Page,
 * `root` onto the View element, `defs` into the PUBLIC SECTION. */
const app = ({ chain = '', root = '', defs = '', main = '' } = {}) =>
  'CLASS zcl_review_1003 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n'
  + '    DATA amount TYPE p LENGTH 10 DECIMALS 2.\n' + defs
  + 'ENDCLASS.\n\nCLASS zcl_review_1003 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->a( n = `xmlns:core` v = `sap.ui.core`\n'
  + root
  + '        )->ele( `Page`\n'
  + '          )->tag( `Text` )->a( n = `text` v = client->_bind( mv_text )\n'
  + chain
  + '        )->end( ).\n'
  + '    client->view_display( view->stringify( ) ).\n' + main + '  ENDMETHOD.\nENDCLASS.\n';

const typed = (type, val = 'amount') => `          )->tag( \`Text\` )->a( n = \`text\` v = |\\{ path: '{ client->_bind( val = ${val} path = abap_true ) }', type: '${type}' \\}|\n`;

export default async function ({ section, assert, tempDir, checkAbapSource, checkXmlSource }) {
  const opts = { render: false, minUi5: '1.71' };
  const of = (src, type, o = opts) => checkAbapSource(src, o).findings.filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, of(src, type)).output;

  section('round 2026-10-03: invalid-css-value - a size without a unit, and what the type accepts', () => {
    const src = app({ chain: '          )->tag( `Button` )->a( n = `text` v = `a` )->a( n = `width` v = `100`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `b` )->a( n = `width` v = `100 px`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `c` )->a( n = `width` v = `calc(100%-2rem)`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `d` )->a( n = `width` v = `fit-content`\n'
      // all accepted by sap.ui.core.CSSSize
      + '          )->tag( `Button` )->a( n = `text` v = `e` )->a( n = `width` v = `100%`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `f` )->a( n = `width` v = `auto`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `g` )->a( n = `width` v = `0`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `h` )->a( n = `width` v = `calc(100% - 2rem)`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `i` )->a( n = `width` v = `10vw`\n'
      + '          )->tag( `Button` )->a( n = `text` v = `j` )->a( n = `width` v = `12.5REM`\n'
      // a binding is a runtime matter
      + '          )->tag( `Button` )->a( n = `text` v = `k` )->a( n = `width` v = client->_bind( mv_text )\n' });
    const hits = of(src, 'invalid-css-value');
    assert(hits.length === 4 && hits.every((h) => h.severity === 'error' && h.memberType === 'sap.ui.core.CSSSize'),
      `the four refused sizes, as errors; %, auto, 0, a spaced calc( ), vw, an upper-case unit and a binding are fine (${hits.map((h) => h.value).join(' | ')})`);
    assert(hits[0].value === '100' && !hits[0].fixes, 'a bare number has no fix: px, rem and % are three layouts');
    assert(hits[1].suggestion === '100px' && hits[1].fixes?.length === 1, 'a blank between number and unit is the mechanical repair');
    assert(/setter THROWS/.test(hits[0].message) && /a number with a unit/.test(hits[0].message), `the message says why and what to write (${hits[0].message})`);
    const out = fixed(src, 'invalid-css-value');
    assert(out.includes('v = `100px`') && of(out, 'invalid-css-value').length === 3, '--fix writes 100px; the others stay reported');
  });

  section('round 2026-10-03: invalid-css-value - a colour name is lower case, raw XML is judged too, a guess is not', () => {
    const src = app({ root: '        )->ele( `Shell` )->a( n = `backgroundColor` v = `Red`\n' }).replace('        )->end( ).\n', '        )->end( )->end( ).\n');
    const hits = of(src, 'invalid-css-value');
    assert(hits.length === 1 && hits[0].memberType === 'sap.ui.core.CSSColor' && hits[0].suggestion === 'red',
      `Shell backgroundColor="Red" - CSSColor's names are lower case, and the fix says so (${JSON.stringify(hits.map((h) => [h.value, h.suggestion]))})`);
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Page><Button text="a" width="200"/><Button text="b" width="200px"/></Page></mvc:View>\n';
    const x = checkXmlSource(xml, { render: false }).findings.filter((f) => f.type === 'invalid-css-value');
    assert(x.length === 1 && x[0].value === '200', `a raw view is judged by the same regex (${x.length})`);
    /* a value the reconstruction GUESSED is not what runs: a template whose
     * interpolation it cannot resolve rebuilds as the literal rest, `px`,
     * which the regex would refuse - while the same chain with a literal is
     * judged, so the silence is the guard and not a lost document */
    const loop = (v) => app({ chain: `          )->tag( \`Button\` )->a( n = \`text\` v = \`x\` )->a( n = \`width\` v = ${v}\n`,
      defs: '    DATA t_widths TYPE string_table.\n',
      main: '    LOOP AT t_widths INTO DATA(w).\n    ENDLOOP.\n' });
    assert(of(loop('|{ w }px|'), 'invalid-css-value').length === 0 && of(loop('`px`'), 'invalid-css-value').length === 1,
      'a guessed value is never judged; the literal it rebuilds as is');
  });

  section('round 2026-10-03: unknown-binding-type - a model type no release has, by global name', () => {
    const src = app({ chain: typed('sap.ui.model.type.Decimal')
      + typed('sap.ui.model.type.datetime')
      + typed('sap.ui.model.odata.type.Decimal')
      + typed('sap.ui.model.type.Currency')
      + typed('zcl_my.Type')
      + typed('.MyType')
      + '          )->tag( `Text` )->a( n = `text` v = |\\{ parts: [ \\{ path: \'/A\', type: \'sap.ui.model.type.Number\' \\} ] \\}|\n' });
    const hits = of(src, 'unknown-binding-type');
    assert(hits.length === 3 && hits.every((h) => h.severity === 'error'),
      `Decimal, datetime and Number are no model types; odata Decimal, Currency, an app's own type and a relative one are not judged (${hits.map((h) => h.value).join(', ')})`);
    assert(hits[0].allowed?.includes('Float') && /runs WITHOUT a type/.test(hits[0].message), `the message names the namespace's types (${hits[0].message})`);
    assert(hits[1].suggestion === 'sap.ui.model.type.DateTime' && hits[1].fixes?.length === 1 && !hits[0].fixes, 'the case did-you-mean carries a fix, a plausible guess does not');
    const out = fixed(src, 'unknown-binding-type');
    assert(out.includes("type: 'sap.ui.model.type.DateTime'") && of(out, 'unknown-binding-type').length === 2, '--fix rewrites the name in the binding info');
  });

  section('round 2026-10-03: unknown-binding-type - the core:require half, judged at the require', () => {
    const src = app({
      root: "        )->a( n = `core:require` v = `\\{ Dec: 'sap/ui/model/type/Decimal', Dt: 'sap/ui/model/type/Datetime', F: 'sap/ui/model/type/Float', J: 'sap/ui/model/json/JSONModel', Z: 'zmy/Type' \\}`\n",
      chain: typed('Dec') + typed('F'),
    });
    const hits = of(src, 'unknown-binding-type');
    assert(hits.length === 2 && hits.every((h) => h.member === 'core:require'),
      `the two unknown modules, once each and at the require - not again at the alias, and JSONModel and an app module are not judged (${hits.map((h) => h.value).join(', ')})`);
    assert(/404s/.test(hits[0].message), 'the message says the module 404s');
    assert(hits[1].suggestion === 'sap/ui/model/type/DateTime', `the suggestion is spelled as a module path (${hits[1].suggestion})`);
    assert(fixed(src, 'unknown-binding-type').includes("Dt: 'sap/ui/model/type/DateTime'"), '--fix rewrites the module path');
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core" core:require="{ T: \'sap/ui/model/odata/type/Integer\' }"><Page><Text text="{ path: \'/A\', type: \'T\' }"/></Page></mvc:View>\n';
    const x = checkXmlSource(xml, { render: false }).findings.filter((f) => f.type === 'unknown-binding-type');
    assert(x.length === 1 && x[0].value === 'sap.ui.model.odata.type.Integer', `a raw view's require too - the OData integer types are Int16/Int32/Int64 (${x.length})`);
  });

  section('round 2026-10-03: binding-type-too-new - the floor decides, the snapshot carries the release', () => {
    const src = app({ chain: typed('sap.ui.model.odata.type.DateTimeWithTimezone', 'mv_text') + typed('sap.ui.model.odata.type.DateTimeOffset', 'mv_text') });
    const hits = of(src, 'binding-type-too-new');
    assert(hits.length === 1 && hits[0].severity === 'warning' && hits[0].since === '1.99.0',
      `DateTimeWithTimezone (@since 1.99) on the 1.71 floor, as a warning; DateTimeOffset is 1.27 (${hits.length})`);
    assert(of(src, 'binding-type-too-new', { ...opts, minUi5: '1.120' }).length === 0, 'silent on a floor that has it');
  });

  section('round 2026-10-03: a snapshot without typePatterns/modelTypes leaves the three rules silent', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8'));
    delete data.typePatterns;
    delete data.modelTypes;
    const file = path.join(tempDir('abap2ui5lint-1003-'), 'properties.json');
    fs.writeFileSync(file, JSON.stringify(data));
    const src = app({ chain: '          )->tag( `Button` )->a( n = `text` v = `a` )->a( n = `width` v = `100`\n'
      + typed('sap.ui.model.type.Decimal') + typed('sap.ui.model.odata.type.DateTimeWithTimezone', 'mv_text') });
    const all = checkAbapSource(src, { ...opts, snapshot: file }).findings.map((x) => x.type);
    assert(!all.includes('invalid-css-value') && !all.includes('unknown-binding-type') && !all.includes('binding-type-too-new'),
      `an older consumer snapshot judges nothing it does not carry (${all.join(', ')})`);
    // and the committed one carries both sections
    assert(data.controls && /^\^\(auto\|inherit\|/.test(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8')).typePatterns['sap.ui.core.CSSSize']),
      'the committed snapshot carries the CSSSize regex');
  });

  section('round 2026-10-03: the generator harvests single-regex DataTypes and the model types', () => {
    const run = (names, base) => JSON.parse(execFileSync(process.execPath,
      [GENERATOR, '--parse', ...names.map((n) => path.join(ROOT, 'test', 'fixtures', 'metadata', n)), '--base', base], { encoding: 'utf8' }));
    const { typePatterns } = run(['pattern-types.js'], 'my/lib');
    assert(Object.keys(typePatterns).join() === 'my.lib.Size,my.lib.Span',
      `one regex test is carried - with a comment line above the return, either quote - and a body of two tests is not (${Object.keys(typePatterns).join()})`);
    const size = new RegExp(typePatterns['my.lib.Size']);
    assert(size.test('10px') && size.test('calc( 1px + 2px )') && !size.test('10'), 'the carried source compiles to the type\'s own check');
    const { modelTypes } = run(['model/Money.js'], 'sap/ui/model/type');
    assert(JSON.stringify(modelTypes) === JSON.stringify({ 'sap.ui.model.type.Money': { since: '1.120.0' } }),
      `the class the module IS, with its class-level @since - not the JSDoc example, not a method's @since (${JSON.stringify(modelTypes)})`);
    assert(Object.keys(run(['model/Money.js'], 'my/lib').modelTypes).length === 0, 'outside the two model-type directories nothing is read as a model type');
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8')).modelTypes;
    assert(committed['sap.ui.model.type.Float'] && committed['sap.ui.model.odata.type.Decimal'] && !committed['sap.ui.model.type.Decimal']
      && !committed['sap.ui.model.odata.type.UnitMixin'],
      'the committed list: both namespaces, no Decimal outside OData, and a mixin is no type');
  });
}
