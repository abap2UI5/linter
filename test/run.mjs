#!/usr/bin/env node
/*
 * test/run — fixture-based self-test of the two gates.
 *
 *   good.clas.abap      reconstructs, no findings, renders clean
 *   viewbuilder.clas.abap  the same view, built through a helper handle
 *   post171.clas.abap   property gate: GenericTile.systemInfo @since 1.92
 *   broken.clas.abap    render gate: typo property + unknown control
 *   structure.clas.abap unknown control/property/aggregation, bad enum and
 *                       numeric values, 0..1 overfilled, excess end( )
 *   dumps.clas.abap     builder calls the view builder ASSERTs on
 *   rowpaths.clas.abap  relative binding paths inside a bound aggregation
 *   nested.clas.abap    nested structures and nested aggregation bindings
 *   sample.view.xml     raw XML path: no findings, renders clean
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkAbapSource, checkXmlSource, checkFiles, produced } from './observe.mjs';
import { prepareAbap } from '../lib/reconstruct.mjs';
import { severityOf } from '../lib/findings.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const f = (n) => path.join(FIX, n);

let failed = 0;
const assert = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) failed++;
};

const results = await checkFiles(
  [f('good.clas.abap'), f('viewbuilder.clas.abap'), f('post171.clas.abap'), f('broken.clas.abap'),
    f('structure.clas.abap'), f('barefragment.clas.abap'), f('sample.view.xml')],
);
const by = (n) => results.find((r) => r.file.endsWith(n));

const good = by('good.clas.abap');
assert(good.docs.length === 1, 'good: one view reconstructed');
assert(good.model.NAME === 'world', 'good: bound scalar seeded from model_init');
assert(good.findings.length === 0,
  `good: the canonical fixture carries no finding (${good.findings.map((x) => x.type).join(', ') || 'none'})`);
assert(good.renderErrors.length === 0, `good: renders clean (${good.renderErrors[0] || ''})`);

// the same view built through a helper handle: through the render gate as
// well, which is what proves the reconstruction is not merely plausible XML
const vbuilder = by('viewbuilder.clas.abap');
assert(vbuilder.findings.length === 0 && vbuilder.renderErrors.length === 0,
  `viewbuilder: the helper-handle fixture renders clean (${vbuilder.renderErrors[0] || vbuilder.findings[0]?.type || ''})`);

const post = by('post171.clas.abap');
assert(post.findings.some((x) => x.member === 'systemInfo' && x.type === 'member-too-new'),
  'post171: GenericTile.systemInfo flagged as member-too-new');

/* A popup whose root is a bare control, not core:FragmentDefinition. The
 * render gate used to decide view-vs-fragment by sniffing the root tag, so
 * this legitimate shape (display-root-mismatch says so in as many words) went
 * to XMLView.create and failed with "XMLView's root node must be 'View'" -
 * a render error against correct code. The consuming call decides now. */
const bareFrag = by('barefragment.clas.abap');
assert(bareFrag.docKinds[0] === 'fragment',
  `barefragment: popup_display marks the document a fragment (got ${bareFrag.docKinds[0]})`);
assert(bareFrag.renderErrors.length === 0,
  `barefragment: a bare-control fragment renders clean (${bareFrag.renderErrors[0] || ''})`);
assert(good.docKinds[0] === 'view',
  `good: view_display marks the document a view (got ${good.docKinds[0]})`);

const broken = by('broken.clas.abap');
assert(broken.renderErrors.length > 0, 'broken: render gate reports errors');
assert(broken.renderErrors.some((e) => /textt|NoSuchControl/i.test(e)),
  `broken: error names the defect (${(broken.renderErrors[0] || '').slice(0, 80)})`);
assert(broken.findings.some((x) => x.type === 'unknown-control' && x.control === 'sap.m.NoSuchControl'),
  'broken: property gate flags the typo control without a browser');

const struct = by('structure.clas.abap');
const has = (type, pred = () => true) => struct.findings.some((f) => f.type === type && pred(f));
assert(has('unknown-control', (f) => f.control === 'sap.m.Buton'),
  'structure: unknown control flagged');
assert(has('unknown-property', (f) => f.control === 'sap.m.Button' && f.member === 'typ'),
  'structure: unknown property flagged');
assert(has('invalid-property-value', (f) => f.member === 'type' && f.allowed?.includes('Emphasized')),
  'structure: enum value outside the allowed set flagged, with the allowed values');
assert(has('invalid-property-value', (f) => f.member === 'percentValue' && f.memberType === 'float'),
  'structure: non-numeric value for a float property flagged');
assert(has('unknown-aggregation', (f) => f.control === 'sap.m.Page' && f.member === 'contentt'),
  'structure: unknown aggregation flagged');
assert(has('too-many-children', (f) => f.member === 'customHeader' && f.count === 2),
  'structure: second child in a 0..1 aggregation flagged');
assert(has('excess-shut'), 'structure: shut( ) past the root flagged (asserts at runtime)');

// the target UI5 version drives BOTH directions: too-new members are only
// a finding below it, deprecations only from the version they take effect
const depLate = await checkFiles([f('deprecated-late.clas.abap')], { render: false, minUi5: '1.71' });
assert(!depLate[0].findings.some((x) => x.type === 'control-deprecated'),
  'target version: a control deprecated after the target is not reported');
const depNow = await checkFiles([f('deprecated-late.clas.abap')], { render: false, minUi5: '1.150' });
assert(depNow[0].findings.some((x) => x.type === 'control-deprecated'),
  'target version: the same control IS reported when the target reaches its deprecation');

// SAPUI5 vs OpenUI5: the same view is fine on one distribution and broken
// on the other, because sap.ui.comp simply does not ship with OpenUI5
const smartSap = await checkFiles([f('smart.clas.abap')], { render: false });
assert(!smartSap[0].findings.some((x) => x.type === 'sapui5-only-control'),
  'distribution: a SAPUI5-only control is accepted on SAPUI5 (the default)');
const smartOpen = await checkFiles([f('smart.clas.abap')], { render: false, distribution: 'openui5' });
assert(smartOpen[0].findings.some(
  (x) => x.type === 'sapui5-only-control' && x.library === 'sap.ui.comp'),
  'distribution: the same control is reported on OpenUI5');
assert(!smartOpen[0].findings.some((x) => x.type === 'unknown-control'),
  'distribution: a SAPUI5-only control is never mistaken for a typo');

// abap2UI5-specific defects: silent at runtime, invisible to UI5 tooling
const rules = (await checkFiles([f('abaprules.clas.abap')], { render: false }))[0];
const hasR = (t, pred = () => true) => rules.findings.some((x) => x.type === t && pred(x));
assert(hasR('obsolete-binder', (x) => x.member === '_bind_edit'),
  'abap rules: _bind_edit reported as obsolete (use _bind)');
// ... including where it carries custom_mapper_back/custom_filter_back: those
// are accepted for source compatibility but no longer EVALUATED, so the call
// is a leftover like any other - only the autofix stays away from it
{
  // checkAbapRules, not checkAbapSource: a snippet without a builder chain
  // never reaches the ABAP rules at all, so the negative form this assertion
  // used to have was green for the wrong reason
  const { checkAbapRules } = await import('./observe.mjs');
  const back = checkAbapRules('client->_bind_edit( val = name custom_mapper_back = mapper )')
    .find((x) => x.type === 'obsolete-binder');
  assert(back?.value === 'custom_mapper_back' && !back.fixes,
    'abap rules: _bind_edit carrying custom_mapper_back is reported too, but never autofixed');
}
assert(hasR('binding-to-local', (x) => x.member === 'lv_local'),
  'abap rules: a local variable bound - lost after the roundtrip');
assert(hasR('event-without-handler', (x) => x.value === 'NO_HANDLER'),
  'abap rules: an event nothing handles');
/* The two handler shapes that used to read as no handler at all. Both are
 * everywhere in the sample corpora, and both made the rule report an event
 * that IS handled - the worst kind of hint, since the reader has to prove
 * the tool wrong before ignoring it. */
{
  const { checkAbapRules } = await import('./observe.mjs');
  const alternatives = checkAbapRules(
    'client->_event( `PRODTYPE_CHANGED` ) client->_event( `SEARCH` )'
    + ' CASE client->get( )-event. WHEN `PRODTYPE_CHANGED` OR `SEARCH`. do_search( ). ENDCASE.');
  assert(!alternatives.some((x) => x.type === 'event-without-handler'),
    'abap rules: WHEN `A` OR `B` handles BOTH names, not only the first');
  const structRead = checkAbapRules(
    'client->_event( `enter` ) IF client->get( )-event = `enter`. play( ). ENDIF.');
  assert(!structRead.some((x) => x.type === 'event-without-handler'),
    'abap rules: get( )-event = `X` is the same handler as get_event( ) = `X`');
  const stillDead = checkAbapRules(
    'client->_event( `SEARCH` ) CASE client->get( )-event. WHEN `OTHER` OR `MORE`. ENDCASE.');
  assert(stillDead.some((x) => x.type === 'event-without-handler' && x.value === 'SEARCH'),
    'abap rules: an alternatives list still leaves an unlisted event dead');

  /* A dispatcher ending in WHEN OTHERS handles every event, including the ones
   * no WHEN names - five message types raised and none of them listed
   * (abap2UI5/samples app 382). */
  const catchAll = checkAbapRules(
    'client->_event( `warning` ) client->_event( `error` )'
    + ' CASE client->get_event( ). WHEN `CUSTOM`. x( ).'
    + ' WHEN OTHERS. client->message_box_display( type = client->get_event( ) ). ENDCASE.');
  assert(!catchAll.some((x) => x.type === 'event-without-handler'),
    'abap rules: WHEN OTHERS in a CASE over the event handles what no WHEN names');
  const otherCase = checkAbapRules(
    'client->_event( `SEARCH` ) CASE mv_mode. WHEN OTHERS. x( ). ENDCASE.');
  assert(otherCase.some((x) => x.type === 'event-without-handler' && x.value === 'SEARCH'),
    'abap rules: a WHEN OTHERS over something that is not the event handles nothing');
}
assert(hasR('unconverted-abap-boolean', (x) => x.member === 'expanded' && x.value === 'abap_true'),
  'abap rules: an ABAP boolean written into the view through v = instead of b =');
assert(hasR('unknown-binding-path', (x) => x.value === '/TYPOED_PATH'),
  'abap rules: a hand-written binding path the model does not have');
assert(hasR('event-arg-unresolved', (x) => x.value === '{BARE_BRACE}'),
  'abap rules: a bare-brace t_arg arrives empty - must be $-prefixed');
assert(!hasR('event-arg-unresolved', (x) => x.value.includes('RESOLVED')),
  'abap rules: a $-prefixed t_arg is fine');
assert(!hasR('event-arg-unresolved', (x) => x.value.startsWith('{0}')),
  'abap rules: a {N} template placeholder t_arg is quoted, not empty');
assert(!hasR('event-arg-unresolved', (x) => /lv_local/.test(x.value)),
  'abap rules: |{ var }| is an ABAP string template - interpolated server-side, not a binding');
assert(!hasR('event-arg-unresolved', (x) => /URL:/.test(x.value)),
  'abap rules: a brace object in a FRONTEND action t_arg (_event_client) is its parameter set, not a binding');
// get_t_arg buffers an empty argument and flushes it only when a later
// non-empty one follows: an empty entry BETWEEN filled ones keeps its slot, a
// TRAILING one disappears and get_event_arg( n ) reads initial
assert(hasR('trailing-empty-event-arg', (x) => x.value === '2'),
  'abap rules: a trailing empty t_arg never arrives');
assert(!hasR('trailing-empty-event-arg', (x) => x.value === '3'),
  'abap rules: an empty t_arg BETWEEN filled ones keeps its slot and is fine');
// UI5 reads a leading { as a binding, so a raw JSON object literal in an
// attribute never reaches the property - bind it instead
assert(hasR('json-literal-in-attribute', (x) => x.member === 'manifest'),
  'abap rules: a raw JSON literal in a view attribute is read as a binding');

const vr = (await checkFiles([f('viewrules.clas.abap')], { render: false }))[0];
const hasV = (t, pred = () => true) => vr.findings.some((x) => x.type === t && pred(x));
assert(hasV('binding-for-event', (x) => x.member === 'press'),
  'view rules: a binding on an event (use _event)');
assert(hasV('duplicate-id', (x) => x.value === 'twice'), 'view rules: duplicate id');
assert(hasV('undeclared-namespace', (x) => x.member === 'undeclared'),
  'view rules: namespace prefix used but never declared');
assert(hasV('missing-accessibility', (x) => x.member === 'tooltip'),
  'view rules: icon-only button without a tooltip');
/* An attribute WRITTEN but not statically resolvable is not an absent one.
 * `COND #( … )` / `SWITCH #( … )` / `|{ count }|` are how a real app labels a
 * button that changes its own caption, and reading the dropped attribute as
 * "no text" reported three correctly labelled buttons as unusable with a
 * screen reader. */
{
  const labelled = `METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
        )->ele( n = \`View\` ns = \`mvc\`
            )->a( n = \`xmlns\` v = \`sap.m\`
            )->ele( \`Page\`
                )->tag( \`Button\`
                    )->a( n = \`text\` v = COND #( WHEN on = abap_true THEN \`Stop\` ELSE \`Start\` )
                    )->a( n = \`icon\` v = \`sap-icon://play\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.`;
  assert(!checkAbapSource(labelled, { render: false }).findings
    .some((x) => x.type === 'missing-accessibility'),
    'missing-accessibility: a text the source computes at runtime still names the button');
  assert(checkAbapSource(labelled.replace(/\)->a\( n = `text`[\s\S]*?\)\n/, ''), { render: false }).findings
    .some((x) => x.type === 'missing-accessibility'),
    'missing-accessibility: with the text gone the same button IS reported — the exception is about the value, not the rule');
}
assert(hasV('duplicate-aggregation', (x) => x.member === 'content'),
  'view rules: the same aggregation opened twice under one control');
assert(hasV('member-deprecated', (x) => x.member === 'translucent'),
  'view rules: a deprecated property reported (version-aware, like controls)');
assert(hasV('missing-required-aggregation', (x) => x.member === 'columns'),
  'view rules: a Table bound to rows but given no columns');
assert(hasV('event-for-property', (x) => x.member === 'tooltip'),
  'view rules: an event handler written into a property slot');
assert(hasV('collection-bound-to-property', (x) => x.member === 'headerText'),
  'view rules: a table bound to a scalar property');
assert(!hasV('invalid-expression-binding'),
  'view rules: a well-formed expression binding is not flagged');

// the builder ASSERTs the app never survives: a( ) with nothing to attach it
// to, and one attribute name written twice on the same control
const dumps = (await checkFiles([f('dumps.clas.abap')], { render: false }))[0];
const hasD = (t, pred = () => true) => dumps.findings.some((x) => x.type === t && pred(x));
assert(hasD('attribute-without-element', (x) => x.member === 'title'),
  'dumps: a( ) on the bare factory root - z2ui5_cl_ui5_view_builder asserts');
assert(hasD('duplicate-property', (x) => x.member === 'text' && x.control === 'Button'),
  'dumps: the same attribute set twice on one control - z2ui5_cl_ui5_view_builder asserts');
assert(dumps.docs[0].split('text="').length === 2,
  'dumps: the refused duplicate is not carried into the reconstructed XML');

// every finding carries where it came from, what it means and how bad it is -
// so an editor can place it and a build can decide on it
const posSrc = fs.readFileSync(f('dumps.clas.abap'), 'utf8').split('\n');
const dup = dumps.findings.find((x) => x.type === 'duplicate-property');
assert(dup.line > 0 && posSrc[dup.line - 1].includes('Save and close'),
  `dumps: the finding points at the SECOND text attribute (line ${dup.line})`);
assert(posSrc[dup.line - 1].slice(dup.column - 1).startsWith('->a('),
  `dumps: the column points at the a( ) call itself (col ${dup.column})`);
assert(dup.severity === 'error' && typeof dup.message === 'string' && dup.message.length > 10,
  'findings: severity and a ready-made message travel with the finding');

// severity is the linter's judgement, not the caller's guesswork
assert(severityOf({ type: 'unknown-control' }) === 'error',
  'severity: a control that does not exist breaks the app - error');
assert(severityOf({ type: 'control-too-new' }) === 'warning',
  'severity: the version floor is a portability warning');
assert(severityOf({ type: 'event-without-handler' }) === 'hint',
  'severity: an unhandled event is a hint - the roundtrip alone may be the point');
assert(severityOf({ type: 'brand-new-rule-nobody-classified' }) === 'error',
  'severity: an unclassified type stays loud rather than being silently dropped');

// a relative {NAME} inside a bound aggregation addresses the ROW - with the
// row's shape known from the class's TYPES, a typo'd column is catchable
const rows = (await checkFiles([f('rowpaths.clas.abap')], { render: false }))[0];
const rowPathFindings = rows.findings.filter((x) => x.type === 'unknown-binding-path');
assert(rowPathFindings.length === 1 && rowPathFindings[0].value === 'CARID',
  `rows: the typo'd row field is the only one reported (${rowPathFindings.map((x) => x.value).join(', ')})`);
assert(rowPathFindings[0].context === '/T_FLIGHTS',
  'rows: the finding names the aggregation binding the row came from');
assert(!rows.findings.some((x) => x.value === 'SEATSMAX'),
  'rows: a declared but unseeded field is part of the row - an ABAP structure always has all of them');
assert(!rows.findings.some((x) => x.value === 'CARRID'),
  'rows: a column header under `columns` is not in the row context and is left alone');

// a nested aggregation binding moves the context DOWN - including the
// complex {path: '...'} form the templates actually use
const nested = (await checkFiles([f('nested.clas.abap')], { render: false }))[0];
const nestedPaths = nested.findings.filter((x) => x.type === 'unknown-binding-path');
assert(nestedPaths.length === 1 && nestedPaths[0].value === 'EXPENSE'
  && nestedPaths[0].context === 'ELEMENTS',
  `nested: inside the inner list only its own row fields exist (${nestedPaths.map((x) => x.value).join(', ')})`);
assert(!nested.findings.some((x) => String(x.value).startsWith('AMOUNT/')),
  'nested: a path through a nested structure resolves');

// a structure declared INSIDE another one is a field of its parent AND a
// structure in its own right - it names no TYPE, so the field matcher cannot
// see it and the whole subtree used to be dropped from the model
const nestedTypes = (await checkFiles([f('nestedtypes.clas.abap')], { render: false }))[0];
const nestedTypePaths = nestedTypes.findings.filter((x) => x.type === 'unknown-binding-path');
assert(nestedTypePaths.length === 1 && nestedTypePaths[0].value === 'S_DETAILS/CREATE_DAT',
  `nested types: only the typo through the nested structure is reported (${nestedTypePaths.map((x) => x.value).join(', ')})`);
assert(nestedTypes.findings.length === 1,
  `nested types: a correct deep path raises nothing else either (${nestedTypes.findings.map((x) => x.type).join(', ')})`);
{
  const shape = prepareAbap(fs.readFileSync(f('nestedtypes.clas.abap'), 'utf8')).modelShape;
  assert(shape.T_ROWS[0].S_DETAILS?.S_WHO?.UNAME === '',
    'nested types: two levels of nesting reach the model, not just one');
}

// four ways an ABAP structure declaration hides its shape from a naive parse.
// Every binding in the fixture is correct, so silence is the assertion - and
// each shape then has to still CATCH a typo, or it is being blanket-accepted
// rather than understood.
{
  const src = fs.readFileSync(f('structshapes.clas.abap'), 'utf8');
  assert(checkAbapSource(src, { render: false }).findings.length === 0,
    `struct shapes: nesting, INCLUDE TYPE, a foreign type and a template var are all understood (${
      checkAbapSource(src, { render: false }).findings.map((x) => x.type + ' ' + x.value).join(', ')})`);

  const typos = [
    ['ms_deep-ms_deep2-ms_deep2-val', 'ms_deep-ms_deep2-ms_deep2-vla', 'the same name nested at several levels'],
    ['ms_incl-title', 'ms_incl-titel', 'a field spliced in by INCLUDE TYPE'],
  ];
  for (const [good, bad, what] of typos) {
    const broken = checkAbapSource(src.replace(good, bad), { render: false }).findings;
    assert(broken.some((x) => x.type === 'unknown-binding-path'),
      `struct shapes: a typo through ${what} is still caught (got ${broken.map((x) => x.type).join(', ') || 'nothing'})`);
  }
  /* The foreign type is the exception and has to stay one: its shape is not
   * knowable from this source, so no path below it can be judged. */
  assert(checkAbapSource(src.replace('ms_foreign-anything', 'ms_foreign-whatever'), { render: false })
    .findings.length === 0,
    'struct shapes: a path into a type owned by another class stays unjudged');
}

// the model handed to the RENDERER stays what a seed actually sets: a field
// the class fills in code cannot be followed statically, and inventing an
// empty string for it makes UI5 strict mode reject a good view
const prep = prepareAbap(fs.readFileSync(f('nested.clas.abap'), 'utf8'));
assert(!('ELEMENTS' in prep.model.T_ROWS[0]) && 'ELEMENTS' in prep.modelShape.T_ROWS[0],
  'model: the unseeded field is in the shape the gate asks about, not in the render model');
assert(prep.model.T_ROWS[0].AMOUNT.SIZE === 560,
  'model: a nested structure seed parses as one structure, not as an empty table');

// a DATA declared with a NAMED table type is a table too — the inline
// `STANDARD TABLE OF` form is not the only one the corpus writes
{
  const named = prepareAbap(`CLASS zcl_named DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, name TYPE string, END OF ty_s_row.
    TYPES ty_t_row TYPE STANDARD TABLE OF ty_s_row WITH EMPTY KEY.
    DATA t_rows TYPE ty_t_row.
    DATA t_late TYPE ty_t_row.
ENDCLASS.
CLASS zcl_named IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    t_rows = VALUE #( ( name = \`Notebook\` ) ).
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`List\`
            )->a( n = \`items\` v = client->_bind( t_rows )
            )->ele( \`items\`
                )->tag( \`StandardListItem\`
                    )->a( n = \`title\` v = \`{NAME}\`
        )->end( ).
    v->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_late ) ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(Array.isArray(named.model.T_ROWS) && named.model.T_ROWS[0].NAME === 'Notebook',
    'model: a DATA with a named table type is a table, not a scalar');
  // an UNSEEDED table: the shape keeps a declared row so paths stay judgeable,
  // the render model gets nothing — an invented all-empty row is instantiated
  // by the render gate and then fails strict validation on the first enum
  assert(named.model.T_LATE.length === 0 && named.modelShape.T_LATE.length === 1
    && 'NAME' in named.modelShape.T_LATE[0],
    'model: an unseeded table is empty for the renderer and a declared row in the shape');
}

// _bind with shape-neutral named parameters: omit_initial/omit_initial_paths
// and json change the SERIALIZATION around the binding, not what it addresses,
// so the attribute must reconstruct instead of being dropped as unresolved
{
  const wrap = (v) => `CLASS zcl_b DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA manifest TYPE string.
ENDCLASS.
CLASS zcl_b IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(x) = z2ui5_cl_ui5_view_builder=>factory( ).
    x->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Text\` )->a( n = \`text\` v = ${v}
        )->end( ).
    client->view_display( x->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const json = prepareAbap(wrap('client->_bind( val = manifest json = abap_true )'));
  assert(json.docs[0]?.includes('text="{/MANIFEST}"') && json.notes.length === 0,
    '_bind( json = abap_true ) reconstructs as the plain binding');
  const omit = prepareAbap(wrap('client->_bind( val = manifest omit_initial_paths = VALUE #( ( `A` ) ( `B` ) ) )'));
  assert(omit.docs[0]?.includes('text="{/MANIFEST}"') && omit.notes.length === 0,
    '_bind( omit_initial_paths = VALUE #( … ) ) reconstructs as the plain binding');
  const mapper = prepareAbap(wrap('client->_bind( val = manifest custom_mapper = mapper )'));
  assert(!mapper.docs[0]?.includes('{/MANIFEST}')
    && mapper.notes.some((n) => n.includes('unresolved value expression')),
    '_bind with a custom mapper stays unresolved — the serialized names are not ours to guess');
}

// omit_initial_paths in the RENDER model: the runtime does not serialize an
// initial value of a listed field, so the mock must not either — the seeded
// '' used to reach strict mode as an empty enum and kill the render
{
  const om = prepareAbap(`CLASS zcl_o DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s, text TYPE string, state TYPE string, END OF ty_s.
    DATA t_rows TYPE STANDARD TABLE OF ty_s WITH EMPTY KEY.
ENDCLASS.
CLASS zcl_o IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    t_rows = VALUE #( ( text = \`a\` state = \`\` ) ( text = \`b\` state = \`Success\` ) ).
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`List\`
            )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial_paths = VALUE #( ( \`STATE\` ) ) )
            )->ele( \`items\`
                )->tag( \`ObjectListItem\` )->a( n = \`title\` v = \`{TEXT}\` )->a( n = \`intro\` v = \`{STATE}\` )
        )->end( )->end( )->end( ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(!('STATE' in (om.model.T_ROWS?.[0] ?? { STATE: 1 })) && om.model.T_ROWS?.[1]?.STATE === 'Success',
    'omit_initial_paths: the initial value is dropped from the render model, the filled one kept');
  assert('STATE' in (om.modelShape.T_ROWS?.[0] ?? {}),
    'omit_initial_paths: the shape keeps the field, so binding paths stay judgeable');
}

// no row shape, no verdict: a table of a type the class does not declare
// could have any field, so nothing there is reported
const opaque = `CLASS zcl_x DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA t_flights TYPE STANDARD TABLE OF sflight.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`List\`
            )->a( n = \`items\` v = client->_bind( t_flights )
            )->ele( \`items\`
                )->tag( \`StandardListItem\`
                    )->a( n = \`title\` v = \`{ANYTHING_AT_ALL}\`
        )->end( )->end( )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
assert(!checkAbapSource(opaque, { render: false }).findings
  .some((x) => x.type === 'unknown-binding-path'),
  'rows: nothing is claimed about a row type the class does not declare');

// event parameters an app reads back ($parameters>/name) are members of the
// control like any other - and they are resolved PER EVENT, because two
// events of one control can declare the same name with different histories
const withEvent = (control, event, param) => checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( \`${control}\`
          )->a( n = \`${event}\` v = client->_event( val = \`GO\` t_arg = VALUE #( ( \`\${$parameters>/${param}}\` ) ) ) ).
  client->view_display( view->stringify( ) ).`, { render: false })
  .findings.filter((x) => x.type === 'event-parameter-too-new');

assert(withEvent('SearchField', 'search', 'searchButtonPressed')
  .some((x) => x.member === 'searchButtonPressed' && x.since === '1.114'),
  'event params: one newer than the floor is reported');
assert(!withEvent('SearchField', 'search', 'query').length,
  'event params: one without an @since predates version tracking and is not');
assert(withEvent('Menu', 'beforeClose', 'item').length === 1,
  'event params: Menu beforeClose/item is @since 1.136');
assert(!withEvent('Menu', 'itemSelected', 'item').length,
  'event params: Menu itemSelected/item is NOT - same name, different event, and only the flat member map confuses the two');

// an aggregation directly inside another aggregation: invalid XML, and the
// signature of a missing shut( ) - the port that put <footer> inside <columns>
// only ever surfaced as "failed to load sap/ui/table/footer.js" in the browser
const view = (inner) => `
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:my\`  v = \`my.custom.lib\`
      ${inner}.
  client->view_display( view->stringify( ) ).`;
const misplaced = (src) => checkAbapSource(src, { render: false })
  .findings.filter((x) => x.type === 'aggregation-in-aggregation');

assert(misplaced(view('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )->ele( `footer` )'))
  .some((x) => x.member === 'footer' && x.parentAggregation === 'columns'),
  'missing shut: an aggregation inside an aggregation is reported');
assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( `Column` )->ele( `header` )')).length,
  'missing shut: a well-formed aggregation/control/aggregation nesting is not');
assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( n = `Thing` ns = `my` )->ele( `content` )')).length,
  'missing shut: a control from an unknown library still counts as a control in between');

// a control the aggregation's type does not accept: UI5 refuses the child and
// the part of the view below it silently disappears
const childOf = (inner) => checkAbapSource(view(inner), { render: false })
  .findings.filter((x) => x.type === 'invalid-aggregation-child');
assert(childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Button` )')
  .some((x) => x.control === 'sap.m.Button' && x.parentControl === 'sap.m.Table'
    && x.member === 'columns' && x.expected === 'sap.m.Column'),
  'aggregation child: a Button inside Table columns is reported with the expected type');
assert(!childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )').length,
  'aggregation child: the type the aggregation declares is accepted');

// levels left open at stringify( ) are harmless (render( ) closes the tree) -
// a note for --verbose, never a finding
{
  const open = prepareAbap(view('  )->ele( `Page` )->tag( `Button` )'));
  assert(open.notes.some((n) => /level\(s\) left open/.test(n)),
    'open levels: an unshut tree at stringify( ) is noted');
  assert(!checkAbapSource(view('  )->ele( `Page` )->tag( `Button` )'), { render: false })
    .findings.some((x) => x.type === 'open-levels'),
    'open levels: the note never becomes a finding');
}

// a tag in a foreign namespace (raw XHTML, a custom-control library) is not
// a UI5 aggregation of its parent - it is outside what the metadata can judge
const foreign = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`      v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:html\` v = \`http://www.w3.org/1999/xhtml\`
      )->ele( \`Panel\`
          )->tag( n = \`iframe\` ns = \`html\`
              )->a( n = \`src\` v = \`https://example.org\` ).
  client->view_display( view->stringify( ) ).`, { render: false });
assert(!foreign.findings.some((x) => x.type === 'unknown-aggregation'),
  'foreign namespace: html:iframe is left alone, not read as an aggregation of Panel');

/* A SAP control the snapshot does not carry - a SAPUI5-only library, judged
 * under --distribution sapui5 so it is not reported as sapui5-only either.
 * Its own aggregation was blamed on the nearest KNOWN ancestor: `vos` inside
 * `vbm:AnalyticMap` came out as "sap.m.Page has no aggregation vos", which is
 * a finding no author can act on. `samples-stack` excluded a whole package to
 * silence the same shape. The mirror image was worse and invisible: an
 * aggregation whose name happens to exist on that ancestor was silently
 * excused. */
const opaqueOwner = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:vbm\` v = \`sap.ui.vbm\`
      )->ele( \`Page\`
          )->ele( n = \`AnalyticMap\` ns = \`vbm\`
              )->ele( n = \`vos\` ns = \`vbm\`
                  )->tag( n = \`Spot\` ns = \`vbm\`
                      )->a( n = \`position\` v = \`0;0;0\` ).
  client->view_display( view->stringify( ) ).`, { render: false, distribution: 'sapui5' });
assert(!opaqueOwner.findings.some((x) => x.type === 'unknown-aggregation'),
  `opaque control: vos belongs to vbm:AnalyticMap, not to the Page above it (got ${
    opaqueOwner.findings.map((x) => `${x.type} ${x.control}/${x.member}`).join(', ') || 'nothing'})`);
assert(!opaqueOwner.findings.length,
  `opaque control: nothing under an unjudgeable control is judged (${
    opaqueOwner.findings.map((x) => x.type).join(', ') || 'none'})`);

/* An XML prefix is an NCName: a dot is legal in it, and the sap.viz controls
 * are written with `xmlns:viz.data` / `xmlns:viz.feeds`. Matching the prefix
 * with \w alone read those declarations as absent and then reported every use
 * of them as undeclared-namespace - four errors on one correct class. */
const dottedNs = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`          v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`      v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:viz.data\` v = \`sap.viz.ui5.data\`
      )->ele( \`Page\`
          )->tag( n = \`FlattenedDataset\` ns = \`viz.data\` ).
  client->view_display( view->stringify( ) ).`, { render: false, distribution: 'sapui5' });
assert(!dottedNs.findings.some((x) => x.type === 'undeclared-namespace'),
  `dotted prefix: xmlns:viz.data is a declaration (got ${
    dottedNs.findings.map((x) => `${x.type} ${x.member ?? ''}`).join(', ') || 'nothing'})`);

// positions in raw XML are just as exact as in a builder class
const xmlPos = (await checkFiles([f('badvalue.view.xml')], { render: false }))[0];
const bad = xmlPos.findings.find((x) => x.type === "invalid-property-value");
assert(bad?.line === 4 && bad?.column === 15,
  `xml: the invalid value is located at 4:15 (got ${bad?.line}:${bad?.column})`);

const xml = by('sample.view.xml');
assert(xml.kind === 'xml', 'xml: raw view detected');
assert(xml.findings.length === 0, 'xml: no property findings');
assert(xml.renderErrors.length === 0, `xml: renders clean (${xml.renderErrors[0] || ''})`);


// a view that is built and never handed to the client
{
  const nd = (await checkFiles([f('nodisplay.clas.abap')], { render: false }))[0];
  assert(nd.findings.some((x) => x.type === 'view-never-displayed'),
    'abap rules: a view built but never displayed - an empty page, no error');
  const shown = (await checkFiles([f('good.clas.abap')], { render: false }))[0];
  assert(!shown.findings.some((x) => x.type === 'view-never-displayed'),
    'abap rules: a displayed view is not reported');
  // popover_display and the nest*_view_display family are display calls too -
  // a popover-only helper class is legitimate (caught by the VS Code
  // extension's snippet gate as a false positive of the narrower list)
  const popoverOnly = `CLASS zcl_pop DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.
CLASS zcl_pop IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(popover) = z2ui5_cl_ui5_view_builder=>factory( ).
    popover->ele( n = \`Popover\` )->a( n = \`xmlns\` v = \`sap.m\` ).
    client->popover_display( xml = popover->stringify( ) by_id = \`opener\` ).
  ENDMETHOD.
ENDCLASS.`;
  assert(!checkAbapSource(popoverOnly).findings.some((x) => x.type === 'view-never-displayed'),
    'abap rules: a popover-only class displays its view too');
}

// ---------------------------------------------------------------- config ----
{
  const os = await import('node:os');
  const cp = await import('node:child_process');
  const { stripJsonc, loadConfig, applyConfig, findConfig, CONFIG_NAME } = await import('../lib/config.mjs');
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5lint-'));
  const sub = path.join(dir, 'nested', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  const cfgFile = path.join(dir, CONFIG_NAME);
  fs.writeFileSync(cfgFile, `{
  // comment survives
  "ui5": "1.96",
  "failOn": "hint",
  "render": false,
  "allow": ["sap.m.Avatar"], // trailing comma next
}`);

  assert(JSON.parse(stripJsonc('{"a":1,/*x*/"b":"//not a comment",}')).b === '//not a comment',
    'config: stripJsonc keeps // inside strings');

  /* Trailing-comma removal must tell punctuation from text. It used to be a
   * regex over the finished output, which also rewrote string CONTENT: an
   * exclude pattern `app[,]x` came out as `app[]x` - a character class that
   * matches nothing, so the suppression silently stopped suppressing. */
  assert(JSON.parse(stripJsonc('{"exclude":["src/app[,]x"],}')).exclude[0] === 'src/app[,]x',
    'config: stripJsonc keeps a comma before ] inside a string');
  assert(JSON.parse(stripJsonc('{"a":"foo, } bar"}')).a === 'foo, } bar',
    'config: stripJsonc keeps a comma before } inside a string');
  assert(JSON.stringify(JSON.parse(stripJsonc('{"a":[1, 2, ], "b":{"c":1, }, }'))) === '{"a":[1,2],"b":{"c":1}}',
    'config: stripJsonc still drops the structural trailing commas');

  const cfg = loadConfig(cfgFile);
  assert(cfg.minUi5 === '1.96' && cfg.failOn === 'hint' && cfg.render === false,
    'config: jsonc parsed with comments and trailing commas');

  assert(findConfig(sub) === cfgFile, 'config: discovered walking upward from a nested dir');

  const opt = { minUi5: '1.71', failOn: 'warning', render: true, allow: ['sap.m.Page.x'] };
  applyConfig(opt, new Set(['failOn']), cfg);
  assert(opt.minUi5 === '1.96', 'config: fills an option the CLI did not set');
  assert(opt.failOn === 'warning', 'config: an explicit CLI flag beats the config');
  assert(opt.allow.includes('sap.m.Avatar') && opt.allow.includes('sap.m.Page.x'),
    'config: allow lists merge');

  let threw = '';
  fs.writeFileSync(path.join(dir, 'bad.jsonc'), '{"tpyo": 1}');
  try { loadConfig(path.join(dir, 'bad.jsonc')); }
  catch (e) { threw = e.message; }
  assert(/unknown key 'tpyo'/.test(threw), 'config: an unknown key fails loudly');

  // end-to-end: the CLI picks the config up from the checked path's directory
  // (cwd is this repo, which has no config - discovery must come from the path)
  // the successor-builder fixture, because this run must exit 0: the old
  // builder is frozen upstream and reports non-released-api on every file
  fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(sub, 'good.clas.abap'));
  const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' }; // never inherit the runner's
  const out = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap')], { encoding: 'utf8', env });
  assert(/target SAPUI5 1\.96/.test(out) && /failing on hint/.test(out),
    'config: cli applies ui5/failOn from the discovered abap2ui5lint.jsonc');
  const off = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap'), '--no-config'], { encoding: 'utf8', env });
  assert(/target SAPUI5 1\.71/.test(off), 'config: --no-config restores the defaults');

  // the .json spelling is discovered too (abaplint.json / abaplint.jsonc)
  const plain = path.join(dir, 'plain');
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, 'abap2ui5lint.json'), '{"ui5": "1.120"}');
  assert(findConfig(plain) === path.join(plain, 'abap2ui5lint.json'),
    'config: abap2ui5lint.json is discovered as well as .jsonc');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ----------------------------------------------------------------- rules ----
// per-rule off / severity / exclude, the abaplint-shaped `rules` block
{
  const { loadConfig } = await import('../lib/config.mjs');
  const os = await import('node:os');
  const src = fs.readFileSync(f('viewrules.clas.abap'), 'utf8');

  const plain = checkAbapSource(src);
  const has = (r, type) => r.findings.some((x) => x.type === type);
  assert(has(plain, 'missing-accessibility') && has(plain, 'member-deprecated'),
    'rules: the fixture reports the rules the overrides act on');

  const off = checkAbapSource(src, { rules: { 'missing-accessibility': false } });
  assert(!has(off, 'missing-accessibility') && has(off, 'member-deprecated'),
    'rules: false switches a single rule off and leaves the rest alone');

  const lowered = checkAbapSource(src, { rules: { 'member-deprecated': 'hint' } });
  const dep = lowered.findings.find((x) => x.type === 'member-deprecated');
  assert(dep.severity === 'hint' && severityOf(dep) === 'hint',
    'rules: a severity string overrides the default, and severityOf reads it back');

  const excluded = checkAbapSource(src, { rules: { 'duplicate-id': { exclude: ['viewrules'] } }, file: 'src/viewrules.clas.abap' });
  assert(!has(excluded, 'duplicate-id'), 'rules: exclude drops the rule for a file the pattern matches');
  const kept = checkAbapSource(src, { rules: { 'duplicate-id': { exclude: ['nothing'] } }, file: 'src/viewrules.clas.abap' });
  assert(has(kept, 'duplicate-id'), 'rules: a non-matching exclude leaves the rule in place');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5rules-'));
  const write = (body) => { const p = path.join(dir, 'abap2ui5lint.jsonc'); fs.writeFileSync(p, body); return p; };
  const throws = (body) => { try { loadConfig(write(body)); return ''; } catch (e) { return e.message; } };
  assert(/unknown rule 'no-such-rule'/.test(throws('{"rules": {"no-such-rule": false}}')),
    'rules: an unknown rule id in the config fails loudly');
  assert(/must be a severity/.test(throws('{"rules": {"duplicate-id": "fatal"}}')),
    'rules: an unknown severity fails loudly');
  assert(/unknown key 'sevrity'/.test(throws('{"rules": {"duplicate-id": {"sevrity": "hint"}}}')),
    'rules: a typo inside a rule object fails loudly');
  assert(loadConfig(write('{"$schema": "x", "rules": {"duplicate-id": {"severity": "hint", "exclude": ["/test/"]}}}')).rules['duplicate-id'].severity === 'hint',
    'rules: $schema is accepted and a full rule object survives loading');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------------------ directives ----
// " abap2ui5lint-disable-next-line <rule>, -disable-line, -disable/-enable
{
  const src = fs.readFileSync(f('directives.clas.abap'), 'utf8');
  const r = checkAbapSource(src);
  const props = r.findings.filter((x) => x.type === 'unknown-property').map((x) => x.member);
  assert(props.join(',') === 'typo2,typo5',
    `directives: only the unwaived typos survive (got ${props.join(',') || 'none'})`);

  const { parseDirectives, applyDirectives } = await import('../lib/findings.mjs');
  assert(parseDirectives('nothing to see here') === null,
    'directives: a source without a directive costs nothing');
  const d = parseDirectives('" abap2ui5lint-disable-next-line duplicate-id\nx\ny');
  assert(d.suppresses(2, 'duplicate-id') && !d.suppresses(2, 'unknown-control') && !d.suppresses(3, 'duplicate-id'),
    'directives: -disable-next-line is scoped to the next line and to the named rule');
  const all = parseDirectives('<!-- abap2ui5lint-disable-next-line -->\nx');
  assert(all.suppresses(2, 'anything'), 'directives: an XML comment without a rule id waives every rule');
  const reason = parseDirectives('" abap2ui5lint-disable-line duplicate-id -- known, tracked in #42');
  assert(reason.suppresses(1, 'duplicate-id') && !reason.suppresses(1, 'known'),
    'directives: the reason after -- is not read as a rule id');
  assert(applyDirectives([{ type: 'duplicate-id' }], '" abap2ui5lint-disable\n').length === 1,
    'directives: a finding the gate could not place is never suppressed');
}

// -------------------------------------------------------------- new rules ----
// display-root-mismatch, binding-type-mismatch, event-arg-out-of-range
{
  const { checkAbapRules, namedModels } = await import('./observe.mjs');
  const { deniedControlMethod } = await import('../lib/frontend-actions.mjs');
  const roots = checkAbapSource(fs.readFileSync(f('roots.clas.abap'), 'utf8'));
  const mismatches = roots.findings.filter((x) => x.type === 'display-root-mismatch');
  assert(mismatches.length === 2,
    `display-root-mismatch: both directions reported (got ${mismatches.length})`);
  assert(mismatches.some((x) => x.member === 'popup_display' && x.value === 'mvc:View'),
    'display-root-mismatch: a mvc:View handed to the popup slot');
  assert(mismatches.some((x) => x.member === 'view_display' && x.value === 'core:FragmentDefinition'),
    'display-root-mismatch: a core:FragmentDefinition handed to the view slot');
  assert(!checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8')).findings
    .some((x) => x.type === 'display-root-mismatch'),
    'display-root-mismatch: a matching pair is not reported');

  /* The rule used to live only in the handle-aware extractor, so a LINEARLY
   * built class - the very shape the rule's own doc uses as its example -
   * was never judged. roots.clas.abap builds through handles; this is the
   * other idiom, the whole document in one statement. */
  const linear = checkAbapSource(`
  client->popup_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( \`Text\` )->a( n = \`text\` v = \`x\` )->stringify( ) ).`);
  assert(linear.findings.some((x) => x.type === 'display-root-mismatch'
      && x.member === 'popup_display' && x.value === 'mvc:View'),
    'display-root-mismatch: reported on a linearly built class too, not only a handle-built one');

  const typed = checkAbapSource(fs.readFileSync(f('typedbind.clas.abap'), 'utf8'));
  const mism = typed.findings.filter((x) => x.type === 'binding-type-mismatch');
  assert(mism.map((x) => x.memberType).sort().join() === 'boolean,float,int',
    `binding-type-mismatch: a TYPE string field on a float, an int and a boolean property (got ${mism.map((x) => x.memberType).join() || 'none'})`);
  assert(!mism.some((x) => x.value === 'REAL_NUM'),
    'binding-type-mismatch: a numeric ABAP type on a numeric property is not reported');

  const arity = typed.findings.filter((x) => x.type === 'event-arg-out-of-range');
  assert(arity.length === 2, `event-arg-out-of-range: two reads past the end (got ${arity.length})`);
  assert(arity.some((x) => x.value === 'PICK' && x.member === '2' && x.count === 1),
    'event-arg-out-of-range: arg 2 of an event that sends one');
  assert(arity.some((x) => x.value === 'PLAIN' && x.member === '1' && x.count === 0),
    'event-arg-out-of-range: the default arg of an event that sends none');
  assert(!arity.some((x) => x.member === '1' && x.value === 'PICK'),
    'event-arg-out-of-range: a read inside the declared arity is not reported');

  // the two shapes that were false positives on the corpus
  const foreign = `CLASS x IMPLEMENTATION.
  METHOD main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->tag( \`Button\` )->a( n = \`press\` v = client->_event( \`GO\` ) ).
    CASE client->get_event( ).
      WHEN \`GO\`.
        client->message_box_display( onclose = \`CLOSED\` ).
      WHEN \`CLOSED\`.
        IF client->get_event_arg( ) = \`YES\`.
        ENDIF.
    ENDCASE.
  ENDMETHOD.
  METHOD other.
    client->popover_display( by_id = client->get_event_arg( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const none = checkAbapRules(foreign).filter((x) => x.type === 'event-arg-out-of-range');
  assert(none.length === 0,
    `event-arg-out-of-range: an event the class does not raise, and a read in another method, are not judged (got ${none.length})`);

  // --- an imperative setter where the control has a bindable property -------
  const setters = checkAbapSource(fs.readFileSync(f('setters.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'settable-property-via-action');
  assert(setters.length === 1 && setters[0].member === 'expanded' && setters[0].control === 'sap.m.Panel',
    `settable-property-via-action: only the bindable property is reported (got ${setters.map((x) => `${x.control}.${x.member}`).join() || 'none'})`);
  assert(!setters.some((x) => x.member === 'selectedSection'),
    'settable-property-via-action: an association cannot be bound and is never reported');
  assert(!setters.some((x) => x.member === 'asyncURLHandler'),
    'settable-property-via-action: a function-typed property cannot travel in a JSON model');

  // --- the three silent wires: denied method, bound association, named model
  const wires = checkAbapSource(fs.readFileSync(f('wires.clas.abap'), 'utf8')).findings;

  const denied = wires.filter((x) => x.type === 'denied-control-method');
  assert(denied.length === 3, `denied-control-method: the three denied wires (got ${denied.map((x) => x.value).join() || 'none'})`);
  assert(denied.some((x) => x.value === 'destroy' && x.member === 'destroy'),
    'denied-control-method: destroy is denied by exact name');
  assert(denied.some((x) => x.value === 'addAggregation'),
    'denied-control-method: the generic reflection mutators are denied');
  assert(denied.some((x) => x.value === 'bindProperty' && x.member === 'bind'),
    'denied-control-method: the finding names the PREFIX that matched, not the method');
  assert(!denied.some((x) => x.value === 'removeAllContent'),
    'denied-control-method: a NAMED per-aggregation mutator is allowed by the runtime and never reported');
  assert(deniedControlMethod('removeAllItems') === null && deniedControlMethod('destroyContent') === null,
    'denied-control-method: the removeAll/destroy prefixes match no named method');
  assert(deniedControlMethod('removeAllAggregation') === 'removeAllAggregation',
    'denied-control-method: the generic form of the same name IS denied');

  const assoc = wires.filter((x) => x.type === 'binding-on-association');
  assert(assoc.length === 1 && assoc[0].member === 'selectedSection',
    `binding-on-association: the bound association is reported (got ${assoc.map((x) => x.member).join() || 'none'})`);

  const models = wires.filter((x) => x.type === 'unknown-model');
  assert(models.length === 2 && models.every((x) => ['i18n', 'ui'].includes(x.value)),
    `unknown-model: only the two models the app does not have (got ${models.map((x) => x.value).join() || 'none'})`);
  assert(!models.some((x) => ['device', 'message', 'http'].includes(x.value)),
    'unknown-model: the framework models are on every view slot');
  assert(!models.some((x) => x.value === 'srv'),
    'unknown-model: a model the class registers with SET_ODATA_MODEL is available');
  assert(namedModels('client->_event_client( val = client->cs_event-set_odata_model t_arg = VALUE #( ( url ) ( name ) ) ).') === null,
    'unknown-model: a class registering a model under a non-literal name is not judged at all');

  // --- a relative binding with no context to resolve against ----------------
  const orphan = checkAbapSource(fs.readFileSync(f('orphanbind.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'relative-binding-without-context');
  assert(orphan.length === 1 && orphan[0].value === 'NAME',
    `relative-binding-without-context: only the contextless root field is reported (got ${orphan.map((x) => x.value).join() || 'none'})`);
  assert(!checkAbapSource(fs.readFileSync(f('rowpaths.clas.abap'), 'utf8'))
    .findings.some((x) => x.type === 'relative-binding-without-context'),
    'relative-binding-without-context: a relative binding inside a bound aggregation is not judged');

  // --- a value the reconstruction had to guess at is not judged ------------
  // ids and binding paths built inside a LOOP from the loop variable: the
  // reconstruction cannot compute them, so every row collapses to the same
  // string. Reporting that reports the reconstruction, not the app.
  const looped = checkAbapSource(`
CLASS zcl_l DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA t_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.
ENDCLASS.
CLASS zcl_l IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    DATA(box) = view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\` )->ele( \`VBox\` ).
    DO 3 TIMES.
      DATA(i) = sy-index.
      box->tag( \`Input\`
          )->a( n = \`id\`    v = |FIELD_{ i }|
          )->a( n = \`value\` v = |\\{/T_ROWS/{ i }/NAME\\}|
          )->tag( \`CheckBox\`
          )->a( n = \`id\`       v = |FLAG_{ i }|
          )->a( n = \`selected\` v = |\\{/T_ROWS/{ i }/FLAG\\}| ).
    ENDDO.
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(!looped.findings.some((x) => x.type === 'duplicate-id'),
    `guessed value: a loop-built id is not a duplicate (got ${looped.findings.filter((x) => x.type === 'duplicate-id').length})`);
  assert(!looped.findings.some((x) => x.type === 'unknown-binding-path'),
    `guessed value: a loop-built binding path is not judged (got ${looped.findings.filter((x) => x.type === 'unknown-binding-path').map((x) => x.value).join()})`);
  // and the DOCUMENT stays renderable: UI5 refuses a duplicate id outright, so
  // two loop-built ids collapsing to one string would kill the render of a view
  // that is fine at runtime
  const loopIds = [...looped.docs[0].matchAll(/ id="([^"]*)"/g)].map((x) => x[1]);
  assert(loopIds.length > 1 && new Set(loopIds).size === loopIds.length,
    `guessed value: each loop-built id reconstructs uniquely (got ${loopIds.join()})`);

  // --- an INLINE structure is a structure ----------------------------------
  // `DATA: BEGIN OF message, … END OF message.` names no type of its own, and
  // an unresolved one turns every path through it into unknown-binding-path
  // plus a '' in the render model, which then fails strict property validation
  // on the first enum or boolean field
  const inlineStruct = checkAbapSource(fs.readFileSync(f('inlinestruct.clas.abap'), 'utf8'));
  assert(inlineStruct.findings.length === 0,
    `inline structure: every path through one resolves (got ${inlineStruct.findings.map((x) => `${x.type}:${x.value || ''}`).join() || 'none'})`);
  assert(Object.hasOwn(inlineStruct.model, 'MESSAGE') && Object.hasOwn(inlineStruct.model, 'ERROR'),
    'inline structure: both spellings (one-line DATA: BEGIN OF, and READ-ONLY on the next line) reach the model');
  // the same declaration read by the VISIBILITY scan: a comma split saw
  // `BEGIN OF message` and registered the fields in the attribute's place, so
  // every binding through a PUBLIC inline structure reported as non-public
  assert(!checkAbapRules(fs.readFileSync(f('inlinestruct.clas.abap'), 'utf8'))
    .some((x) => x.type === 'binding-to-nonpublic'),
    'inline structure: one declared in the PUBLIC SECTION is public');

  // --- CONTROL_BY_ID against the ids the class actually declares ------------
  const actionFindings = checkAbapRules(fs.readFileSync(f('actionid.clas.abap'), 'utf8'));
  const ids = actionFindings.filter((x) => x.type === 'frontend-action-unknown-id');
  assert(ids.length === 2 && ids.map((x) => x.value).sort().join() === 'messageview,msgView',
    `frontend-action-unknown-id: the miscased CONTROL_BY_ID and the unknown SET_FOCUS id are reported (got ${ids.map((x) => x.value).join() || 'none'})`);
  assert(ids.find((x) => x.value === 'msgView')?.control === 'SET_FOCUS',
    'frontend-action-unknown-id: the id-addressed action names itself in the finding');
  assert(ids[0].allowed.sort().join() === 'mainPage,messageView',
    `frontend-action-unknown-id: the finding carries the declared ids (got ${ids[0].allowed.join()})`);
  const anchors = actionFindings.filter((x) => x.type === 'popover-anchor-unknown-id');
  assert(anchors.length === 1 && anchors[0].value === 'mainpage',
    `popover-anchor-unknown-id: only the miscased anchor is reported (got ${anchors.map((x) => x.value).join() || 'none'})`);
  assert(checkAbapRules(`
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->tag( \`Page\` )->a( n = \`id\` v = |page{ idx }| ).
    client->follow_up_action( val = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`page1\` ) ( \`focus\` ) ) ).`)
    .filter((x) => x.type === 'frontend-action-unknown-id').length === 0,
    'frontend-action-unknown-id: a class that builds ids at runtime is not judged');
  assert(checkAbapRules(fs.readFileSync(f('wire.clas.abap'), 'utf8'))
    .filter((x) => x.type === 'frontend-action-unknown-id').length === 0,
    'frontend-action-unknown-id: a class whose views declare no id at all is not judged');

  assert(checkAbapRules('DATA(vn) = client->get( )-viewname.')
    .some((x) => x.type === 'get-viewname-removed'),
    'get-viewname-removed: a read of the removed ty_s_get component is reported');
  assert(!checkAbapRules('DATA(ev) = client->get( )-event.')
    .some((x) => x.type === 'get-viewname-removed'),
    'get-viewname-removed: the surviving components are left alone');

  // --- the frontend's remaining closed sets --------------------------------
  const act = (call) => checkAbapRules(`
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` ).
    ${call}
    client->view_display( v->stringify( ) ).`);

  assert(act('client->follow_up_action( val = `SET_TITEL` t_arg = VALUE #( ( `Hi` ) ) ).')
    .some((x) => x.type === 'unknown-frontend-action' && x.value === 'SET_TITEL'),
    'unknown-frontend-action: a literal name outside the dispatch table is reported');
  assert(act('client->follow_up_action( val = `set_title` t_arg = VALUE #( ( `Hi` ) ) ).')
    .some((x) => x.type === 'unknown-frontend-action'),
    'unknown-frontend-action: the dispatch table is case-sensitive, so a lower-cased name is reported');
  assert(!act('client->follow_up_action( val = `SET_TITLE` t_arg = VALUE #( ( `Hi` ) ) ).')
    .some((x) => x.type === 'unknown-frontend-action'),
    'unknown-frontend-action: a known literal name is fine');
  assert(!act('client->follow_up_action( val = `NAV_CONTAINER_TO` t_arg = VALUE #( ( `nav` ) ( `p2` ) ) ).')
    .some((x) => x.type === 'unknown-frontend-action'),
    'unknown-frontend-action: a server-remapped alias is fine');
  assert(!act('client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
    .some((x) => x.type === 'unknown-frontend-action'),
    'unknown-frontend-action: the raw-JavaScript escape hatch is not an unknown ACTION');
  assert(act('client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
    .some((x) => x.type === 'raw-javascript-to-frontend' && x.member === 'follow_up_action'),
    'raw-javascript-to-frontend: the escape hatch ships code, and code does not belong on the wire');
  assert(act('client->_event_client( val = `sap.m.URLHelper.redirect(\'https://x\')` ).')
    .some((x) => x.type === 'unknown-frontend-action'),
    'unknown-frontend-action: _event_client has no raw-JS path — a non-name literal can never dispatch');
  // and neither has follow_up_action where its RESULT is consumed: that is
  // the `IF result IS SUPPLIED` branch, which goes to get_event_client( ) —
  // _event_client's own body — and never near custom_js
  {
    const wired = act(')->a( n = `press` v = client->follow_up_action( val = `sap.m.URLHelper.redirect(\'https://x\')` ) )');
    assert(!wired.some((x) => x.type === 'raw-javascript-to-frontend')
      && wired.some((x) => x.type === 'unknown-frontend-action'),
    'raw-javascript-to-frontend: the escape hatch is the STATEMENT form — a wired follow_up_action is an unknown action, like _event_client');
  }
  assert(!act('client->follow_up_action( val = lv_dynamic ).')
    .some((x) => x.type === 'raw-javascript-to-frontend' || x.type === 'unknown-frontend-action'),
    'raw-javascript-to-frontend: a runtime value is not statically knowable and not judged');

  assert(act('client->_event_client( val = client->cs_event-control_by_id view = `NESTED` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
    .some((x) => x.type === 'unknown-view-slot' && x.value === 'NESTED'),
    'unknown-view-slot: NESTED is not a slot (cs_view-nested is NEST)');
  assert(!act('client->_event_client( val = client->cs_event-control_by_id view = `NEST` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
    .some((x) => x.type === 'unknown-view-slot'),
    'unknown-view-slot: the real slot keys are fine');
  assert(act('client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( `200` ) ( `SIDEBAR` ) ) ).')
    .some((x) => x.type === 'unknown-view-slot' && x.value === 'SIDEBAR'),
    'unknown-view-slot: SET_SIZE_LIMIT\'s view key is judged too');

  assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+Shift` ) ( `SAVE` ) ) ).')
    .some((x) => x.type === 'invalid-keyboard-shortcut'),
    'invalid-keyboard-shortcut: a modifiers-only combo binds nothing');
  const shortcutOk = act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Cmd+Return` ) ( `SAVE` ) ) ). client->check_on_event( `SAVE` ).');
  assert(!shortcutOk.some((x) => x.type === 'invalid-keyboard-shortcut'),
    'invalid-keyboard-shortcut: aliases resolve, Cmd+Return names a key');
  assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ) ).')
    .some((x) => x.type === 'event-without-handler' && x.value === 'SAVE'),
    'event-without-handler: a shortcut\'s backend event with no branch is a dead wire');
  assert(!shortcutOk.some((x) => x.type === 'event-without-handler'),
    'event-without-handler: a handled shortcut event is fine');
  assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `sidePanel` ) ) ). client->check_on_event( `SAVE` ).')
    .some((x) => x.type === 'frontend-action-unknown-id' && x.member === 'scope'),
    'frontend-action-unknown-id: a shortcut scope that is neither a slot nor a declared id');
  assert(!act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `POPUP` ) ) ). client->check_on_event( `SAVE` ).')
    .some((x) => x.type === 'frontend-action-unknown-id'),
    'frontend-action-unknown-id: a slot-key scope is fine');

  assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `contains` ) ( `x` ) ) ).')
    .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator' && x.value === 'contains'),
    'invalid-frontend-action: the filter operator whitelist is case-sensitive');
  assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `Contains` ) ( `x` ) ) ).')
    .some((x) => x.type === 'invalid-frontend-action'),
    'invalid-frontend-action: a whitelisted operator is fine');
  assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `NAME` ) ( `contains` ) ) ).')
    .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator'),
    'invalid-frontend-action: with no value slot the runtime clears before reading the operator — inert, not judged');
  assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","contains","x"]]]` ) ) ).')
    .some((x) => x.type === 'invalid-frontend-action' && x.member === 'filter operator'),
    'invalid-frontend-action: compound filter-group rows are judged too');
  assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[["NAME","Contains","x"]]` ) ) ).')
    .some((x) => x.type === 'invalid-action-payload' && x.member === 'filter row'),
    'invalid-action-payload: a group of strings is a missing nesting level — upstream logs "bad filter row"');
  assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","Contains","x"],["NAME","EQ","y"]]]` ) ) ).')
    .some((x) => x.type === 'invalid-action-payload' || x.type === 'invalid-frontend-action'),
    'compound filter groups: the correct nested form is fine');
  assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[oops` ) ) ).')
    .some((x) => x.type === 'invalid-action-payload' && x.control === 'BINDING_CALL'),
    'invalid-action-payload: malformed filter-groups JSON is rejected with a log upstream');

  assert(act('client->follow_up_action( val = client->cs_event-wizard_set_next_step t_arg = VALUE #( ( `wiz` ) ( `step1` ) ( `step2` ) ) ).')
    .filter((x) => x.type === 'frontend-action-unknown-id').length === 3,
    'frontend-action-unknown-id: every id slot of WIZARD_SET_NEXT_STEP is judged');
  assert(!act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl/items/0` ) ( `focus` ) ) ).')
    .some((x) => x.type === 'frontend-action-unknown-id'),
    'frontend-action-unknown-id: the aggregation-item form judges only its id segment');
  assert(act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `openBy` ) ( `anchor1` ) ) ).')
    .some((x) => x.type === 'frontend-action-unknown-id' && x.member === 'openBy'),
    'frontend-action-unknown-id: an anchor argument naming an undeclared id');
  assert(!act('client->_event_client( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `openBy` ) ( `$event.oSource.sId` ) ) ).')
    .some((x) => x.type === 'frontend-action-unknown-id'),
    'frontend-action-unknown-id: a $-prefixed anchor is resolved client-side, not a static id (corpus shape)');
  assert(!act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `tbl` ) ( `setActivePage` ) ( |tbl/pages/{ idx }| ) ) ).')
    .some((x) => x.type === 'frontend-action-unknown-id'),
    'frontend-action-unknown-id: a template with an interpolation is composed at runtime, never a literal (corpus shape)');

  // --- object payloads (enum values need the snapshot) ----------------------
  const payloadClass = (payload) => checkAbapSource(`CLASS zcl_p DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.
CLASS zcl_p IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` )->end( ).
    client->follow_up_action( val = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`tbl\` ) ( \`setSticky\` ) ( \`${payload}\` ) ) ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`).findings;
  assert(payloadClass('ColumnHeaders').some((x) => x.type === 'invalid-action-payload'),
    'invalid-action-payload: a bare enum key is not JSON — castArg turns it into {}');
  assert(!payloadClass('["ColumnHeaders"]').some((x) => x.type === 'invalid-action-payload'),
    'invalid-action-payload: a JSON array of known enum keys is the correct form');
  assert(payloadClass('["ColumnHeader"]').some((x) => x.type === 'invalid-action-payload' && x.value === 'ColumnHeader'),
    'invalid-action-payload: an unknown sap.m.Sticky key is dropped by UI5 silently');

  // --- json = abap_true on a scalar-typed property --------------------------
  const jsonBind = (leaf) => checkAbapSource(`CLASS zcl_j DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA manifest TYPE string.
ENDCLASS.
CLASS zcl_j IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->a( n = \`xmlns:w\` v = \`sap.ui.integration.widgets\`
        )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
        ${leaf}
        )->end( ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`).findings;
  assert(jsonBind(')->tag( `Text` )->a( n = `text` v = client->_bind( val = manifest json = abap_true )')
    .some((x) => x.type === 'json-bind-on-scalar-property' && x.member === 'text'),
    'json-bind-on-scalar-property: a json splice on a string property');
  assert(!jsonBind(')->tag( n = `Card` ns = `w` )->a( n = `manifest` v = client->_bind( val = manifest json = abap_true )')
    .some((x) => x.type === 'json-bind-on-scalar-property'),
    'json-bind-on-scalar-property: an object/any-typed property is what json is FOR');
  assert(!jsonBind(')->tag( `Text` )->a( n = `text` v = client->_bind( manifest )')
    .some((x) => x.type === 'json-bind-on-scalar-property'),
    'json-bind-on-scalar-property: a plain bind of the same attribute is fine');

  // --- JavaScript through the VIEW ------------------------------------------
  assert(jsonBind(')->tag( `Button` )->a( n = `press` v = `z2ui5.oView.doSomething()` )')
    .some((x) => x.type === 'raw-javascript-to-frontend' && x.member === 'press'),
    'raw-javascript-to-frontend: a hand-written handler string on an event attribute');
  assert(!jsonBind(')->tag( `Button` )->a( n = `press` v = client->_event( `SAVE` ) )')
    .some((x) => x.type === 'raw-javascript-to-frontend'),
    'raw-javascript-to-frontend: the client->_event( ) wire is the correct form');
  assert(jsonBind(')->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<script>alert(1)</script>` )')
    .some((x) => x.type === 'raw-javascript-to-frontend' && x.value === 'script tag'),
    'raw-javascript-to-frontend: a <script> tag through core:HTML content');
  assert(!jsonBind(')->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<style>.a \\{color:red\\}</style>` )')
    .some((x) => x.type === 'raw-javascript-to-frontend'),
    'raw-javascript-to-frontend: a stylesheet is not code and stays fine');
  const { checkXmlSource } = await import('./observe.mjs');
  assert(!checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Button press=".onPress"/></mvc:View>')
    .findings.some((x) => x.type === 'raw-javascript-to-frontend'),
    'raw-javascript-to-frontend: a raw view.xml has a controller — handler names belong there');

  // --- date/time model types over a JSON model ------------------------------
  const dates = checkAbapSource(fs.readFileSync(f('datetype.clas.abap'), 'utf8'));
  const noSource = dates.findings.filter((x) => x.type === 'date-type-without-source');
  assert(noSource.length === 3,
    `date-type-without-source: three sourceless date bindings (got ${noSource.length})`);
  assert(noSource.map((x) => x.value).sort().join() === 'DateType,TimeType,sap.ui.model.type.DateTime',
    `date-type-without-source: the alias and the full module name are both judged (got ${noSource.map((x) => x.value).sort().join()})`);
  assert(!dates.findings.some((x) => x.type === 'date-type-without-source' && x.value === 'sap.ui.model.type.Float'),
    'date-type-without-source: a non-date type never needs a source format');

  // --- frontend-action wires and CSS braces ---------------------------------
  const wire = checkAbapSource(fs.readFileSync(f('wire.clas.abap'), 'utf8'));
  const actions = wire.findings.filter((x) => x.type === 'invalid-frontend-action');
  assert(actions.length === 4, `invalid-frontend-action: four bad wires (got ${actions.length})`);
  assert(actions.some((x) => x.control === 'CONTROL_GLOBAL' && x.value === 'MESSAGE_TOASTER' && x.member === 'global object'),
    'invalid-frontend-action: an unknown global object');
  assert(actions.some((x) => x.control === 'CONTROL_GLOBAL' && x.value === 'display' && x.allowed.join() === 'show'),
    'invalid-frontend-action: a method the global does not offer, with its allowed set');
  assert(actions.some((x) => x.control === 'BINDING_CALL' && x.value === 'refresh'),
    'invalid-frontend-action: a binding method that is not filter or sort');
  assert(actions.some((x) => x.member === 'view slot'),
    'invalid-frontend-action: the obsolete empty view slot of CONTROL_BY_ID');
  assert(!actions.some((x) => ['MESSAGE_TOAST', 'show', 'hide', 'BUSY_INDICATOR'].includes(x.value)),
    'invalid-frontend-action: a correct wire is never reported');

  const { ACTION_ARGS, GLOBAL_TARGETS, FRONTEND_EVENTS, FRONTEND_EVENT_ALIASES } = await import('../lib/frontend-actions.mjs');
  assert(Object.keys(ACTION_ARGS).every((a) => a === a.toLowerCase()) && GLOBAL_TARGETS.MESSAGE_TOAST.includes('show'),
    'invalid-frontend-action: the catalog is keyed by the cs_event constant name');
  assert(checkAbapRules('client->follow_up_action( val = client->cs_event-control_global '
    + 't_arg = VALUE #( ( `POPUP` ) ( `setWithinArea` ) ( `withinArea` ) ) ).')
    .filter((x) => x.type === 'invalid-frontend-action').length === 0,
    'invalid-frontend-action: POPUP.setWithinArea is a known global (abap2UI5 CONTROL_GLOBAL target)');

  /* The targets upstream added after the frontend action layer was split per
   * action group. check-upstream could not see any of them while it still
   * read the single, now-emptied z2ui5_cl_ui5f_frontact_js class. */
  for (const [target, method] of [
    ['VIEW_SLOTS', 'destroy'], ['VIEW_SLOTS', 'updateModel'],
    ['ROUTER', 'sync'], ['MESSAGE_BOX', 'alert'], ['MESSAGE_BOX', 'confirm'],
  ]) {
    assert(checkAbapRules('client->follow_up_action( val = client->cs_event-control_global '
      + `t_arg = VALUE #( ( \`${target}\` ) ( \`${method}\` ) ) ).`)
      .filter((x) => x.type === 'invalid-frontend-action').length === 0,
      `invalid-frontend-action: ${target}.${method} is a known CONTROL_GLOBAL wire`);
  }
  /* Removed upstream (BREAKING, changelog): the constants are gone from
   * z2ui5_if_client, so naming them is broken code and must be reported. */
  for (const gone of ['HISTORY_BACK', 'NAV_TO_ROUTE']) {
    assert(!FRONTEND_EVENTS.includes(gone),
      `invalid-frontend-action: ${gone} was removed upstream and must not stay in the dispatch mirror`);
  }
  /* Still released cs_event constants - the SERVER remaps either close onto
   * the VIEW_SLOTS destroy action, so an app using them is correct code. */
  for (const kept of ['POPUP_CLOSE', 'POPOVER_CLOSE']) {
    assert(FRONTEND_EVENT_ALIASES.includes(kept),
      `invalid-frontend-action: ${kept} is server-remapped, not gone - it must stay accepted`);
  }

  const css = wire.findings.filter((x) => x.type === 'unescaped-brace-in-style');
  assert(css.length === 1 && css[0].count === 2,
    `unescaped-brace-in-style: one finding per stylesheet, counting its braces (got ${css.length}/${css[0]?.count})`);
  assert(checkAbapRules('DATA(c) = `<style>.a \\{color:red\\}</style>`.').length === 0,
    'unescaped-brace-in-style: a correctly escaped stylesheet is silent');
  assert(checkAbapRules('DATA(c) = `<style>.a \\{x\\}</style>` && `toast {0} done`.')
    .filter((x) => x.type === 'unescaped-brace-in-style').length === 0,
    'unescaped-brace-in-style: a brace outside the <style> span is not CSS (the corpus false positive)');

  const collapsed = wire.findings.filter((x) => x.type === 'collapsed-brace-in-style');
  assert(collapsed.length === 1 && collapsed[0].count === 2,
    `collapsed-brace-in-style: the template form is caught where the source looks escaped (got ${collapsed.length})`);
  assert(checkAbapRules('DATA(c) = |<style>.a \\\\\\{x\\\\\\}</style>|.')
    .filter((x) => x.type === 'collapsed-brace-in-style').length === 0,
    'collapsed-brace-in-style: a doubled backslash survives the template and is not reported');
  assert(checkAbapRules('DATA(c) = `<style>.a \\{x\\}</style>`.')
    .filter((x) => x.type === 'collapsed-brace-in-style').length === 0,
    'collapsed-brace-in-style: the backtick form it recommends is not reported');

  /* The mirror image, and the rule that had no test at all until the coverage
   * gate at the end of this file went in. A backtick literal does no escape
   * processing, so the backslash is not an escape there - it lands in the
   * serialized attribute and UI5 sees `\{ path: … \}` where a binding should
   * be. Both correct spellings must stay silent, or the rule would report the
   * fix it recommends. */
  const escaped = (v) => checkAbapRules(`)->a( n = \`items\` v = ${v} )`)
    .filter((x) => x.type === 'escaped-brace-in-backtick');
  assert(escaped('`\\{ path: \'message>/\' \\}`').length === 1,
    'escaped-brace-in-backtick: a binding escaped inside a backtick literal is reported');
  assert(escaped('`{ path: \'message>/\' }`').length === 0,
    'escaped-brace-in-backtick: the plain-brace binding it recommends is silent');
  assert(escaped('|\\{ path: \'message>/\' \\}|').length === 0,
    'escaped-brace-in-backtick: the template form needs the escapes and is silent');
  assert(escaped('`<style>.a \\{color:red\\}</style>`').length === 0,
    'escaped-brace-in-backtick: an escaped stylesheet is not a binding and is left alone');

  const dead = wire.findings.filter((x) => x.type === 'unused-public-attribute');
  assert(dead.length === 1 && dead[0].member === 'ballast',
    `unused-public-attribute: only the untouched one (got ${dead.map((x) => x.member).join() || 'none'})`);
  assert(!dead.some((x) => ['name', 'counter'].includes(x.member)),
    'unused-public-attribute: a bound attribute and one used only in code are both left alone');
  assert(checkAbapRules('CLASS x DEFINITION. PROTECTED SECTION. DATA hidden TYPE string. ENDCLASS.')
    .filter((x) => x.type === 'unused-public-attribute').length === 0,
    'unused-public-attribute: a non-PUBLIC attribute is not transported and not judged');
}

// ------------------------------------------- rules distilled from the corpus ----
// popover-display-val, uncurated-formatter, hardcoded-binding-path,
// duplicate-for-iterator — lessons that bit the ai-demokit corpus, promoted
// from its repo-local pattern-lint into rules every consumer sees
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { applyFixes } = await import('../lib/fix.mjs');
  const srcC = fs.readFileSync(f('corpusrules.clas.abap'), 'utf8');
  const corpus = checkAbapSource(srcC);
  const hasC = (t, pred = () => true) => corpus.findings.some((x) => x.type === t && pred(x));

  assert(hasC('popover-display-val'),
    'popover-display-val: val = on popover_display is reported (it does not compile)');
  const pop = corpus.findings.find((x) => x.type === 'popover-display-val');
  assert(/popover_display\( xml = popover/.test(applyFixes(srcC, [pop]).output),
    'popover-display-val: --fix rewrites the parameter name to xml, the argument untouched');
  assert(!checkAbapRules('client->popup_display( val = popup->stringify( ) ).')
    .some((x) => x.type === 'popover-display-val'),
    'popover-display-val: popup_display( val = ) is the correct form and never reported');

  assert(hasC('uncurated-formatter', (x) => x.value === 'round2DP' && x.member === 'number'),
    'uncurated-formatter: a formatter outside the curated module is reported');
  assert(!hasC('uncurated-formatter', (x) => x.value === 'DateCreateObject'),
    'uncurated-formatter: a curated formatter is not');
  const ownModule = checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`      v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`  v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
      )->a( n = \`core:require\` v = \`{Formatter: 'my/app/formatter'}\`
      )->tag( \`Text\` )->a( n = \`text\` v = \`{ path: 'X', formatter: 'Formatter.myOwn' }\` ).
  client->view_display( view->stringify( ) ).`);
  assert(!ownModule.findings.some((x) => x.type === 'uncurated-formatter'),
    'uncurated-formatter: an alias pointed at the class\'s own module is not judged');

  assert(hasC('hardcoded-binding-path', (x) => x.value.includes('{/TITLE}')),
    'hardcoded-binding-path: a textual absolute path is reported');
  assert(!hasC('hardcoded-binding-path', (x) => x.value.includes('PRICE')),
    'hardcoded-binding-path: a relative complex-binding path is not absolute and not reported');
  assert(!checkAbapRules(`client->switch_default_model_path( ).
    view->tag( \`Panel\` )->a( n = \`binding\` v = \`{/Products('4711')}\` ).`)
    .some((x) => x.type === 'hardcoded-binding-path'),
    'hardcoded-binding-path: an OData entity path with a key predicate is exempt when the class switches its default model');
  assert(!checkAbapRules('DATA(css) = `<style>.a \\{/* keep */color:red\\}</style>`.')
    .some((x) => x.type === 'hardcoded-binding-path'),
    'hardcoded-binding-path: a CSS comment after a brace inside <style> is not a path');

  assert(hasC('duplicate-for-iterator', (x) => x.member === 'i'),
    'duplicate-for-iterator: the reused iterator across two VALUE blocks in one method');
  assert(!checkAbapRules('METHOD a. x = VALUE #( FOR i = 1 UNTIL i > 2 ( ) ). ENDMETHOD.'
    + ' METHOD b. y = VALUE #( FOR i = 1 UNTIL i > 2 ( ) ). ENDMETHOD.')
    .some((x) => x.type === 'duplicate-for-iterator'),
    'duplicate-for-iterator: the same name in two different methods is fine');

  assert(checkAbapRules('view->tag( `Input` )->a( n = `liveChange` v = client->_event( `LIVE` ) ).')
    .some((x) => x.type === 'live-event-roundtrip' && x.member === 'liveChange'),
    'live-event-roundtrip: a liveChange wired to a backend round-trip is reported');
  assert(!checkAbapRules('view->tag( `Input` )->a( n = `liveChange` v = client->_event_client( `X` t_arg = VALUE #( ( `A` ) ) ) ).')
    .some((x) => x.type === 'live-event-roundtrip'),
    'live-event-roundtrip: a frontend-only _event_client wire is not judged');
  assert(!checkAbapRules('view->tag( `Input` )->a( n = `change` v = client->_event( `DONE` ) ).')
    .some((x) => x.type === 'live-event-roundtrip'),
    'live-event-roundtrip: the final-value event is the correct form and not reported');

  const flag = `CLASS zcl_f DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA check_initialized TYPE abap_bool.
    DATA cache_loaded TYPE abap_bool.
ENDCLASS.
CLASS zcl_f IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    IF check_initialized = abap_false.
      check_initialized = abap_true.
      client->view_display( render( ) ).
    ENDIF.
    IF cache_loaded IS INITIAL.
      cache_loaded = abap_true.
      load_cache( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.`;
  const flags = checkAbapRules(flag);
  assert(flags.some((x) => x.type === 'manual-init-flag' && x.member === 'check_initialized'),
    'manual-init-flag: a boolean gating the first render is reported');
  assert(!flags.some((x) => x.type === 'manual-init-flag' && x.member === 'cache_loaded'),
    'manual-init-flag: a lazy-load guard that displays nothing is left alone');
  assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      client->view_display( render( ) ).
    ENDIF.
  ENDMETHOD.`).some((x) => x.type === 'manual-init-flag'),
    'manual-init-flag: check_on_init( ) is the correct form and not reported');

  const refs = checkAbapRules(`CLASS zcl_r DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mt_data TYPE REF TO data.
    DATA t_rows TYPE STANDARD TABLE OF string WITH EMPTY KEY.
ENDCLASS.
CLASS zcl_r IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_data ) ).
    view->ele( \`List\` )->a( n = \`items\` v = client->_bind( mt_data->* ) ).
    view->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_rows ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(refs.filter((x) => x.type === 'binding-to-reference').length === 1,
    'binding-to-reference: the undereferenced REF TO bind is reported, ref->* and a data attribute are not');

  const disabled = checkAbapSource(`CLASS zcl_d DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA can_save TYPE abap_bool.
ENDCLASS.
CLASS zcl_d IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Button\`
            )->a( n = \`press\`   v = client->_event( \`DEAD\` )
            )->a( n = \`enabled\` v = \`false\`
        )->tag( \`Button\`
            )->a( n = \`press\`   v = client->_event( \`LIVE\` )
            )->a( n = \`enabled\` v = client->_bind( can_save )
        )->end( ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  const dead = disabled.findings.filter((x) => x.type === 'event-on-disabled-control');
  assert(dead.length === 1 && dead[0].member === 'press',
    'event-on-disabled-control: the literal-disabled button is reported, the bound one is not');

  /* The same button wired with follow_up_action( ), the name the corpora moved
   * to. The reconstructor knew _event/_event_client only, so such a handler
   * resolved to nothing and was DROPPED from the view - and every rule that
   * judges an event wire stopped seeing it. A dropped wire is silent: the port
   * looks clean instead of being judged. */
  const followUp = checkAbapSource(`
CLASS zcl_f DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.
CLASS zcl_f IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Button\`
            )->a( n = \`press\`   v = client->follow_up_action( val = client->cs_event-popup_close )
            )->a( n = \`enabled\` v = \`false\`
        )->end( ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(followUp.docs[0]?.includes('press='),
    'follow_up_action: the wire reaches the reconstructed view instead of being dropped');
  assert(followUp.findings.some((x) => x.type === 'event-on-disabled-control'),
    'follow_up_action: a wire written with it is judged like an _event_client one');
}

// ------------------------------------------- obsolete z2ui5_if_client members ----
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { applyFixes } = await import('../lib/fix.mjs');
  const source = fs.readFileSync(f('obsolete.clas.abap'), 'utf8');
  const found = checkAbapRules(source);
  const of = (t, pred = () => true) => found.filter((x) => x.type === t && pred(x));

  const updates = of('obsolete-model-update');
  assert(updates.length === 5
    && ['view_model_update', 'nest_view_model_update', 'nest2_view_model_update',
      'popup_model_update', 'popover_model_update'].every(
      (m) => updates.some((x) => x.member === m)),
  `obsolete-model-update: all five empty push methods are reported (${updates.map((x) => x.member).join(', ')})`);

  assert(of('obsolete-frontend-event', (x) => x.member === '_event_client').length === 1,
    'obsolete-frontend-event: _event_client reported — follow_up_action reaches the same get_event_client');

  const fixed = applyFixes(source, found).output;
  assert(!/model_update/.test(fixed) && !/_event_client/.test(fixed),
    'obsolete: --fix deletes every model update and renames the frontend event');
  assert(/v = client->follow_up_action\( val = client->cs_event-popup_close \)/.test(fixed),
    'obsolete: the renamed call keeps its arguments untouched, in the view-attribute position');
  assert(!/\n[ \t]*\n[ \t]*\n/.test(fixed),
    'obsolete: a deleted call takes its whole line with it, leaving no blank run behind');
  assert(!checkAbapRules(fixed).some(
    (x) => x.type === 'obsolete-model-update' || x.type === 'obsolete-frontend-event'),
  'obsolete: the fixed source reports neither rule again');

  // a call that shares its line, or carries a trailing comment, keeps the
  // line: deleting a comment nobody asked about is a guess
  const shared = 'IF x = 1. client->view_model_update( ). ENDIF.';
  assert(applyFixes(shared, checkAbapRules(shared)).output === 'IF x = 1.  ENDIF.',
    'obsolete-model-update: on a shared line only the statement is cut');
  const commented = '    client->popup_model_update( ). " refresh\n';
  assert(applyFixes(commented, checkAbapRules(commented)).output === '     " refresh\n',
    'obsolete-model-update: a trailing comment survives the deletion');

  // the automatic push reaches the MAIN slot, which after a navigation still
  // holds the CALLED app's view - so this is no longer a re-display
  const navigated = `METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      client->view_model_update( ).
    ENDIF.
  ENDMETHOD.`;
  assert(checkAbapRules(navigated).some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-view-display-on-navigated: view_model_update( ) no longer counts as a re-display');
}

// ------------------------------------------ source positions and declarations ----
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { annotate } = await import('../lib/findings.mjs');

  /* A finding has to point at the line it is about. publicAttributes measured
   * its offsets in the SECTION BODY but added the offset of the `PUBLIC
   * SECTION.` keyword, so every unused-public-attribute landed one line
   * early — invisible in a test that only checks the member name. */
  const attrs = `CLASS zcl_x DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA used TYPE string.
    DATA ballast TYPE string.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    used = \`x\`.
  ENDMETHOD.
ENDCLASS.`;
  const dead = annotate(checkAbapRules(attrs).filter((x) => x.type === 'unused-public-attribute'), attrs);
  assert(dead.length === 1 && dead[0].member === 'ballast' && dead[0].line === 5,
    `unused-public-attribute: reported on the line it is declared on (line ${dead[0]?.line}, DATA ballast is line 5)`);

  /* A CHAINED declaration declares more than one name. Only the first was
   * collected, so the second boolean reached the view unreported while its
   * neighbour on the line above was caught. */
  const chained = `CLASS x DEFINITION PUBLIC.
  PUBLIC SECTION.
    DATA: first  TYPE abap_bool,
          second TYPE abap_bool.
ENDCLASS.
CLASS x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->tag( \`Button\`
            )->a( n = \`visible\` v = first
            )->a( n = \`enabled\` v = second ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const bools = checkAbapRules(chained).filter((x) => x.type === 'unconverted-abap-boolean');
  assert(bools.length === 2 && bools.some((x) => x.value === 'second'),
    `unconverted-abap-boolean: every name of a chained DATA: declaration is a known boolean (${bools.map((x) => x.value).join(', ')})`);
}

// ------------------------------------------------------- accessibility ----
{
  const view = (leaf) => `CLASS x DEFINITION PUBLIC.
ENDCLASS.
CLASS x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
${leaf}.
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const a11y = (leaf) => checkAbapSource(view(leaf), { render: false })
    .findings.filter((x) => x.type === 'missing-accessibility');

  /* sap.m.Image.decorative DEFAULTS TO TRUE, and UI5 then ignores `alt`
   * outright — so demanding one from an image without `decorative` asked for
   * an attribute the framework drops, on nearly every image in a corpus. */
  assert(!a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )').length,
    'missing-accessibility: an image without `decorative` is decorative by default and needs no alt');
  assert(a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )->a( n = \`decorative\` v = \`false\` )').length === 1,
    'missing-accessibility: an image declared MEANINGFUL and left without alt is the defect');
  assert(!a11y('        )->tag( \`Image\` )->a( n = \`src\` v = \`x.png\` )->a( n = \`decorative\` v = \`false\` )->a( n = \`alt\` v = \`Logo\` )').length,
    'missing-accessibility: …and an alt on it settles the matter');

  // three ways to name an icon-only button, not two
  assert(a11y('        )->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://add\` )').length === 1,
    'missing-accessibility: an icon-only button with no name at all is reported');
  for (const named of ['text', 'tooltip', 'ariaLabelledBy']) {
    assert(!a11y(`        )->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://add\` )->a( n = \`${named}\` v = \`x\` )`).length,
      `missing-accessibility: an icon button named through ${named} has an accessible name`);
  }
}

// ----------------------------------------------- a broken install answers ----
{
  const { loadSnapshot, snapshotVersion } = await import('../lib/properties.mjs');
  /* The snapshot is the property gate's whole knowledge. A `--snapshot`
   * pointing at nothing, or an install that lost data/properties.json, used
   * to come out as a bare ENOENT stack trace — while the render gate's
   * missing dependencies have always answered with one actionable line. */
  let thrown = null;
  try { loadSnapshot('/nope/properties.json'); } catch (e) { thrown = e; }
  assert(thrown?.code === 'ERR_SNAPSHOT_MISSING' && /properties\.json/.test(thrown.message)
    && /--no-properties/.test(thrown.message),
  `snapshot: a missing snapshot is one actionable line, not a stack trace (${thrown?.code})`);
  assert(snapshotVersion('/nope/properties.json') === '',
    'snapshot: snapshotVersion returns the empty string it promises when the file is unreadable');
}

// ------------------------------------------------------- file collection ----
{
  const { collectFiles } = await import('./observe.mjs');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5lint-collect-'));
  const named = path.join(dir, 'my_app.abap');           // not abapGit's spelling
  fs.copyFileSync(f('viewbuilder.clas.abap'), named);
  fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'z.testclasses.abap'));

  // a path the caller NAMED is meant - dropping it silently is the worst
  // answer a linter can give
  assert(collectFiles([named]).length === 1,
    'collectFiles: an explicitly named .abap file carrying a builder chain is checked');
  // …but a directory WALK keeps to the naming convention, which is what tells
  // an app class from an include or a generated artefact
  assert(collectFiles([dir]).length === 0,
    `collectFiles: a directory scan stays on .clas.abap (${collectFiles([dir]).join(', ')})`);
  assert(collectFiles([path.join(dir, 'z.testclasses.abap')]).length === 0,
    'collectFiles: a test include is never checked, not even when named');

  // the same file reached twice - `cli.mjs src src`, or a directory named
  // next to one of its own files - was checked, reported and COUNTED twice
  fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'app.clas.abap'));
  const twice = collectFiles([dir, dir, path.join(dir, 'app.clas.abap')]);
  assert(twice.length === 1, `collectFiles: a file reached twice is checked once (${twice.join(', ')})`);
  // …and it comes back spelled the way it was reached: result.file travels
  // into --json and into the baseline keys, so the string is a contract
  const abs = collectFiles([path.resolve(f('good.clas.abap'))]);
  assert(abs.length === 1 && path.isAbsolute(abs[0]),
    `collectFiles: an absolute path stays absolute (${abs[0]})`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------- builder chain layout ----
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { annotate } = await import('../lib/findings.mjs');
  const source = fs.readFileSync(f('chainlayout.clas.abap'), 'utf8');
  const found = annotate(checkAbapRules(source).filter((x) => x.type.startsWith('chain-')), source);
  const of = (shape) => found.find((x) => x.shape === shape);

  assert(of('siblings') && of('siblings').value === '10' && of('siblings').count === 12,
    'chain-indentation: a sibling written a level out of line with its siblings is reported');
  assert(of('outdented') && of('outdented').member === 'att',
    'chain-indentation: an attribute written LEFT of the control it belongs to is reported');
  const crammed = found.find((x) => x.type === 'chain-element-per-line');
  assert(crammed && crammed.count === 3,
    'chain-element-per-line: three controls on one line of a multi-line chain, counted');
  /* An attribute sharing its control's line hides no level of the tree —
   * the compact form of half the samples, and every hit the first version
   * of this rule produced on the corpus. */
  const compact = `v->ele( n = \`View\` ns = \`mvc\`
      )->tag( \`Text\` )->a( n = \`text\` v = \`a\`
      )->tag( \`Text\` )->a( n = \`text\` v = \`b\` ).`;
  assert(!checkAbapRules(compact).some((x) => x.type === 'chain-element-per-line'),
    'chain-element-per-line: a control and its own attributes may share a line');
  // one finding per chain per rule: a shifted block makes everything below it
  // look wrong too, and forty findings for one mistake is not a report
  assert(found.filter((x) => x.type === 'chain-indentation').length === 2,
    `chain-indentation: one finding per chain (${found.length} in a fixture with two broken chains)`);
  // the fixture's fourth method keeps a TWO-space step throughout - the size
  // of the step is not what the rule is about, so it stays silent
  assert(!found.some((x) => x.line > 66),
    `chain layout: a chain that keeps its own two-space rhythm is never reported (${found.map((x) => x.line).join(', ')})`);

  // …and the canonical fixtures carry nothing
  for (const clean of ['good.clas.abap', 'viewbuilder.clas.abap']) {
    const src = fs.readFileSync(f(clean), 'utf8');
    assert(!checkAbapRules(src).some((x) => x.type.startsWith('chain-')),
      `chain layout: ${clean} is laid out the way the app guide writes it`);
  }
  // a chain on ONE line is a deliberate compact form, not a layout to judge
  const oneLiner = 'DATA(v) = z2ui5_cl_ui5_view_builder=>factory( )->ele( `View` )->a( n = `x` v = `y` )->tag( `Text` ).';
  assert(!checkAbapRules(oneLiner).some((x) => x.type.startsWith('chain-')),
    'chain layout: a single-line chain has no layout to be inconsistent with');

  // ---- chain-house-layout: the opt-in one ----------------------------------
  const { applyFixes } = await import('../lib/fix.mjs');
  const ON = { rules: { 'chain-house-layout': 'warning' } };
  const drifted = `  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->ele( \`Shell\` )->ele( \`Page\`
                  )->tag( \`Text\` )->a( n = \`text\` v = \`x\` ).`;

  assert(!checkAbapRules(drifted).some((x) => x.type === 'chain-house-layout'),
    'chain-house-layout: silent until a config asks for it');
  assert(checkAbapRules(drifted, ON).some((x) => x.type === 'chain-house-layout'),
    'chain-house-layout: switched on by a rules entry, it reports the drifted chain');
  assert(!checkAbapRules(drifted, { rules: { 'chain-house-layout': false } })
    .some((x) => x.type === 'chain-house-layout'),
  'chain-house-layout: `false` keeps it off even as an opt-in rule');

  // the fix is the canonical layout, and it is whitespace-only
  const houseFixed = applyFixes(drifted, checkAbapRules(drifted, ON)).output;
  const collapse = (t) => t.replace(/\s+/g, ' ').trim();
  assert(collapse(houseFixed) === collapse(drifted),
    'chain-house-layout: --fix changes whitespace only — the chain still builds the same view');
  // the statement is indented by two, so the tree starts at 2+4 and steps by four
  assert(/\n {6}\)->ele\( n = `View`/.test(houseFixed)
    && /\n {10}\)->a\( n = `xmlns`/.test(houseFixed)
    && /\n {10}\)->ele\( `Shell`/.test(houseFixed)
    && /\n {14}\)->ele\( `Page`/.test(houseFixed)
    && /\n {18}\)->tag\( `Text`/.test(houseFixed)
    && /\n {22}\)->a\( n = `text`/.test(houseFixed),
  `chain-house-layout: --fix gives every call its own line at four spaces per level\n${houseFixed}`);
  assert(!checkAbapRules(houseFixed, ON).some((x) => x.type === 'chain-house-layout'),
    'chain-house-layout: the fixed chain reports nothing on a second run');

  // the compact attribute form chain-element-per-line allows IS reported here —
  // that difference is the whole point of the rule being separate and opt-in
  assert(checkAbapRules(compact, ON).some((x) => x.type === 'chain-house-layout'),
    'chain-house-layout: stricter than chain-element-per-line — an attribute gets its own line too');

  // a two-space chain is fine for its neighbours and not for this one
  for (const clean of ['good.clas.abap', 'viewbuilder.clas.abap']) {
    const src = fs.readFileSync(f(clean), 'utf8');
    const out = applyFixes(src, checkAbapRules(src, ON)).output;
    assert(collapse(out) === collapse(src),
      `chain-house-layout: the fix stays whitespace-only on ${clean}`);
  }
}

// ------------------------------- the view builder (z2ui5_cl_ui5_view_builder) ----
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { applyFixes } = await import('../lib/fix.mjs');
  const { dialectOf } = await import('../lib/builders.mjs');
  const source = fs.readFileSync(f('viewbuilder.clas.abap'), 'utf8');
  const vb = checkAbapSource(source, { render: false });
  const ai = prepareAbap(fs.readFileSync(f('good.clas.abap'), 'utf8'));

  assert(vb.usesBuilder && vb.docs.length === 1,
    'view builder: an ele/tag/a/end class is recognised and reconstructed');
  /* The same view written as one flat chain and as a chain that hands a
   * handle to a helper has to come out as the SAME document — that is the
   * whole claim of the handle-aware reconstruction. The helper fixture adds
   * one boolean attribute, and nothing else. */
  assert(vb.docs[0].replace(' editable="true"', '') === ai.docs[0],
    `view builder: a helper-handle chain rebuilds the same document as a flat one\n      ${vb.docs[0]}\n      ${ai.docs[0]}`);
  assert(vb.docs[0].includes('editable="true"'),
    'view builder: a( b = flag ) reaches the view as a rendered boolean');
  assert(vb.helperTokens === 0,
    'view builder: a helper typed TYPE REF TO z2ui5_cl_ui5_view_builder is followed, not counted as unattributable');
  assert(vb.model.NAME === 'world' && vb.findings.length === 0,
    `view builder: the model is derived and the fixture is clean (${vb.findings.map((x) => x.type).join(', ')})`);

  // every source-reading rule follows the dialect too — ids, booleans, wires
  const wired = `CLASS zcl_x DEFINITION PUBLIC.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA flag TYPE abap_bool.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->tag( \`Button\`
            )->a( n = \`id\`      v = \`btnOk\`
            )->a( n = \`visible\` v = flag ).
    client->follow_up_action( val = client->cs_event-control_by_id
                              t_arg = VALUE #( ( \`btnok\` ) ( \`focus\` ) ) ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const found = checkAbapRules(wired);
  const id = found.find((x) => x.type === 'frontend-action-unknown-id');
  assert(id && id.allowed.includes('btnOk'),
    'view builder: ids written with a( n = `id` ) are collected, so a wrong wire is still caught');
  const bool = found.find((x) => x.type === 'unconverted-abap-boolean');
  assert(bool && /a\( b = /.test(bool.fixHint),
    'view builder: an unconverted boolean names the builder\'s own correction');
  assert(/a\( n = `visible` b = flag/.test(applyFixes(wired, found).output),
    'view builder: --fix moves the flag onto the b parameter instead of wrapping it');

  assert(dialectOf('z2ui5_cl_ui5_view_builder=>factory( )').verbs === '(ele|tag|end|a|stringify)',
    'view builder: a source is read in the dialect its factory names');
}

// ------------------------------------------------- the FROZEN view builder ----
/* An app on `z2ui5_cl_xml_view` was not merely unjudged, it was invisible:
 * collectFiles kept a class only when it called a CURRENT builder's factory, so
 * a whole app on the retired API produced "no checkable app classes" and exit 0.
 * That is the shape of miss this linter exists to prevent, and it is aimed at
 * the most common wrong answer there is - the old API is what nearly all public
 * abap2UI5 material shows, and therefore what a language model writes. */
{
  const { checkAbapSource, collectFiles } = await import('./observe.mjs');
  const { frozenBuilderOf, FROZEN_BUILDERS } = await import('../lib/builders.mjs');
  const os = await import('node:os');
  const source = fs.readFileSync(f('frozenbuilder.clas.abap'), 'utf8');

  const found = checkAbapSource(source, { render: false }).findings;
  const frozen = found.find((x) => x.type === 'frozen-view-builder');
  assert(frozen && frozen.value === 'z2ui5_cl_xml_view',
    'frozen builder: a class on z2ui5_cl_xml_view is reported, not skipped');
  assert(frozen.severity === 'error',
    'frozen builder: an error - the whole view went unchecked, which is worse than any one finding');
  assert(/NOTHING about the view was checked/.test(frozen.message),
    'frozen builder: the message says what was not judged, not just that a name is old');
  assert(frozen.line === 13,
    `frozen builder: reported at the factory call, not at line 1 (got ${frozen.line})`);

  /* And ONLY that. The other ABAP rules model the current dialect; run over
   * `page( )`/`button( )` they would be guessing, and confident noise is a
   * worse trade than the silence it replaces. */
  assert(found.length === 1,
    `frozen builder: exactly one finding, no guesses about an API the reconstructor does not model (got ${found.map((x) => x.type).join(', ') || 'none'})`);

  // the collection half - the actual defect, and the half a findings test misses
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5-frozen-'));
  fs.writeFileSync(path.join(dir, 'zcl_frozen_app.clas.abap'), source);
  assert(collectFiles([dir]).length === 1,
    'frozen builder: the file is collected — before this, the run said "no checkable app classes"');
  fs.rmSync(dir, { recursive: true, force: true });

  // negative: the current builder is not mistaken for the frozen one, and a
  // mention that is not a factory call is not a view being built with it
  assert(frozenBuilderOf(fs.readFileSync(f('good.clas.abap'), 'utf8')) === null,
    'frozen builder: a class on the current builder is not reported');
  assert(frozenBuilderOf('" see z2ui5_cl_xml_view for the old way') === null,
    'frozen builder: naming the class without calling its factory builds no view');
  assert(FROZEN_BUILDERS.includes('z2ui5_cl_xml_view_cc'),
    'frozen builder: the custom-control half of the old API counts too');
}

// ------------------------------------------ the released API surface (src/02) ----
{
  const { checkAbapRules } = await import('./observe.mjs');
  const { apiVerdict, RELEASED_OBJECTS } = await import('../lib/released-api.mjs');
  const source = fs.readFileSync(f('releasedapi.clas.abap'), 'utf8');
  const named = checkAbapRules(source)
    .filter((x) => x.type === 'non-released-api').map((x) => x.value);

  for (const [name, area] of [
    ['z2ui5_cl_util', 'src/99/01'],          // retired utility class
    ['z2ui5_cl_pop_to_confirm', 'src/99/02'], // built-in popup, replaced by the addon
    ['z2ui5_cl_ajson', 'src/00/01'],          // vendored copy, renamed on every sync
    ['z2ui5_if_ajson', 'src/00/01'],          // …in a declaration, not only a call
    ['z2ui5_cl_ui5_client', 'src/01'],        // the core engine
  ]) {
    assert(named.includes(name) && apiVerdict(name).area === area,
      `non-released-api: ${name} is reported, and placed in ${area}`);
  }

  for (const name of RELEASED_OBJECTS) {
    assert(apiVerdict(name) === null, `non-released-api: the released ${name} is never reported`);
  }
  // z2ui5_if_types ships in the released src/02 - which it has to, because the
  // released client->get( ) returns z2ui5_if_types=>ty_s_get and an app that
  // declares a variable of that type cannot avoid naming it
  assert(!named.includes('z2ui5_if_types'),
    'non-released-api: z2ui5_if_types is released — the released client->get( ) returns it');
  // an app\'s own z2ui5_-prefixed class matches no framework family
  assert(!named.includes('z2ui5_cl_demo_app_042'),
    'non-released-api: a name outside every framework prefix family is somebody else\'s class');
  // a legacy name inside a `…` literal is text, not a reference
  assert(!named.includes('z2ui5_cl_util_log'),
    'non-released-api: a framework name inside a string literal is not a use of it');

  const own = `CLASS z2ui5_cl_ui5_app_start DEFINITION PUBLIC.
ENDCLASS.
CLASS z2ui5_cl_ui5_app_start IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_xml_view=>factory( ).
  ENDMETHOD.
ENDCLASS.`;
  const inOwn = checkAbapRules(own).filter((x) => x.type === 'non-released-api');
  assert(inOwn.length === 1 && inOwn[0].value === 'z2ui5_cl_xml_view',
    'non-released-api: a class does not use ITSELF — only the frozen builder it names is reported');
  assert(inOwn[0].replacement === 'z2ui5_cl_ui5_view_builder',
    'non-released-api: the frozen view builder points at its successor');
}

// --------------------------------------------------------- lifecycle rules ----
{
  const lc = checkAbapSource(fs.readFileSync(f('lifecycle.clas.abap'), 'utf8'));
  assert(lc.findings.some((x) => x.type === 'separate-lifecycle-ifs' && x.member === 'check_on_navigated'),
    'separate-lifecycle-ifs: a second plain IF on a lifecycle check is reported');
  assert(lc.findings.some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-view-display-on-navigated: a navigated branch that never re-displays');

  const chained = `METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      client->view_display( render( ) ).
    ELSEIF client->check_on_navigated( ).
      IF picked IS INITIAL.
        picked = \`x\`.
      ENDIF.
      client->view_display( render( ) ).
    ENDIF.
  ENDMETHOD.`;
  const { checkAbapRules } = await import('./observe.mjs');
  assert(!checkAbapRules(chained).some((x) => x.type === 'separate-lifecycle-ifs'),
    'separate-lifecycle-ifs: an IF/ELSEIF chain is the correct form and not reported');
  assert(!checkAbapRules(chained).some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-view-display-on-navigated: an inner IF does not end the branch early — the display after it counts');

  /* The branch usually DELEGATES - `on_navigation( )`, which calls
   * `view_display( )`, which displays. Reading only the branch text called
   * four correct samples broken and offered a fix that would have displayed
   * the view twice. */
  const delegated = `METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      paint( ).
    ELSEIF client->check_on_navigated( ).
      on_navigation( ).
    ENDIF.
  ENDMETHOD.
  METHOD on_navigation.
    client->message_toast_display( \`back\` ).
    paint( ).
  ENDMETHOD.
  METHOD paint.
    client->view_display( render( ) ).
  ENDMETHOD.`;
  assert(!checkAbapRules(delegated).some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-view-display-on-navigated: a branch that delegates two levels down to a display still counts');
  const delegatedSilent = delegated.replace('client->view_display( render( ) ).', 'rendered = abap_true.');
  // `paint` rather than `view_display` on purpose: the method NAME must not be
  // what satisfies the rule, or the negative half proves nothing
  assert(checkAbapRules(delegatedSilent).some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-view-display-on-navigated: following the call does not make the rule toothless — no display anywhere is still reported');

  /* An ABAP keyword inside a STRING LITERAL is not structure. A MessageStrip
   * whose text reads "…so the state can be shared with someone else. Enter a
   * quantity…" ended its enclosing IF branch at that `else`, four statements
   * before the real ENDIF - and the view_display( ) after it stopped counting.
   * Any English sentence long enough contains one of these words. */
  const prose = `METHOD z2ui5_if_app~main.
    IF client->check_on_navigated( ).
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory(
          )->ele( n = \`View\` ns = \`mvc\`
              )->a( n = \`xmlns\` v = \`sap.m\`
              )->tag( \`MessageStrip\`
                  )->a( n = \`text\` v = \`share the state with someone else. Enter a quantity, if you like, and press it\` ).
      client->view_display( view->stringify( ) ).
    ENDIF.
  ENDMETHOD.`;
  assert(!checkAbapRules(prose).some((x) => x.type === 'missing-view-display-on-navigated'),
    'ifBranchEnd: `else`/`if` inside a literal is prose, not the end of the branch');

  /* ---- missing-on-navigated-branch: the same defect, one step earlier ----
   *
   * The rule above needs a branch to judge. The far more common shape in the
   * wild has none at all - 576 classes across the three sample repositories -
   * and it is invisible until something navigates into the app. */
  const NAV = 'missing-on-navigated-branch';
  const canonical = `METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_init( ).
      model_init( ).
      view_display( ).
    ELSEIF client->check_on_event( ).
      on_event( ).
    ENDIF.
  ENDMETHOD.
  METHOD view_display.
    client->view_display( render( ) ).
  ENDMETHOD.`;
  assert(checkAbapRules(canonical).some((x) => x.type === NAV),
    'missing-on-navigated-branch: the two-branch dispatcher every guide used to show');
  assert(!checkAbapRules(canonical).some((x) => x.type === 'missing-view-display-on-navigated'),
    'missing-on-navigated-branch: the branch-that-exists rule stays quiet - the two never both fire');
  assert(!checkAbapRules(canonical.replace(
    'ELSEIF client->check_on_event( ).',
    'ELSEIF client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF client->check_on_event( ).')).some((x) => x.type === NAV),
  'missing-on-navigated-branch: adding the branch clears it');

  // a static app - no data, no events - is the same defect with one branch
  assert(checkAbapRules(`METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      client->view_display( render( ) ).
    ENDIF.
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: a lone check_on_init branch is not exempt for being simple');

  /* The reason this is not a text search for the word. An app whose display
   * is NOT gated by the lifecycle re-displays on EVERY roundtrip, navigated
   * ones included - samples/z2ui5_cl_smp_app_025 is exactly this shape, and
   * a rule reading the text alone called it broken. */
  assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_init( ).
      name = \`world\`.
    ELSEIF client->check_on_event( ).
      on_event( ).
    ENDIF.
    view_display( ).
  ENDMETHOD.
  METHOD view_display.
    client->view_display( render( ) ).
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: an ungated display after the chain covers every roundtrip');

  /* The popup-helper shape: display once, then leave on everything else.
   * abap2UI5's own z2ui5_cl_pop_data is written this way. */
  assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
    me->client = client.
    IF client->check_on_init( ).
      display( ).
      RETURN.
    ENDIF.
    client->nav_app_leave( ).
  ENDMETHOD.
  METHOD display.
    client->popup_display( render( ) ).
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: a helper that leaves on every other roundtrip needs no branch');

  // a class that never displays anything is not an app to judge - that is
  // view-never-displayed's finding, and two rules for one class is a report
  // nobody can act on
  assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      counter = counter + 1.
    ENDIF.
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: a class with no display anywhere is a helper, not a blank app');

  // the OR form is a navigated branch too, spelled differently
  assert(!checkAbapRules(`METHOD z2ui5_if_app~main.
    IF client->check_on_init( ) OR client->check_on_navigated( ).
      client->view_display( render( ) ).
    ENDIF.
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: check_on_navigated in an OR condition counts');

  /* ifBlockEnd has to step OVER the ELSEIF branches of the construct it is
   * cutting, or the second branch is read as ungated code and every
   * dispatcher looks covered by its own on_event branch. */
  assert(checkAbapRules(`METHOD z2ui5_if_app~main.
    IF client->check_on_init( ).
      IF flag = abap_true.
        client->view_display( render( ) ).
      ENDIF.
    ELSEIF client->check_on_event( ).
      client->view_display( render( ) ).
    ENDIF.
  ENDMETHOD.`).some((x) => x.type === NAV),
  'missing-on-navigated-branch: a nested IF inside the branch does not end the construct early');

  /* An `exclude` is matched against the path the runner REACHED the file by,
   * which is absolute when `paths` comes from a config file - while the report
   * prints it relative to the cwd. A pattern written from what you can read in
   * the report used to match nothing, silently. */
  {
    const { applyRules } = await import('../lib/findings.mjs');
    const one = [{ type: 'unknown-control' }];
    /* An exclude has to mean the same thing however the run was started. The
     * path a finding carries is absolute or relative depending on the
     * invocation, and BOTH spellings of the pattern were in the README and in
     * real configs: `/src/02/` with abaplint's leading slash (linter#35, where
     * `abap2ui5lint src` reported 25 findings the config had waived), and
     * `^src/00/98/` written the way the report prints it. */
    for (const [pattern, what] of [
      ['^src/00/98/', 'written the way the report prints the path'],
      ['/src/00/98/', "written with abaplint's leading slash"],
    ]) {
      const rules = { 'unknown-control': { exclude: [pattern] } };
      for (const [form, how] of [
        [`${process.cwd()}/src/00/98/app.clas.abap`, 'an absolute path'],
        ['src/00/98/app.clas.abap', 'a relative path'],
        ['./src/00/98/app.clas.abap', 'a dot-prefixed path'],
      ]) {
        assert(applyRules([...one], rules, form).length === 0,
          `rules.exclude: "${pattern}" (${what}) excludes the file when it arrives as ${how}`);
      }
      assert(applyRules([...one], rules, `${process.cwd()}/src/01/app.clas.abap`).length === 1,
        `rules.exclude: "${pattern}" still only excludes what it names`);
      assert(applyRules([...one], rules, 'src/01/app.clas.abap').length === 1,
        `rules.exclude: "${pattern}" still only excludes what it names, relative too`);
    }
  }
  // the guard idiom is exclusive by construction: good.clas.abap opens with
  // `IF check_on_event( \`GO\` ). RETURN. ENDIF.` before its init IF
  assert(!checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8')).findings
    .some((x) => x.type === 'separate-lifecycle-ifs'),
    'separate-lifecycle-ifs: an IF block that RETURNs (the guard idiom) does not count');
}

// -------------------------------- event-parameter existence + closed gaps ----
{
  const paramFindings = (control, event, param, type) => checkAbapSource(`
  DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
  view->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( \`${control}\`
          )->a( n = \`${event}\` v = client->_event( val = \`GO\` t_arg = VALUE #( ( \`\${$parameters>/${param}}\` ) ) ) ).
  client->view_display( view->stringify( ) ).`)
    .findings.filter((x) => x.type === type);

  const typo = paramFindings('SearchField', 'search', 'quer', 'unknown-event-parameter');
  assert(typo.length === 1 && typo[0].allowed.includes('query'),
    'unknown event param: a typo is reported, carrying the names the event does declare');
  assert(!paramFindings('SearchField', 'search', 'query', 'unknown-event-parameter').length,
    'unknown event param: a declared parameter without @since is known, not unknown');
  assert(!paramFindings('Button', 'press', 'anything', 'unknown-event-parameter').length,
    'unknown event param: an event that declares no parameters block is never judged');
  assert(paramFindings('SearchField', 'search', 'searchButtonPressed', 'event-parameter-too-new').length === 1
    && !paramFindings('SearchField', 'search', 'searchButtonPressed', 'unknown-event-parameter').length,
    'unknown event param: a too-new parameter reports as too-new, never doubly as unknown');
  // the false positive the first corpus run produced: a subclass widening an
  // inherited event without redeclaring it (DateRangeSelection change from/to)
  assert(!paramFindings('DateRangeSelection', 'change', 'from', 'unknown-event-parameter').length,
    'unknown event param: an event the control does not declare itself is not judged');

  // --- the two rules that only had negative/severity assertions -------------
  const tooNew = checkAbapSource(view('  )->tag( `IllustratedMessage` )')).findings
    .filter((x) => x.type === 'control-too-new');
  assert(tooNew.length === 1 && tooNew[0].control === 'sap.m.IllustratedMessage' && tooNew[0].since === '1.98',
    `control-too-new: a control introduced after the floor is reported with its @since (got ${tooNew.map((x) => `${x.control}@${x.since}`).join() || 'none'})`);

  const brokenExpr = checkAbapSource(view('  )->tag( `Button` )->a( n = `visible` v = `{= ( 1 }` )')).findings
    .filter((x) => x.type === 'invalid-expression-binding');
  assert(brokenExpr.length === 1 && brokenExpr[0].member === 'visible',
    'invalid-expression-binding: unbalanced parens in {= … } are reported');

  // missing-required-aggregation reaches subclasses through the chain — the
  // REQUIRED_WITH table needs no TreeTable row of its own
  const tree = checkAbapSource(`
  DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
  v->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`       v = \`sap.m\`
      )->a( n = \`xmlns:mvc\`   v = \`sap.ui.core.mvc\`
      )->a( n = \`xmlns:table\` v = \`sap.ui.table\`
      )->ele( n = \`TreeTable\` ns = \`table\` )->a( n = \`rows\` v = \`{/T_X}\` ).
  client->view_display( v->stringify( ) ).`);
  assert(tree.findings.some((x) => x.type === 'missing-required-aggregation' && x.member === 'columns'),
    'missing-required-aggregation: a TreeTable inherits the Table rows→columns rule through the chain');
}

// ------------------------------------------- rules['render-error'] ----
// the render gate's pseudo-rule: waive or downgrade render failures per file
// instead of switching the gate off wholesale
{
  const waived = (await checkFiles([f('broken.clas.abap')], { rules: { 'render-error': { exclude: ['broken'] } } }))[0];
  assert(waived.renderErrors.length === 0 && waived.notes.some((n) => /waived by rules\['render-error'\]/.test(n)),
    'render-error: an exclude waives the render failures of a matching file, saying so in a note');

  const downgraded = (await checkFiles([f('broken.clas.abap')], { rules: { 'render-error': 'warning' } }))[0];
  assert(downgraded.renderErrors.length > 0 && downgraded.renderSeverity === 'warning',
    'render-error: a severity override keeps the errors and re-weighs them');
  const { problemsOf } = await import('../lib/report.mjs');
  assert(problemsOf(downgraded).filter((p) => p.rule === 'render-error').every((p) => p.severity === 'warning'),
    'render-error: the report carries the overridden severity');

  const stale = (await checkFiles([f('good.clas.abap')], { rules: { 'render-error': { exclude: ['good'] } } }))[0];
  assert(stale.notes.some((n) => /stale render-error waiver/.test(n)),
    'render-error: a waived file that renders clean is called out as a stale waiver');

  const os = await import('node:os');
  const { loadConfig } = await import('../lib/config.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5render-'));
  const cfg = path.join(dir, 'abap2ui5lint.jsonc');
  fs.writeFileSync(cfg, '{"rules": {"render-error": {"exclude": ["legacy/"]}}}');
  assert(loadConfig(cfg).rules['render-error'].exclude[0] === 'legacy/',
    'render-error: the config accepts the pseudo-rule in its rules block');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------- optional render deps ----
// playwright + @openui5/* ship in @abap2ui5/render-runtime, declared as an
// OPTIONAL PEER: absent, the property gate still works and a requested render
// fails with one actionable message
{
  const { RENDER_DEPS, RENDER_RUNTIME, missingRenderDeps, renderDepsError, renderFallback } = await import('../lib/render.mjs');
  const root = path.join(FIX, '..', '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'render-runtime', 'package.json'), 'utf8'));

  // The whole point of the split: a default `npm i @abap2ui5/linter` (and so
  // `npx`, which has no --omit=optional) must not drag ~123 MB of UI5 in. npm
  // installs optionalDependencies BY DEFAULT, so their absence here is the
  // guard - an optional PEER is the one kind npm leaves alone.
  assert(!pkg.dependencies && !pkg.optionalDependencies,
    'render deps: the linter declares no runtime dependencies of its own');
  assert(pkg.peerDependencies?.[RENDER_RUNTIME]
    && pkg.peerDependenciesMeta?.[RENDER_RUNTIME]?.optional === true,
    `render deps: ${RENDER_RUNTIME} is declared as an OPTIONAL peer`);
  assert(runtime.name === RENDER_RUNTIME
    && RENDER_DEPS.slice().sort().join() === Object.keys(runtime.dependencies).sort().join(),
    'render deps: RENDER_DEPS mirrors exactly the dependencies of the render runtime');

  assert(missingRenderDeps().length === 0,
    'render deps: everything is installed in this environment');
  // intercept resolution to simulate an install without the runtime package
  const missing = missingRenderDeps(() => { throw new Error('MODULE_NOT_FOUND'); });
  assert(missing.length === RENDER_DEPS.length,
    'render deps: an unresolvable install reports every render dep as missing');
  const err = renderDepsError(missing);
  assert(err.code === 'ERR_RENDER_DEPS_MISSING',
    'render deps: the refusal carries a stable code the CLI can catch');
  assert(/playwright/.test(err.message) && /@openui5\/sap\.ui\.core/.test(err.message),
    'render deps: the message names the missing packages');
  assert(err.message.includes(RENDER_RUNTIME) && /--no-render/.test(err.message) && /render: false/.test(err.message),
    'render deps: the message names the one package to install and how to run without it');
  const partial = renderDepsError(missingRenderDeps((id) => {
    if (id.startsWith('playwright')) throw new Error('MODULE_NOT_FOUND');
    return id;
  }));
  assert(/missing: playwright\./.test(partial.message) && !/@openui5/.test(partial.message.split('They ship in')[0]),
    'render deps: only what is actually missing is named');

  /* The refusal is for a run that ASKED for the gate. A default-on gate with
   * no runtime steps aside instead - otherwise the advertised
   * `npx @abap2ui5/linter src` exits 2 without linting anything, which is the
   * first command the README gives a new user. */
  const allMissing = [...RENDER_DEPS];
  const fallback = renderFallback({ render: true, asked: false, missing: allMissing });
  assert(typeof fallback === 'string' && /render gate is OFF/.test(fallback),
    'render fallback: a default-on gate without its runtime falls back instead of refusing');
  assert(fallback.includes(RENDER_RUNTIME) && /--render/.test(fallback) && /--no-render/.test(fallback),
    'render fallback: the warning names the package to install, how to demand the gate, and how to go quiet');
  assert(renderFallback({ render: true, asked: true, missing: allMissing }) === null,
    'render fallback: a gate that was ASKED for keeps the hard refusal - a promised gate never silently skips');
  assert(renderFallback({ render: true, asked: false, missing: [] }) === null,
    'render fallback: nothing to say when the runtime is installed');
  assert(renderFallback({ render: false, asked: false, missing: allMissing }) === null,
    'render fallback: --no-render asked for no gate at all, so there is nothing to warn about');
}

// ------------------------------------------------- curated formatter mirror ----
// the render harness provides the same formatter surface the rule judges by —
// the demo-kit pack was removed upstream, and a harness still mirroring it
// would render views green that break live
{
  const { CURATED_FORMATTERS } = await import('../lib/formatters.mjs');
  const renderSrc = fs.readFileSync(path.join(FIX, '..', '..', 'lib', 'render.mjs'), 'utf8');
  const mirrored = [...renderSrc.matchAll(/^ {6}(\w+): function/gm)].map((m) => m[1]);
  assert(mirrored.sort().join() === [...CURATED_FORMATTERS].sort().join(),
    `formatters: the render harness mirrors exactly the curated set (harness: ${mirrored.join(', ') || 'none'})`);
}

// ------------------------------------------------ round 2: new rules ----
{
  const { checkAbapRules } = await import('./observe.mjs');

  // --- binding-to-nonpublic: the app-043 failure class ----------------------
  const nonpublic = `CLASS zcl_x DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA title TYPE string.
  PROTECTED SECTION.
    DATA expanded TYPE abap_bool.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(lv_tmp) = \`x\`.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->ele( \`Panel\`
        )->a( n = \`headerText\` v = client->_bind( title )
        )->a( n = \`expanded\`   v = client->_bind( expanded ) ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const np = checkAbapRules(nonpublic).filter((x) => x.type === 'binding-to-nonpublic');
  assert(np.length === 1 && np[0].member === 'expanded',
    `binding-to-nonpublic: a PROTECTED attribute bound is reported, a PUBLIC one is not (got ${np.map((x) => x.member).join() || 'none'})`);
  assert(!checkAbapRules(fs.readFileSync(f('abaprules.clas.abap'), 'utf8'))
    .some((x) => x.type === 'binding-to-nonpublic'),
    'binding-to-nonpublic: a bound LOCAL stays binding-to-local, never nonpublic');

  // --- private UI5 internals + the commercial host --------------------------
  const internals = checkAbapRules('lv_js = `oControl.mProperties.text` && `sap.ui.getCore()`.');
  assert(internals.some((x) => x.type === 'ui5-internal-access' && x.value === 'mProperties'),
    'ui5-internal-access: reading mProperties is reported');
  assert(checkAbapRules('client->_event( `X` ).').every((x) => x.type !== 'ui5-internal-access'),
    'ui5-internal-access: a class without internals access is silent');
  const host = checkAbapRules('url = `https://ui5.sap.com/resources/sap-ui-core.js`.');
  assert(host.some((x) => x.type === 'commercial-ui5-host' && x.value === 'ui5.sap.com'),
    'commercial-ui5-host: the commercial host is reported');
  assert(!checkAbapRules('url = `https://sdk.openui5.org/resources/sap-ui-core.js`.')
    .some((x) => x.type === 'commercial-ui5-host'),
    'commercial-ui5-host: sdk.openui5.org is the sanctioned host');

  // --- enum VALUES carry their own @since now -------------------------------
  const critical = (minUi5) => checkAbapSource(view('  )->tag( `Button` )->a( n = `type` v = `Critical` )'), { minUi5 })
    .findings.filter((x) => x.type === 'enum-value-too-new');
  assert(critical('1.71').length === 1 && critical('1.71')[0].since === '1.73',
    `enum-value-too-new: ButtonType.Critical (@1.73) is reported on a 1.71 target (got ${critical('1.71').map((x) => x.since).join() || 'none'})`);
  assert(!critical('1.150').length,
    'enum-value-too-new: the same value is fine once the target reaches its @since');
  assert(!checkAbapSource(view('  )->tag( `Button` )->a( n = `type` v = `Emphasized` )'))
    .findings.some((x) => x.type === 'enum-value-too-new'),
    'enum-value-too-new: a value that predates version tracking is never reported');

  // --- the SAP icon font ----------------------------------------------------
  const icons = (value, minUi5 = '1.71') => checkAbapSource(
    view(`  )->tag( \`Button\` )->a( n = \`icon\` v = \`sap-icon://${value}\` )`), { minUi5 },
  ).findings.filter((x) => x.type.startsWith('icon-') || x.type === 'unknown-icon');

  assert(icons('message-information').length === 0,
    'unknown-icon: a glyph that is in the font at 1.71 is silent');
  assert(icons('information')[0]?.type === 'icon-too-new' && icons('information')[0].since === '1.80',
    `icon-too-new: information reached the font in 1.80 (got ${icons('information')[0]?.since || 'nothing'})`);
  assert(icons('clear-all')[0]?.type === 'icon-too-new',
    'icon-too-new: clear-all (1.86) is reported on a 1.71 target — the eraser case');
  assert(icons('information', '1.120').length === 0,
    'icon-too-new: the same glyph is fine once the target reaches the release it arrived in');
  assert(icons('nosuchglyph')[0]?.type === 'unknown-icon',
    'unknown-icon: a name in no release is reported whatever the target');
  assert(icons('nosuchglyph', '1.150')[0]?.type === 'unknown-icon',
    'unknown-icon: ...including on the newest target');
  /* The one that looks like a typo and is not: IconPool reads the name as a
   * URI hostname, which is lower-cased, so a camelCase name matches nothing
   * in any release — and a correctly-cased name must still resolve. */
  assert(icons('textFormatting')[0]?.type === 'unknown-icon',
    'unknown-icon: a camelCase name matches no glyph — icon names are effectively lower-case');
  assert(icons('text-formatting').length === 0,
    'unknown-icon: ...and the hyphenated spelling of the same glyph is fine');
  assert(icons('binary')[0]?.type === 'icon-removed',
    'icon-removed: a glyph that left the font again (binary -> non-binary) is reported');
  assert(icons('tnt/actor').length === 0,
    'unknown-icon: a collection-qualified name belongs to a custom font and is never judged');
  /* An icon name travels as DATA at least as often as as an attribute - a
   * status column of a bound table never reaches the view tree. */
  assert(checkAbapRules('ls_row-icon = `sap-icon://information`.')
    .some((x) => x.type === 'icon-too-new'),
    'icon-too-new: a name in a data literal is judged too, not just a view attribute');
  assert(!checkAbapRules('" the sap-icon://information glyph arrived in 1.80\nx = 1.')
    .some((x) => x.type.includes('icon')),
    'icon rules: a name in a COMMENT is prose, not a use');

  // --- toolbar-only controls in a sap.m.Bar ---------------------------------
  const inBar = (inner, minUi5 = '1.71') => checkAbapSource(view(inner), { minUi5 })
    .findings.filter((x) => x.type === 'toolbar-control-in-bar');

  assert(inBar('  )->ele( `Bar` )->ele( `contentRight` )->tag( `ToolbarSeparator` )').length === 1,
    'toolbar-control-in-bar: a separator inside a Bar is reported');
  assert(inBar('  )->ele( `Bar` )->ele( `contentRight` )->tag( `ToolbarSpacer` )').length === 1,
    'toolbar-control-in-bar: ...and so is a spacer');
  /* The half nobody writes on purpose: Page headerContent is FORWARDED into
   * the internal Bar's contentRight, so the view never mentions a Bar. */
  assert(inBar('  )->ele( `Page` )->ele( `headerContent` )->tag( `ToolbarSeparator` )').length === 1,
    'toolbar-control-in-bar: Page headerContent is forwarded into the internal Bar and counts');
  assert(inBar('  )->ele( `Toolbar` )->tag( `ToolbarSeparator` )').length === 0,
    'toolbar-control-in-bar: a Toolbar IS a flex container — the whole point, never reported');
  assert(inBar('  )->ele( `Page` )->ele( `content` )->tag( `ToolbarSeparator` )').length === 0,
    'toolbar-control-in-bar: a Page content child is not in a bar');
  assert(inBar('  )->ele( `Bar` )->ele( `contentRight` )->tag( `ToolbarSeparator` )', '1.76').length === 0,
    'toolbar-control-in-bar: from 1.76 the Bar is a flex container and the rule is silent');
  assert(inBar('  )->ele( `Bar` )->ele( `contentRight` )->tag( `Button` )').length === 0,
    'toolbar-control-in-bar: an inline control in a bar is exactly what belongs there');

  // --- an aggregation TAG the release does not have -------------------------
  const aggTooNew = (minUi5) => checkAbapSource(
    view('  )->ele( `Dialog` )->ele( `footer` )->tag( `Button` )'), { minUi5 },
  ).findings.filter((x) => x.type === 'aggregation-too-new');
  assert(aggTooNew('1.71').length === 1,
    'aggregation-too-new: Dialog footer (~1.110) on a 1.71 target is reported');
  assert(severityOf(aggTooNew('1.71')[0]) === 'error',
    'aggregation-too-new: an ERROR, not a warning — UI5 resolves the tag as a class and the view never loads');
  assert(!aggTooNew('1.120').length,
    'aggregation-too-new: fine once the target has the aggregation');
  assert(!checkAbapSource(view('  )->ele( `Dialog` )->ele( `buttons` )->tag( `Button` )'), { minUi5: '1.71' })
    .findings.some((x) => x.type === 'aggregation-too-new'),
    'aggregation-too-new: buttons (1.21.1) is the 1.71 way to do the same thing');

  // --- a source line the system cannot import -------------------------------
  const longLine = `    lv_x = \`${'a'.repeat(260)}\`.`;
  const tooLong = checkAbapRules(`CLASS x IMPLEMENTATION.\n${longLine}\n  y = 1.\nENDCLASS.`)
    .filter((x) => x.type === 'source-line-too-long');
  assert(tooLong.length === 1 && tooLong[0].value === longLine.length,
    `source-line-too-long: a line over 255 characters is reported (got ${tooLong.map((x) => x.value).join() || 'nothing'})`);
  assert(severityOf(tooLong[0]) === 'error',
    'source-line-too-long: an ERROR — the object does not import, it leaves an empty stub behind');
  assert(!checkAbapRules(`CLASS x IMPLEMENTATION.\n    lv_x = \`${'a'.repeat(200)}\`.\nENDCLASS.`)
    .some((x) => x.type === 'source-line-too-long'),
    'source-line-too-long: a line within the limit is silent');
  assert(checkAbapRules(`  a = 1.\n${longLine}\n${longLine.replace('lv_x', 'lv_y')}\n`)
    .filter((x) => x.type === 'source-line-too-long').length === 2,
    'source-line-too-long: every over-long line is its own finding — each needs its own split');

  // --- absolute paths inside complex bindings and expressions ---------------
  const complexSrc = (value) => `CLASS zcl_x DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_row, text TYPE string, END OF ty_s_row.
    DATA t_x TYPE STANDARD TABLE OF ty_s_row.
    DATA name TYPE string.
ENDCLASS.
CLASS zcl_x IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    t_x = VALUE #( ( text = \`a\` ) ).
    name = \`n\`.
    DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
    v->ele( n = \`View\` ns = \`mvc\` )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_x )
      )->a( n = \`tooltip\` v = client->_bind( name )
      )->tag( \`Text\` )->a( n = \`text\` v = ${value} ).
    client->view_display( v->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;
  const complexPaths = (value) => checkAbapSource(complexSrc(value))
    .findings.filter((x) => x.type === 'unknown-binding-path');
  assert(complexPaths('|\\{ path: \'/TYPO\', type: \'sap.ui.model.type.String\' \\}|').some((x) => x.value === '/TYPO'),
    'complex paths: a hardcoded absolute path in a binding info is existence-checked now');
  assert(complexPaths('`{= ${/NOPE} + 1 }`').some((x) => x.value === '/NOPE'),
    'complex paths: an absolute path inside an expression binding too');
  assert(!complexPaths('`{= ${/T_X/9/TEXT} }`').length,
    'complex paths: a numeric row index steps into the array — the corpus false positive');
  assert(!complexPaths('|\\{ path: \'/NAME\' \\}|').length,
    'complex paths: a path the model has is not reported');

  // --- undeclared-namespace gained a fix for conventional prefixes ----------
  const { applyFixes } = await import('../lib/fix.mjs');
  const nsSrc = `
  DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
  v->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( n = \`Icon\` ns = \`core\` )->a( n = \`src\` v = \`sap-icon://add\` ).
  client->view_display( v->stringify( ) ).`;
  const nsFinding = checkAbapSource(nsSrc).findings.find((x) => x.type === 'undeclared-namespace');
  assert(nsFinding?.fixes?.length === 1,
    'undeclared-namespace: a conventional prefix carries a fix');
  assert(/->a\( n = `xmlns:core` v = `sap\.ui\.core` \)->a\( n = `xmlns`/.test(applyFixes(nsSrc, [nsFinding]).output),
    'undeclared-namespace: the fix inserts the declaration next to the root\'s first xmlns write');
  const vrNs = checkAbapSource(fs.readFileSync(f('viewrules.clas.abap'), 'utf8'))
    .findings.find((x) => x.type === 'undeclared-namespace');
  assert(vrNs && !vrNs.fixes,
    'undeclared-namespace: an unconventional prefix could mean any library and gets no fix');

  /* The anchor is searched in the SCRUBBED source: a commented-out builder
   * line — a previous root kept for reference — comes before the live one
   * often enough, and the declaration used to land INSIDE that comment,
   * leaving the view unfixed and the comment mangled. */
  const commented = `
  DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
  " )->a( n = \`xmlns\` v = \`sap.ui.core\`   the old root, kept for reference
  v->ele( n = \`View\` ns = \`mvc\`
      )->a( n = \`xmlns\`     v = \`sap.m\`
      )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
      )->tag( n = \`Icon\` ns = \`core\` ).
  client->view_display( v->stringify( ) ).`;
  const commentedFix = applyFixes(commented, checkAbapSource(commented).findings).output;
  assert(/" \)->a\( n = `xmlns` v = `sap\.ui\.core`   the old root/.test(commentedFix),
    'undeclared-namespace: the fix never lands in a commented-out builder line');
  assert(!checkAbapSource(commentedFix).findings.some((x) => x.type === 'undeclared-namespace'),
    'undeclared-namespace: …and the declaration it inserted instead really fixes the view');
}

// ------------------------------------------------ sarif + baseline + cli ----
{
  const cp = await import('node:child_process');
  const os = await import('node:os');
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const run = (args, env = {}) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env } }), code: 0 };
    } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
  };

  // --- sarif ----------------------------------------------------------------
  const sarif = JSON.parse(run([f('viewrules.clas.abap'), '--no-render', '--format', 'sarif'], { GITHUB_ACTIONS: 'true' }).out);
  assert(sarif.version === '2.1.0' && sarif.runs[0].tool.driver.name === 'abap2ui5-linter',
    'sarif: a parseable 2.1.0 log, even inside GitHub Actions (no annotations join it)');
  assert(sarif.runs[0].results.some((r) => r.ruleId === 'duplicate-id' && r.level === 'error')
    && sarif.runs[0].results.some((r) => r.level === 'note'),
    'sarif: severities map to error/warning/note and every result carries its rule id');
  assert(sarif.runs[0].tool.driver.rules.every((r) => r.helpUri.includes(`#${r.id}`)),
    'sarif: every rule links to its anchor on the rules page');

  /* What code scanning actually renders. Without these the Security tab shows
   * a bare rule id and attributes every alert to an unversioned tool. */
  const { version: pkgVersion } = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8'));
  assert(sarif.runs[0].tool.driver.version === pkgVersion
    && sarif.runs[0].tool.driver.semanticVersion === pkgVersion,
    `sarif: the driver carries the package version (got ${sarif.runs[0].tool.driver.version})`);
  const { RULE_DOCS } = await import('../lib/rule-docs.mjs');
  assert(sarif.runs[0].tool.driver.rules.every((r) => r.id === r.name
    && r.defaultConfiguration
    && ['error', 'warning', 'note'].includes(r.defaultConfiguration.level)),
    'sarif: every rule carries a name and a defaultConfiguration level');
  assert(sarif.runs[0].tool.driver.rules.every((r) => !RULE_DOCS[r.id]
    || (r.shortDescription.markdown === RULE_DOCS[r.id].summary
      && !r.shortDescription.text.includes('`'))),
    'sarif: a documented rule carries its summary, markdown raw and text backtick-free');

  /* --- the two value flags that name a closed set ---------------------------
   * A value outside the set fails nowhere downstream - it falls back to the
   * default - so a typo used to be silent: `--ui5 1,130` reported every
   * control added after 1.71 as too new, and `--distribution openui` ran none
   * of the openui5 checks that were asked for. abap2ui5lint.jsonc refuses
   * both loudly, and the flags have to agree with it. */
  const runErr = (args) => {
    try {
      cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } });
      return { err: '', code: 0 };
    } catch (e) { return { err: e.stderr ?? '', code: e.status }; }
  };
  const good = f('good.clas.abap');
  for (const bad of ['banana', '1,71', '1.', '']) {
    const r = runErr([good, '--no-render', '--no-config', '--ui5', bad]);
    assert(r.code === 2 && /takes a version like 1\.71/.test(r.err),
      `cli: --ui5 '${bad}' is refused instead of silently meaning 1.71 (exit ${r.code})`);
  }
  for (const ok of ['1.71', '1.130', '1.120.3']) {
    assert(runErr([good, '--no-render', '--no-config', '--ui5', ok]).code !== 2,
      `cli: --ui5 ${ok} is accepted`);
  }
  const distro = runErr([good, '--no-render', '--no-config', '--distribution', 'openui']);
  assert(distro.code === 2 && /takes sapui5 or openui5/.test(distro.err),
    'cli: --distribution refuses a value outside the two it knows');
  assert(runErr([good, '--no-render', '--no-config', '--distribution', 'OpenUI5']).code !== 2,
    'cli: --distribution stays case-insensitive');

  /* --- --render, the promise that the gate ran -----------------------------
   * The unit tests above decide the fallback; what this pins is that the flag
   * REACHES that decision - an unknown option exits 2 with "unknown option",
   * which would make the whole promise unwritable. The runtime is installed
   * here, so the run itself is an ordinary one. */
  assert(runErr([good, '--no-config', '--render']).code !== 2,
    'cli: --render is a known flag, so a job can demand the render gate');
  assert(/--render/.test(runErr([good, '--no-config', '--nonsense']).err),
    'cli: the usage line offers --render next to --no-render');

  // --- baseline -------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5base-'));
  const target = path.join(dir, 'abaprules.clas.abap');
  fs.copyFileSync(f('abaprules.clas.abap'), target);
  const bl = path.join(dir, 'abap2ui5lint-baseline.json');

  assert(run([target, '--no-render', '--baseline', bl, '--update-baseline']).code === 0
    && fs.existsSync(bl),
    'baseline: --update-baseline freezes the current findings and exits 0');
  const adopted = run([target, '--no-render', '--baseline', bl]);
  assert(adopted.code === 0 && /suppressed by/.test(adopted.out),
    `baseline: a run over unchanged findings is green and says what it suppressed (exit ${adopted.code})`);

  const withNew = fs.readFileSync(target, 'utf8')
    .replace('client->view_display', 'client->popover_display( val = view->stringify( ) ).\n    client->view_display');
  fs.writeFileSync(target, withNew);
  const newFinding = run([target, '--no-render', '--baseline', bl]);
  assert(newFinding.code === 1 && /popover-display-val/.test(newFinding.out)
    && !/obsolete-binder/.test(newFinding.out.split('\n').filter((l) => /error|warning/.test(l)).join('\n')),
    'baseline: a NEW finding fails while the frozen ones stay suppressed');

  fs.copyFileSync(f('good.clas.abap'), target);
  const stale = run([target, '--no-render', '--baseline', bl]);
  assert(stale.code === 1 && /STALE/.test(stale.out),
    'baseline: an entry whose finding is gone is stale and FAILS — a suppression never outlives its finding');

  // --- --fix-dry-run --------------------------------------------------------
  fs.copyFileSync(f('abaprules.clas.abap'), target);
  const before = fs.readFileSync(target, 'utf8');
  assert(/would fix/.test(run([target, '--no-render', '--fix-dry-run']).out)
    && fs.readFileSync(target, 'utf8') === before,
    'fix: --fix-dry-run reports without writing (the env variable keeps working too)');
  fs.rmSync(dir, { recursive: true, force: true });
}

// ------------------------------------------------- upstream mirror parsers ----
{
  const { embeddedJs, parseGlobalTargets, parseFormatterExports } = await import('../scripts/check-upstream.mjs');
  const abap = 'x = `const GLOBAL_TARGETS = {` && |\\n| &&\n'
    + '`  ONE_LINER: { get: () => X, methods: { show: ["string"] } },` && |\\n| &&\n'
    + '`  MULTI: {` && |\\n| && `    get: () => Y,` && |\\n| && `    methods: {` && |\\n| &&\n'
    + '`      a: ["int"],` && |\\n| && `      b: [],` && |\\n| && `    },` && |\\n| && `  },` && |\\n| && `};`.';
  const targets = parseGlobalTargets(abap);
  assert(targets.ONE_LINER?.join() === 'show' && targets.MULTI?.join() === 'a,b',
    `upstream: GLOBAL_TARGETS parses one-line and multi-line entries (got ${JSON.stringify(targets)})`);
  assert(embeddedJs('a = `line1` && |\\n| && `line2`.').includes('line1\nline2'),
    'upstream: the embedded JS is reassembled from the backtick literals');
  assert(parseFormatterExports('  return {\n    DateCreateObject(s) {\n      return s;\n    },\n    expandInlineIcons(text) {},\n  };').join() === 'DateCreateObject,expandInlineIcons',
    'upstream: the formatter export surface parses');
}

// ------------------------------------------------- metadata drift gate ----
// generate-metadata --check took ~3 minutes before the extend-scan fix and
// lived in its own CI step; at ~2 seconds it belongs in the suite
{
  const cp = await import('node:child_process');
  let ok = true;
  let msg = '';
  try {
    cp.execFileSync('node', [path.join(FIX, '..', '..', 'scripts', 'generate-metadata.mjs'), '--check'], { encoding: 'utf8' });
  } catch (e) { ok = false; msg = (e.stderr || e.stdout || '').trim(); }
  assert(ok, `metadata: data/properties.json is in sync — npm run generate-metadata (${msg})`);
}

// --------------------------------------------------- icon data integrity ----
/* The icon snapshot cannot have a drift gate like properties.json: it is built
 * by packing 79 OpenUI5 releases from the registry, so --check would need
 * network on every test run. The committed file IS the contract, and what is
 * checkable offline is that it says what the rules assume it says. */
{
  const icons = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'icons.json'), 'utf8'));
  const names = Object.keys(icons.icons);
  assert(icons.floor === '1.71',
    `icons: the data's floor is the release the rules treat as "at or before" (got ${icons.floor})`);
  assert(names.length > 650, `icons: the registry is populated (${names.length} names)`);
  assert(names.every((n) => n === n.toLowerCase()),
    'icons: every name is stored lower-cased — IconPool reads the name as a URI hostname, so comparisons are case-insensitive');
  const floorCount = names.filter((n) => icons.icons[n] === '1.71').length;
  assert(floorCount > 600, `icons: most glyphs predate the floor (${floorCount} at 1.71)`);
  assert(names.some((n) => icons.icons[n] !== '1.71'),
    'icons: the scan covers releases ABOVE the floor — otherwise icon-too-new can never fire');
  /* The three glyphs the rules' documentation names by hand. If a regeneration
   * moves one of these, the README, the rules page and the ui5-check entry all
   * became wrong in the same moment. */
  assert(icons.icons.information === '1.80' && icons.icons['clear-all'] === '1.86',
    `icons: the documented arrivals hold (information ${icons.icons.information}, clear-all ${icons.icons['clear-all']})`);
  assert(icons.icons['message-information'] === '1.71' && icons.icons.eraser === '1.71',
    'icons: ...and so do the 1.71 replacements the messages point at');
  assert(!('textformatting' in icons.icons),
    'icons: a camelCase name resolves to no glyph in any release — the unknown-icon case');
  assert(Object.keys(icons.removed).every((n) => n in icons.icons),
    'icons: a removed glyph is still a name that once existed, so it carries a since as well');
}

// ------------------------------------------------------------------- fix ----
{
  const os = await import('node:os');
  const cp = await import('node:child_process');
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const { applyFixes } = await import('../lib/fix.mjs');
  const { checkAbapRules } = await import('./observe.mjs');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5fix-'));
  const target = path.join(dir, 'abaprules.clas.abap');
  const original = fs.readFileSync(f('abaprules.clas.abap'), 'utf8');
  fs.writeFileSync(target, original);

  // the linter still exits 1 on what is left over, so never trust execFileSync
  const run = (env = {}) => {
    try {
      return cp.execFileSync('node', [CLI, target, '--no-render', '--fix'], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env },
      });
    } catch (e) { return e.stdout ?? ''; }
  };

  const dry = run({ ABAP2UI5LINT_FIX_DRY_RUN: 'true' });
  assert(/would fix 4 problem\(s\)/.test(dry) && fs.readFileSync(target, 'utf8') === original,
    'fix: the dry run reports what it would do and leaves the file alone');

  const out = run();
  const fixed = fs.readFileSync(target, 'utf8');
  assert(/fixed 4 problem\(s\) in 1 file\(s\)/.test(out), 'fix: the four mechanical corrections are applied');
  assert(/client->_bind\( name \)/.test(fixed) && !/_bind_edit/.test(fixed),
    'fix: obsolete-binder becomes client->_bind( )');
  assert(/client->follow_up_action\( val   = client->cs_event-urlhelper/.test(fixed)
    && !/_event_client/.test(fixed),
  'fix: obsolete-frontend-event becomes client->follow_up_action( )');
  assert(/b = abap_true/.test(fixed),
    'fix: unconverted-abap-boolean moves onto b =, the token kept verbatim');
  assert(/`\$\{BARE_BRACE\}`/.test(fixed) && /`\$\{RESOLVED\}`/.test(fixed) && /`\{0\} selected`/.test(fixed),
    'fix: event-arg-unresolved gains its $, the already-correct and quoted forms untouched');
  assert(!/obsolete-binder|obsolete-frontend-event|unconverted-abap-boolean|event-arg-unresolved/.test(out),
    'fix: what was fixed is gone from the report of the same run');
  assert(/binding-to-local/.test(out), 'fix: a finding without a mechanical correction survives');

  const twice = original.replace(/client->_bind\( lv_local \)/, 'client->_bind_edit( lv_local )');
  const both = checkAbapRules(twice).find((x) => x.type === 'obsolete-binder');
  assert(both.fixes.length === 2, 'fix: two call sites of one deduped finding both carry a fix');
  assert(!/_bind_edit/.test(applyFixes(twice, [both]).output), 'fix: and both are applied in one pass');

  const overlap = applyFixes('abcdef', [{ fixes: [{ start: 1, end: 4, text: 'X' }, { start: 2, end: 5, text: 'Y' }] }]);
  assert(overlap.output === 'aXef' && overlap.applied === 1 && overlap.deferred === 1,
    'fix: overlapping spans are deferred to the next run, never merged by guesswork');

  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- report ----
{
  const cp = await import('node:child_process');
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  // GITHUB_ACTIONS is pinned OFF: inherited from the runner it turns the
  // annotations on for every case below, and the assertions would then be
  // testing a different program in CI than they test locally
  const run = (args, env = {}) => {
    try {
      return cp.execFileSync('node', [CLI, ...args], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env },
      });
    } catch (e) { return e.stdout ?? ''; }
  };
  const dumps = f('dumps.clas.abap');

  const stylish = run([dumps, '--no-render']);
  assert(/duplicate-property\s*$/m.test(stylish), 'report: every line ends in its rule id');
  assert(/^2 problems \(2 errors, 0 warnings, 0 hints\)$/m.test(stylish), 'report: the problem count reads like ui5lint');
  assert(!/\bpass\b/.test(run([f('viewbuilder.clas.abap'), '--no-render'])) &&
    /Success! No findings detected\./.test(run([f('viewbuilder.clas.abap'), '--no-render'])),
    'report: a clean file is not printed, only the success line');

  const quiet = run([f('viewrules.clas.abap'), '--no-render', '--quiet']);
  assert(!/\bhint\b.*missing-accessibility/.test(quiet) && /2 hints\)/.test(quiet),
    'report: --quiet hides the non-errors but still counts them');

  const json = JSON.parse(run([dumps, '--no-render', '--json']));
  assert(json.problems === 2 && json.totals.error === 2 && json.results[0].findings[0].type,
    'report: --json carries totals, problems and the annotated findings');
  assert(JSON.parse(run([dumps, '--no-render', '--format', 'json'])).problems === 2,
    'report: --format json is the same thing');

  const md = run([dumps, '--no-render', '--format', 'markdown']);
  assert(/\| Location \| Severity \| Message \| Rule \|/.test(md) && /`duplicate-property`/.test(md),
    'report: --format markdown emits a table per file');

  const annotated = run([dumps, '--no-render'], { GITHUB_ACTIONS: 'true' });
  assert(/^::error file=.*dumps\.clas\.abap,line=32,col=18,title=abap2ui5-linter\(duplicate-property\)::/m.test(annotated),
    'report: inside GitHub Actions the findings are annotated onto the diff');
  assert(!/^::/m.test(run([dumps, '--no-render', '--no-annotate'], { GITHUB_ACTIONS: 'true' })),
    'report: --no-annotate switches that off again');
  assert(!/^::/m.test(run([dumps, '--no-render'])), 'report: no annotations outside a workflow');
  // a workflow command appended after the document would make it a parse
  // error - `--json | jq` inside Actions is the case that found this
  const inWorkflow = run([dumps, '--no-render', '--json'], { GITHUB_ACTIONS: 'true' });
  assert(JSON.parse(inWorkflow).problems === 2 && !/^::/m.test(inWorkflow),
    'report: --json stays parseable inside GitHub Actions, annotations do not join it');
  assert(!/^::/m.test(run([dumps, '--no-render', '--format', 'markdown'], { GITHUB_ACTIONS: 'true' })),
    'report: markdown stays clean too');

  assert(/^abap2ui5lint \d+\.\d+\.\d+ \(.*cli\.mjs\)$/m.test(run(['--version'])),
    'report: --version prints version and script location');

  // --init: the config a new project starts from. It has to parse with the
  // linter's OWN loader (it is jsonc with comments), point $schema at the
  // installed copy rather than at main, and refuse to overwrite.
  {
    const { loadConfig } = await import('../lib/config.mjs');
    const os = await import('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5-init-'));
    cp.execFileSync('node', [CLI, '--init'], { cwd: dir, encoding: 'utf8' });
    const written = path.join(dir, 'abap2ui5lint.jsonc');
    assert(fs.existsSync(written), 'init: writes abap2ui5lint.jsonc into the working directory');
    const cfg = loadConfig(written);
    assert(cfg.minUi5 === '1.71' && cfg.failOn === 'warning' && Array.isArray(cfg.paths),
      'init: the file the linter writes is one the linter reads back');
    const raw = fs.readFileSync(written, 'utf8');
    assert(raw.includes('./node_modules/@abap2ui5/linter/data/abap2ui5lint.schema.json'),
      'init: $schema points at the installed version, not at main');
    let refused = '';
    try { cp.execFileSync('node', [CLI, '--init'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { refused = e.status === 2 ? String(e.stderr) : ''; }
    assert(/already exists/.test(refused), 'init: a second run refuses instead of overwriting');
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const fails = (args) => {
    try { cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe' }); return ''; }
    catch (e) { return e.status === 2 ? (e.stderr ?? '') : ''; }
  };
  assert(/unknown option '--nope'/.test(fails(['--nope'])), 'report: an unknown flag is refused, not read as a path');
  assert(/--allow needs a value/.test(fails([dumps, '--no-render', '--allow'])),
    'report: a flag missing its value is refused instead of crashing the gate');
  assert(/no such file or directory: .*no-such-path/.test(fails(['no-such-path', '--no-render'])),
    'report: a mistyped path is one clean line and exit 2, not a stack trace');
}

// ---------------------------------------- run summary, progress and badge ----
// What a CLEAN corpus run says about itself. Without these three, a run over
// a few hundred classes prints "148 files, no findings" and a reader cannot
// tell a gate that judged thousands of controls from one that judged nothing
{
  const cp = await import('node:child_process');
  const os = await import('node:os');
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const run = (args, env = {}) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '', ...env } }), code: 0 };
    } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
  };
  const one = [f('good.clas.abap'), '--no-render'];
  // two fixtures that are clean on both gates - a corpus summary must be
  // readable exactly where there is no finding list to read instead
  const two = [f('good.clas.abap'), f('viewbuilder.clas.abap'), '--no-render'];

  const corpus = run(two).out;
  assert(/^sources +2 app classes$/m.test(corpus) && /^views +\d+ documents reconstructed, nested \d+ deep/m.test(corpus),
    'stats: the run summary names what was read and what was rebuilt from it');
  assert(/^judged +\d+ controls of \d+ types, \d+ bindings, \d+ icons, \d+ attributes$/m.test(corpus),
    'stats: and what the gate actually judged - the half no finding list can show');
  assert(/^most used +sap\.m\./m.test(corpus) && /^gates +properties 2 files, render off$/m.test(corpus),
    'stats: the control histogram and which gates ran');
  assert(/^time +properties \d+\.\d+s, total \d+\.\d+s$/m.test(corpus),
    'stats: with the phase timings the progress reporter collected');

  assert(!/^sources/m.test(run(one).out), 'stats: one file gets no run summary - it is the report');
  assert(/^sources +1 app class$/m.test(run([...one, '--stats']).out), 'stats: --stats asks for it anyway');
  assert(!/^sources/m.test(run([...two, '--no-stats']).out), 'stats: --no-stats switches it off');
  assert(!/^sources/m.test(run([...two, '--quiet']).out), 'stats: --quiet means quiet here too');

  const md = run([...two, '--format', 'markdown']).out;
  assert(/^### Run summary$/m.test(md) && /^- \*\*judged\*\* — \d+ controls/m.test(md),
    'stats: the markdown report carries the same summary (that is the $GITHUB_STEP_SUMMARY shape)');

  const json = JSON.parse(run([...two, '--json']).out);
  assert(json.stats.controls > 0 && json.stats.types['sap.m.Button'] > 0 && json.stats.documents >= 2,
    'stats: --json carries the aggregate, control histogram included');
  assert(json.results.every((r) => r.stats.documents >= 0) && json.results[0].stats.types === undefined,
    'stats: per result the counts, without repeating the histogram for every file');

  // --- progress -------------------------------------------------------------
  const { createProgress } = await import('../lib/report.mjs');
  const spy = () => { const lines = []; return { lines, write: (s) => lines.push(s) }; };
  const inActions = spy();
  const p = createProgress({ enabled: true, stream: inActions, github: true });
  p.update({ phase: 'properties', done: 0, total: 2 });
  p.update({ phase: 'properties', done: 1, total: 2, file: 'a.clas.abap' });
  p.update({ phase: 'render', done: 0, total: 2, pages: 4 });
  p.update({ phase: 'render', done: 1, total: 2, file: 'b.clas.abap', skipped: true });
  p.finish();
  const log = inActions.lines.join('');
  assert(/::group::abap2ui5-linter: properties gate, 2 files\n/.test(log)
    && /\[1\/2\] a\.clas\.abap\n/.test(log) && /::group::abap2ui5-linter: render gate, 2 files on 4 browser pages/.test(log),
    'progress: inside Actions every file is logged, wrapped in a collapsed group per gate');
  assert((log.match(/::group::/g) || []).length === (log.match(/::endgroup::/g) || []).length
    && /::endgroup::\nabap2ui5-linter: properties gate — 2 files in \d/.test(log),
    'progress: the groups are balanced and the timing line stays outside, visible while collapsed');
  assert(/render skipped \(built in helper methods\)/.test(log),
    'progress: a file the render gate steps over says so where it happens');
  assert(typeof p.times.properties === 'number' && typeof p.times.render === 'number',
    'progress: both phases are timed');

  const single = spy();
  const p2 = createProgress({ enabled: true, stream: single, github: true });
  p2.update({ phase: 'properties', done: 0, total: 1 });
  p2.update({ phase: 'properties', done: 1, total: 1, file: 'a.clas.abap' });
  p2.finish();
  assert(!single.lines.length && typeof p2.times.properties === 'number',
    'progress: a one-file run reports nothing and is still timed');

  const off = spy();
  const p3 = createProgress({ enabled: false, stream: off, github: true });
  p3.update({ phase: 'properties', done: 0, total: 9 });
  p3.finish();
  assert(!off.lines.length && typeof p3.times.properties === 'number',
    'progress: --no-progress prints nothing and keeps the timings');

  // --- badges ---------------------------------------------------------------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5badge-'));
  const badgeFile = path.join(dir, 'badges', 'check-abap2ui5.json');
  const corpusFile = path.join(dir, 'badges', 'abap2ui5.json');
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const clean = run([...two, '--badge', badgeFile, '--badge-corpus', corpusFile]);
  const badge = read(badgeFile);
  const facts = read(corpusFile);
  assert(clean.code === 0 && badge.schemaVersion === 1 && badge.color === '4c1'
    && badge.label === 'check-abap2UI5' && /^\d+ rules passed$/.test(badge.message),
    `badge: the verdict badge counts the rules that ran, the way a test badge counts tests (${badge.label} | ${badge.message})`);
  assert(facts.color === '007ec6' && facts.label === 'abap2UI5'
    && /^2 apps · 2 views · \d+ controls$/.test(facts.message),
    `badge: the corpus badge is a fact, blue, with no verdict in it (${facts.label} | ${facts.message})`);
  const shieldsKeys = ['schemaVersion', 'label', 'message', 'color', 'labelColor', 'cacheSeconds'];
  assert([badge, facts].every((b) => b.labelColor === '555' && b.namedLogo === undefined
    && Object.keys(b).every((k) => shieldsKeys.includes(k))),
    'badge: only keys the shields endpoint schema defines - an extra one renders as "invalid"');

  const dirty = run([f('structure.clas.abap'), f('good.clas.abap'), '--no-render', '--badge', badgeFile, '--badge-corpus', corpusFile]);
  const red = read(badgeFile);
  assert(dirty.code === 1 && red.color === 'e05d44' && /^\d+ errors$/.test(red.message)
    && /^2 apps/.test(read(corpusFile).message),
    `badge: the failing run - the one whose badge matters - is written too, and the corpus badge stays a count (${red.message})`);

  const xmlOnly = run([f('sample.view.xml'), '--no-render', '--badge-corpus', corpusFile]);
  const xml = read(corpusFile);
  assert(xmlOnly.code === 0 && /^1 view · \d+ controls$/.test(xml.message),
    `badge: a corpus of raw views has no app classes to count, and says nothing instead of "0 apps" (${xml.message})`);

  const nothing = path.join(dir, 'nothing');
  fs.mkdirSync(nothing);
  run([nothing, '--no-render', '--badge', badgeFile, '--badge-corpus', corpusFile]);
  assert([read(badgeFile), read(corpusFile)].every((b) => b.message === 'nothing checkable' && b.color === '9f9f9f'),
    'badge: a run that finds NOTHING to check says so on BOTH badges instead of leaving the last good ones standing');

  // the config form: the badges belong to the repo, not to the command line
  const { loadConfig } = await import('../lib/config.mjs');
  const cfgFile = path.join(dir, 'abap2ui5lint.jsonc');
  fs.writeFileSync(cfgFile, '{ "badge": "badges/from-config.json" }');
  const fromConfig = loadConfig(cfgFile).badge;
  assert(fromConfig.length === 1 && fromConfig[0].file === 'badges/from-config.json' && fromConfig[0].kind === 'checks',
    'badge: a plain path in the config is the file, and one badge alone is the verdict - what it has always meant');
  fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
  run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile]);
  assert(fs.existsSync(path.join(dir, 'badges', 'from-config.json')),
    'badge: written relative to the config file, not to whatever cwd the run had');
  fs.rmSync(path.join(dir, 'badges', 'from-config.json'));
  run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile, '--no-badge']);
  assert(!fs.existsSync(path.join(dir, 'badges', 'from-config.json')),
    'badge: --no-badge keeps a second pass (a job summary, a piped --json) from overwriting the real run\'s badges');

  // both badges from the config, each with its own file and label
  fs.writeFileSync(cfgFile, JSON.stringify({ badge: [
    { kind: 'corpus', file: 'badges/corpus.json', label: 'samples' },
    { kind: 'checks', file: 'badges/checks.json' },
  ] }));
  run([path.join(dir, 'good.clas.abap'), '--no-render', '--config', cfgFile]);
  assert(read(path.join(dir, 'badges', 'corpus.json')).label === 'samples'
    && read(path.join(dir, 'badges', 'checks.json')).label === 'check-abap2UI5',
    'badge: a list writes one file per kind, and a label given there beats the default name');

  const rejects = (json, pattern, what) => {
    fs.writeFileSync(cfgFile, json);
    let threw = '';
    try { loadConfig(cfgFile); } catch (e) { threw = e.message; }
    assert(pattern.test(threw), `badge: ${what} (${threw || 'accepted'})`);
  };
  rejects('{ "badge": { "file": "b.json", "colour": "green" } }', /unknown key 'colour'/,
    'a typo in the badge block fails loudly, like every other config key');
  rejects('{ "badge": { "file": "b.json", "kind": "corpse" } }', /'kind' must be corpus or checks/,
    'an unknown kind names the two that exist instead of silently writing neither');
  rejects('{ "badge": [{ "file": "a.json" }, { "file": "b.json" }] }', /lists kind 'checks' twice/,
    'the same badge written to two files is a copy-paste, and says so');
  fs.rmSync(dir, { recursive: true, force: true });
}

// --------------------------------------------------------------- typings ----
// types.d.ts is the typed contract of the exports map: hand-written (the
// implementation has no TypeScript build step by design), gated here so it
// can neither go stale against the exports map nor stop parsing
{
  const cp = await import('node:child_process');
  const ROOT = path.join(FIX, '..', '..');
  const dts = fs.readFileSync(path.join(ROOT, 'types.d.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  // every exports subpath that resolves to code has its declare-module block,
  // and every subpath's "types" condition points at this file
  const subpaths = Object.entries(pkg.exports).filter(([, v]) => typeof v === 'object');
  const undeclared = subpaths
    .map(([k]) => (k === '.' ? '@abap2ui5/linter' : `@abap2ui5/linter/${k.slice(2)}`))
    .filter((m) => !dts.includes(`declare module "${m}"`));
  assert(subpaths.length && !undeclared.length,
    `typings: every code subpath of the exports map is declared (missing: ${undeclared.join(', ') || 'none'})`);
  assert(subpaths.every(([, v]) => v.types === './types.d.ts') && pkg.types === './types.d.ts'
    && pkg.files.includes('types.d.ts'),
    'typings: the types conditions, the top-level types field and files[] all carry types.d.ts');

  // tsc --noEmit keeps the file syntactically and internally valid. typescript
  // is a devDependency used ONLY for this check - there is still no build step
  const { createRequire } = await import('node:module');
  let tsc = null;
  try { tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc'); } catch { /* not installed */ }
  if (tsc) {
    let ok = true;
    let msg = '';
    try {
      cp.execFileSync('node', [tsc, '--noEmit', '--strict', '--target', 'es2022', 'types.d.ts'],
        { cwd: ROOT, encoding: 'utf8' });
    } catch (e) { ok = false; msg = (e.stdout || e.stderr || '').trim().slice(0, 400); }
    assert(ok, `typings: types.d.ts type-checks clean (${msg || 'tsc --noEmit'})`);
  } else {
    assert(true, 'typings: typescript not installed - tsc check skipped (structural gate above still ran)');
  }
}

// ---------------------------------------------------------------- schema ----
{
  const { render, SCHEMA_FILE } = await import('../scripts/generate-schema.mjs');
  const committed = fs.readFileSync(SCHEMA_FILE, 'utf8');
  assert(committed === render(), 'schema: data/abap2ui5lint.schema.json is in sync (npm run generate-schema)');
  const schema = JSON.parse(committed);
  const { RULES, RENDER_RULE } = await import('../lib/findings.mjs');
  // + 1: the render gate's pseudo-rule is offered in the rules block too
  assert(Object.keys(schema.properties.rules.properties).length === RULES.length + 1
    && RULES.includes('duplicate-id') && schema.properties.rules.properties[RENDER_RULE],
    'schema: every rule id plus the render pseudo-rule is offered to the editor');
}

// ----------------------------------------------------------- rules page ----
{
  const { RULES, RENDER_RULE } = await import('../lib/findings.mjs');
  const { RULE_DOCS, CATEGORIES } = await import('../lib/rule-docs.mjs');
  const { FIXABLE } = await import('../lib/fix.mjs');
  const { buildPage, PAGE_FILE } = await import('../scripts/generate-rules-page.mjs');

  // The registry plus the render gate's pseudo-rule: `render-error` is emitted
  // by no check and so is deliberately absent from RULES, but it reaches
  // reports and SARIF like any other id and the SARIF helpUri deep-links here.
  const pageRules = [...RULES, RENDER_RULE].sort();
  const documented = Object.keys(RULE_DOCS).sort();
  assert(documented.join() === pageRules.join(),
    `rules page: every rule is documented and every documented rule exists (${
      pageRules.filter((r) => !RULE_DOCS[r]).concat(documented.filter((d) => !pageRules.includes(d))).join(', ') || 'in sync'})`);

  const known = new Set(CATEGORIES.map((c) => c.id));
  assert(Object.values(RULE_DOCS).every((d) => known.has(d.category) && d.summary && d.detail),
    'rules page: every entry has a known category, a summary and a detail');

  assert(FIXABLE.every((id) => RULES.includes(id) && RULE_DOCS[id].fixNote),
    'rules page: an autofixable rule says on the page what --fix does to it');

  const page = fs.readFileSync(PAGE_FILE, 'utf8');
  assert(page === buildPage(), 'rules page: docs/index.html is in sync (npm run generate-rules-page)');
  assert(pageRules.every((id) => page.includes(`<article class="rule" id="${id}"`)),
    'rules page: every rule has an anchor to link to');
  assert(!/<script src|<link rel="stylesheet"|https?:\/\/(?!github\.com|abap2ui5)/.test(page),
    'rules page: self-contained - no external stylesheet, script or font');

  // the README finding tables are hand-written - the one of the five places a
  // new rule moves to (AGENTS.md) that nothing generated. Now gated too.
  const readme = fs.readFileSync(path.join(FIX, '..', '..', 'README.md'), 'utf8');
  const missing = RULES.filter((id) => !readme.includes(`\`${id}\``));
  assert(!missing.length,
    `README: every rule id appears in the finding tables (missing: ${missing.join(', ') || 'none'})`);
}


// -------------------------------------------------------- robustness ----
/* The VS Code extension checks LIVE while the user types, so half-written
 * source is a normal input, not an edge case - and a throw there kills the
 * feature instead of reporting a finding. Nothing pinned that before.
 *
 * Measured over the corpus first: 2,508 truncations and 2,760 seeded
 * mutations (inserted brackets/backticks/quotes, deleted runs, duplicated
 * runs, stripped backticks) across 103 real ports threw nothing. Those
 * sweeps need the corpus; this fixture-scale guard is what CI can carry.
 */
{
  const abap = fs.readFileSync(f('good.clas.abap'), 'utf8');
  const xml = fs.readFileSync(f('badvalue.view.xml'), 'utf8');
  const POISON = ['`', '(', ')', '{', '}', '"', "'", '&', '<', '>', '=>', '->'];
  let threw = null;

  for (let i = 0; i <= 40 && !threw; i++) {
    const cutA = abap.slice(0, Math.floor((abap.length * i) / 40));
    const cutX = xml.slice(0, Math.floor((xml.length * i) / 40));
    try { checkAbapSource(cutA, { minUi5: '1.71' }); } catch (e) { threw = `truncated ABAP at ${i}/40: ${e.message}`; }
    try { checkXmlSource(cutX, { minUi5: '1.71' }); } catch (e) { threw = threw || `truncated XML at ${i}/40: ${e.message}`; }
  }
  assert(!threw, `robustness: a truncated source is reported, never thrown on${threw ? ` - ${threw}` : ''}`);

  threw = null;
  for (let i = 0; i < POISON.length && !threw; i++) {
    const at = Math.floor((abap.length * (i + 1)) / (POISON.length + 1));
    const hurt = abap.slice(0, at) + POISON[i] + abap.slice(at);
    try { checkAbapSource(hurt, { minUi5: '1.71' }); } catch (e) { threw = `'${POISON[i]}' at ${at}: ${e.message}`; }
  }
  assert(!threw, `robustness: a stray bracket/quote is reported, never thrown on${threw ? ` - ${threw}` : ''}`);
}

// ------------------------------------------------------- rule coverage ----
/* Every rule the linter offers has to FIRE somewhere in this suite.
 *
 * The gap this closes was invisible by construction: 83 of the 84 rules were
 * asserted and the 84th (`escaped-brace-in-backtick`) simply had no test.
 * Nothing was in a position to say so — a rule that stops firing keeps this
 * suite green, ships, and reports nothing until somebody notices by hand.
 *
 * What is recorded is what the checks actually produced (test/observe.mjs),
 * not what the test source appears to mention, so a negated assertion or a
 * renamed idiom cannot pass for coverage. A rule may be exempt, but only in
 * writing, below. */
{
  const { RULES } = await import('../lib/findings.mjs');

  /* id -> why this rule cannot be produced by the fixture suite. Keep it
   * empty if you can: an exemption is a rule nothing proves. */
  const EXEMPT = {};

  const uncovered = RULES.filter((id) => !produced.has(id) && !(id in EXEMPT));
  assert(!uncovered.length,
    `rule coverage: every rule fires somewhere in the suite (never fired: ${uncovered.join(', ') || 'none'})`);

  const stale = Object.keys(EXEMPT).filter((id) => produced.has(id) || !RULES.includes(id));
  assert(!stale.length,
    `rule coverage: no stale exemption - a rule that fires needs none (${stale.join(', ') || 'none'})`);
}

// ----------------------------------------------- the docs' builder verbs ----
/* The rule reference shows code a reader copies, and 11 of its 49 examples
 * called methods the view builder does not have (`view->leaf( … )`,
 * `->_generic( name = … )`) - the ROLE names lib/builders.mjs uses internally,
 * which were the verbs of a builder that is gone. It rendered on the published
 * page and in the README, and no reader could have known.
 *
 * Derived from the builder rather than from a list of bad spellings, so a
 * future rename of a verb takes the docs with it. */
{
  const { RULE_DOCS } = await import('../lib/rule-docs.mjs');
  const { VIEW_BUILDER } = await import('../lib/builders.mjs');

  const REAL = new Set([
    VIEW_BUILDER.open, VIEW_BUILDER.leaf, VIEW_BUILDER.att, VIEW_BUILDER.shut,
    'factory', 'stringify', 'render', 'xml_escape',
  ]);
  // a builder chain in the docs is written `view->x(` or `)->x(`; a client
  // call is `client->x(` and is not this gate's business
  const CHAIN_CALL = /(?:^|[\s(])(?:\w*view\w*|popup|popover|\)|\w*_x)->(\w+)\s*\(/g;

  /* One rule is ABOUT the builder that does not have these methods. Its example
   * has to show `page( )`/`button( )` or it is not showing the reader the code
   * they have in front of them. Named here rather than loosened for everyone,
   * so the gate still holds for the other 85. */
  const ABOUT_THE_OLD_BUILDER = new Set(['frozen-view-builder']);

  const wrong = [];
  for (const [id, doc] of Object.entries(RULE_DOCS)) {
    if (ABOUT_THE_OLD_BUILDER.has(id)) continue;
    for (const field of ['summary', 'detail', 'example', 'fixNote']) {
      const text = doc[field];
      if (typeof text !== 'string') continue;
      for (const [, verb] of text.matchAll(CHAIN_CALL)) {
        if (!REAL.has(verb)) wrong.push(`${id}.${field}: ->${verb}( )`);
      }
    }
  }
  assert(!wrong.length,
    `rule docs: every builder call names a method the builder has (${wrong.join('; ') || 'all real'})`);
}

console.log(failed ? `\n${failed} assertion(s) failed` : '\nall assertions passed');
process.exit(failed ? 1 : 0);
