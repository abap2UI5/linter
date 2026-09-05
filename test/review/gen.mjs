/*
 * Review round 2026-09 - the generators and the mirrored tables: the metadata
 * snapshot's parents, cardinalities, deprecation versions, member map and
 * fired event parameters; the icon text scan; the icon generator's pin; the
 * server-side event names and the cs_event gate. See test/review/README.md
 * for the harness.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { pinnedVersion } from '../../scripts/generate-icons.mjs';
import { parseClientEvents } from '../../scripts/check-upstream.mjs';
import { FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES, SERVER_EVENTS } from '../../lib/frontend-actions.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GENERATOR = path.join(ROOT, 'scripts', 'generate-metadata.mjs');
const MEMBER_SETS = ['properties', 'aggregations', 'associations', 'events'];

/** The generator over synthetic module sources only (`--parse`), as the
 *  committed snapshot would carry them - the one seam a unit test of the
 *  parser has, since the script runs on import. */
const parseAll = (fixDir, names, base = 'my/lib') => JSON.parse(execFileSync(
  process.execPath,
  [GENERATOR, '--parse', ...names.map((n) => path.join(fixDir, 'metadata', n)), '--base', base],
  { encoding: 'utf8' },
));
const parse = (fixDir, names, base) => parseAll(fixDir, names, base).controls;

const VIEW = (body, ns = '') => `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" ${ns}>${body}</mvc:View>`;
const types = (r, type) => r.findings.filter((x) => x.type === type);

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8'));
  const controls = snapshot.controls;

  section('generator: parentOf resolves every factory shape and harvests no example code', () => {
    const c = parse(FIX, ['arrow-factory.js', 'commented-params.js', 'jsdoc-example.js', 'bare-arrow.js', 'split-define.js']);
    assert(c['my.lib.ArrowPanel']?.parent === 'sap.ui.core.Control',
      `an arrow factory with a multi-line parameter list pairs its parameters with the dependencies (got ${c['my.lib.ArrowPanel']?.parent})`);
    assert(c['my.lib.ArrowPanel']?.since === '1.90', 'the class-level @since is still read after the header change');
    assert(c['my.lib.CommentedElement']?.parent === 'sap.ui.core.Element',
      `comments inside the dependency and parameter lists do not shift the pairing (got ${c['my.lib.CommentedElement']?.parent})`);
    assert(c['my.lib.SameFileSub']?.parent === 'my.lib.CommentedElement',
      `a class extending a class of the same file names it as its parent (got ${c['my.lib.SameFileSub']?.parent})`);
    assert(c['my.lib.BareArrow']?.parent === 'sap.ui.core.Element',
      `a single bare arrow parameter is a parameter list too (got ${c['my.lib.BareArrow']?.parent})`);
    assert(c['my.lib.Split']?.parent === 'sap.ui.base.ManagedObject',
      `\`sap.ui\` and \`.define(\` on two lines is still the header (got ${c['my.lib.Split']?.parent})`);
    assert(c['my.lib.Real']?.parent === 'sap.ui.core.Control', 'the real class next to the example code is harvested with its parent');
    for (const ghost of ['my.example.NotAClass', 'my.example.LineComment', '...']) {
      assert(!(ghost in c), `${ghost} - example code in a JSDoc block, a line comment or a string - is not a class`);
    }
    assert(Object.keys(c).length === 6, `exactly the six real classes (got ${Object.keys(c).join(', ')})`);
  });

  section('generator: a deprecation keeps its release in every spelling the sources use', () => {
    const old = parse(FIX, ['deprecations.js'])['my.lib.Old'];
    assert(old.since === '1.20', `a class @since ending the sentence loses the full stop, not the version (got ${old.since})`);
    assert(old.deprecated?.since === '1.115' && old.deprecated.text === 'Please use {@link my.lib.Real Real} instead.',
      `class-level \`@deprecated since 1.115.\` carries 1.115 and the text after it (got ${JSON.stringify(old.deprecated)})`);
    const p = old.properties;
    const expected = {
      asOfVersion: ['1.20.0', 'replaced by <code>b</code>.'],
      asOf: ['1.21', ''],
      sinceVersion: ['1.22.1', 'Text after the version.'],
      sinceLower: ['1.23', ''],
      sinceUpper: ['1.24', 'replaced by <code>b</code>'],
      deprecatedAsOf: ['1.25', ''],
      asOfVersionGlued: ['1.26', ''],
      noVersion: [null, 'because it never worked'],
    };
    for (const [name, [since, text]] of Object.entries(expected)) {
      assert(p[name]?.deprecated?.since === since && p[name]?.deprecated?.text === text,
        `${name}: since ${JSON.stringify(since)}, text ${JSON.stringify(text)} (got ${JSON.stringify(p[name]?.deprecated)})`);
    }
    assert(p.trailingDot?.since === '1.30' && old.members.trailingDot === '1.30',
      `a member \`@since 1.30.\` is 1.30 in the member and in the flat map (got ${p.trailingDot?.since} / ${old.members.trailingDot})`);
  });

  section('generator: cardinality is written the way ManagedObjectMetadata resolves it', () => {
    const box = parse(FIX, ['cardinality.js'])['my.lib.Box'];
    const a = box.aggregations;
    assert(a.items.multiple === true, `an aggregation saying nothing is 0..n - UI5's default (got ${a.items.multiple})`);
    assert(a.header.multiple === false, 'multiple: false is written out - the one value that used to be implied by absence');
    assert(a.rows.multiple === true, 'multiple: true stays true');
    assert(a._hidden.multiple === false, 'the spacing UI5 sometimes writes (`multiple : false`) is read too');
    assert(box.associations.labelFor.multiple === false, 'an association saying nothing is 0..1 - the opposite default');
    assert(box.associations.ariaLabelledBy.multiple === true, 'an association declaring multiple: true keeps it');
    assert(!('multiple' in box.properties.title), 'a property carries no cardinality');
    assert(box.defaultAggregation === 'items', 'the default aggregation is untouched');
  });

  section('generator: an enum registered under an alias reads its values from the dependency', () => {
    const { enums, enumSince } = parseAll(FIX, ['alias-enum.js']);
    assert(JSON.stringify(enums['my.lib.Shape']) === JSON.stringify(['Round', 'Square']),
      `registerEnum("my.lib.Shape", Shape) with Shape a dependency yields the dependency's values (got ${JSON.stringify(enums['my.lib.Shape'])})`);
    assert(enumSince['my.lib.Shape']?.Square === '1.40', 'and the per-value @since of that module');
    for (const [name, values] of [['sap.ui.core.CalendarType', 'Gregorian'], ['sap.ui.core.date.CalendarWeekNumbering', 'ISO_8601']]) {
      assert(snapshot.enums[name]?.includes(values),
        `${name}, registered in sap.ui.core for an object from sap/base, is in the snapshot with its values (got ${JSON.stringify(snapshot.enums[name])?.slice(0, 80)})`);
    }
  });

  section('generator: the member map covers declared members only, fired parameters join their event', () => {
    const cal = parse(FIX, ['events.js'])['my.lib.Cal'];
    assert(JSON.stringify(cal.members) === JSON.stringify({ title: '1.50' }),
      `members: the declared @since only - not the event parameter that shares the aggregation's name (got ${JSON.stringify(cal.members)})`);
    assert(cal.events.select.params.appointments.since === '1.67.0',
      'the parameter keeps its @since where it belongs: under its event');
    assert(cal.aggregations.appointments.since === undefined, 'the aggregation of the same name stays version-less');
    const change = cal.events.change.params;
    assert(change.key && !change.key.fired, 'a declared parameter is not flagged as fired');
    for (const k of ['item', 'sortOrder', 'extra', 'viaFireEvent']) {
      assert(change[k]?.fired === true, `\`${k}\` from a fire<Event>({ … }) literal joins the declared parameters, flagged fired (got ${JSON.stringify(change[k])})`);
    }
    assert(!('mRest' in change) && !('notAKey' in change),
      `a spread and a nested key are not parameters (got ${Object.keys(change).join(', ')})`);
    assert(cal.events.bare.params === undefined,
      'an event whose metadata declares no parameters is not given a list by its fire call - the reader would judge every read against it');
    assert(!('mRest' in (cal.events.select.params)) && Object.keys(cal.events.select.params).join() === 'appointments,item',
      'a fire call passing a variable adds nothing');
  });

  section('snapshot: the committed metadata carries the generator fixes', () => {
    const names = Object.keys(controls);
    /* Example code from the JSDoc of Control, Element, UIComponent and friends,
     * plus the `...` of an error message in mvc/Controller.js - fourteen names
     * the snapshot used to carry as classes. (HeaderAdapter and test.Designtime
     * are odd names but real `.extend( )` calls in code, and stay.) */
    const ghosts = names.filter((n) => /^(my|sample|myapp)\./.test(n) || /^sap\.mylib\./.test(n) || n === '...' || n === 'MyModule');
    assert(ghosts.length === 0, `no example code is a class (got ${ghosts.join(', ') || 'none'})`);
    assert(names.every((n) => /^\w+(?:\.\w+)*$/.test(n)),
      `every name is a dotted identifier (got ${names.filter((n) => !/^\w+(?:\.\w+)*$/.test(n)).join(', ') || 'none'})`);
    const roots = names.filter((n) => controls[n].parent === null);
    assert(roots.length === 0,
      `no class is parentless - sap.ui.base.Object, the one real root, is created by Metadata.createClass and has no entry (got ${roots.join(', ') || 'none'})`);
    assert('sap.ui.core.util.ExportTypeCSV' in controls,
      'ExportTypeCSV, whose regex literal carries a quote, is still harvested - the comment heuristic reads lines, not strings');
    let c = 'sap.m.p13n.SelectionPanel';
    const chain = [];
    for (let depth = 0; c && depth < 10; depth++) { chain.push(c); c = controls[c]?.parent; }
    assert(chain.includes('sap.ui.core.Control'),
      `sap.m.p13n.SelectionPanel is a Control (chain ${chain.join(' > ')})`);
    for (const [n, expected] of [
      ['sap.ui.core.dnd.DragDropBase', 'sap.ui.core.Element'], ['sap.ui.unified.calendar.MonthPicker', 'sap.ui.core.Control'],
      ['sap.ui.integration.delegate.Paginator', 'sap.ui.base.ManagedObject'], ['sap.ui.core.CustomLocaleData', 'sap.ui.core.LocaleData'],
      ['sap.ui.core.Locale', 'sap.ui.base.Object'], ['sap.ui.core.util.MockServer', 'sap.ui.base.ManagedObject'],
    ]) {
      assert(controls[n]?.parent === expected, `${n} extends ${expected} (got ${controls[n]?.parent})`);
    }
    assert(controls['sap.ui.integration.ActionDefinition'].properties.buttonType.deprecated.since === '1.130',
      'ActionDefinition.buttonType (`Since 1.130`) carries its version');
    assert(controls['sap.m.TablePersoController'].deprecated.since === '1.115', 'TablePersoController (`since 1.115`) carries its version');
    assert(controls['sap.ui.core.search.SearchProvider'].deprecated.since === '1.120', 'SearchProvider (`since 1.120`) carries its version');
    let nullSince = 0;
    let dotted = 0;
    let unsized = 0;
    for (const meta of Object.values(controls)) {
      if (meta.deprecated && meta.deprecated.since === null) nullSince++;
      if (/\.$/.test(meta.since || '')) dotted++;
      for (const set of MEMBER_SETS) {
        for (const e of Object.values(meta[set] || {})) {
          if (e.deprecated && e.deprecated.since === null) nullSince++;
          if (/\.$/.test(e.since || '') || /\.$/.test(e.deprecated?.since || '')) dotted++;
          if ((set === 'aggregations' || set === 'associations') && typeof e.multiple !== 'boolean') unsized++;
        }
      }
    }
    assert(nullSince === 0, `no deprecation is left without a version (${nullSince} still null)`);
    assert(dotted === 0, `no version ends with a full stop (${dotted} do)`);
    assert(unsized === 0, `every aggregation and association carries a boolean multiple (${unsized} do not)`);
    assert(controls['sap.m.table.columnmenu.Menu'].aggregations.items.multiple === true, 'Menu.items, declared without a flag, is 0..n');
    assert(controls['sap.m.Page'].aggregations.subHeader.multiple === false, 'Page.subHeader is 0..1');
    assert(controls['sap.m.ListBase'].aggregations.headerToolbar.multiple === false, 'ListBase.headerToolbar is 0..1');
    for (const n of ['sap.m.SinglePlanningCalendar', 'sap.m.SinglePlanningCalendarGrid']) {
      assert(controls[n].members.appointments === undefined && controls[n].events.appointmentSelect.params.appointments.since === '1.67.0',
        `${n}: the appointments aggregation no longer borrows 1.67.0 from the appointmentSelect parameter, which keeps it`);
    }
    for (const meta of Object.values(controls)) {
      const declared = new Set(MEMBER_SETS.flatMap((s) => Object.keys(meta[s] || {})));
      for (const m of Object.keys(meta.members)) {
        if (!declared.has(m)) assert(false, `members entry ${m} names no declared member`);
      }
    }
    assert(controls['sap.m.table.columnmenu.QuickSort'].events.change.params.item?.fired === true,
      'QuickSort.change knows the `item` it fires, next to the key and sortOrder it declares');
  });

  section('properties: a p13n panel inherits Control and sits in a content aggregation', () => {
    const r = checkXmlSource(VIEW('<Page><content><p13n:SelectionPanel visible="false" enableCount="true"/></content></Page>', 'xmlns:p13n="sap.m.p13n"'), { minUi5: '1.130' });
    assert(types(r, 'unknown-property').length === 0,
      `visible, inherited from Control, is known on sap.m.p13n.SelectionPanel (got ${types(r, 'unknown-property').map((x) => x.member).join(', ') || 'none'})`);
    assert(types(r, 'invalid-aggregation-child').length === 0, 'a p13n panel is a Control and may sit in Page content');
    assert(r.findings.length === 0, `nothing else fires at a floor above the panel's @since (got ${r.findings.map((x) => x.type).join(', ') || 'none'})`);
  });

  section('properties: an aggregation declared without a flag is 0..n, one declared multiple: false is 0..1', () => {
    const menu = checkXmlSource(VIEW('<columnmenu:Menu><columnmenu:items><columnmenu:ActionItem label="a"/><columnmenu:ActionItem label="b"/></columnmenu:items></columnmenu:Menu>', 'xmlns:columnmenu="sap.m.table.columnmenu"'), { minUi5: '1.130' });
    assert(types(menu, 'too-many-children').length === 0,
      `two items in sap.m.table.columnmenu.Menu.items are fine - UI5's default is 0..n (got ${menu.findings.map((x) => x.type).join(', ') || 'none'})`);
    const page = checkXmlSource(VIEW('<Page><subHeader><Bar/><Bar/></subHeader></Page>'), { minUi5: '1.130' });
    assert(types(page, 'too-many-children').some((x) => x.member === 'subHeader'), 'two Bars in Page.subHeader are still one too many');
  });

  section('properties: a deprecation spelled without the word "version" is judged by its release', () => {
    const jsView = (minUi5) => types(checkXmlSource(VIEW('<mvc:JSView viewName="my.View"/>'), { minUi5 }), 'control-deprecated');
    assert(jsView('1.71').length === 0, 'sap.ui.core.mvc.JSView (`Since 1.90`) is not deprecated on a 1.71 floor');
    assert(jsView('1.100').length === 1, 'and is on a 1.100 floor');
    const card = (minUi5) => types(checkXmlSource(VIEW(
      '<w:Card><w:actionDefinitions><integration:ActionDefinition text="Go" buttonType="Transparent"/></w:actionDefinitions></w:Card>',
      'xmlns:w="sap.ui.integration.widgets" xmlns:integration="sap.ui.integration"',
    ), { minUi5 }), 'member-deprecated');
    assert(card('1.100').length === 0, 'ActionDefinition.buttonType (`Since 1.130`) is not deprecated on a 1.100 floor');
    assert(card('1.140').some((x) => x.member === 'buttonType'), 'and is on a 1.140 floor');
  });

  section('review_gen fixture: fired event parameters, the icon scan and the server-side hash events', () => {
    const src = fs.readFileSync(f('review_gen.clas.abap'), 'utf8');
    const r = checkAbapSource(src, { render: false, minUi5: '1.130' });
    assert(r.docs.length === 1, 'one view reconstructed');
    const params = types(r, 'unknown-event-parameter').map((x) => x.member);
    assert(params.join() === 'typo',
      `QuickSort change: $parameters>/item is what the control fires and passes, $parameters>/typo is reported (got ${params.join(', ') || 'none'})`);
    const icons = types(r, 'unknown-icon').map((x) => x.value);
    assert(icons.join() === 'status-typo',
      `|sap-icon://status-{ code }| names its glyph at runtime and is not judged, the literal typo is (got ${icons.join(', ') || 'none'})`);
    const wires = types(r, 'unknown-frontend-action').map((x) => x.value);
    assert(wires.join() === 'HASH_TYPO',
      `HASH_REPLACE and HASH_ATTACH_CHANGED are released cs_event constants the server consumes; HASH_TYPO is not (got ${wires.join(', ') || 'none'})`);
    assert(SERVER_EVENTS.includes('HASH_REPLACE') && SERVER_EVENTS.includes('HASH_ATTACH_CHANGED'),
      'both are listed with the three server events they are consumed next to');
  });

  section('icons: an XML comment is not a view, an interpolation is not a name', () => {
    const quiet = checkXmlSource(VIEW('\n  <!-- <Button icon="sap-icon://old-typo-in-comment"/> -->\n  <Button icon="sap-icon://accept" tooltip="a"/>\n  <Button icon="sap-icon://status-{path}" tooltip="b"/>\n'));
    assert(types(quiet, 'unknown-icon').length === 0,
      `a name inside <!-- --> and a name ending at an interpolation are not reported (got ${types(quiet, 'unknown-icon').map((x) => x.value).join(', ') || 'none'})`);
    const loud = checkXmlSource(VIEW('<!-- a comment before it -->\n<Button icon="sap-icon://not-a-glyph-xyz" tooltip="c"/>'));
    const hit = types(loud, 'unknown-icon');
    assert(hit.length === 1 && hit[0].value === 'not-a-glyph-xyz', 'a real unknown name outside the comment is still reported');
    assert(hit[0]?.line === 2, `and at its own line - blanking keeps every offset (got line ${hit[0]?.line})`);
  });

  section('check-upstream: the client interface gate reads cs_event, and the mirror accepts every constant in it', () => {
    const synthetic = `INTERFACE zif_x PUBLIC.
  CONSTANTS:
    BEGIN OF cs_event,
      " a comment quoting a value: VALUE \`NOT_AN_EVENT\`
      popup_close    TYPE string VALUE \`POPUP_CLOSE\`,
      hash_set       TYPE string VALUE \`SET_PUSH_STATE\`,
      hash_replace   TYPE string VALUE \`HASH_REPLACE\`,
      set_push_state TYPE string VALUE \`SET_PUSH_STATE\`,
      legacy         TYPE string VALUE 'OLD_QUOTED',
    END OF cs_event.
  CONSTANTS:
    BEGIN OF cs_view,
      main TYPE string VALUE \`MAIN\`,
    END OF cs_view.
ENDINTERFACE.`;
    const parsed = parseClientEvents(synthetic);
    assert(parsed.join() === 'POPUP_CLOSE,SET_PUSH_STATE,HASH_REPLACE,OLD_QUOTED',
      `the values between BEGIN OF and END OF cs_event, both quote forms, de-duplicated, comments and cs_view excluded (got ${parsed.join(', ')})`);
    assert(parseClientEvents('INTERFACE zif_y PUBLIC. ENDINTERFACE.').length === 0, 'no cs_event block, no values');

    const upstream = parseClientEvents(fs.readFileSync(f('cs_event.intf.abap'), 'utf8'));
    assert(upstream.length >= 40 && upstream.includes('HASH_REPLACE') && upstream.includes('HASH_ATTACH_CHANGED'),
      `the fixture is the real block (${upstream.length} values, hash events present)`);
    const accepted = new Set([...FRONTEND_EVENTS, ...FRONTEND_EVENT_ALIASES, ...SERVER_EVENTS]);
    const missing = upstream.filter((v) => !accepted.has(v));
    assert(missing.length === 0, `every cs_event value is accepted by one of the three lists (missing: ${missing.join(', ') || 'none'})`);
    const stale = [...FRONTEND_EVENT_ALIASES, ...SERVER_EVENTS].filter((v) => !upstream.includes(v));
    assert(stale.length === 0, `every server-side name is still a cs_event value (stale: ${stale.join(', ') || 'none'})`);
  });

  section('generate-icons: the pin is read from the render-runtime workspace', () => {
    const runtime = JSON.parse(fs.readFileSync(path.join(ROOT, 'render-runtime', 'package.json'), 'utf8'));
    const pin = String(runtime.dependencies['@openui5/sap.ui.core']).replace(/^[\^~]/, '');
    assert(pinnedVersion() === pin, `pinnedVersion( ) resolves against render-runtime/package.json (${pinnedVersion()} vs ${pin})`);
    assert(pinnedVersion() === snapshot.ui5Version, 'and that is the release the metadata snapshot describes');
    const icons = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'icons.json'), 'utf8'));
    assert(pinnedVersion() === icons.ui5Version, 'and the one the icon snapshot describes');

    const older = tempDir('abap2ui5lint-pin-');
    fs.writeFileSync(path.join(older, 'package.json'), JSON.stringify({ optionalDependencies: { '@openui5/sap.ui.core': '^1.99.0' } }));
    assert(pinnedVersion(older) === '1.99.0', 'the root manifest of the older layout is the fallback, range prefix dropped');
    const bare = tempDir('abap2ui5lint-nopin-');
    let threw = '';
    try { pinnedVersion(bare); } catch (e) { threw = e.message; }
    assert(/render-runtime\/package\.json/.test(threw), `with neither manifest the error names both files (got ${JSON.stringify(threw)})`);
  });
}
