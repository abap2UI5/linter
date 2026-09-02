#!/usr/bin/env node
/*
 * test/run — fixture-based self-test of the two gates.
 *
 * The LOAD-BEARING few, the ones every other section leans on. This is a
 * sample and says so: `test/fixtures/` holds far more, one or two per rule
 * family, and each is introduced by the section that reads it. A header
 * pretending to list them all is a header that goes stale on the next rule.
 *
 *   good.clas.abap      reconstructs, no findings, renders clean — the
 *                       reference every "…and the legal form is left alone"
 *                       assertion is written against
 *   viewbuilder.clas.abap  the same view, built through a helper handle. The
 *                       PAIR is the proof: the two reconstruct byte-identical
 *                       documents, which is what makes one reconstructor
 *                       enough for both builder dialects
 *   post171.clas.abap   property gate: GenericTile.systemInfo @since 1.92
 *   broken.clas.abap    render gate: typo property + unknown control
 *   structure.clas.abap unknown control/property/aggregation, bad enum and
 *                       numeric values, 0..1 overfilled, excess end( )
 *   dumps.clas.abap     builder calls the view builder ASSERTs on
 *   rowpaths.clas.abap  relative binding paths inside a bound aggregation
 *   nested.clas.abap    nested structures and nested aggregation bindings
 *   sample.view.xml     raw XML path: no findings, renders clean
 *
 * What the suite is FOR, beyond the rules: the last sections gate everything
 * generated or written down — the schema, the rules page, types.d.ts against
 * the exports map, AGENTS.md against the artefacts, the workflows and the
 * composite action — and the rule-coverage gate at the end asserts that every
 * registered rule actually fired somewhere above.
 *
 * HOW IT RUNS. `node:test` and `node:assert`, both of which ship with Node 22:
 * no dependency, no runner to install, no build step - the same constraints
 * this project has always had. Each `section( )` is one `test( )`, they run in
 * order, and a section's failure is its own: this was a 3,700-line single
 * process where any TypeError mid-file aborted every remaining assertion AND
 * the coverage gate at the end, which made a crash and a coverage failure look
 * identical from the outside. Temp directories go through `tempDir( )` and are
 * removed in one `after( )`, so an aborted section leaks none.
 *
 *   npm test                       the whole suite
 *   node --test-name-pattern=fix test/run.mjs    one section
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { test, after } from 'node:test';
import nodeAssert from 'node:assert';
import { checkAbapSource, checkXmlSource, checkFiles, produced } from './observe.mjs';
import { prepareAbap } from '../lib/reconstruct.mjs';
import { elementBoundSlots } from '../lib/index.mjs';
import { severityOf, severityRank } from '../lib/findings.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const f = (n) => path.join(FIX, n);

/* Every applyFixes call in this suite - and in every CLI subprocess it spawns
 * - runs with malformed fix spans as an ERROR rather than as a silent drop.
 * A rule that computes its offsets against the wrong text (the scrubbed copy,
 * another document of the same class) otherwise ships a fix that can never be
 * applied, and the only symptom is a finding that survives every --fix pass. */
process.env.ABAP2UI5LINT_STRICT_FIXES = 'true';

/*
 * The harness. `node:test` and `node:assert` ship with Node 22, so this is
 * still a suite with no dependency, no runner to install and no build step.
 *
 * `assert( )` deliberately does NOT throw. Every assertion in a section runs,
 * a failing one is recorded, and the SECTION fails at its end carrying all of
 * them - which is the behaviour this suite always had. What node:test adds is
 * the isolation it never had: a TypeError in one section used to abort every
 * remaining assertion AND the rule-coverage gate at the end, so a crash and a
 * coverage failure were indistinguishable. Now the section fails and the rest
 * of the suite, the coverage gate included, still runs and still reports.
 */
let bucket = [];
const assert = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) bucket.push(msg);
};

/** One section of the suite: isolated, ordered, and failing with every one of
 *  its assertions rather than with the first. */
const section = (name, body) => test(name, async () => {
  bucket = [];
  try {
    await body();
  } finally {
    const failures = bucket;
    bucket = [];
    nodeAssert.ok(!failures.length,
      `${failures.length} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
});

/* Temp directories, cleaned up centrally.
 *
 * Every section that needed one used to mkdtemp and rm it itself, which is
 * correct right up until the section throws in between - and then the
 * directory outlives the run with nobody to notice. Registered here and
 * removed in one `after( )`, so an aborted section leaks nothing. Sections
 * still remove their own where they want the removal ASSERTED; a second
 * removal of a gone directory is a no-op. */
const tempDirs = [];
const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const results = await checkFiles(
  [f('good.clas.abap'), f('viewbuilder.clas.abap'), f('post171.clas.abap'), f('broken.clas.abap'),
    f('structure.clas.abap'), f('barefragment.clas.abap'), f('sample.view.xml')],
);
const by = (n) => results.find((r) => r.file.endsWith(n));

const good = by('good.clas.abap');
section('good', async () => {
  assert(good.docs.length === 1, 'good: one view reconstructed');
  assert(good.model.NAME === 'world', 'good: bound scalar seeded from model_init');
  assert(good.findings.length === 0,
    `good: the canonical fixture carries no finding (${good.findings.map((x) => x.type).join(', ') || 'none'})`);
  assert(good.renderErrors.length === 0, `good: renders clean (${good.renderErrors[0] || ''})`);
});

// the same view built through a helper handle: through the render gate as
// well, which is what proves the reconstruction is not merely plausible XML
const vbuilder = by('viewbuilder.clas.abap');
section('viewbuilder', async () => {
  assert(vbuilder.findings.length === 0 && vbuilder.renderErrors.length === 0,
    `viewbuilder: the helper-handle fixture renders clean (${vbuilder.renderErrors[0] || vbuilder.findings[0]?.type || ''})`);
});

const post = by('post171.clas.abap');
section('post171', async () => {
  assert(post.findings.some((x) => x.member === 'systemInfo' && x.type === 'member-too-new'),
    'post171: GenericTile.systemInfo flagged as member-too-new');
});

/* A popup whose root is a bare control, not core:FragmentDefinition. The
 * render gate used to decide view-vs-fragment by sniffing the root tag, so
 * this legitimate shape (display-root-mismatch says so in as many words) went
 * to XMLView.create and failed with "XMLView's root node must be 'View'" -
 * a render error against correct code. The consuming call decides now. */
const bareFrag = by('barefragment.clas.abap');
section('barefragment', async () => {
  assert(bareFrag.docKinds[0] === 'fragment',
    `barefragment: popup_display marks the document a fragment (got ${bareFrag.docKinds[0]})`);
  assert(bareFrag.renderErrors.length === 0,
    `barefragment: a bare-control fragment renders clean (${bareFrag.renderErrors[0] || ''})`);
  assert(good.docKinds[0] === 'view',
    `good: view_display marks the document a view (got ${good.docKinds[0]})`);
});

const broken = by('broken.clas.abap');
section('broken', async () => {
  assert(broken.renderErrors.length > 0, 'broken: render gate reports errors');
  assert(broken.renderErrors.some((e) => /textt|NoSuchControl/i.test(e)),
    `broken: error names the defect (${(broken.renderErrors[0] || '').slice(0, 80)})`);
  assert(broken.findings.some((x) => x.type === 'unknown-control' && x.control === 'sap.m.NoSuchControl'),
    'broken: property gate flags the typo control without a browser');
});

const struct = by('structure.clas.abap');
const has = (type, pred = () => true) => struct.findings.some((f) => f.type === type && pred(f));
section('structure', async () => {
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
});

// the target UI5 version drives BOTH directions: too-new members are only
// a finding below it, deprecations only from the version they take effect
const depLate = await checkFiles([f('deprecated-late.clas.abap')], { render: false, minUi5: '1.71' });
section('target version', async () => {
  assert(!depLate[0].findings.some((x) => x.type === 'control-deprecated'),
    'target version: a control deprecated after the target is not reported');
});
const depNow = await checkFiles([f('deprecated-late.clas.abap')], { render: false, minUi5: '1.150' });
section('target version (2)', async () => {
  assert(depNow[0].findings.some((x) => x.type === 'control-deprecated'),
    'target version: the same control IS reported when the target reaches its deprecation');
});

/* A library deprecated WHOLE. Not one of the rules above can see it: none of
 * these libraries is in the snapshot, so the control resolves to nothing, sits
 * in no known library, and every check went quiet - the strongest false green
 * this tool can produce. The fixture puts the replacement next to the dead
 * control on purpose: sap.viz.ui5.Bar is deprecated and sap.viz.ui5.controls
 * .VizFrame is what to write instead, and a prefix rule catches both unless
 * the exception holds. */
const deadLib = await checkFiles([f('deadlib.clas.abap')], { render: false });
section('deprecated library', async () => {
  const found = deadLib[0].findings.filter((x) => x.type === 'deprecated-library');
  assert(found.some((x) => x.control === 'sap.ui.commons.Button' && x.library === 'sap.ui.commons'),
    'deprecated library: a sap.ui.commons control is reported, though no rule reading the snapshot can see it');
  assert(found.some((x) => x.control === 'sap.viz.ui5.Bar' && x.since === '1.32'),
    'deprecated library: the legacy sap.viz.ui5 chart classes are reported');
  assert(!found.some((x) => x.control === 'sap.viz.ui5.controls.VizFrame'),
    'deprecated library: the REPLACEMENT under the same prefix is not reported');
  assert(found.every((x) => /use /.test(x.message)),
    'deprecated library: every finding names what to write instead');
  /* One finding per tag. sap.viz is SAPUI5-only as well, and both are true -
   * but a tag that has to be rewritten anyway does not also need advice on
   * configuring the distribution it is kept under. */
  assert(!deadLib[0].findings.some((x) => x.type === 'sapui5-only-control' && x.control === 'sap.viz.ui5.Bar'),
    'deprecated library: the portability hint stands down where the library is dead');
  assert(deadLib[0].findings.some((x) => x.type === 'sapui5-only-control' && x.control === 'sap.viz.ui5.controls.VizFrame'),
    'deprecated library: and still fires for the living control beside it');
  assert(!deadLib[0].findings.some((x) => x.type === 'unknown-control'),
    'deprecated library: a dead-library control is never mistaken for a typo');
});
/* Held against the target like any other deprecation: below 1.38 sap.ui.commons
 * is simply the library of its day, and sap.viz falls back to the portability
 * hint it got before this rule existed. */
const deadLibOld = await checkFiles([f('deadlib.clas.abap')], { render: false, minUi5: '1.30' });
section('deprecated library (2)', async () => {
  assert(!deadLibOld[0].findings.some((x) => x.type === 'deprecated-library'),
    'deprecated library: nothing is reported below the deprecating release');
  assert(deadLibOld[0].findings.some((x) => x.type === 'sapui5-only-control' && x.control === 'sap.viz.ui5.Bar'),
    'deprecated library: and the rule under it gets the tag back');
});

/* SAPUI5 vs OpenUI5: the same view is fine on one distribution and broken on
 * the other, because sap.ui.comp simply does not ship with OpenUI5 - so this
 * rule's severity is decided by the CONFIG, not by the view, and all three
 * answers have to be distinguishable. Saying "sapui5" is a decision; saying
 * nothing is the absence of one, and used to be silently read as the first. */
const smartSap = await checkFiles([f('smart.clas.abap')], { render: false, distribution: 'sapui5' });
section('distribution', async () => {
  assert(!smartSap[0].findings.some((x) => x.type === 'sapui5-only-control'),
    'distribution: a SAPUI5-only control is accepted on SAPUI5');
});
const smartOpen = await checkFiles([f('smart.clas.abap')], { render: false, distribution: 'openui5' });
section('distribution (2)', async () => {
  const found = smartOpen[0].findings.find((x) => x.type === 'sapui5-only-control');
  assert(found && found.library === 'sap.ui.comp',
    'distribution: the same control is reported on OpenUI5');
  assert(found.severity === 'error',
    `distribution: an ERROR where the config says the library is not there (got ${found?.severity})`);
  assert(!smartOpen[0].findings.some((x) => x.type === 'unknown-control'),
    'distribution: a SAPUI5-only control is never mistaken for a typo');
});
const smartUnset = await checkFiles([f('smart.clas.abap')], { render: false });
section('distribution (3)', async () => {
  const found = smartUnset[0].findings.find((x) => x.type === 'sapui5-only-control');
  assert(found, 'distribution: with no distribution configured the control is still reported');
  assert(found.severity === 'hint',
    `distribution: a HINT when nobody said which distribution this runs on (got ${found?.severity})`);
  assert(/no "distribution" is configured/.test(found.message),
    `distribution: the hint says WHY it is one, and what to write (got ${found?.message})`);
  // and it is advisory: the default failOn is `warning`, so an unconfigured
  // repo learns about its SmartTable without its build turning red for it
  assert(severityRank(found.severity) < severityRank('warning'),
    'distribution: the unconfigured answer does not fail a default run');
  const over = await checkFiles([f('smart.clas.abap')],
    { render: false, rules: { 'sapui5-only-control': 'error' } });
  assert(over[0].findings.find((x) => x.type === 'sapui5-only-control').severity === 'error',
    'distribution: a rules override still beats the distribution-derived severity');
});

// abap2UI5-specific defects: silent at runtime, invisible to UI5 tooling
const rules = (await checkFiles([f('abaprules.clas.abap')], { render: false }))[0];
const hasR = (t, pred = () => true) => rules.findings.some((x) => x.type === t && pred(x));
section('abap rules', async () => {
  assert(hasR('obsolete-binder', (x) => x.member === '_bind_edit'),
    'abap rules: _bind_edit reported as obsolete (use _bind)');
});
// ... including where it carries custom_mapper_back/custom_filter_back: those
// are accepted for source compatibility but no longer EVALUATED, so the call
// is a leftover like any other - only the autofix stays away from it
section('abap rules (2)', async () => {
    // checkAbapRules, not checkAbapSource: a snippet without a builder chain
    // never reaches the ABAP rules at all, so the negative form this assertion
    // used to have was green for the wrong reason
    const { checkAbapRules } = await import('./observe.mjs');
    const back = checkAbapRules('client->_bind_edit( val = name custom_mapper_back = mapper )')
      .find((x) => x.type === 'obsolete-binder');
    assert(back?.value === 'custom_mapper_back' && !back.fixes,
      'abap rules: _bind_edit carrying custom_mapper_back is reported too, but never autofixed');
});
section('abap rules (3)', async () => {
  assert(hasR('binding-to-local', (x) => x.member === 'lv_local'),
    'abap rules: a local variable bound - lost after the roundtrip');
  assert(hasR('event-without-handler', (x) => x.value === 'NO_HANDLER'),
    'abap rules: an event nothing handles');
});
/* The two handler shapes that used to read as no handler at all. Both are
 * everywhere in the sample corpora, and both made the rule report an event
 * that IS handled - the worst kind of hint, since the reader has to prove
 * the tool wrong before ignoring it. */
section('abap rules (4)', async () => {
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
});
section('abap rules (5)', async () => {
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
});

const vr = (await checkFiles([f('viewrules.clas.abap')], { render: false }))[0];
const hasV = (t, pred = () => true) => vr.findings.some((x) => x.type === t && pred(x));
section('view rules', async () => {
  assert(hasV('binding-for-event', (x) => x.member === 'press'),
    'view rules: a binding on an event (use _event)');
  assert(hasV('duplicate-id', (x) => x.value === 'twice'), 'view rules: duplicate id');
  assert(hasV('undeclared-namespace', (x) => x.member === 'undeclared'),
    'view rules: namespace prefix used but never declared');
  assert(hasV('missing-accessibility', (x) => x.member === 'tooltip'),
    'view rules: icon-only button without a tooltip');
});
/* An attribute WRITTEN but not statically resolvable is not an absent one.
 * `COND #( … )` / `SWITCH #( … )` / `|{ count }|` are how a real app labels a
 * button that changes its own caption, and reading the dropped attribute as
 * "no text" reported three correctly labelled buttons as unusable with a
 * screen reader. */
section('sap-icon', async () => {
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
});
section('view rules (2)', async () => {
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
});

// the builder ASSERTs the app never survives: a( ) with nothing to attach it
// to, and one attribute name written twice on the same control
const dumps = (await checkFiles([f('dumps.clas.abap')], { render: false }))[0];
const hasD = (t, pred = () => true) => dumps.findings.some((x) => x.type === t && pred(x));
section('dumps', async () => {
  assert(hasD('attribute-without-element', (x) => x.member === 'title'),
    'dumps: a( ) on the bare factory root - z2ui5_cl_ui5_view_builder asserts');
  assert(hasD('duplicate-property', (x) => x.member === 'text' && x.control === 'Button'),
    'dumps: the same attribute set twice on one control - z2ui5_cl_ui5_view_builder asserts');
  assert(dumps.docs[0].split('text="').length === 2,
    'dumps: the refused duplicate is not carried into the reconstructed XML');
});

// every finding carries where it came from, what it means and how bad it is -
// so an editor can place it and a build can decide on it
const posSrc = fs.readFileSync(f('dumps.clas.abap'), 'utf8').split('\n');
const dup = dumps.findings.find((x) => x.type === 'duplicate-property');
section('dumps (2)', async () => {
  assert(dup.line > 0 && posSrc[dup.line - 1].includes('Save and close'),
    `dumps: the finding points at the SECOND text attribute (line ${dup.line})`);
  assert(posSrc[dup.line - 1].slice(dup.column - 1).startsWith('->a('),
    `dumps: the column points at the a( ) call itself (col ${dup.column})`);
  assert(dup.severity === 'error' && typeof dup.message === 'string' && dup.message.length > 10,
    'findings: severity and a ready-made message travel with the finding');
});

// severity is the linter's judgement, not the caller's guesswork
section('severity', async () => {
  assert(severityOf({ type: 'unknown-control' }) === 'error',
    'severity: a control that does not exist breaks the app - error');
  assert(severityOf({ type: 'control-too-new' }) === 'warning',
    'severity: the version floor is a portability warning');
  assert(severityOf({ type: 'event-without-handler' }) === 'hint',
    'severity: an unhandled event is a hint - the roundtrip alone may be the point');
  assert(severityOf({ type: 'brand-new-rule-nobody-classified' }) === 'error',
    'severity: an unclassified type stays loud rather than being silently dropped');
});

// a relative {NAME} inside a bound aggregation addresses the ROW - with the
// row's shape known from the class's TYPES, a typo'd column is catchable
const rows = (await checkFiles([f('rowpaths.clas.abap')], { render: false }))[0];
const rowPathFindings = rows.findings.filter((x) => x.type === 'unknown-binding-path');
section('rows', async () => {
  assert(rowPathFindings.length === 1 && rowPathFindings[0].value === 'CARID',
    `rows: the typo'd row field is the only one reported (${rowPathFindings.map((x) => x.value).join(', ')})`);
  assert(rowPathFindings[0].context === '/T_FLIGHTS',
    'rows: the finding names the aggregation binding the row came from');
  assert(!rows.findings.some((x) => x.value === 'SEATSMAX'),
    'rows: a declared but unseeded field is part of the row - an ABAP structure always has all of them');
  assert(!rows.findings.some((x) => x.value === 'CARRID'),
    'rows: a column header under `columns` is not in the row context and is left alone');
});

// a nested aggregation binding moves the context DOWN - including the
// complex {path: '...'} form the templates actually use
const nested = (await checkFiles([f('nested.clas.abap')], { render: false }))[0];
const nestedPaths = nested.findings.filter((x) => x.type === 'unknown-binding-path');
section('nested', async () => {
  assert(nestedPaths.length === 1 && nestedPaths[0].value === 'EXPENSE'
    && nestedPaths[0].context === 'ELEMENTS',
    `nested: inside the inner list only its own row fields exist (${nestedPaths.map((x) => x.value).join(', ')})`);
  assert(!nested.findings.some((x) => String(x.value).startsWith('AMOUNT/')),
    'nested: a path through a nested structure resolves');
});

// a structure declared INSIDE another one is a field of its parent AND a
// structure in its own right - it names no TYPE, so the field matcher cannot
// see it and the whole subtree used to be dropped from the model
const nestedTypes = (await checkFiles([f('nestedtypes.clas.abap')], { render: false }))[0];
const nestedTypePaths = nestedTypes.findings.filter((x) => x.type === 'unknown-binding-path');
section('nested types', async () => {
  assert(nestedTypePaths.length === 1 && nestedTypePaths[0].value === 'S_DETAILS/CREATE_DAT',
    `nested types: only the typo through the nested structure is reported (${nestedTypePaths.map((x) => x.value).join(', ')})`);
  assert(nestedTypes.findings.length === 1,
    `nested types: a correct deep path raises nothing else either (${nestedTypes.findings.map((x) => x.type).join(', ')})`);
});
section('nested types (2)', async () => {
    const shape = prepareAbap(fs.readFileSync(f('nestedtypes.clas.abap'), 'utf8')).modelShape;
    assert(shape.T_ROWS[0].S_DETAILS?.S_WHO?.UNAME === '',
      'nested types: two levels of nesting reach the model, not just one');
});

// four ways an ABAP structure declaration hides its shape from a naive parse.
// Every binding in the fixture is correct, so silence is the assertion - and
// each shape then has to still CATCH a typo, or it is being blanket-accepted
// rather than understood.
section('struct shapes', async () => {
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
});

// the model handed to the RENDERER stays what a seed actually sets: a field
// the class fills in code cannot be followed statically, and inventing an
// empty string for it makes UI5 strict mode reject a good view
const prep = prepareAbap(fs.readFileSync(f('nested.clas.abap'), 'utf8'));
section('model', async () => {
  assert(!('ELEMENTS' in prep.model.T_ROWS[0]) && 'ELEMENTS' in prep.modelShape.T_ROWS[0],
    'model: the unseeded field is in the shape the gate asks about, not in the render model');
  assert(prep.model.T_ROWS[0].AMOUNT.SIZE === 560,
    'model: a nested structure seed parses as one structure, not as an empty table');
});

// a DATA declared with a NAMED table type is a table too — the inline
// `STANDARD TABLE OF` form is not the only one the corpus writes
section('xmlns', async () => {
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
});

// _bind with shape-neutral named parameters: omit_initial/omit_initial_paths
// and json change the SERIALIZATION around the binding, not what it addresses,
// so the attribute must reconstruct instead of being dropped as unresolved
section('xmlns (2)', async () => {
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
});

// omit_initial_paths in the RENDER model: the runtime does not serialize an
// initial value of a listed field, so the mock must not either — the seeded
// '' used to reach strict mode as an empty enum and kill the render
section('xmlns (3)', async () => {
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
});

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
section('rows (2)', async () => {
  assert(!checkAbapSource(opaque, { render: false }).findings
    .some((x) => x.type === 'unknown-binding-path'),
    'rows: nothing is claimed about a row type the class does not declare');
});

/* The CELL binding — `_bind( val = t[ n ]-field tab = t tab_index = n )`, one
 * row of an internal table addressed from a statically written control. It
 * fell through to "unresolved" until the reconstructor learned it, and an
 * unresolved value takes its ATTRIBUTE out of the reconstructed view, so
 * every gate stopped seeing the property (the same shape as the earlier
 * omit_initial_paths/json gap). What is asserted here is both halves: the
 * consistent call resolves to the row-qualified path, and every form whose
 * three parts disagree stays unresolved rather than resolving to a guess. */
const cellClass = (bindExpr) => `CLASS zcl_cell DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_emp, name TYPE string, job TYPE string, END OF ty_s_emp.
    DATA mt_emp TYPE STANDARD TABLE OF ty_s_emp WITH EMPTY KEY.
    DATA mv_row TYPE i.
ENDCLASS.
CLASS zcl_cell IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    mt_emp = VALUE #( ( name = \`Michael Adams\` job = \`Scrum Master\` )
                      ( name = \`John Miller\` job = \`Product Owner\` ) ).
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Label\`
            )->a( n = \`text\` v = ${bindExpr}
        )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`;

section('cell binding', async () => {
  const first = prepareAbap(cellClass('client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 )'));
  assert(first.docs[0]?.includes('text="{/MT_EMP/0/NAME}"') && first.notes.length === 0,
    'cell binding: ABAP row 1 is client row 0, and the attribute stays in the view');
  const second = prepareAbap(cellClass('client->_bind( val = mt_emp[ 2 ]-job tab = mt_emp tab_index = 2 )'));
  assert(second.docs[0]?.includes('text="{/MT_EMP/1/JOB}"'),
    'cell binding: the row index and the component are both resolved, not guessed');
  const bare = prepareAbap(cellClass('client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 path = abap_true )'));
  assert(bare.docs[0]?.includes('text="/MT_EMP/0/NAME"'),
    'cell binding: path = abap_true still asks for the bare path');
  const me = prepareAbap(cellClass('client->_bind( val = me->mt_emp[ 1 ]-name tab = me->mt_emp tab_index = 1 )'));
  assert(me.docs[0]?.includes('text="{/MT_EMP/0/NAME}"'),
    'cell binding: a me-> prefix drops away on both arguments');

  // the table becomes a bound root, so the row shape is known and the
  // row-qualified path is judged like any other rather than reported missing
  assert(Array.isArray(first.model.MT_EMP) && first.model.MT_EMP[0]?.NAME === 'Michael Adams',
    'cell binding: the TABLE is what the model carries — the cell is only a path into it');
  assert(!checkAbapSource(cellClass('client->_bind( val = mt_emp[ 2 ]-job tab = mt_emp tab_index = 2 )'),
    { render: false }).findings.some((x) => x.type === 'unknown-binding-path'),
    'cell binding: a resolved cell path is not reported as unknown');

  // the three parts disagree -> the call cannot work (the framework matches
  // the cell by REFERENCE and refuses a val outside the addressed row), so a
  // path computed from it would be a guess printed as a fact
  const guessable = [
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 2 )', 'the row in val and tab_index disagree'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_other tab_index = 1 )', 'val reads a table other than tab'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = mv_row )', 'the row number is not a literal'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp )', 'tab_index is missing'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab_index = 1 )', 'tab is missing'],
    ['client->_bind( val = mt_emp[ 1 ]-name tab = mt_emp tab_index = 1 switch_default_model = abap_true )',
      'a re-rooted model is still not ours to guess'],
  ];
  for (const [expr, why] of guessable) {
    const out = prepareAbap(cellClass(expr));
    assert(!out.docs[0]?.includes('{/MT_EMP/')
      && out.notes.some((n) => n.includes('unresolved value expression')),
      `cell binding: stays unresolved when ${why}`);
  }

  /* The ASSIGNED-row spelling — `val = <emp>-name` — is what a downported
   * class writes, so it is the one the corpus uses. `val` contributes the
   * component; the table and the row come from tab/tab_index either way. */
  const assigned = prepareAbap(`CLASS zcl_cell DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES: BEGIN OF ty_s_emp, name TYPE string, job TYPE string, END OF ty_s_emp.
    DATA mt_emp TYPE STANDARD TABLE OF ty_s_emp WITH EMPTY KEY.
ENDCLASS.
CLASS zcl_cell IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    FIELD-SYMBOLS <emp1> TYPE ty_s_emp.
    FIELD-SYMBOLS <emp2> TYPE ty_s_emp.
    mt_emp = VALUE #( ( name = \`Michael Adams\` job = \`Scrum Master\` )
                      ( name = \`John Miller\` job = \`Product Owner\` ) ).
    ASSIGN mt_emp[ 1 ] TO <emp1>.
    ASSIGN mt_emp[ 2 ] TO <emp2>.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->tag( \`Label\`
            )->a( n = \`text\` v = client->_bind( val = <emp1>-name tab = mt_emp tab_index = 1 )
        )->tag( \`Label\`
            )->a( n = \`text\` v = client->_bind( val = <emp2>-job tab = mt_emp tab_index = 2 )
        )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.`);
  assert(assigned.docs[0]?.includes('text="{/MT_EMP/0/NAME}"')
    && assigned.docs[0]?.includes('text="{/MT_EMP/1/JOB}"')
    && assigned.notes.length === 0,
    'cell binding: an assigned row resolves from tab/tab_index plus the component');
  assert(assigned.model.MT_EMP?.[1]?.JOB === 'Product Owner',
    'cell binding: the assigned form binds the table into the model like the other one');
});

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

section('event params', async () => {
  assert(withEvent('SearchField', 'search', 'searchButtonPressed')
    .some((x) => x.member === 'searchButtonPressed' && x.since === '1.114'),
    'event params: one newer than the floor is reported');
  assert(!withEvent('SearchField', 'search', 'query').length,
    'event params: one without an @since predates version tracking and is not');
  assert(withEvent('Menu', 'beforeClose', 'item').length === 1,
    'event params: Menu beforeClose/item is @since 1.136');
  assert(!withEvent('Menu', 'itemSelected', 'item').length,
    'event params: Menu itemSelected/item is NOT - same name, different event, and only the flat member map confuses the two');
});

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

section('missing shut', async () => {
  assert(misplaced(view('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )->ele( `footer` )'))
    .some((x) => x.member === 'footer' && x.parentAggregation === 'columns'),
    'missing shut: an aggregation inside an aggregation is reported');
  assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( `Column` )->ele( `header` )')).length,
    'missing shut: a well-formed aggregation/control/aggregation nesting is not');
  assert(!misplaced(view('  )->ele( `Table` )->ele( `columns` )->ele( n = `Thing` ns = `my` )->ele( `content` )')).length,
    'missing shut: a control from an unknown library still counts as a control in between');
});

// a control the aggregation's type does not accept: UI5 refuses the child and
// the part of the view below it silently disappears
const childOf = (inner) => checkAbapSource(view(inner), { render: false })
  .findings.filter((x) => x.type === 'invalid-aggregation-child');
section('aggregation child', async () => {
  assert(childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Button` )')
    .some((x) => x.control === 'sap.m.Button' && x.parentControl === 'sap.m.Table'
      && x.member === 'columns' && x.expected === 'sap.m.Column'),
    'aggregation child: a Button inside Table columns is reported with the expected type');
  assert(!childOf('  )->ele( `Table` )->ele( `columns` )->tag( `Column` )').length,
    'aggregation child: the type the aggregation declares is accepted');
});

/* ------------------------------------------------ negative counter-cases ----
 *
 * The doctrine is a fixture proving a rule sees its own defect AND leaves the
 * neighbouring legal form alone, and eight rules had only the first half. A
 * rule asserted in one direction can be a rule that fires on everything: the
 * positive case passes either way, and the corpus is where that gets found
 * out - late, on somebody else's repository.
 *
 * Each pair below is the same view twice, defective and correct, differing in
 * the one thing the rule is about.
 */
section('too-many-children', async () => {
    const only = (src, type) => checkAbapSource(src, { render: false })
      .findings.filter((x) => x.type === type);
    const sees = (inner, type) => only(view(inner), type).length > 0;
    const quiet = (inner, type) => only(view(inner), type).length === 0;

    // too-many-children: a 0..1 aggregation given two. The second silently
    // replaces the first at runtime.
    assert(sees('  )->ele( `Page` )->ele( `customHeader` )->tag( `Bar` )->tag( `Bar` )', 'too-many-children'),
      'too-many-children: two children in a 0..1 aggregation are reported');
    assert(quiet('  )->ele( `Page` )->ele( `customHeader` )->tag( `Bar` )', 'too-many-children'),
      'too-many-children: …and one is not');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->tag( `Button` )', 'too-many-children'),
      'too-many-children: a 0..n aggregation takes as many as it likes');

    // excess-shut: end( ) past the root - the builder ASSERTs, so the app dumps.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->end( )->end( )->end( )->end( )', 'excess-shut'),
      'excess-shut: closing past the root is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->end( )->end( )', 'excess-shut'),
      'excess-shut: …and a chain that closes exactly what it opened is not');

    // duplicate-aggregation: the same aggregation opened twice under ONE control.
    assert(sees('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->end( )->ele( `content` )->tag( `Text` )', 'duplicate-aggregation'),
      'duplicate-aggregation: one control opening the same aggregation twice is reported');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->tag( `Button` )->end( )->ele( `footer` )->tag( `Bar` )', 'duplicate-aggregation'),
      'duplicate-aggregation: …and two DIFFERENT aggregations are not');
    assert(quiet('  )->ele( `Page` )->ele( `content` )->ele( `Panel` )->ele( `content` )->tag( `Button` )', 'duplicate-aggregation'),
      'duplicate-aggregation: …nor the same aggregation name on a NESTED control - it belongs to its own parent');

    // attribute-without-element: a( ) with nothing to attach it to. dumps.clas
    // carries the positive; this is the legal form beside it.
    assert(quiet('  )->ele( `Page` )->a( n = `title` v = `Hi` )', 'attribute-without-element'),
      'attribute-without-element: an attribute on an element that exists is not reported');

    // binding-for-event / event-for-property: two halves of one matrix - a
    // binding written into an event slot, and a handler written into a property.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `press` v = `{/NAME}` )', 'binding-for-event'),
      'binding-for-event: a {binding} on an event slot is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{/NAME}` )', 'binding-for-event'),
      'binding-for-event: …and the identical binding on a PROPERTY is not');
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `tooltip` v = client->_event( `GO` ) )', 'event-for-property'),
      'event-for-property: a handler written into a property slot is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `press` v = client->_event( `GO` ) )', 'event-for-property'),
      'event-for-property: …and the identical handler on the EVENT is not');

    // json-literal-in-attribute: UI5 reads a leading { as a binding, so a raw
    // JSON object never reaches the property.
    assert(sees('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{"a":1}` )', 'json-literal-in-attribute'),
      'json-literal-in-attribute: a raw JSON object in an attribute is reported');
    assert(quiet('  )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `{/NAME}` )', 'json-literal-in-attribute'),
      'json-literal-in-attribute: …and an ordinary binding, the shape it has to tell apart, is not');

    /* collection-bound-to-property needs the CLASS, not just the chain: the rule
     * asks the derived model whether the bound name is a table, so a bare view
     * would leave it silent for the wrong reason. */
    const bound = (member, name) => `CLASS zcl_neg DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA name TYPE string.
      DATA tab TYPE STANDARD TABLE OF string WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_neg IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\`     v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`Page\`
            )->ele( \`Table\`
              )->a( n = \`${member}\` v = client->_bind( ${name} ) ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
    assert(only(bound('headerText', 'tab'), 'collection-bound-to-property').length === 1,
      'collection-bound-to-property: a table bound to a scalar property is reported');
    assert(only(bound('headerText', 'name'), 'collection-bound-to-property').length === 0,
      'collection-bound-to-property: …and a scalar bound to the same property is not');
    assert(only(bound('items', 'tab'), 'collection-bound-to-property').length === 0,
      'collection-bound-to-property: …nor the same table bound to the AGGREGATION it belongs in');
});

// levels left open at stringify( ) are harmless (render( ) closes the tree) -
// a note for --verbose, never a finding
section('open levels', async () => {
    const open = prepareAbap(view('  )->ele( `Page` )->tag( `Button` )'));
    assert(open.notes.some((n) => /level\(s\) left open/.test(n)),
      'open levels: an unshut tree at stringify( ) is noted');
    assert(!checkAbapSource(view('  )->ele( `Page` )->tag( `Button` )'), { render: false })
      .findings.some((x) => x.type === 'open-levels'),
      'open levels: the note never becomes a finding');
});

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
section('foreign namespace', async () => {
  assert(!foreign.findings.some((x) => x.type === 'unknown-aggregation'),
    'foreign namespace: html:iframe is left alone, not read as an aggregation of Panel');
});

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
  client->view_display( view->stringify( ) ).
`, { render: false, distribution: 'sapui5' });
section('opaque control', async () => {
  assert(!opaqueOwner.findings.some((x) => x.type === 'unknown-aggregation'),
    `opaque control: vos belongs to vbm:AnalyticMap, not to the Page above it (got ${
      opaqueOwner.findings.map((x) => `${x.type} ${x.control}/${x.member}`).join(', ') || 'nothing'})`);
  assert(!opaqueOwner.findings.length,
    `opaque control: nothing under an unjudgeable control is judged (${
      opaqueOwner.findings.map((x) => x.type).join(', ') || 'none'})`);
});

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
section('dotted prefix', async () => {
  assert(!dottedNs.findings.some((x) => x.type === 'undeclared-namespace'),
    `dotted prefix: xmlns:viz.data is a declaration (got ${
      dottedNs.findings.map((x) => `${x.type} ${x.member ?? ''}`).join(', ') || 'nothing'})`);
});

// positions in raw XML are just as exact as in a builder class
const xmlPos = (await checkFiles([f('badvalue.view.xml')], { render: false }))[0];
const bad = xmlPos.findings.find((x) => x.type === "invalid-property-value");
section('xml', async () => {
  assert(bad?.line === 4 && bad?.column === 15,
    `xml: the invalid value is located at 4:15 (got ${bad?.line}:${bad?.column})`);
});

const xml = by('sample.view.xml');
section('xml (2)', async () => {
  assert(xml.kind === 'xml', 'xml: raw view detected');
  assert(xml.findings.length === 0, 'xml: no property findings');
  assert(xml.renderErrors.length === 0, `xml: renders clean (${xml.renderErrors[0] || ''})`);
});


// a view that is built and never handed to the client
section('abap rules (6)', async () => {
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
});

// ---------------------------------------------------------------- config ----
section('config', async () => {
    const os = await import('node:os');
    const cp = await import('node:child_process');
    const { stripJsonc, loadConfig, applyConfig, findConfig, CONFIG_NAME } = await import('../lib/config.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');

    const dir = tempDir('a2ui5lint-');
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

    /* A comma offset is a UTF-16 CODE UNIT index. Rebuilding the string by code
     * POINT (`[...out]`) shifts every index past the first astral character, so
     * one config with an emoji anywhere in it lost an unrelated character and
     * kept the comma it was supposed to lose. Three consumers read this loader
     * (CLI, VS Code extension, the App prototype), and all three saw a
     * SyntaxError instead of a config. */
    const astral = '{ "paths": ["src/\u{1F3AF}app"], "ui5": "1.71", }';
    assert(stripJsonc(astral) === '{ "paths": ["src/\u{1F3AF}app"], "ui5": "1.71" }',
      `config: stripJsonc drops the right comma past a non-BMP character (got ${stripJsonc(astral)})`);
    assert(JSON.parse(stripJsonc(astral)).paths[0] === 'src/\u{1F3AF}app',
      'config: a config carrying an emoji still parses, path intact');
    // two of them, so the drift is measured beyond a single 2-unit shift
    const astral2 = '{ "a": ["\u{1F3AF}", "\u{1F600}"], "b": [1, ], }';
    assert(JSON.stringify(JSON.parse(stripJsonc(astral2))) === '{"a":["\u{1F3AF}","\u{1F600}"],"b":[1]}',
      'config: several non-BMP characters do not shift the comma offsets');

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

    // ignore: repo-level, and validated the same way an exclude pattern is
    fs.writeFileSync(path.join(dir, 'ign.jsonc'), '{"ignore": ["/generated/"]}');
    assert(loadConfig(path.join(dir, 'ign.jsonc')).ignore[0] === '/generated/',
      'config: ignore survives loading as a pattern list');
    fs.writeFileSync(path.join(dir, 'ignbad.jsonc'), '{"ignore": ["[unclosed"]}');
    let ignThrew = '';
    try { loadConfig(path.join(dir, 'ignbad.jsonc')); } catch (e) { ignThrew = e.message; }
    assert(/ignore pattern '\[unclosed' is not a valid regex/.test(ignThrew),
      'config: an uncompilable ignore pattern fails loudly instead of suppressing nothing');
    fs.writeFileSync(path.join(dir, 'ignstr.jsonc'), '{"ignore": "generated"}');
    let ignType = '';
    try { loadConfig(path.join(dir, 'ignstr.jsonc')); } catch (e) { ignType = e.message; }
    assert(/'ignore' must be an array/.test(ignType), 'config: ignore must be a list, not a single string');

    let threw = '';
    fs.writeFileSync(path.join(dir, 'bad.jsonc'), '{"tpyo": 1}');
    try { loadConfig(path.join(dir, 'bad.jsonc')); }
    catch (e) { threw = e.message; }
    assert(/unknown key 'tpyo'/.test(threw), 'config: an unknown key fails loudly');

    fs.writeFileSync(path.join(dir, 'cachebad.jsonc'), '{"cache": "yes"}');
    let cacheType = '';
    try { loadConfig(path.join(dir, 'cachebad.jsonc')); } catch (e) { cacheType = e.message; }
    assert(/'cache' must be true or false/.test(cacheType), 'config: cache must be a boolean');
    fs.writeFileSync(path.join(dir, 'cacheok.jsonc'), '{"cache": true}');
    assert(loadConfig(path.join(dir, 'cacheok.jsonc')).cache === true, 'config: cache: true survives loading');

    /* render grew an object form: { "pages": N } asks for the gate AND sizes
     * its page pool. It normalizes to render:true + renderPages, so every
     * consumer keeps reading a boolean `render`. */
    fs.writeFileSync(path.join(dir, 'rp.jsonc'), '{"render": {"pages": 2}}');
    const rp = loadConfig(path.join(dir, 'rp.jsonc'));
    assert(rp.render === true && rp.renderPages === 2,
      'config: render {pages} normalizes to render:true plus renderPages');
    for (const [text, re, what] of [
      ['{"render": {"pagez": 2}}', /render has unknown key 'pagez'/, 'an unknown key inside render fails loudly'],
      ['{"render": {"pages": 0}}', /render 'pages' must be a positive integer/, 'pages 0 is refused'],
      ['{"render": {"pages": 2.5}}', /render 'pages' must be a positive integer/, 'a fractional pages is refused'],
      ['{"render": "yes"}', /'render' must be true, false, or/, 'a string render is refused'],
      ['{"render": [4]}', /'render' must be true, false, or/, 'an array render is refused'],
    ]) {
      fs.writeFileSync(path.join(dir, 'rpbad.jsonc'), text);
      let msg = '';
      try { loadConfig(path.join(dir, 'rpbad.jsonc')); } catch (e) { msg = e.message; }
      assert(re.test(msg), `config: ${what} (got '${msg}')`);
    }

    // end-to-end: the CLI picks the config up from the checked path's directory
    // (cwd is this repo, which has no config - discovery must come from the path)
    // the successor-builder fixture, because this run must exit 0: the old
    // builder is frozen upstream and reports non-released-api on every file
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(sub, 'good.clas.abap'));
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' }; // never inherit the runner's
    const out = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap')], { encoding: 'utf8', env });
    /* The context line names the DISTRIBUTION the run assumed, and the config
     * above sets none - "SAPUI5" would be a claim nobody made, and it is the
     * line a reader checks after a sapui5-only-control hint. */
    assert(/target UI5 1\.96 \(distribution unset\)/.test(out) && /failing on hint/.test(out),
      `config: cli applies ui5/failOn from the discovered abap2ui5lint.jsonc (got ${out.split('\n').find((l) => l.includes('target')) || out})`);
    const off = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap'), '--no-config'], { encoding: 'utf8', env });
    assert(/target UI5 1\.71 \(distribution unset\)/.test(off), 'config: --no-config restores the defaults');
    const dist = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap'), '--no-config', '--distribution', 'sapui5'], { encoding: 'utf8', env });
    assert(/target SAPUI5 1\.71/.test(dist), 'config: a configured distribution is named as itself');

    // the .json spelling is discovered too (abaplint.json / abaplint.jsonc)
    const plain = path.join(dir, 'plain');
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'abap2ui5lint.json'), '{"ui5": "1.120"}');
    assert(findConfig(plain) === path.join(plain, 'abap2ui5lint.json'),
      'config: abap2ui5lint.json is discovered as well as .jsonc');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------ config (2) ----
// `extends` (a base config another one builds on) and `maxWarnings`
// (ui5lint's warning cap)
section('config (2)', async () => {
    const cp = await import('node:child_process');
    const { loadConfig } = await import('../lib/config.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const dir = tempDir('a2ui5-ext-');

    // --- extends: base + child, child wins per key, rules merge per id -------
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shared', 'base.jsonc'), JSON.stringify({
      ui5: '1.96', failOn: 'hint', paths: ['src'], baseline: 'base-baseline.json',
      rules: { 'missing-accessibility': false, 'member-deprecated': 'hint' },
    }));
    fs.writeFileSync(path.join(dir, 'child.jsonc'), JSON.stringify({
      extends: './shared/base.jsonc', failOn: 'error',
      rules: { 'member-deprecated': 'warning' },
    }));
    const merged = loadConfig(path.join(dir, 'child.jsonc'));
    assert(merged.minUi5 === '1.96', 'extends: a key only the base sets survives');
    assert(merged.failOn === 'error', 'extends: the extending file wins per key');
    assert(merged.rules['missing-accessibility'] === false && merged.rules['member-deprecated'] === 'warning',
      'extends: the rules blocks merge per rule id, the child entry winning');
    assert(merged.extends === undefined, 'extends: the pointer itself does not survive the merge');
    // the base's path-carrying keys stay anchored at the BASE file
    assert(merged.paths[0] === path.join(dir, 'shared', 'src'),
      `extends: the base's relative paths resolve against the base file (got ${merged.paths[0]})`);
    assert(merged.baseline === path.join(dir, 'shared', 'base-baseline.json'),
      'extends: the base\'s baseline resolves against the base file too');

    // a chain follows; a cycle refuses instead of recursing forever
    fs.writeFileSync(path.join(dir, 'grand.jsonc'), JSON.stringify({ extends: './child.jsonc', ui5: '1.120' }));
    assert(loadConfig(path.join(dir, 'grand.jsonc')).minUi5 === '1.120'
      && loadConfig(path.join(dir, 'grand.jsonc')).failOn === 'error',
    'extends: a chain of three merges near-to-far');
    fs.writeFileSync(path.join(dir, 'a.jsonc'), '{"extends": "./b.jsonc"}');
    fs.writeFileSync(path.join(dir, 'b.jsonc'), '{"extends": "./a.jsonc"}');
    let cycle = '';
    try { loadConfig(path.join(dir, 'a.jsonc')); } catch (e) { cycle = e.message; }
    assert(/'extends' cycle/.test(cycle), `extends: a cycle is refused loudly (${cycle})`);
    fs.writeFileSync(path.join(dir, 'selfie.jsonc'), '{"extends": "./selfie.jsonc"}');
    try { loadConfig(path.join(dir, 'selfie.jsonc')); cycle = ''; } catch (e) { cycle = e.message; }
    assert(/'extends' cycle/.test(cycle), 'extends: a self-extend is the shortest cycle');
    fs.writeFileSync(path.join(dir, 'dangling.jsonc'), '{"extends": "./nowhere.jsonc"}');
    let missing = '';
    try { loadConfig(path.join(dir, 'dangling.jsonc')); } catch (e) { missing = e.message; }
    assert(/no such file/.test(missing), 'extends: a missing base fails with the config loader\'s own message');
    fs.writeFileSync(path.join(dir, 'extbad.jsonc'), '{"extends": 42}');
    let bad = '';
    try { loadConfig(path.join(dir, 'extbad.jsonc')); } catch (e) { bad = e.message; }
    assert(/'extends' must be a path/.test(bad), 'extends: a non-string is refused');

    // --- maxWarnings ----------------------------------------------------------
    fs.writeFileSync(path.join(dir, 'mw.jsonc'), '{"maxWarnings": 3}');
    assert(loadConfig(path.join(dir, 'mw.jsonc')).maxWarnings === 3, 'maxWarnings: survives loading');
    for (const bad2 of ['{"maxWarnings": -1}', '{"maxWarnings": 1.5}', '{"maxWarnings": "3"}']) {
      fs.writeFileSync(path.join(dir, 'mwbad.jsonc'), bad2);
      let msg = '';
      try { loadConfig(path.join(dir, 'mwbad.jsonc')); } catch (e) { msg = e.message; }
      assert(/'maxWarnings' must be a non-negative integer/.test(msg),
        `maxWarnings: ${bad2} is refused`);
    }

    // the flag: post171 yields 2 warnings and 0 errors, so --fail-on error
    // passes until the cap says otherwise
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
    const run = (args) => {
      try { cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env }); return 0; }
      catch (e) { return e.status; }
    };
    const P = [f('post171.clas.abap'), '--no-render', '--no-config', '--fail-on', 'error'];
    assert(run(P) === 0, 'maxWarnings: without the cap, warnings do not fail a --fail-on error run');
    assert(run([...P, '--max-warnings', '2']) === 0, 'maxWarnings: at the cap the run still passes');
    assert(run([...P, '--max-warnings', '1']) === 1, 'maxWarnings: one over the cap fails the run');
    assert(run([...P, '--max-warnings', 'lots']) === 2, 'maxWarnings: a non-integer value is bad usage');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------------------- cache ----
// the opt-in cross-run result cache (--cache): a hit skips both gates and
// replays the stored findings; anything relevant moving is a miss
section('cache', async () => {
    const cp = await import('node:child_process');
    const { CACHE_VERSION, DEFAULT_CACHE_FILE, cacheContext, loadCache, saveCache, hashOf } = await import('../lib/cache.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const dir = tempDir('a2ui5-cache-');
    const app = path.join(dir, 'app.clas.abap');
    fs.copyFileSync(f('broken.clas.abap'), app);
    const cacheFile = path.join(dir, DEFAULT_CACHE_FILE);
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
    const run = (args) => {
      try {
        return { out: cp.execFileSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env }), code: 0 };
      } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
    };
    const BASE = ['app.clas.abap', '--no-render', '--no-config', '--cache', '--json'];

    const first = run(BASE);
    assert(fs.existsSync(cacheFile), 'cache: --cache writes the cache file');
    const firstDoc = JSON.parse(first.out);
    assert(firstDoc.problems > 0 && first.code === 1, 'cache: the first (cold) run still reports and fails normally');

    /* The HIT is proven by tampering: rewrite the stored findings and see the
     * next run replay them - a run that recomputed would report the defects
     * the file still carries. */
    const store = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const key = Object.keys(store.files)[0];
    assert(store.version === CACHE_VERSION && store.files[key].hash === hashOf(fs.readFileSync(app, 'utf8')),
      'cache: an entry is keyed by the file content hash');
    store.files[key].result.findings = [];
    fs.writeFileSync(cacheFile, JSON.stringify(store));
    const replayed = run(BASE);
    assert(JSON.parse(replayed.out).problems === 0 && replayed.code === 0,
      'cache: a hit replays the stored findings instead of re-running the gates');

    // miss on CONTENT change: the same tampered entry no longer matches
    fs.appendFileSync(app, '\n* changed\n');
    const contentMiss = run(BASE);
    assert(JSON.parse(contentMiss.out).problems === firstDoc.problems && contentMiss.code === 1,
      'cache: a changed file misses and is recomputed');

    // miss on CONFIG change: same content, but a setting that changes verdicts
    const store2 = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    store2.files[Object.keys(store2.files)[0]].result.findings = [];
    fs.writeFileSync(cacheFile, JSON.stringify(store2));
    const configMiss = run([...BASE, '--ui5', '1.120']);
    assert(JSON.parse(configMiss.out).problems > 0,
      'cache: a changed setting drops the whole cache and recomputes');
    assert(cacheContext({ version: '1', snapshot: '1.151.0', options: { minUi5: '1.71' } })
      !== cacheContext({ version: '1', snapshot: '1.151.0', options: { minUi5: '1.120' } }),
      'cache: the context hash moves with the settings');
    assert(cacheContext({ version: '1', snapshot: '1.151.0', options: { rules: { 'unknown-control': false } } })
      !== cacheContext({ version: '1', snapshot: '1.151.0', options: {} }),
      'cache: the rules block is part of the context');

    // a corrupt cache file is an empty cache, never an error
    fs.writeFileSync(cacheFile, 'not json {');
    const corrupt = run(BASE);
    assert(JSON.parse(corrupt.out).problems === firstDoc.problems && corrupt.code === 1,
      'cache: a corrupt cache file is tolerated and the run recomputes');
    const rewritten = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert(rewritten.version === CACHE_VERSION, 'cache: the corrupt file is replaced by a valid one');
    assert(Object.keys(loadCache(cacheFile, 'wrong-context')).length === 0,
      'cache: another context reads as empty');
    saveCache(cacheFile, 'ctx', { a: { hash: 'h', result: {} } });
    assert(loadCache(cacheFile, 'ctx').a.hash === 'h', 'cache: save/load round-trips');

    /* An entry that parses but carries no usable result (result: null - a
     * truncated write, a hand-edit) is a MISS, never a crash: the cache is
     * expendable by contract, so nothing read from it has a trusted shape. */
    fs.rmSync(cacheFile, { force: true });
    run(BASE);
    const mangled = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const k of Object.keys(mangled.files)) mangled.files[k].result = null;
    fs.writeFileSync(cacheFile, JSON.stringify(mangled));
    const nulled = run(BASE);
    assert(JSON.parse(nulled.out).problems === firstDoc.problems && nulled.code === 1,
      'cache: a null result entry is a miss and the run recomputes');
    const healed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert(Object.values(healed.files).every((e) => e.result && Array.isArray(e.result.findings)),
      'cache: the recompute replaces the unusable entry');

    /* --fix rewrites the file, so its stale entry can never match again: the
     * fixed run reports the post-fix state, not a replay of the pre-fix one. */
    const fixable = path.join(dir, 'fixable.clas.abap');
    fs.copyFileSync(f('abaprules.clas.abap'), fixable);
    fs.rmSync(cacheFile, { force: true });
    const preFix = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--json']);
    assert(/obsolete-binder/.test(preFix.out), 'cache: the fixable finding is cached first');
    const postFix = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--fix', '--json']);
    assert(!/"type":"obsolete-binder"/.test(postFix.out),
      'cache: a --fix run does not replay the pre-fix findings of the file it modified');
    const after = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--json']);
    assert(!/"type":"obsolete-binder"/.test(after.out),
      'cache: the run after the fix caches the post-fix state');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------------------- rules ----
// per-rule off / severity / exclude, the abaplint-shaped `rules` block
section('rules block', async () => {
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

    const dir = tempDir('a2ui5rules-');
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

    /* A config that is not there was named by hand: `findConfig` only returns a
     * file it has already seen, so `loadConfig` is only ever handed a missing
     * path by `--config`. It used to rethrow node's own text — an errno and a
     * syscall at somebody who mistyped a path. */
    const failed = (p) => { try { loadConfig(p); return ''; } catch (e) { return e.message; } };
    const gone = failed(path.join(dir, 'nope.jsonc'));
    assert(/no such file/.test(gone) && /--config/.test(gone),
      `config: a missing --config path says so and names the flag (got ${JSON.stringify(gone)})`);
    assert(!/ENOENT|syscall/.test(gone),
      `config: and does not hand node's errno to the reader (got ${JSON.stringify(gone)})`);
    const isDir = failed(dir);
    assert(/is a directory/.test(isDir) && !/EISDIR/.test(isDir),
      `config: --config pointed at a directory says that, not EISDIR (got ${JSON.stringify(isDir)})`);

    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------ directives ----
// " abap2ui5lint-disable-next-line <rule>, -disable-line, -disable/-enable
section('directives', async () => {
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
});

// -------------------------------------------------------------- new rules ----
// display-root-mismatch, binding-type-mismatch, event-arg-out-of-range
section('display-root-mismatch', async () => {
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

    /* The `arg` shorthand counts toward the arity. abap2UI5's client folds
     * `arg = x` into the same string_table as `t_arg = VALUE #( ( x ) )`, so a
     * wire spelling its one argument that way sends one - reading the t_arg
     * region alone made every such wire look like it sent nothing, which was
     * 187 false positives in 125 files the day the samples-controls corpus
     * adopted the shorthand. */
    /* checkAbapRules, not checkAbapSource: a snippet without a builder chain
     * never reaches the ABAP rules at all - the same trap the abap rules (2)
     * section documents, and the reason these assertions would otherwise be
     * green for the wrong reason. */
    const { checkAbapRules: argRules } = await import('./observe.mjs');
    const argEvent = (raise, read) => argRules(`CLASS x IMPLEMENTATION.
    METHOD view.
      ${raise}
    ENDMETHOD.
    METHOD on_event.
      CASE client->get( )-event.
        WHEN \`PICK\`.
          DATA(v) = client->get_event_arg( ${read} ).
      ENDCASE.
    ENDMETHOD.
    ENDCLASS.`).filter((x) => x.type === 'event-arg-out-of-range');

    assert(argEvent('client->_event( val = `PICK` arg = `${$source>/key}` ).', '1').length === 0,
      'event-arg-out-of-range: arg = counts as one argument, so reading 1 is in range');
    assert(argEvent('client->_event( val = `PICK` arg = `${$source>/key}` ).', '2').length === 1,
      'event-arg-out-of-range: reading past a single arg = is still reported');
    assert(argEvent('client->_event( val = `PICK` t_arg = VALUE #( ( `${a}` ) ) arg = `${b}` ).', '2').length === 0,
      'event-arg-out-of-range: arg appends behind t_arg, so the two compose to arity 2');
    assert(argEvent('client->_event( val = `PICK` arg = lv_key ).', '1').length === 0,
      'event-arg-out-of-range: a non-literal arg is still one argument, not a skipped one');
    assert(argEvent('client->_event( val = `PICK` ).', '1').length === 1,
      'event-arg-out-of-range: an event that really sends nothing is unaffected');

    /* and the unresolved-brace rule keeps its coverage across the shorthand -
     * a bare {COL} arrives empty whichever parameter carried it */
    const argBrace = argRules('CLASS x IMPLEMENTATION. METHOD view.'
      + ' client->_event( val = `PICK` arg = `{COL}` ). ENDMETHOD. ENDCLASS.')
      .filter((x) => x.type === 'event-arg-unresolved');
    assert(argBrace.length === 1 && argBrace[0].value === '{COL}',
      `event-arg-unresolved: a bare brace in arg = is reported like one in t_arg (got ${argBrace.length})`);

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

    // --- the inverse: a setter no binding can carry, issued off the display path
    const rebuild = checkAbapSource(fs.readFileSync(f('rebuildstate.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'control-state-lost-on-rebuild');
    const rebuiltAt = (id, m) => rebuild.find((x) => x.value === id && x.member === m);
    assert(rebuild.length === 2,
      `control-state-lost-on-rebuild: two wires survive no rebuild (got ${rebuild.map((x) => `${x.value}.${x.member}`).join() || 'none'})`);
    assert(rebuiltAt('objectPage', 'setSelectedSection')?.control === 'sap.uxap.ObjectPageLayout',
      'control-state-lost-on-rebuild: an ASSOCIATION cannot be bound, so re-issuing is the only remedy');
    assert(rebuiltAt('badged', 'setBadgeMinValue')?.control === 'sap.m.Button',
      'control-state-lost-on-rebuild: a method that is no member at all (Button keeps the badge bounds in private fields)');
    assert(!rebuild.some((x) => x.member === 'setNextStep'),
      'control-state-lost-on-rebuild: the same id+setter re-issued from view_display( ) is silent');
    assert(!rebuild.some((x) => x.member === 'setActivePage'),
      'control-state-lost-on-rebuild: a helper view_display( ) calls is ON the display path');
    assert(!rebuild.some((x) => x.member === 'setExpanded'),
      'control-state-lost-on-rebuild: a bindable property belongs to settable-property-via-action');
    assert(!rebuild.some((x) => x.member === 'setCurrentStep'),
      'control-state-lost-on-rebuild: a LITERAL value carries no class state for the rebuild to contradict');
    assert(!rebuild.some((x) => x.member === 'focus'),
      'control-state-lost-on-rebuild: only a set…( ) is judged');
    const setterFixture = checkAbapSource(fs.readFileSync(f('setters.clas.abap'), 'utf8'))
      .findings.filter((x) => x.type === 'control-state-lost-on-rebuild');
    assert(setterFixture.length === 0,
      `control-state-lost-on-rebuild: the sibling rule's fixture sets only CONSTANTS (got ${setterFixture.length})`);

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
    const at = (control, member) => orphan.filter((x) => x.control === control && x.member === member)
      .map((x) => x.value).sort().join();
    assert(at('sap.m.Text', 'text') === 'NAME',
      `relative-binding-without-context: the contextless root field is reported (got ${at('sap.m.Text', 'text') || 'none'})`);
    /* The four shapes a PROPERTY binding takes. Only the first was judged until
     * samples-controls app 592 shipped 42 dead address bindings in the second:
     * `{STREET} {HOUSENUMBER}` is two relative paths in one attribute, and the
     * anchored ^{NAME}$ matcher the rule started on could see neither. */
    assert(at('sap.m.Title', 'text') === 'NAME,SUPPLIER',
      `relative-binding-without-context: a COMPOSITE binding is reported once per path - app 592's literal shape (got ${at('sap.m.Title', 'text') || 'none'})`);
    assert(at('sap.m.ObjectNumber', 'number') === 'PRICE',
      `relative-binding-without-context: the COMPLEX form on a property, which only the aggregation branch used to match (got ${at('sap.m.ObjectNumber', 'number') || 'none'})`);
    assert(at('sap.m.ObjectStatus', 'text') === 'STATUS',
      `relative-binding-without-context: an EXPRESSION binding resolves its embedded paths against the same missing context (got ${at('sap.m.ObjectStatus', 'text') || 'none'})`);
    assert(at('sap.m.Label', 'text') === 'NOSUCHFIELD',
      `relative-binding-without-context: a relative name the model root does not have is dead too - it used to fall between this rule and unknown-binding-path, whose relative arm needs a context to check against (got ${at('sap.m.Label', 'text') || 'none'})`);
    assert(!orphan.some((x) => x.control === 'sap.ui.table.RowSettings'),
      'relative-binding-without-context: a per-row template aggregation is not only `template` - rowSettingsTemplate is cloned per row the same way');
    assert(!orphan.some((x) => x.control === 'sap.m.Text' && x.value === 'PRODUCTID'),
      'relative-binding-without-context: a `binding` attribute IS a context - XMLTemplateProcessor hands it to bindObject( ), the declarative cs_event-bind_element');
    assert(!orphan.some((x) => ['0', '1'].includes(String(x.value)) || String(x.value).includes('device')),
      'relative-binding-without-context: a message placeholder and a named model are neither of them a relative path');
    assert(orphan.length === 6,
      `relative-binding-without-context: nothing else in the fixture is reported (got ${orphan.map((x) => `${x.control}.${x.member}=${x.value}`).join(' ') || 'none'})`);
    assert(!checkAbapSource(fs.readFileSync(f('rowpaths.clas.abap'), 'utf8'))
      .findings.some((x) => x.type === 'relative-binding-without-context'),
      'relative-binding-without-context: a relative binding inside a bound aggregation is not judged');

    /* The same promise across a FOREIGN namespace. abap2UI5's own controls
     * (z2ui5.cc) are in no UI5 snapshot, and the walk declines to look into a
     * non-`sap.` namespace at all - it used to hand the children nothing, so a
     * bound custom control's row template was judged contextless and both of
     * its attributes reported (abap2UI5/samples app 306). Every one of these
     * controls extends a real one: CameraSelector extends sap.m.ComboBox and
     * inherits its `items`. */
    {
      const foreign = `CLASS x DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA devices TYPE string_table.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->a( n = \`xmlns:core\` v = \`sap.ui.core\`
          )->a( n = \`xmlns:z2ui5\` v = \`z2ui5.cc\`
          )->ele( n = \`CameraSelector\` ns = \`z2ui5\`
              )->a( n = \`items\` v = \`{path:'/DEVICES'}\`
              )->tag( n = \`Item\` ns = \`core\`
                  )->a( n = \`key\` v = \`{KEY}\`
                  )->a( n = \`text\` v = \`{TEXT}\` ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
      const rows = checkAbapSource(foreign).findings
        .filter((x) => x.type === 'relative-binding-without-context');
      assert(rows.length === 0,
        `relative-binding-without-context: a bound control in a foreign namespace still makes its children rows (got ${rows.map((x) => `${x.member}=${x.value}`).join(' ') || 'none'})`);

      /* …and the widening is not "a foreign tag silences the rule". With no
       * binding on it there is no row context, and the children are reported
       * exactly as before. */
      const unbound = checkAbapSource(foreign.replace("v = \`{path:'/DEVICES'}\`", 'v = \`plain\`')).findings
        .filter((x) => x.type === 'relative-binding-without-context');
      assert(unbound.length === 2,
        `relative-binding-without-context: an UNBOUND foreign control opens no context, so its children are still judged (got ${unbound.length})`);
    }
    {
      const agg = checkAbapSource(fs.readFileSync(f('orphanbind.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'relative-aggregation-without-context');
      assert(agg.length === 1 && agg[0].value === 'T_ROWS',
        `relative-aggregation-without-context: only the root-level one is reported (got ${agg.map((x) => x.value).join() || 'none'})`);
      assert(!checkAbapSource(fs.readFileSync(f('rowpaths.clas.abap'), 'utf8'))
        .findings.some((x) => x.type === 'relative-aggregation-without-context'),
        'relative-aggregation-without-context: a relative aggregation inside a row template is the normal form');
      assert(!agg.some((x) => String(x.value).includes('message')),
        'relative-aggregation-without-context: a named model prefix is stripped before asking whether the path is absolute - `message>/` is not relative');
      assert(!agg.some((x) => String(x.value) === 'T_CHILDREN'),
        'relative-aggregation-without-context: an aggregation whose value the reconstructor could not resolve still makes its children a row template - the blind spot is not a defect');

      const bound = checkAbapSource(fs.readFileSync(f('elementbind.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'relative-aggregation-without-context');
      assert(bound.length === 0,
        `relative-aggregation-without-context: cs_event-bind_element sets a context on a whole slot at runtime, so nothing in the class is contextless (got ${bound.map((x) => x.value).join() || 'none'})`);
      assert(checkAbapSource(fs.readFileSync(f('elementbind.clas.abap'), 'utf8').replace('cs_event-bind_element', 'cs_event-popup_close'))
        .findings.some((x) => x.type === 'relative-aggregation-without-context'),
        'relative-aggregation-without-context: the same fixture without the element bind IS reported - the suppression is the bind, not the shape');

      /* The wire binds ONE slot. Asked of the whole CLASS, a single popup wire
       * disarmed the check for every document including the main slot that was
       * never element-bound - one popup wire silencing a whole port. */
      const slot = checkAbapSource(fs.readFileSync(f('slotbind.clas.abap'), 'utf8')).findings;
      assert(slot.filter((x) => x.type.startsWith('relative-')).length === 2
        && slot.some((x) => x.type === 'relative-binding-without-context' && x.value === 'HEADLINE')
        && slot.some((x) => x.type === 'relative-aggregation-without-context' && x.value === 'T_PRODUCT'),
        `bind_element scopes to the slot it names: the MAIN document is still judged (got ${slot.map((x) => `${x.type}=${x.value}`).join(' ') || 'none'})`);
      assert(!slot.some((x) => ['NAME', 'T_ITEM'].includes(String(x.value))),
        'bind_element: the POPUP document it does name is suppressed, relative paths and all');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element view = client->cs_view-nested ).').slots.has('NEST'),
        'bind_element: the cs_view constant NAME is not its value - cs_view-nested is NEST');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element t_arg = VALUE #( ( `0` ) ) ).').slots.has('MAIN'),
        'bind_element: with no view parameter the ABAP DEFAULT applies, and it is cs_view-main');
      assert(elementBoundSlots('client->follow_up_action( val = client->cs_event-bind_element view = lv_slot ).').all,
        'bind_element: a slot that is not a literal could be any of them, so it suppresses everywhere - a wrong second guess is worse than silence');
      assert(!elementBoundSlots('" client->follow_up_action( val = client->cs_event-bind_element )').slots.size,
        'bind_element: a wire in a COMMENT is not a wire');
    }

    // --- an attribute the reconstructor could not resolve is still versioned --
    // A COND #( ) value is dropped from the document rather than invented, so
    // the member used to be invisible to every version rule. app 454 hid a
    // UI5 >= 1.117 floor behind exactly this and view-gates reported pass.
    {
      const cond = checkAbapSource(fs.readFileSync(f('condattr.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'member-too-new' && x.member === 'initialFocus');
      assert(cond.length === 1 && cond[0].since === '1.117.0',
        `member-too-new: a COND-valued attribute is still judged for its version (got ${cond.map((x) => x.since).join() || 'none'})`);
    }

    // --- a member with no own @since inherits its DECLARING class's version ---
    // sap.f.cards.BaseHeader is @1.86 and its `press` carries no member-level
    // @since, so the walk used to stop at "base version" and pass a press on the
    // @1.64 sap.f.cards.Header at a 1.71 floor. A member cannot predate the class
    // that declares it.
    {
      const inh = checkAbapSource(fs.readFileSync(f('inheritedsince.clas.abap'), 'utf8'))
        .findings.filter((x) => x.type === 'member-too-new' && x.member === 'press');
      assert(inh.length === 1 && inh[0].since === '1.86',
        `member-too-new: press inherits BaseHeader's 1.86 (got ${inh.map((x) => x.since).join() || 'none'})`);
    }

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

    /* literal-view-slot: the same wire one keystroke EARLIER. A correct
     * literal is not an error and is not nothing either - it is the spelling
     * the compiler cannot check, and `NESTED` above is what happens next. */
    {
      const litSrc = `
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->tag( \`Table\` )->a( n = \`id\` v = \`tbl\` ).
      client->follow_up_action( val = client->cs_event-control_by_id view = \`NEST\` t_arg = VALUE #( ( \`tbl\` ) ( \`focus\` ) ) ).
      client->view_display( v->stringify( ) ).`;
      const lit = checkAbapRules(litSrc);
      const slot = lit.find((x) => x.type === 'literal-view-slot');
      assert(slot && slot.value === 'NEST',
        `literal-view-slot: a correct slot written as a literal is reported (got ${lit.map((x) => x.type).join(', ') || 'nothing'})`);
      assert(severityOf(slot) === 'hint',
        `literal-view-slot: a hint - the wire works, it is only unchecked (got ${severityOf(slot)})`);
      assert(!lit.some((x) => x.type === 'unknown-view-slot'),
        'literal-view-slot: a valid slot is never ALSO reported as unknown');
      // …and the wrong literal stays the error it was, without a second
      // finding telling its author to write a constant they got wrong anyway
      assert(!act('client->_event_client( val = client->cs_event-control_by_id view = `NESTED` t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
        .some((x) => x.type === 'literal-view-slot'),
        'literal-view-slot: an unknown slot is one finding, not two');

      // the fix is the point of the rule: an exact substitution, and what it
      // produces has to be the CONSTANT for that value - NEST is cs_view-nested
      const { applyFixes } = await import('../lib/fix.mjs');
      const fixed = applyFixes(litSrc, lit).output;
      assert(/view = client->cs_view-nested\b/.test(fixed) && !/view = `NEST`/.test(fixed),
        `literal-view-slot: --fix writes the constant carrying that value (got ${fixed.split('\n').find((l) => l.includes('control_by_id'))})`);
      assert(!checkAbapRules(fixed).some((x) => x.type === 'literal-view-slot' || x.type === 'unknown-view-slot'),
        'literal-view-slot: the fixed source is clean - the fix does not trade one finding for another');

      // both t_arg carriers too: SET_SIZE_LIMIT's view key and the shortcut
      // scope sit inside a VALUE #( ) row, where the constant is just as valid
      const sizeLit = act('client->follow_up_action( val = client->cs_event-set_size_limit t_arg = VALUE #( ( `200` ) ( `MAIN` ) ) ).');
      assert(sizeLit.some((x) => x.type === 'literal-view-slot' && x.value === 'MAIN'),
        'literal-view-slot: SET_SIZE_LIMIT\'s view key is offered the constant as well');
      assert(act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `POPUP` ) ) ). client->check_on_event( `SAVE` ).')
        .some((x) => x.type === 'literal-view-slot' && x.value === 'POPUP'),
        'literal-view-slot: a shortcut scope that IS a slot is offered it too');
      // a scope that is a control id stays a control id — only an exact slot
      // value is judged, so `tbl` is not read as a mis-cased slot
      assert(!act('client->follow_up_action( val = client->cs_event-keyboard_shortcut t_arg = VALUE #( ( `Ctrl+S` ) ( `SAVE` ) ( `tbl` ) ) ). client->check_on_event( `SAVE` ).')
        .some((x) => x.type === 'literal-view-slot'),
        'literal-view-slot: a control id used as a scope is not a slot');
      // the constant form is what the rule ASKS for, so it must never fire on it
      assert(!act('client->follow_up_action( val = client->cs_event-control_by_id view = client->cs_view-nested t_arg = VALUE #( ( `tbl` ) ( `focus` ) ) ).')
        .some((x) => x.type === 'literal-view-slot' || x.type === 'unknown-view-slot'),
        'literal-view-slot: the constant itself is the answer, never the finding');
    }

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
    {
      const { checkAbapRules } = await import('./observe.mjs');
      const withEnum = (src) => checkAbapRules(src, { enumFields: new Map([['T_APPOINTMENTS', new Set(['TYPE'])]]) });
      const hit = (src) => withEnum(src).some((x) => x.type === 'enum-field-unset-on-insert' && x.member === 'TYPE');
      assert(hit('INSERT VALUE #( title = `New` start_at = s ) INTO TABLE t_appointments.'),
        'enum-field-unset-on-insert: a row built without the enum-fed field ships "" and throws');
      assert(!withEnum('INSERT VALUE #( title = `New` type = `None` start_at = s ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: seeding the default is the repair');
      assert(!withEnum('DATA(p) = VALUE #( ( `TYPE` ) ).\nclient->_bind( val = t omit_initial_paths = VALUE #( ( `TYPE` ) ) ).\nINSERT VALUE #( title = `New` ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: omit_initial_paths is the other repair and is honoured');
      assert(!checkAbapRules('INSERT VALUE #( title = `New` ) INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: with no enum-bound field in the view there is nothing to report');

      /* The three construction sites, each of which the corpus sweep of
       * 2026-08-26 found the rule blind to. `INSERT VALUE #( )` was the only one
       * judged; the model_init seed hid three defects and the work area two. */
      assert(hit('t_appointments = VALUE #( ( title = `A` type = `Type01` )\n( title = `B` ) ).'),
        'enum-field-unset-on-insert: the model_init table seed is a row-build site too - it was the dominant one');
      assert(hit('<person>-t_appointments = VALUE #( ( title = `B` ) ).'),
        'enum-field-unset-on-insert: the seed of a NESTED table, written through a field symbol');
      assert(hit('DATA(appt) = VALUE ty_s_appointment( title = `B` ).\nINSERT appt INTO TABLE t_appointments.'),
        'enum-field-unset-on-insert: a row assembled in a work area is the same row');
      assert(hit('APPEND VALUE #( title = `B` ) TO <person>-t_appointments.'),
        'enum-field-unset-on-insert: APPEND into a nested table resolves to the aggregation path, not to a key that does not exist');
      assert(!withEnum('DATA(appt) = VALUE ty_s_appointment( title = `B` ).\nappt-type = `Type01`.\nINSERT appt INTO TABLE t_appointments.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a work-area field filled after the constructor is set');

      /* …and the four shapes that are NOT it. Every one of them is a real port
       * in samples-controls that the widened rule reported before these guards. */
      assert(!withEnum('t_appointments = VALUE #( type = `Type01` ( title = `A` ) ( title = `B` ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a component set ONCE before the rows is ABAP\'s per-table default and every row carries it (app 407)');
      assert(!withEnum('t_appointments = VALUE #( FOR row IN t_all WHERE ( name = x ) ( row ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a comprehension copies a whole row - there is no field list to read (app 505)');
      assert(!withEnum('t_appointments = VALUE #( ( title = `A` ) ).\nLOOP AT t_appointments REFERENCE INTO DATA(r).\nr->type = `Type01`.\nENDLOOP.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a seed a LOOP completes afterwards is not a row built without the field (apps 009/208/505)');
      assert(!withEnum('t_appointments = VALUE #( ( title = `A` ) ).\nt_appointments[ 1 ]-type = `Type01`.')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a component written through a table expression counts as set (app 549)');
      assert(!withEnum('t_others = VALUE #( ( title = `A` ) ).')
        .some((x) => x.type === 'enum-field-unset-on-insert'),
        'enum-field-unset-on-insert: a seed of a table the view does not bind that way is not judged against it');
    }

    /* The VIEW half, end to end: which table each enum-fed field belongs to.
     *
     * The fixture is the shape of the seven ports the 2026-08-26 corpus sweep
     * had to fix by hand. A PlanningCalendar binds THREE tables - `rows`,
     * `specialDates`, and the `appointments` NESTED one row deeper - and only
     * the innermost template carries `ariaHasPopup`. Before this the rule saw
     * one absolute path and pooled every enum field below it, so the seed of
     * `t_special` was reported for an ARIA it has no business carrying, and the
     * nested `T_APPOINTMENTS` resolved to no key at all.
     */
    {
      const src = fs.readFileSync(f('enumseed.clas.abap'), 'utf8');
      const seeds = (text) => checkAbapSource(text).findings
        .filter((x) => x.type === 'enum-field-unset-on-insert');
      assert(seeds(src).length === 0,
        `enum-field-unset-on-insert: the fixture as written is CORRECT - every row carries its enum seed (got ${seeds(src).map((x) => `${x.member}@${x.line}`).join() || 'none'})`);
      /* Each repair removed on its own. A rule that fires once for a class
       * proves nothing about the site the fix was written at - and every one of
       * these is a shape the rule was blind to before 2026-08. */
      const site = (find, repl, member, why) => {
        const broken = src.replace(find, repl);
        assert(broken !== src, `enum-field-unset-on-insert fixture: the seed "${why}" is there to remove`);
        const got = seeds(broken);
        assert(got.some((x) => x.member === member), `enum-field-unset-on-insert: ${why} (got ${got.map((x) => x.member).join() || 'none'})`);
      };
      site('type = `Type06` aria = `None`', 'type = `Type06`', 'ARIA',
        'the model_init seed of a NESTED table is judged row by row (apps 531/536/538)');
      site('type     = `Type09`\n                    aria     = `None`', 'type     = `Type09`', 'ARIA',
        'an INSERT into <fs>-t_appointments resolves through the RELATIVE aggregation path (apps 108/547)');
      site('type     = `Type09`\n                                                aria     = `None`', 'type     = `Type09`', 'ARIA',
        'a row assembled in a work area is judged where it is built (apps 537/538)');
      site('type = `NonWorking`', 'title = `NonWorking`', 'TYPE',
        'the sibling `specialDates` template keeps its OWN field - T_SPECIAL is judged for TYPE, never for the ARIA two levels below it');
      site('lr_product->weightstate =', 'lr_product->weight =', 'WEIGHTSTATE',
        'a second table in the same view is judged against its own template once nothing fills it later');
    }

    assert(act('client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `t` ) ( `expand` ) ( `$event.oSource.getSelectedItems().map(function (o) { return o.getId(); })` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: a function literal in a resolved argument loses the whole handler');
    assert(act('client->_event( val = `X` t_arg = VALUE #( ( `${x}.filter(a => a.id)` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: an arrow function fails the same way');
    assert(!act('client->follow_up_action( val = client->cs_event-control_global t_arg = VALUE #( ( `MESSAGE_TOAST` ) ( `show` ) ( `the function was called` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: the word in a quoted string argument is shipped as text, not parsed');
    assert(!act('client->_event( val = `X` t_arg = VALUE #( ( `${$parameters>/value}` ) ) ).')
      .some((x) => x.type === 'event-arg-js-callback'),
      'event-arg-js-callback: a plain resolved expression is fine');
    assert(act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[{"path":"NAME","operator":"Contains","value1":"x"}]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: the object form is dropped whole and clears the binding instead of filtering it');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: an empty payload IS the clear form and is not reported');
    assert(!act('client->follow_up_action( val = client->cs_event-binding_call t_arg = VALUE #( ( `tbl` ) ( `items` ) ( `filter` ) ( `[[["NAME","Contains","x"]]]` ) ) ).')
      .some((x) => x.type === 'filter-groups-not-arrays'),
      'filter-groups-not-arrays: the correct nested form is not reported');
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
    assert(noSource.length === 4,
      `date-type-without-source: four sourceless date bindings (got ${noSource.length})`);
    assert(noSource.map((x) => x.value).sort().join() === 'DateType,TimeType,sap.ui.model.type.Date,sap.ui.model.type.DateTime',
      `date-type-without-source: the alias, the full module name and the quoted-key spelling are all judged (got ${noSource.map((x) => x.value).sort().join()})`);
    // the two halves have to move together: a quoted 'type' with a quoted
    // 'source' is CORRECT, and teaching the rule only the first spelling would
    // turn every one of apps 017/018's date bindings into a finding
    assert(noSource.filter((x) => x.value === 'sap.ui.model.type.Date').length === 1,
      `date-type-without-source: a QUOTED source counts, so only the sourceless quoted binding is reported (got ${noSource.filter((x) => x.value === 'sap.ui.model.type.Date').length})`);
    assert(!dates.findings.some((x) => x.type === 'date-type-without-source' && x.value === 'sap.ui.model.type.Float'),
      'date-type-without-source: a non-date type never needs a source format');

    // --- a picker whose value has neither a binding type nor a valueFormat ----
    const picker = checkAbapSource(fs.readFileSync(f('pickerformat.clas.abap'), 'utf8'));
    const locale = picker.findings.filter((x) => x.type === 'picker-value-without-format');
    assert(locale.length === 3,
      `picker-value-without-format: three unformatted picker values (got ${locale.length}: ${locale.map((x) => x.value).join()})`);
    assert(locale.every((x) => x.severity === 'warning' && x.member === 'value'),
      'picker-value-without-format: a warning on the value property');
    assert(locale.map((x) => x.value).sort().join() === 'END_AT,REC_END,START_AT',
      `picker-value-without-format: the three fields the class itself authors (got ${locale.map((x) => x.value).sort().join()})`);
    assert(locale.some((x) => x.control === 'sap.m.DateTimePicker')
      && locale.some((x) => x.control === 'sap.m.DatePicker')
      && locale.some((x) => x.control === 'sap.m.DateRangeSelection'),
      'picker-value-without-format: the family comes from the metadata (value + valueFormat), not from a name list');
    assert(!locale.some((x) => x.value === 'TYPED_AT'),
      'picker-value-without-format: a TYPED binding owns the pattern — valueFormat is moot, not missing');
    assert(!locale.some((x) => x.value === 'FORMATTED'),
      'picker-value-without-format: a declared valueFormat is the fix, never the defect');
    assert(!locale.some((x) => x.value === 'MADE_ON'),
      'picker-value-without-format: a field the class writes as digit-free text (`n/a`) is not a date in any locale');
    assert(!locale.some((x) => x.value === 'EXPIRES'),
      'picker-value-without-format: a field the class never writes has only ONE author — the picker reads back what it wrote');
    assert(!locale.some((x) => x.control === 'sap.m.TimePicker'),
      'picker-value-without-format: no value binding, so nothing can be written back');
    assert(!locale.some((x) => x.value === 'NOTE'),
      'picker-value-without-format: sap.m.Input has no valueFormat — it is not a picker and formats nothing');
    // the same view as a raw XML document: there is no ABAP class to ask who
    // else writes the field, so the rule has nothing to judge and says nothing
    assert(!checkXmlSource('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><DateTimePicker value="{/START_AT}"/></mvc:View>')
      .findings.some((x) => x.type === 'picker-value-without-format'),
      'picker-value-without-format: a raw view.xml has no class to read the second author from');

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
    for (const gone of ['NAV_TO_ROUTE']) {
      assert(!FRONTEND_EVENTS.includes(gone),
        `invalid-frontend-action: ${gone} was removed upstream and must not stay in the dispatch mirror`);
    }
    /* HISTORY_BACK left the removed list on 2026-08-31: the capability came
     * BACK upstream the same day and was renamed to HASH_BACK before release
     * (actions/Browser.js -> Router.navBack, the UI5 onNavBack pattern: one
     * consumed window.history.go(-1) with an optional fallback hash for the
     * cold deep link - it pairs with the app-owned hash routing, whose hash
     * change then round-trips like a browser Back). HASH_BACK is the
     * cs_event constant, so naming it is correct code; HISTORY_BACK never
     * shipped in a release and stays out of the dispatch mirror. */
    assert(FRONTEND_EVENTS.includes('HASH_BACK'),
      'invalid-frontend-action: HASH_BACK is the upstream dispatch entry and must be accepted');
    assert(!FRONTEND_EVENTS.includes('HISTORY_BACK'),
      'invalid-frontend-action: HISTORY_BACK was renamed to HASH_BACK before it ever shipped');
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
});

// ------------------------------------------- rules distilled from the corpus ----
// popover-display-val, uncurated-formatter, hardcoded-binding-path,
// duplicate-for-iterator — lessons that bit the ai-demokit corpus, promoted
// from its repo-local pattern-lint into rules every consumer sees
section('popover-display-val', async () => {
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
});

// ------------------------------------------- obsolete z2ui5_if_client members ----
section('obsolete-model-update', async () => {
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

    /* The ELSE of a COND is not the ELSE of the IF. Found on a real
     * documentation page: the branch below displays four statements after the
     * COND, and a scanner looking for the WORD ended the branch at the COND's
     * ELSE and reported a branch that never re-displays. A false positive on
     * idiomatic modern ABAP is the worst kind - it pushes people away from COND
     * to satisfy a rule about something else entirely. */
    const condElse = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        DATA(status) = COND #( WHEN sy-index MOD 2 = 0 THEN \`open\` ELSE \`closed\` ).
        DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
        client->view_display( view->stringify( ) ).
      ENDIF.
    ENDMETHOD.`;
    assert(!checkAbapRules(condElse).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a COND ELSE inside the branch does not end it');

    /* And the switch is not stuck the other way: a branch that really does not
     * display is still reported when a COND sits in front of the gap. */
    const condElseNoDisplay = `METHOD z2ui5_if_app~main.
      IF client->check_on_navigated( ).
        DATA(status) = COND #( WHEN sy-index MOD 2 = 0 THEN \`open\` ELSE \`closed\` ).
      ENDIF.
    ENDMETHOD.`;
    assert(checkAbapRules(condElseNoDisplay).some((x) => x.type === 'missing-view-display-on-navigated'),
      'missing-view-display-on-navigated: a COND does not hide a branch that never displays');
});

// ------------------------------------------ source positions and declarations ----
section('unused-public-attribute', async () => {
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

    /* The chain again, this time through the two SECTION-scoped collectors.
     * The case above went through instanceAttributes, which reads the whole
     * class definition and was always right; publicAttributes and
     * privateInstanceAttributes read one section and ended their block on `$`
     * under /m, which matches at every LINE end — so the lazy body stopped at
     * the first newline and both rules saw the first name of a chain and no
     * other. That is why this case looked covered and was not. */
    const sections = `CLASS x DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA: pub_one   TYPE string,
            pub_two   TYPE string,
            pub_three TYPE string.
    PRIVATE SECTION.
      DATA: priv_one TYPE string,
            priv_two TYPE string.
  ENDCLASS.
  CLASS x IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      priv_one = priv_two = pub_one.
    ENDMETHOD.
  ENDCLASS.`;
    const found = annotate(checkAbapRules(sections), sections);
    const unused = found.filter((x) => x.type === 'unused-public-attribute').map((x) => x.member);
    assert(unused.length === 2 && unused.includes('pub_two') && unused.includes('pub_three'),
      `unused-public-attribute: the second and third name of a chain are judged too (got ${unused.join(', ') || 'none'})`);
    assert(!unused.includes('pub_one'),
      'unused-public-attribute: a chained name that IS read stays unreported');
    const privs = found.filter((x) => x.type === 'private-app-attribute');
    assert(privs.length === 2 && privs.map((x) => x.member).join() === 'priv_one,priv_two',
      `private-app-attribute: every name of a chained PRIVATE declaration (got ${privs.map((x) => x.member).join() || 'none'})`);
    // the offsets are walked, not searched for, so each name keeps its own line
    assert(privs[0].line === 8 && privs[1].line === 9,
      `private-app-attribute: each name of a chain on its own line (got ${privs.map((x) => x.line).join()}, expected 8,9)`);
});

// ------------------------------------------------------- accessibility ----
section('xmlns (4)', async () => {
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
});

// ----------------------------------------------- a broken install answers ----
section('snapshot', async () => {
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
});

// ------------------------------------------------------- file collection ----
section('file collection', async () => {
    const { collectFiles } = await import('./observe.mjs');
    const os = await import('node:os');
    const dir = tempDir('a2ui5lint-collect-');
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

    /* A symlink cycle. `statSync` follows links, so `deep/loop -> deep` used to
     * be an unbounded descent: the walk never finished, the run reported
     * nothing, and there is no output at all to read that from. Everything else
     * this gate can get wrong is at least visible as a verdict. */
    const deep = path.join(dir, 'deep');
    fs.mkdirSync(deep, { recursive: true });
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(deep, 'inner.clas.abap'));
    let linked = true;
    try { fs.symlinkSync(deep, path.join(deep, 'loop'), 'dir'); } catch { linked = false; }
    if (linked) {
      const cyc = collectFiles([deep]);
      assert(cyc.length === 1, `collectFiles: a symlink cycle terminates and collects each file once (${cyc.length})`);
      // a second link to the same directory is the same directory, not a copy
      fs.symlinkSync(deep, path.join(deep, 'again'), 'dir');
      assert(collectFiles([deep]).length === 1,
        'collectFiles: two links to one directory collapse onto its realpath');
    }

    // ignore: the repo-level counterpart of rules[id].exclude
    const gen = path.join(dir, 'generated');
    fs.mkdirSync(gen, { recursive: true });
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(gen, 'gen.clas.abap'));
    assert(collectFiles([gen]).length === 1, 'ignore: the generated tree is collected without a pattern');
    assert(collectFiles([dir], { ignore: ['generated'] }).every((p) => !p.includes('generated')),
      'ignore: a matching pattern drops the tree from a directory walk');
    assert(collectFiles([path.join(gen, 'gen.clas.abap')], { ignore: ['generated'] }).length === 1,
      'ignore: a path named on the command line is still checked - ignore filters a scan, not an argument');
    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------- builder chain layout ----
section('chain-indentation', async () => {
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
});

// ------------------------------- the view builder (z2ui5_cl_ui5_view_builder) ----
section('view builder', async () => {
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
});

// ------------------------------------------------- the FROZEN view builder ----
/* An app on `z2ui5_cl_xml_view` was not merely unjudged, it was invisible:
 * collectFiles kept a class only when it called a CURRENT builder's factory, so
 * a whole app on the retired API produced "no checkable app classes" and exit 0.
 * That is the shape of miss this linter exists to prevent, and it is aimed at
 * the most common wrong answer there is - the old API is what nearly all public
 * abap2UI5 material shows, and therefore what a language model writes. */
section('frozen view builder', async () => {
    const { checkAbapSource, collectFiles } = await import('./observe.mjs');
    const { frozenBuilderOf, FROZEN_BUILDERS } = await import('../lib/builders.mjs');
    const os = await import('node:os');
    const source = fs.readFileSync(f('frozenbuilder.clas.abap'), 'utf8');

    const found = checkAbapSource(source, { render: false }).findings;
    const frozen = found.find((x) => x.type === 'frozen-view-builder');
    assert(frozen && frozen.value === 'z2ui5_cl_xml_view',
      'frozen builder: a class on z2ui5_cl_xml_view is reported, not skipped');
    assert(frozen.severity === 'warning',
      `frozen builder: a warning - the class compiles and renders today, and breaks on the upgrade the deprecation announces (got ${frozen.severity})`);
    assert(/DEPRECATED/.test(frozen.message),
      'frozen builder: the message says the builder is deprecated, which is what the reader has to act on');
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
    const dir = tempDir('a2ui5-frozen-');
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
});

// ------------------------------------------ the released API surface (src/02) ----
section('non-released-api', async () => {
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
    // z2ui5_if_types WAS released, because the released client->get( ) returned
    // z2ui5_if_types=>ty_s_get and an app declaring a variable of that type
    // could not avoid the name. Upstream moved every type onto the object that
    // uses it and retired the shared interface into src/99 - it still SHIPS, so
    // an app naming it still compiles, which is exactly why it has to be
    // reported now, with the object the types moved to.
    assert(named.includes('z2ui5_if_types')
      && apiVerdict('z2ui5_if_types').area === 'src/99'
      && apiVerdict('z2ui5_if_types').replacement === 'z2ui5_if_client',
      'non-released-api: the retired z2ui5_if_types is reported, pointing at z2ui5_if_client');
    assert(apiVerdict('z2ui5_if_exit')?.replacement === 'z2ui5_if_ui5_exit'
      && apiVerdict('z2ui5_if_ui5_exit') === null,
      'non-released-api: the exit interface reports under its old name and is silent under the new one');
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
});

// --------------------------------------------------------- lifecycle rules ----
section('separate-lifecycle-ifs', async () => {
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

    /* The client handle is not always spelled `client`. samples-stack's app 319
     * calls it `m_client`, and every lifecycle rule used to hard-code
     * `client->` - so that class had no navigated branch and NO rule saw it,
     * neither this one nor separate-lifecycle-ifs. The handle is matched by
     * shape now. */
    const mclient = canonical.replace(/client->/g, 'm_client->').replace('me->client = client.', 'm_client = client.');
    assert(checkAbapRules(mclient).some((x) => x.type === NAV),
      'missing-on-navigated-branch: found through a handle named m_client, not only client');
    assert(!checkAbapRules(mclient.replace(
      'ELSEIF m_client->check_on_event( ).',
      'ELSEIF m_client->check_on_navigated( ).\n      view_display( ).\n    ELSEIF m_client->check_on_event( ).')).some((x) => x.type === NAV),
    'missing-on-navigated-branch: and cleared through it too');
    assert(checkAbapRules(`METHOD z2ui5_if_app~main.
      IF mo_client->check_on_init( ).
        on_init( ).
      ENDIF.
      IF mo_client->check_on_navigated( ).
        view_display( ).
      ENDIF.
    ENDMETHOD.`).some((x) => x.type === 'separate-lifecycle-ifs'),
    'separate-lifecycle-ifs: found through a handle named mo_client too');

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
        /* The Windows spelling, asserted on every platform. `path.resolve` and
         * `path.relative` hand back `\` there, so all three forms above carried
         * backslashes and a `/`-written pattern matched none of them - three of
         * the windows-latest failures in linter#67. Writing the separator by
         * hand is what makes that reproducible on Linux; without this the
         * regression is only visible on one leg of the matrix.
         *
         * The relative form is the one that carries: a `\`-separated path under
         * the cwd reaches both patterns (itself for `^src/`, its resolved form
         * for `/src/`). A fabricated `C:\...` cannot - `path.relative` has no
         * way to reduce a foreign drive to `src/00/98/`, on either platform -
         * so asserting it here would test the fixture, not the fix. */
        assert(applyRules([...one], rules, 'src\\00\\98\\app.clas.abap').length === 0,
          `rules.exclude: "${pattern}" excludes a backslash-separated path (Windows)`);

        assert(applyRules([...one], rules, `${process.cwd()}/src/01/app.clas.abap`).length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names`);
        assert(applyRules([...one], rules, 'src/01/app.clas.abap').length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names, relative too`);
        assert(applyRules([...one], rules, 'src\\01\\app.clas.abap').length === 1,
          `rules.exclude: "${pattern}" still only excludes what it names, backslashes too`);
      }
      /* The compiled config is memoized per (rules object, rule id) - one
       * rules object walked over many files must still decide per FILE, and
       * a severity override must survive the memo on the second file too. */
      {
        const rules = { 'unknown-control': { severity: 'hint', exclude: ['^src/00/'] } };
        assert(applyRules([...one], rules, 'src/00/a.clas.abap').length === 0,
          'rules.exclude: memoized config still excludes the matching file');
        const kept = applyRules([{ type: 'unknown-control' }], rules, 'src/01/b.clas.abap');
        assert(kept.length === 1 && kept[0].severity === 'hint',
          'rules.exclude: memoized config keeps the non-matching file, severity override intact');
      }
    }
    // the guard idiom is exclusive by construction: good.clas.abap opens with
    // `IF check_on_event( \`GO\` ). RETURN. ENDIF.` before its init IF
    assert(!checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8')).findings
      .some((x) => x.type === 'separate-lifecycle-ifs'),
      'separate-lifecycle-ifs: an IF block that RETURNs (the guard idiom) does not count');
});

// -------------------------------- event-parameter existence + closed gaps ----
section('xmlns (5)', async () => {
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
});

// ------------------------------------------- rules['render-error'] ----
// the render gate's pseudo-rule: waive or downgrade render failures per file
// instead of switching the gate off wholesale
section('render-error', async () => {
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
    const dir = tempDir('a2ui5render-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{"rules": {"render-error": {"exclude": ["legacy/"]}}}');
    assert(loadConfig(cfg).rules['render-error'].exclude[0] === 'legacy/',
      'render-error: the config accepts the pseudo-rule in its rules block');
    fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------- optional render deps ----
// playwright + @openui5/* ship in @abap2ui5/render-runtime, declared as an
// OPTIONAL PEER: absent, the property gate still works and a requested render
// fails with one actionable message
section('render deps', async () => {
    const { RENDER_DEPS, SCREENSHOT_DEPS, RENDER_RUNTIME, missingRenderDeps, renderDepsError, renderFallback } = await import('../lib/render.mjs');
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
    /* Nothing ships in the runtime unaccounted for, and nothing the GATE needs
     * is missing from it - but the two lists are no longer the same list. The
     * theme compiler is in the runtime because `--screenshot` needs it and one
     * install should get everything; it is out of RENDER_DEPS because the gate
     * must still run where it is absent. */
    assert(runtime.name === RENDER_RUNTIME
      && [...RENDER_DEPS, ...SCREENSHOT_DEPS].sort().join() === Object.keys(runtime.dependencies).sort().join(),
      'render deps: the runtime ships exactly RENDER_DEPS plus the screenshot-only ones');
    assert(!RENDER_DEPS.some((d) => SCREENSHOT_DEPS.includes(d)),
      'render deps: a screenshot-only package is never required by the gate');

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
});

// ------------------------------------------------------ shared renderer ----
// checkFiles/screenshotFiles accept an ALREADY-OPEN renderer and then never
// close it - the contract a long-lived consumer (mcp-server) keeps one warm
// Chromium on, instead of paying a cold start per validate_view call
section('shared renderer', async () => {
    const { openRenderer } = await import('../lib/render.mjs');
    const files = [f('good.clas.abap'), f('broken.clas.abap')];
    const independent = await checkFiles(files, {});
    const renderer = await openRenderer({ pages: 2 });
    try {
      const first = await checkFiles([files[0]], { renderer });
      // a second call on the SAME renderer is the proof the first did not close it
      const second = await checkFiles([files[1]], { renderer });
      // the runtime numbers views per session (__xmlview0, __xmlview1, ...),
      // so the generated id is the one part of an error text that may differ
      const shape = (r) => JSON.stringify({
        findings: r.findings.map((x) => [x.type, x.line, x.column]),
        renderErrors: r.renderErrors.map((e) => e.replace(/__xmlview\d+/g, '__xmlview')),
      });
      assert(shape(first[0]) === shape(independent[0]),
        'shared renderer: the clean file gets the same verdict as an independent run');
      assert(shape(second[0]) === shape(independent[1]) && second[0].renderErrors.length > 0,
        'shared renderer: the broken file still fails the render gate through the shared session');
      // and it is still usable directly afterwards - checkFiles left it open
      const direct = await renderer.render({ xml: independent[0].docs[0], model: independent[0].model });
      assert(Array.isArray(direct) && direct.length === 0,
        'shared renderer: the renderer stays open and renders after both calls');
    } finally {
      await renderer.close();
    }
});

// ------------------------------------------------- curated formatter mirror ----
// the render harness provides the same formatter surface the rule judges by —
// the demo-kit pack was removed upstream, and a harness still mirroring it
// would render views green that break live
section('formatters', async () => {
    const { CURATED_FORMATTERS } = await import('../lib/formatters.mjs');
    const renderSrc = fs.readFileSync(path.join(FIX, '..', '..', 'lib', 'render.mjs'), 'utf8');
    const mirrored = [...renderSrc.matchAll(/^ {6}(\w+): function/gm)].map((m) => m[1]);
    assert(mirrored.sort().join() === [...CURATED_FORMATTERS].sort().join(),
      `formatters: the render harness mirrors exactly the curated set (harness: ${mirrored.join(', ') || 'none'})`);
});

// ------------------------------------------------ round 2: new rules ----
section('xmlns (6)', async () => {
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
    assert(host.some((x) => x.type === 'commercial-ui5-host' && x.value.startsWith('ui5.sap.com/resources/')),
      'commercial-ui5-host: a RUNTIME load from the commercial host is reported, and the finding names the path that made it one');
    /* The two shapes that made every SAPUI5-facing consumer switch the rule
     * off wholesale, which cost them the case above. */
    assert(checkAbapRules('url = `https://ui5.sap.com/`.').every((x) => x.type !== 'commercial-ui5-host'),
      'commercial-ui5-host: a demo-kit link is not a distribution — SAPUI5 has no other home');
    assert(checkAbapRules('url = `https://ui5.sap.com/test-resources/sap/suite/images/a.jpg`.')
      .every((x) => x.type !== 'commercial-ui5-host'),
      'commercial-ui5-host: an asset under /test-resources/ is not the runtime');
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

    /*
     * The icon scan is reachable on its own, through the `./icons` subpath.
     *
     * Both entry points call it, so a consumer going through `checkAbapSource`
     * or `checkXmlSource` never has to - but a consumer that assembles the
     * pipeline itself does, and could not: `checkIcons` lived in a module the
     * exports map did not name, and `exports` blocks a deep import. That is
     * what left the VS Code extension's in-process gate without the icon rules
     * on its XML path while its ABAP path (which goes through checkAbapRules)
     * had them - the same file judged differently by the editor and by CI,
     * which is the divergence that gate exists to close.
     */
    {
      const icons = await import('@abap2ui5/linter/icons');
      assert(typeof icons.checkIcons === 'function' && typeof icons.loadIcons === 'function',
        'icons: the ./icons subpath exports checkIcons and loadIcons');
      const xml = '<mvc:View xmlns="sap.m"><Button icon="sap-icon://nosuchglyph"/></mvc:View>';
      assert(icons.checkIcons(xml).some((x) => x.type === 'unknown-icon'),
        'icons: checkIcons judges raw XML text on its own');
      assert(icons.checkIcons(xml, { minUi5: '1.120' }).some((x) => x.type === 'unknown-icon'),
        'icons: ...and honours the target release it is given');
      /* An empty registry reports nothing rather than throwing - the same "no
       * guessing" the rest of the linter follows, and what a host without a
       * filesystem falls back to. */
      const empty = { floor: '1.71', ui5Version: '', since: new Map(), removed: new Map() };
      assert(icons.checkIcons(xml, { iconData: empty }).length === 0,
        'icons: an empty registry judges nothing instead of guessing');
      assert(icons.loadIcons().since.size > 0,
        'icons: loadIcons reads the committed registry');
    }

    /*
     * elementBoundSlots is reachable WITHOUT the package entry point.
     *
     * checkAbapSource works `boundElement` out with it and passes it to
     * checkNodes, where it SUPPRESSES the "this path has no context" findings.
     * A consumer that assembles the pipeline itself and cannot call it is
     * therefore STRICTER than the CLI - it reports a relative binding the
     * linter accepts, a false positive in that consumer's editor.
     *
     * The entry point was its only route, and that route imports render.mjs:
     * `http`, `os` and `module`. A browser bundle cannot resolve those, so the
     * VS Code extension's web build failed outright on the import - which is
     * at least loud. It lives in abap-source.mjs now and is re-exported from
     * both here and ./abap-rules, which no renderer hangs off.
     */
    {
      const wired = `client->follow_up_action( client->_event_client(
          action = z2ui5_if_client=>cs_event-bind_element
          t_arg  = VALUE #( ( \`/MT_ROWS/1\` ) ) ) ).`;
      const viaEntry = await import('@abap2ui5/linter');
      const viaLeaf = await import('@abap2ui5/linter/abap-rules');
      assert(typeof viaLeaf.elementBoundSlots === 'function',
        'elementBoundSlots: reachable through ./abap-rules, without the renderer');
      assert(typeof viaEntry.elementBoundSlots === 'function',
        'elementBoundSlots: still on the entry point it has always been on');
      const a = viaLeaf.elementBoundSlots(wired);
      const b = viaEntry.elementBoundSlots(wired);
      assert(a.all === b.all && [...a.slots].join() === [...b.slots].join(),
        'elementBoundSlots: both routes are the same function');
      assert(!a.all && a.slots.has('MAIN'),
        `elementBoundSlots: a wire with no view= binds the MAIN slot (got ${[...a.slots].join() || 'none'})`);
      /* the leaf module may not grow a path to the renderer - that is the
       * whole point of the move, and an import is how it would come back */
      const lib = path.join(FIX, '..', '..', 'lib');
      const leafSrc = fs.readFileSync(path.join(lib, 'abap-source.mjs'), 'utf8');
      const rulesSrc = fs.readFileSync(path.join(lib, 'abap-rules.mjs'), 'utf8');
      assert(!/from '\.\/(render|index)\.mjs'/.test(leafSrc + rulesSrc),
        'elementBoundSlots: neither module reaches the renderer or the entry point');
    }

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
});

// ------------------------------------------------ sarif + baseline + cli ----
section('sarif, baseline and cli', async () => {
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

    // --render-pages: the pool size is a closed shape too - anything that is
    // not a positive integer would otherwise silently fall back to 4
    for (const bad of ['0', '-1', '2.5', 'four']) {
      const r = runErr([good, '--no-render', '--no-config', '--render-pages', bad]);
      assert(r.code === 2 && /--render-pages takes a positive integer/.test(r.err),
        `cli: --render-pages '${bad}' is refused instead of silently meaning 4 (exit ${r.code})`);
    }
    assert(runErr([good, '--no-render', '--no-config', '--render-pages', '2']).code !== 2,
      'cli: --render-pages 2 is accepted');

    // --- baseline -------------------------------------------------------------
    const dir = tempDir('a2ui5base-');
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
});

// ------------------------------------------------- upstream mirror parsers ----
section('upstream', async () => {
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

    // the companion-control mirror: the fourth knowledge file, gated since
    // MultiInputExt's TokenKeyCell / TokenTextCells arrived and every view
    // naming them failed view CREATION rather than a property check
    const { parseCcProperties } = await import('../scripts/check-upstream.mjs');
    const ccSrc = `return Control.extend('z2ui5.cc.X', {
        metadata: {
          properties: {
            MultiInputId: { type: 'string' },
            // a comment carrying a fake: pair
            checkInit: { type: 'boolean', defaultValue: false },
            TokenTextCells: { type: 'string', defaultValue: '' },
          },
          events: { change: { allowPreventDefault: true, parameters: {} } },
        },
      });`;
    assert(parseCcProperties(ccSrc).join() === 'MultiInputId,checkInit,TokenTextCells',
      `upstream: a companion control's property names parse, nested types and comments skipped (got ${parseCcProperties(ccSrc).join()})`);
    assert(parseCcProperties('return Control.extend("x", { metadata: {} });').length === 0,
      'upstream: a control with no properties block parses as none rather than throwing');

    const { CC_CONTROLS, ccMirrorScript } = await import('../lib/cc-controls.mjs');
    const script = ccMirrorScript();
    assert(Object.keys(CC_CONTROLS).every((n) => script.includes(`'z2ui5/cc/${n}'`)),
      'cc-controls: the harness script is generated from CC_CONTROLS, one define per mirrored control');
    assert(script.includes('TokenKeyCell') && script.includes('TokenTextCells'),
      'cc-controls: the suggestion-row validator properties reach the harness');
});

// ------------------------------------------------ relative asset URLs ----
/* A demo-kit sample is served from the SDK page and resolves `./test-resources/…`
 * there; an abap2UI5 app is served from the ICF node and has no document root,
 * so the asset 404s and the control shows its placeholder - a failure with no
 * error anywhere. The fixture carries the three broken shapes and six that must
 * stay silent, because the scope is what decides whether this is a rule or a
 * nuisance. Found in abap2UI5/samples-controls apps 401/402/412/587, ten paths. */
section('relative-asset-url', async () => {
    const found = checkXmlSource(fs.readFileSync(f('relativeasset.view.xml'), 'utf8'), { minUi5: '1.71' })
      .findings.filter((x) => x.type === 'relative-asset-url');
    assert(found.length === 3,
      `relative-asset-url: the three document-relative UI5 paths are reported (${found.length})`);
    assert(found.some((x) => x.value.startsWith('./test-resources/'))
        && found.some((x) => x.value.startsWith('test-resources/'))
        && found.some((x) => x.value.startsWith('../resources/sap/')),
      'relative-asset-url: ./, bare and ../ forms are all caught');
    const quiet = ['https://', 'sap-icon://', 'data:', '//example.org', '{/', './img/'];
    assert(quiet.every((q) => !found.some((x) => x.value.startsWith(q))),
      'relative-asset-url: absolute, icon, data, protocol-relative, bound and non-UI5-tree paths stay silent');
});

// ------------------------------------------------- metadata drift gate ----
// generate-metadata --check took ~3 minutes before the extend-scan fix and
// lived in its own CI step; at ~2 seconds it belongs in the suite
section('metadata drift gate', async () => {
    const cp = await import('node:child_process');
    let ok = true;
    let msg = '';
    try {
      cp.execFileSync('node', [path.join(FIX, '..', '..', 'scripts', 'generate-metadata.mjs'), '--check'], { encoding: 'utf8' });
    } catch (e) { ok = false; msg = (e.stderr || e.stdout || '').trim(); }
    assert(ok, `metadata: data/properties.json is in sync — npm run generate-metadata (${msg})`);

    /* And in sync from a filesystem that hands the walk back in another order.
     *
     * `readdirSync` order is a property of the FILESYSTEM: ext4 hands back
     * `Dialog.js` before `delegate/`, NTFS sorts case-insensitively and hands
     * back `delegate/` first. That order decided the key order of the snapshot,
     * so windows-latest generated the same 973 controls with the same values in
     * another sequence and this gate called it stale - on a tree byte-identical
     * to the green ubuntu one (linter#67).
     *
     * The walk sorts now, and this is what says so on every platform: run the
     * generator with readdir wrapped to return NTFS order and require the same
     * bytes. Without the sort in collect() this run differs; asserting it here
     * is what keeps the regression off one leg of the matrix. */
    const ntfs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'a2u5-ntfs-')), 'run.mjs');
    const out = `${ntfs}.json`;
    fs.writeFileSync(ntfs, `import fs from 'fs';
const real = fs.readdirSync;
fs.readdirSync = (dir, opts) => {
  const r = real(dir, opts);
  if (!Array.isArray(r)) return r;
  return [...r].sort((a, b) => {
    const x = (a.name ?? a).toLowerCase(); const y = (b.name ?? b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
};
await import(${JSON.stringify(pathToFileURL(path.join(FIX, '..', '..', 'scripts', 'generate-metadata.mjs')).href)});
`);
    let reordered = true;
    let why = '';
    try {
      cp.execFileSync('node', [ntfs, '--out', out], { encoding: 'utf8' });
      const a = fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8');
      reordered = fs.readFileSync(out, 'utf8') === a;
    } catch (e) { reordered = false; why = (e.stderr || e.message || '').trim(); }
    finally { fs.rmSync(path.dirname(ntfs), { recursive: true, force: true }); }
    assert(reordered,
      `metadata: the snapshot does not depend on readdir order — a case-insensitive (NTFS) walk produces the same bytes ${why}`);
});

/* `@ui5-experimental-since` is a version tag like any other and the snapshot has
 * to carry it. It used to be read at CLASS level only, so a MEMBER carrying it
 * landed with no version at all and was treated as base version - i.e. silently
 * passed at any floor. 55 members were in that state; these three pin the two
 * halves of the fix (the version, and the flag that says which tag it came
 * from) against a member whose own JSDoc carries the tag today. */
section('metadata', async () => {
    const props = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8'));
    const tok = props.controls['sap.m.Tokenizer']?.properties ?? {};
    assert(tok.multiLine?.since === '1.142',
      `metadata: an @ui5-experimental-since member carries its version (Tokenizer.multiLine ${tok.multiLine?.since})`);
    assert(tok.multiLine?.experimental === true,
      'metadata: an @ui5-experimental-since member is flagged experimental, so a consumer can tell it from a plain @since');
    assert(tok.width?.since === undefined && tok.width?.experimental === undefined,
      'metadata: a member with neither tag stays version-less — absent still means base version');
});

// --------------------------------------------------- icon data integrity ----
/* The icon snapshot cannot have a drift gate like properties.json: it is built
 * by packing 79 OpenUI5 releases from the registry, so --check would need
 * network on every test run. The committed file IS the contract, and what is
 * checkable offline is that it says what the rules assume it says. */
section('icons', async () => {
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
});

// ------------------------------------------------ the snapshot pairing ----
/* Two npm packages come out of one tag, and the split is only safe while they
 * describe the SAME OpenUI5 release: data/properties.json and data/icons.json
 * answer `@since` from the version they were generated at, while the render
 * gate loads whatever @openui5 the render-runtime workspace pins. Let those
 * drift and the two gates disagree about the same control - the property gate
 * calling a member too new for a runtime that already ships it, or worse, the
 * silent direction: staying quiet about a member the loaded runtime does not
 * have. Nothing else enforces the pairing; RELEASING.md only says it must
 * hold, and a hand-written release step is exactly what forgets it. */
section('snapshots', async () => {
    const dir = path.join(FIX, '..', '..');
    const props = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'properties.json'), 'utf8'));
    const iconData = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'icons.json'), 'utf8'));
    const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'render-runtime', 'package.json'), 'utf8'));
    const pinned = Object.entries(runtime.dependencies || {})
      .filter(([n]) => n.startsWith('@openui5/'))
      .map(([n, v]) => [n, String(v).replace(/^[\^~]/, '')]);

    assert(props.ui5Version === iconData.ui5Version,
      `snapshots: the property and icon data are generated at one release (properties ${props.ui5Version}, icons ${iconData.ui5Version})`);

    const off = pinned.filter(([, v]) => v !== props.ui5Version);
    assert(pinned.length > 0 && off.length === 0,
      `snapshots: render-runtime loads the release the data describes - ${props.ui5Version} (${
        off.length ? off.map(([n, v]) => `${n}@${v}`).join(', ') : `${pinned.length} @openui5 pins agree`})`);
});

// ------------------------------------------------------------------- fix ----
section('fix', async () => {
    const os = await import('node:os');
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const { applyFixes } = await import('../lib/fix.mjs');
    const { checkAbapRules } = await import('./observe.mjs');

    const dir = tempDir('a2ui5fix-');
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
    assert(/would fix 5 problem\(s\)/.test(dry) && fs.readFileSync(target, 'utf8') === original,
      'fix: the dry run reports what it would do and leaves the file alone');

    const out = run();
    const fixed = fs.readFileSync(target, 'utf8');
    assert(/fixed 5 problem\(s\) in 1 file\(s\)/.test(out), 'fix: the five mechanical corrections are applied');
    assert(/client->_bind\( name \)/.test(fixed) && !/_bind_edit/.test(fixed),
      'fix: obsolete-binder becomes client->_bind( )');
    assert(/client->follow_up_action\( val   = client->cs_event-urlhelper/.test(fixed)
      && !/_event_client/.test(fixed),
    'fix: obsolete-frontend-event becomes client->follow_up_action( )');
    assert(/b = abap_true/.test(fixed),
      'fix: unconverted-abap-boolean moves onto b =, the token kept verbatim');
    assert(/`\$\{BARE_BRACE\}`/.test(fixed) && /`\$\{RESOLVED\}`/.test(fixed) && /`\{0\} selected`/.test(fixed),
      'fix: event-arg-unresolved gains its $, the already-correct and quoted forms untouched');
    assert(/t_arg = VALUE #\( \( `first` \) \)/.test(fixed)
      && /val = `MIDDLE` t_arg = VALUE #\( \( `first` \) \( `` \) \( `third` \) \)/.test(fixed),
    'fix: the trailing empty t_arg row is deleted, the load-bearing middle one kept');
    assert(!/obsolete-binder|obsolete-frontend-event|unconverted-abap-boolean|event-arg-unresolved|trailing-empty-event-arg/.test(out),
      'fix: what was fixed is gone from the report of the same run');
    assert(/binding-to-local/.test(out), 'fix: a finding without a mechanical correction survives');

    const twice = original.replace(/client->_bind\( lv_local \)/, 'client->_bind_edit( lv_local )');
    const both = checkAbapRules(twice).find((x) => x.type === 'obsolete-binder');
    assert(both.fixes.length === 2, 'fix: two call sites of one deduped finding both carry a fix');
    assert(!/_bind_edit/.test(applyFixes(twice, [both]).output), 'fix: and both are applied in one pass');

    const overlap = applyFixes('abcdef', [{ fixes: [{ start: 1, end: 4, text: 'X' }, { start: 2, end: 5, text: 'Y' }] }]);
    assert(overlap.output === 'aXef' && overlap.applied === 1 && overlap.deferred === 1,
      'fix: overlapping spans are deferred to the next run, never merged by guesswork');
    assert(overlap.dropped === 0, 'fix: a legitimate pair drops nothing');

    /* A span that does not address this source is a rule computing offsets
     * against the wrong text, and it used to be counted as neither applied nor
     * deferred: "fixed 0 problems", the finding surviving every pass, nothing
     * saying why. It is a third outcome now, and in the suite it throws. */
    const prevStrict = process.env.ABAP2UI5LINT_STRICT_FIXES;
    delete process.env.ABAP2UI5LINT_STRICT_FIXES;
    const bad = applyFixes('abcdef', [{ fixes: [{ start: 2, end: 99, text: 'X' }, { start: 1, end: 2, text: 'Y' }] }]);
    assert(bad.output === 'aYcdef' && bad.applied === 1 && bad.dropped === 1,
      `fix: an out-of-range span is counted as dropped, not silently forgotten (${bad.dropped})`);
    assert(applyFixes('abc', [{ fixes: [{ start: 2, end: 1, text: 'X' }] }]).dropped === 1,
      'fix: a reversed span is dropped too');
    assert(applyFixes('abc', [{ fixes: [{ start: 0.5, end: 1, text: 'X' }] }]).dropped === 1,
      'fix: a non-integer bound is dropped too');
    process.env.ABAP2UI5LINT_STRICT_FIXES = 'true';
    let strictThrew = '';
    try { applyFixes('abcdef', [{ fixes: [{ start: 2, end: 99, text: 'X' }] }]); }
    catch (e) { strictThrew = e.message; }
    assert(/do not address this source/.test(strictThrew),
      `fix: in strict mode a dropped span throws instead of being counted (${strictThrew || 'no throw'})`);
    // restored, because every OTHER applyFixes call in this suite runs under
    // strict mode: that is what makes a real rule unable to ship an unusable span
    process.env.ABAP2UI5LINT_STRICT_FIXES = prevStrict ?? 'true';

    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------- fix (2) ----
// the 2026-09 fixes: four existing rules whose correction turned out to be
// mechanical. Each is asserted through applyFixes (strict-span mode is on for
// the whole suite, so an unusable span throws rather than passing silently)
section('fix (2)', async () => {
    const { applyFixes } = await import('../lib/fix.mjs');
    const { checkAbapRules, checkAbapSource } = await import('./observe.mjs');

    // --- escaped-brace-in-backtick: delete the backslashes -------------------
    {
      const src = ')->a( n = `items` v = `\\{ path: \'message>/\' \\}` )';
      const found = checkAbapRules(src).filter((x) => x.type === 'escaped-brace-in-backtick');
      assert(found.length === 1 && found[0].fixes?.length === 2,
        `fix: escaped-brace-in-backtick carries one deletion per backslash (got ${found[0]?.fixes?.length})`);
      assert(applyFixes(src, found).output === ')->a( n = `items` v = `{ path: \'message>/\' }` )',
        'fix: escaped-brace-in-backtick leaves the plain-brace literal the doc recommends');
    }

    // --- redundant-conv-i: unwrap the CONV ------------------------------------
    {
      const src = 'DATA count TYPE i.\n  count = CONV i( lv_text ).\n';
      const found = checkAbapRules(src).filter((x) => x.type === 'redundant-conv-i');
      assert(found.length === 1 && found[0].fixes?.length === 1,
        'fix: redundant-conv-i carries the unwrap');
      assert(applyFixes(src, found).output === 'DATA count TYPE i.\n  count = lv_text.\n',
        'fix: redundant-conv-i unwraps to the bare assignment');
    }

    // --- lifecycle-is-initial: the three shapes -------------------------------
    {
      const src = fs.readFileSync(f('isinitial.clas.abap'), 'utf8');
      const found = checkAbapSource(src).findings.filter((x) => x.type === 'lifecycle-is-initial');
      const call = found.find((x) => x.member === 'check_on_init( )');
      assert(call?.fixes?.length === 1, 'fix: the lifecycle call carries a fix');
      const out = applyFixes(src, found).output;
      assert(/IF client->check_on_init\( \)\.\n/.test(out),
        'fix: IS NOT INITIAL on the lifecycle call becomes the predicative form');
      /* the fixture's variable case is IS NOT INITIAL, which is deliberately
       * NOT fixed - `= abap_true` vs `<> abap_false` is a choice, not a
       * mechanical rewrite - so the text survives the pass */
      assert(/IF mv_ready IS NOT INITIAL\./.test(out),
        'fix: IS NOT INITIAL on a plain variable is reported but never rewritten');
    }
    {
      // IS INITIAL, both shapes: the call becomes = abap_false, so does the var
      const src = 'DATA mv_ready TYPE abap_bool.\n'
        + 'IF client->check_on_init( ) IS INITIAL.\nENDIF.\nIF mv_ready IS INITIAL.\nENDIF.\n';
      const found = checkAbapRules(src).filter((x) => x.type === 'lifecycle-is-initial');
      assert(found.length === 2 && found.every((x) => x.fixes?.length === 1),
        `fix: both IS INITIAL shapes carry the = abap_false rewrite (got ${found.length})`);
      const out = applyFixes(src, found).output;
      assert(/IF client->check_on_init\( \) = abap_false\./.test(out)
        && /IF mv_ready = abap_false\./.test(out),
        'fix: IS INITIAL is spelled out as = abap_false in both shapes');
    }

    // --- trailing-empty-event-arg: a row with its line to itself --------------
    {
      const src = 'client->_event( val = `PICK`\n'
        + '  t_arg = VALUE #( ( `${/ID}` )\n'
        + '                   ( `` )\n'
        + '                 ) ).\n';
      const found = checkAbapRules(src).filter((x) => x.type === 'trailing-empty-event-arg');
      assert(found.length === 1 && found[0].fixes?.length === 1,
        'fix: the trailing empty row carries its deletion');
      assert(applyFixes(src, found).output === 'client->_event( val = `PICK`\n'
        + '  t_arg = VALUE #( ( `${/ID}` )\n'
        + '                 ) ).\n',
        'fix: a row with its line to itself takes the whole line with it');
    }
    {
      // a comment next to the row is never deleted with it
      const src = 'client->_event( val = `PICK`\n'
        + '  t_arg = VALUE #( ( `${/ID}` ) " why\n'
        + '                   ( `` ) ) ).\n';
      const found = checkAbapRules(src).filter((x) => x.type === 'trailing-empty-event-arg');
      const out = applyFixes(src, found).output;
      assert(/ " why\n/.test(out) && !/\( `` \)/.test(out),
        'fix: the row goes, the comment beside the constructor stays');
    }
});

// ----------------------------------------------------------------- stdin ----
// --stdin: the property gate over piped source - the editor/pre-commit case.
// The render gate stays off (a piped buffer has no file corpus), exit codes
// and formats behave exactly as for a file
section('stdin', async () => {
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const run = (args, input) => {
      try {
        return { out: cp.execFileSync('node', [CLI, ...args], { input, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } }), code: 0, err: '' };
      } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
    };
    const abap = fs.readFileSync(f('broken.clas.abap'), 'utf8');

    const plain = run(['--stdin', '--no-config'], abap);
    assert(plain.code === 1 && /unknown-control/.test(plain.out) && /^<stdin>$/m.test(plain.out),
      `stdin: piped ABAP is judged by the property gate and reported under <stdin> (exit ${plain.code})`);

    const named = run(['--stdin', '--stdin-filename', 'zcl_my.clas.abap', '--no-config', '--json'], abap);
    const doc = JSON.parse(named.out);
    assert(doc.results[0].file === 'zcl_my.clas.abap' && doc.problems > 0,
      'stdin: --stdin-filename names the source in the report');

    // the filename decides the handling: a .view.xml name goes down the XML path
    const xml = fs.readFileSync(f('badvalue.view.xml'), 'utf8');
    const asXml = run(['--stdin', '--stdin-filename', 'bad.view.xml', '--no-config'], xml);
    assert(asXml.code === 1 && /invalid-property-value/.test(asXml.out),
      'stdin: a .view.xml filename is checked as a raw view');

    const clean = run(['--stdin', '--stdin-filename', 'ok.view.xml', '--no-config'], fs.readFileSync(f('sample.view.xml'), 'utf8'));
    assert(clean.code === 0 && /Success!/.test(clean.out), 'stdin: a clean pipe exits 0');

    // incompatible modes are refused rather than silently ignored
    // --render-pages counts as ASKING for the render gate (like the config's
    // object form), which is also what keeps a missing runtime a hard refusal
    // instead of a silent property-only fallback on a tuned gate
    for (const [extra, why] of [[['--fix'], 'no file to rewrite'], [['--render'], 'property gate only'], [['--render-pages', '2'], 'tuning the pool asks for the gate'], [['--screenshot', 'x.png'], 'screenshot needs files']]) {
      const r = run(['--stdin', '--no-config', ...extra], abap);
      assert(r.code === 2, `stdin: --stdin with ${extra[0]} is refused (${why}; exit ${r.code})`);
    }
});

// ------------------------------------------------------------ ci formats ----
// checkstyle and junit: the two XML shapes most CI systems ingest natively.
// Thin renderers over the same problemsOf() walk - asserted on shape,
// escaping and the severity mapping
section('ci formats', async () => {
    const cp = await import('node:child_process');
    const { FORMATS, formatCheckstyle, formatJunit } = await import('../lib/report.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const run = (args) => {
      try {
        return cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } });
      } catch (e) { return e.stdout ?? ''; }
    };
    assert(FORMATS.includes('checkstyle') && FORMATS.includes('junit'),
      'ci formats: both are offered by --format');

    const cs = run([f('dumps.clas.abap'), '--no-render', '--format', 'checkstyle']);
    assert(/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(cs) && /<checkstyle version="4\.3">/.test(cs),
      'checkstyle: the document opens with the declaration and the checkstyle root');
    assert(/<file name="[^"]*dumps\.clas\.abap">/.test(cs),
      'checkstyle: one <file> element per result');
    assert(/<error line="\d+" column="\d+" severity="error" message="[^"]+" source="duplicate-property"\/>/.test(cs),
      'checkstyle: a problem is an <error> with line, column, severity, message and rule id');
    assert(!/severity="hint"/.test(formatCheckstyle([{ file: 'x', findings: [{ type: 'missing-accessibility', severity: 'hint', message: 'm', line: 1, column: 1 }], renderErrors: [], notes: [] }]))
      && /severity="info"/.test(formatCheckstyle([{ file: 'x', findings: [{ type: 'missing-accessibility', severity: 'hint', message: 'm', line: 1, column: 1 }], renderErrors: [], notes: [] }])),
      'checkstyle: our hint maps to checkstyle\'s info');
    // escaping: a message carrying every XML-hostile character survives as text
    const hostile = formatCheckstyle([{ file: 'a<b>&"\'.abap', findings: [{ type: 'unknown-control', severity: 'error', message: 'x < y & "z" \'w\'', line: 1, column: 2 }], renderErrors: [], notes: [] }]);
    assert(/name="a&lt;b&gt;&amp;&quot;&apos;\.abap"/.test(hostile) && /message="x &lt; y &amp; &quot;z&quot; &apos;w&apos;"/.test(hostile),
      'checkstyle: names and messages are XML-escaped');

    const ju = run([f('dumps.clas.abap'), '--no-render', '--format', 'junit']);
    assert(/<testsuites name="abap2ui5-linter" tests="2" failures="2">/.test(ju),
      `junit: the root carries the totals (got ${ju.split('\n')[1]})`);
    assert(/<testsuite name="[^"]*dumps\.clas\.abap" tests="2" failures="2" errors="0">/.test(ju),
      'junit: one <testsuite> per file with its own counts');
    assert(/<testcase name="duplicate-property at \d+:\d+" classname="[^"]*dumps\.clas\.abap">/.test(ju)
      && /<failure message="[^"]+" type="error">/.test(ju),
      'junit: a problem is a failing <testcase> naming the rule and position');
    // a clean file is a PASSING testcase, so the test tab shows it was seen
    const clean = formatJunit([{ file: 'ok.clas.abap', findings: [], renderErrors: [], notes: [] }]);
    assert(/<testsuite name="ok\.clas\.abap" tests="1" failures="0" errors="0">/.test(clean)
      && /<testcase name="clean" classname="ok\.clas\.abap"\/>/.test(clean),
      'junit: a clean file is one passing testcase, not an empty document');
});

// ---------------------------------------------------------------- report ----
section('report', async () => {
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

    /* ruleHits: rule id -> what the gate PRODUCED, before the rules block,
     * directives or a baseline suppressed anything. The additive stats key
     * that tells a fully suppressed corpus apart from one nothing fired on. */
    assert(json.stats.ruleHits && json.stats.ruleHits['duplicate-property'] === json.stats.rules['duplicate-property'],
      'report: stats.ruleHits mirrors the reported counts when nothing is suppressed');
    {
      const dir = tempDir('a2ui5-hits-');
      fs.writeFileSync(path.join(dir, 'off.jsonc'), '{"rules": {"duplicate-property": false}}');
      const offJson = JSON.parse(run([dumps, '--no-render', '--json', '--config', path.join(dir, 'off.jsonc')]));
      assert(offJson.stats.rules['duplicate-property'] === undefined,
        'report: the switched-off rule reports nothing');
      assert(offJson.stats.ruleHits['duplicate-property'] >= 1,
        'report: ...but ruleHits still says it fired - the instrumentation survives suppression');
      fs.rmSync(dir, { recursive: true, force: true });
    }

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

    /* A message that carries a backslash right before a pipe. Escaping only
     * the pipe leaves `\\|` - an escaped backslash followed by a LIVE column
     * separator - so the row the escaping exists to keep intact is the one it
     * breaks, in markdown that goes into a pull request comment. */
    const { formatMarkdown } = await import('../lib/report.mjs');
    const row = formatMarkdown(
      [{
        file: 'x.clas.abap',
        findings: [{ line: 1, column: 1, severity: 'error', message: String.raw`path \|foo| is odd`, rule: 'r' }],
        renderErrors: [],
      }],
      { totals: { error: 1, warning: 0, hint: 0 } },
    ).split('\n').find((l) => l.includes('is odd'));
    /* Parsed the way a renderer parses it: a backslash escapes the character
     * after it, so only an UNESCAPED pipe ends a cell. */
    const cellsOf = (line) => {
      const out = [];
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') { cur += line[++i] ?? ''; continue; }
        if (line[i] === '|') { out.push(cur); cur = ''; continue; }
        cur += line[i];
      }
      out.push(cur);
      return out.slice(1, -1).map((c) => c.trim());
    };
    assert(row && cellsOf(row).length === 4 && cellsOf(row)[2] === String.raw`path \|foo| is odd`,
      'report: a backslash in a message cannot open a column of its own');

    /* The machine report written BESIDE the human one. Without it a workflow
     * that wants the annotated log AND a SARIF file for code scanning has to run
     * the whole gate twice, paying the render half again - which is why the
     * composite action reads its outputs from --json-out. */
    {
      const os = await import('node:os');
      const dir = tempDir('a2ui5-out-');
      const sarifAt = path.join(dir, 'nested', 'report.sarif');
      const jsonAt = path.join(dir, 'report.json');
      const human = run([dumps, '--no-render', '--sarif-out', sarifAt, '--json-out', jsonAt]);
      assert(/^2 problems /m.test(human),
        'report: --sarif-out leaves stdout the human report it always was');
      const sarif = JSON.parse(fs.readFileSync(sarifAt, 'utf8'));
      assert(sarif.version === '2.1.0' && sarif.runs[0].results.length === 2,
        `report: --sarif-out writes the SARIF document, creating the directory (${sarif.runs?.[0]?.results?.length})`);
      const asJson = JSON.parse(fs.readFileSync(jsonAt, 'utf8'));
      assert(asJson.problems === 2 && asJson.totals.error === 2 && asJson.files === 1,
        'report: --json-out writes the same document --json prints, counts and all');
      assert(JSON.parse(run([dumps, '--no-render', '--json'])).problems === asJson.problems,
        'report: and it is the same document, not a second opinion');
      fs.rmSync(dir, { recursive: true, force: true });
    }

    assert(/^abap2ui5lint \d+\.\d+\.\d+ \(.*cli\.mjs\)$/m.test(run(['--version'])),
      'report: --version prints version and script location');

    /* --help prints the man page, and the man page documents every flag.
     *
     * It used to print the 800-character single-line USAGE while the structured
     * 100-line header sat unread at the top of cli.mjs - and because nothing
     * compared the two, the header had gone stale: no --baseline, no --init, no
     * --help, and --format still offering three of the four formats. The two
     * lists are gated against each other now, in both directions. */
    const help = run(['--help']);
    assert(help.split('\n').length > 40 && /^Options:$/m.test(help) && /^Gates:$/m.test(help),
      `report: --help prints the structured man page, not the one-line usage (${help.split('\n').length} lines)`);
    let usage = '';
    try { cp.execFileSync('node', [CLI, '--nope'], { encoding: 'utf8' }); }
    catch (e) { usage = e.stderr ?? ''; }
    assert(/^abap2ui5lint: unknown option '--nope'/.test(usage) && /\[paths\.\.\.\]/.test(usage),
      'report: a bad flag still gets the usage reminder');

    /* …wrapped, and pointing at the help that says what the flags DO.
     *
     * The reminder is one 679-character string. Printed as one line it reached
     * the reader as nine ragged terminal-wrapped lines with bracketed groups
     * split down the middle - and that reader has just mistyped a flag, so it
     * is the worst moment for a wall. `--help` was moved off this same string
     * for the same reason; the error path had kept it.
     *
     * Wrapped rather than shortened on purpose: the full list is what the two
     * assertions below compare against `--help`, in both directions, and that
     * gate has already caught a stale header once. A short usage line would
     * leave them nothing to compare. */
    const usageLines = usage.split('\n').filter((l) => /^(usage:|\s+\[)/.test(l));
    assert(usageLines.length > 1 && usageLines.every((l) => l.length <= 78),
      `report: the usage reminder is wrapped, not one long line (longest ${Math.max(0, ...usageLines.map((l) => l.length))})`);
    assert(usageLines.every((l) => (l.match(/\[/g) || []).length === (l.match(/\]/g) || []).length),
      'report: and no bracketed group is split across a line boundary');
    assert(/try `abap2ui5lint --help`/.test(usage),
      'report: the reminder points at --help, which is where the flags are explained');
    const flagsIn = (text) => new Set([...text.matchAll(/--[a-z][a-z0-9-]+/g)].map((m) => m[0]));
    const inUsage = [...flagsIn(usage)].filter((x) => x !== '--nope');
    const undocumented = inUsage.filter((flag) => !help.includes(flag));
    assert(!undocumented.length,
      `report: every flag the usage line offers is documented in --help (missing: ${undocumented.join(', ') || 'none'})`);
    // …and the other way: a flag the header describes and the usage line forgot
    const NOT_IN_USAGE = new Set(['--min-ui5', '--openui5', '--json', '--no-config', '--fix-dry-run']);
    const missingFromUsage = [...flagsIn(help)]
      .filter((flag) => !usage.includes(flag) && !NOT_IN_USAGE.has(flag));
    assert(!missingFromUsage.length,
      `report: every documented flag is offered by the usage line too (missing: ${missingFromUsage.join(', ') || 'none'})`);

    // --init: the config a new project starts from. It has to parse with the
    // linter's OWN loader (it is jsonc with comments), point $schema at the
    // installed copy rather than at main, and refuse to overwrite.
    {
      const { loadConfig } = await import('../lib/config.mjs');
      const os = await import('node:os');
      const dir = tempDir('a2ui5-init-');
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
});

// ---------------------------------------- run summary, progress and badge ----
// What a CLEAN corpus run says about itself. Without these three, a run over
// a few hundred classes prints "148 files, no findings" and a reader cannot
// tell a gate that judged thousands of controls from one that judged nothing
section('run summary, progress and badge', async () => {
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
    const dir = tempDir('a2ui5badge-');
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
});

// ----------------------------------------------------- peer render runtime ----
/* The render runtime is an OPTIONAL PEER of this package, and the two are
 * released from one tag by `npm version --workspaces`. That bump moves both
 * versions and touches no dependency range, so the peer range is the one thing
 * in the release that nothing moves and nothing reads back - and it rotted at
 * `^0.1.0` across three releases while the workspace went to 0.2.1.
 *
 * The consequence is not a missing warning, it is the opposite of the
 * documented guarantee: npm rejects an optional peer that is present and out of
 * range, so `npm i @abap2ui5/linter@0.2.1 @abap2ui5/render-runtime@0.2.1` - the
 * pairing render-runtime/README.md tells everyone to install - failed with
 * ERESOLVE, while the stale 0.1 line was the only one npm accepted.
 *
 * So the range is gated against the workspace it ships with: a release that
 * bumps the workspace and forgets the range fails here instead of on a user's
 * install.
 *
 * It is also GENERATED now (`npm run sync-peer-range`). The old union grew a
 * `|| ^0.N.0` clause per minor and had to be extended by hand at every
 * release, which is the step the three misses were; the bounded form
 * `>=FLOOR <breakingAfter(runtime)` has one moving part and a script that
 * moves it. Only the lower bound stays a judgement - dropping a supported line
 * is an ERESOLVE for everybody still on it, so FLOOR needs a reason (a runtime
 * the linter cannot work without), not a tidy-up. */
section('peer range', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const rt = JSON.parse(fs.readFileSync(path.join(ROOT, 'render-runtime', 'package.json'), 'utf8'));
    const range = pkg.peerDependencies[rt.name];
    const { satisfies, expectedRange, breakingAfter } = await import('../scripts/peer-range.mjs');

    assert(satisfies(range, rt.version) === true,
      `peer range: '${range}' admits the render runtime this repo releases with it (${rt.version})`
      + ' - npm refuses an out-of-range optional peer outright (ERESOLVE), so a stale range forbids'
      + ' exactly the pairing the READMEs tell everyone to install');
    assert(range === expectedRange(rt.version),
      `peer range: the committed range is the generated one (npm run sync-peer-range) - '${range}' vs '${expectedRange(rt.version)}'`);
    assert(satisfies(range, breakingAfter(rt.version)) === false,
      `peer range: and it STOPS at the next breaking runtime line (${breakingAfter(rt.version)})`);
    assert(pkg.peerDependenciesMeta[rt.name].optional === true,
      'peer range: the render runtime stays OPTIONAL - the property gate is the small install');

    // the reader itself, since two gates and one CI script now trust it
    assert(satisfies('^0.2.1', '0.2.9') === true && satisfies('^0.2.1', '0.3.0') === false
      && satisfies('^0.2.1', '0.2.0') === false,
    'peer range: the caret reader treats the minor as the 0.x compatibility boundary');
    assert(satisfies('^1.2.0', '1.9.0') === true && satisfies('^1.2.0', '2.0.0') === false,
      'peer range: …and the major from 1.0.0 on');
    assert(satisfies('>=0.1.0 <0.6.0', '0.5.1') === true
      && satisfies('>=0.1.0 <0.6.0', '0.6.0') === false,
    'peer range: a two-term range is an AND');
    assert(satisfies('^0.2.0 || ^0.5.0', '0.5.1') === true,
      'peer range: alternatives are an OR, so an older union still reads correctly');
    assert(satisfies('workspace:*', '0.5.1') === null && satisfies('~0.5.0', '0.5.1') === null,
      'peer range: a shape the reader does not know answers null, never a confident false');
});

// --------------------------------------------------------------- typings ----
// types.d.ts is the typed contract of the exports map: hand-written (the
// implementation has no TypeScript build step by design), gated here so it
// can neither go stale against the exports map nor stop parsing
section('typings', async () => {
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

    /* Every RUNTIME export of every subpath has a declaration.
     *
     * The structural check above only asks whether the module block exists, so
     * fifteen public symbols - `elementBoundSlots`, the whole opt-in mechanism,
     * the four render constants cli.mjs itself uses - sat behind a declared
     * module and were still untypable by a consumer. The vscode-extension job
     * typechecks against exactly this file, so what is missing here is missing
     * there. Read the blocks out of the file rather than from tsc: the
     * declarations are ambient, and nothing else in the repo imports them. */
    const bodies = {};
    {
      const heads = [...dts.matchAll(/declare module "([^"]+)"\s*\{/g)]
        .map((m) => [m[1], m.index + m[0].length]);
      heads.forEach(([name, from], i) => {
        bodies[name] = dts.slice(from, i + 1 < heads.length ? heads[i + 1][1] : dts.length);
      });
    }
    const undeclaredNames = [];
    for (const [sub, cond] of subpaths) {
      const mod = sub === '.' ? '@abap2ui5/linter' : `@abap2ui5/linter/${sub.slice(2)}`;
      /* pathToFileURL, not the path: the ESM loader takes file:// URLs, and on
       * Windows an absolute path starts with a drive letter it reads as a
       * protocol - ERR_UNSUPPORTED_ESM_URL_SCHEME, "Received protocol 'd:'"
       * (one of the windows-latest failures in linter#67). */
      const runtime = Object.keys(await import(pathToFileURL(path.join(ROOT, cond.default)).href));
      const declared = new Set(
        [...(bodies[mod] ?? '').matchAll(/export (?:declare )?(?:function|const|class|interface|type|enum)\s+(\w+)/g)]
          .map((m) => m[1]),
      );
      for (const name of runtime) if (!declared.has(name)) undeclaredNames.push(`${mod}#${name}`);
    }
    assert(!undeclaredNames.length,
      `typings: every runtime export of every subpath is declared (missing: ${undeclaredNames.join(', ') || 'none'})`);

    /*
     * Every OPTION a function reads, and every KEY a result carries.
     *
     * The check above asks whether each exported NAME is declared; a function
     * can be declared and still lie about what it takes. An option the runtime
     * reads and types.d.ts omits cannot be passed from TypeScript without a
     * cast, so a consumer silently does not pass it and the rules behind it
     * never fire for that consumer while CI reports them - `checkNodes` alone
     * had four such options, and the VS Code extension's in-process gate ran
     * five rules fewer than the CLI because of them.
     *
     * The names are read out of the signatures and the result keys out of a
     * real call, so neither side can be guessed at.
     */
    const optionsOf = (file, fn) => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const sig = new RegExp(`export function ${fn}\\([^)]*?\\{([^}]*)\\}`).exec(src);
      if (!sig) return [];
      // the NAME of each destructured entry, never the default value after `=`
      return sig[1].split(',').map((part) => /^\s*(\w+)/.exec(part)?.[1]).filter(Boolean);
    };
    for (const [file, fn, mod] of [
      ['lib/properties.mjs', 'checkNodes', '@abap2ui5/linter/properties'],
      ['lib/abap-rules.mjs', 'checkAbapRules', '@abap2ui5/linter/abap-rules'],
    ]) {
      const declared = bodies[mod] ?? '';
      const opts = optionsOf(file, fn);
      const missing = opts.filter((name) => !new RegExp(`\\b${name}\\??:`).test(declared));
      assert(opts.length > 3 && !missing.length,
        `typings: ${fn} declares every option it reads (missing: ${missing.join(', ') || 'none'})`);
    }
    {
      const { prepareAbap } = await import('../lib/reconstruct.mjs');
      const prepared = prepareAbap(fs.readFileSync(path.join(FIX, 'good.clas.abap'), 'utf8'));
      const declared = bodies['@abap2ui5/linter/reconstruct'] ?? '';
      const missing = Object.keys(prepared)
        .filter((key) => !new RegExp(`\\b${key}\\??:`).test(declared));
      assert(Object.keys(prepared).length > 5 && !missing.length,
        `typings: PreparedAbap declares every key prepareAbap returns (missing: ${missing.join(', ') || 'none'})`);
    }

    // tsc --noEmit keeps the file syntactically and internally valid. typescript
    // is a devDependency used ONLY for this check - there is still no build step
    const { createRequire } = await import('node:module');
    let tsc = null;
    /* Through the package's own `bin` field, NOT by resolving a subpath.
     * typescript 7 has an `exports` map that does not expose ./bin/tsc, so
     * `resolve('typescript/bin/tsc')` throws on the version this repo pins -
     * and the catch below read that as "typescript not installed" and skipped
     * the gate. A check that reports itself skipped is at least honest; one
     * that reports itself skipped for the wrong reason is how it stays skipped. */
    try {
      const req = createRequire(import.meta.url);
      const manifest = req.resolve('typescript/package.json');
      tsc = path.join(path.dirname(manifest), req('typescript/package.json').bin.tsc);
      if (!fs.existsSync(tsc)) tsc = null;
    } catch { /* not installed */ }
    if (tsc) {
      let ok = true;
      let msg = '';
      try {
        // --types node: ScreenshotResult.png is a Buffer, which is a Node global
        // and not an ambient one. Without it the gate fails on the typings a
        // consumer (who has @types/node) reads perfectly well.
        cp.execFileSync('node', [tsc, '--noEmit', '--strict', '--target', 'es2022', '--types', 'node', 'types.d.ts'],
          { cwd: ROOT, encoding: 'utf8' });
      } catch (e) { ok = false; msg = (e.stdout || e.stderr || '').trim().slice(0, 400); }
      assert(ok, `typings: types.d.ts type-checks clean (${msg || 'tsc --noEmit'})`);
    } else {
      assert(true, 'typings: typescript not installed - tsc check skipped (structural gate above still ran)');
    }
});

// ---------------------------------------------------------------- schema ----
section('schema', async () => {
    const { render, SCHEMA_FILE } = await import('../scripts/generate-schema.mjs');
    const committed = fs.readFileSync(SCHEMA_FILE, 'utf8');
    assert(committed === render(), 'schema: data/abap2ui5lint.schema.json is in sync (npm run generate-schema)');
    const schema = JSON.parse(committed);
    const { RULES, RENDER_RULE } = await import('../lib/findings.mjs');
    // + 1: the render gate's pseudo-rule is offered in the rules block too
    assert(Object.keys(schema.properties.rules.properties).length === RULES.length + 1
      && RULES.includes('duplicate-id') && schema.properties.rules.properties[RENDER_RULE],
      'schema: every rule id plus the render pseudo-rule is offered to the editor');

    /* The loader's KNOWN set and the schema's properties are the same list seen
     * from two sides: a key only the loader knows is a red squiggle over a
     * working config, a key only the schema knows is completion for something
     * that then fails loudly. */
    /* A `$id` on `main` is the very skew --init exists to solve: an editor
     * validating a pinned CLI's config against whatever rules main holds, so a
     * rule id the installed version does not have completes cleanly and then
     * fails loudly on the command line. */
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8')).version;
    assert(schema.$id === `https://raw.githubusercontent.com/abap2UI5/linter/v${pkgVersion}/data/abap2ui5lint.schema.json`,
      `schema: the $id names a version, not a branch (${schema.$id})`);

    const { KNOWN } = await import('../lib/config.mjs');
    const offered = new Set(Object.keys(schema.properties));
    const missing = [...KNOWN].filter((k) => !offered.has(k));
    const extra = [...offered].filter((k) => !KNOWN.has(k));
    assert(!missing.length && !extra.length,
      `schema: the offered keys are exactly the ones the loader accepts (loader-only: ${missing.join(', ') || 'none'}; schema-only: ${extra.join(', ') || 'none'})`);
});

// ----------------------------------------------------------- rules page ----
section('rules page', async () => {
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

    /* …and an EXAMPLE. The suite already gated example correctness (the builder
     * verbs below); presence went ungated, and 36 of 94 rules had none - among
     * them the highest-traffic errors there are. The README delegates all rule
     * documentation to this page, so a rule without an example is a rule whose
     * documentation says a shape is wrong without ever showing the shape. */
    const exampleless = Object.entries(RULE_DOCS).filter(([, d]) => !d.example).map(([id]) => id);
    assert(!exampleless.length,
      `rules page: every rule shows the source that triggers it (no example: ${exampleless.join(', ') || 'none'})`);

    /* …and the SAME source fixed. Showing only the defect leaves the reader to
     * invent the fix, and several examples used to smuggle one in as a trailing
     * line of the same snippet - which cost `example` its meaning, because
     * nothing said which of the two lines was the reported one. The pair is
     * also what the reports deep-link at, so a rule without a remedy is a
     * report link that lands on half an answer. */
    const remedyless = Object.entries(RULE_DOCS).filter(([, d]) => !d.remedy).map(([id]) => id);
    assert(!remedyless.length,
      `rules page: every rule shows the same source fixed (no remedy: ${remedyless.join(', ') || 'none'})`);

    /* A remedy identical to the example documents nothing, and is what a
     * copy-paste while adding a rule produces. */
    const unchanged = Object.entries(RULE_DOCS).filter(([, d]) => d.example === d.remedy).map(([id]) => id);
    assert(!unchanged.length,
      `rules page: the remedy differs from the example (identical: ${unchanged.join(', ') || 'none'})`);

    // no category may become the page's dumping ground again: the abap2UI5 half
    // was one flat group of 54, which on a searchable page is no grouping at all
    const perCategory = CATEGORIES.map((c) => [c.id, Object.values(RULE_DOCS).filter((d) => d.category === c.id).length]);
    const empty = perCategory.filter(([, n]) => n === 0).map(([id]) => id);
    assert(!empty.length, `rules page: every category has rules in it (empty: ${empty.join(', ') || 'none'})`);
    const biggest = perCategory.reduce((a, b) => (b[1] > a[1] ? b : a));
    assert(biggest[1] <= pageRules.length / 3,
      `rules page: no single category holds a third of the rule set (${biggest[0]} has ${biggest[1]} of ${pageRules.length})`);

    assert(FIXABLE.every((id) => RULES.includes(id) && RULE_DOCS[id].fixNote),
      'rules page: an autofixable rule says on the page what --fix does to it');

    const page = fs.readFileSync(PAGE_FILE, 'utf8');
    assert(page === buildPage(), 'rules page: site/index.html is in sync (npm run generate-rules-page)');
    assert(pageRules.every((id) => page.includes(`<article class="rule" id="${id}"`)),
      'rules page: every rule has an anchor to link to');
    /* Self-contained: nothing the browser has to FETCH. Asked of the attributes
     * that fetch (src/href) rather than of the raw text, because a rule about a
     * commercial UI5 host has to be able to print that host in its example -
     * a URL inside a <code> block is documentation, not a request. */
    const fetched = [...page.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((m) => m[1])
      .filter((u) => /^https?:/.test(u) && !/^https:\/\/(github\.com|abap2ui5\.github\.io)\//.test(u));
    assert(!/<script\s+src|<link\b[^>]*stylesheet/.test(page) && !fetched.length,
      `rules page: self-contained - no external stylesheet, script or font (fetches: ${fetched.join(', ') || 'none'})`);
    // and the offsite links that ARE there are links, not loads
    assert(page.includes('https://github.com/abap2UI5/linter'),
      'rules page: …while still linking back to the repository');

    /* The page is served from main and every consumer pins, so without a stamp a
     * reader cannot tell which release it describes - a card for a rule their CLI
     * does not have reads exactly like a card for one it does. */
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8')).version;
    assert(page.includes(`<strong>v${pkgVersion}</strong>`),
      `rules page: the page stamps the version it was generated from (v${pkgVersion})`);
    const snapshotVer = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8')).ui5Version;
    assert(page.includes(`OpenUI5 ${snapshotVer} metadata`),
      `rules page: …and the metadata snapshot it was generated against (${snapshotVer})`);

    /* Two numbers for one tool: the page counted RULES + render-error while
     * --badge counts RULES, so the same run advertised 94 and 93. The page names
     * both now, and says why they differ. */
    assert(page.includes(`Filter ${RULES.length} rules + ${RENDER_RULE}`),
      `rules page: the filter counts the configurable rules and names the pseudo-rule separately (${RULES.length})`);
    assert(page.includes(`“${RULES.length} rules passed”`) && page.includes(`${pageRules.length} cards`),
      'rules page: the footer reconciles its card count with what --badge says');

    // the footer used to send the reader to the README for "metadata snapshot
    // and gate details", which the README stopped carrying
    assert(!/README<\/a>\.\s*<\/footer>/.test(page) && page.includes('abap2ui5.github.io/docs/advanced/linter.html'),
      'rules page: the footer points at documentation that still exists');

    // There was a fifth gate here, over the README's hand-written finding
    // tables. It is gone with the tables: the rule reference is RULE_DOCS and
    // the page generated from it, and the README now links that page instead of
    // keeping a second copy of the rule list by hand. What that gate protected -
    // a rule nobody can look up - is the `every rule is documented` assertion
    // above, which reads the registry rather than a prose table.
});


// ------------------------------------------------------------- AGENTS.md ----
/* AGENTS.md was the only ungated document in the repository.
 *
 * `npm test` gates the README's dependents block, site/index.html, the JSON
 * schema, the RULE_DOCS prose and even the builder verbs inside a rule's
 * example - and nothing looked at the file that calls itself the single source
 * of truth. It had drifted in every direction a document can: nine rules
 * missing from the emit-site table, the @openui5 pins located in the wrong
 * manifest, three counts wrong, and the second published package absent
 * entirely. The counts are read off the artefacts here rather than trusted.
 */
section('AGENTS.md', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
    const { RULES } = await import('../lib/findings.mjs');

    /* Every rule id appears somewhere in it. The emit-site table is what an
     * agent greps to find where a finding comes from, and a rule missing from it
     * is a rule that table quietly denies exists. */
    const absent = RULES.filter((id) => !agents.includes(`\`${id}\``));
    assert(!absent.length,
      `AGENTS: every rule id appears in the emit-site taxonomy (missing: ${absent.join(', ') || 'none'})`);

    /* …in the ROW of the file that actually emits it. The table's whole use is
     * "grep the id to find the exact line", so a rule listed under the wrong
     * file is worse than one listed nowhere: it sends the reader somewhere.
     * Derived from `type: '<id>'` in the sources, which is how every rule
     * reports, rather than from a second list here. */
    const libDir = path.join(ROOT, 'lib');
    const rows = Object.fromEntries(agents.split('\n')
      .filter((l) => /^\| `lib\/[\w-]+\.mjs` \|/.test(l))
      .map((l) => [l.match(/^\| `lib\/([\w-]+\.mjs)`/)[1], l]));
    const misfiled = [];
    for (const file of fs.readdirSync(libDir).filter((n) => n.endsWith('.mjs'))) {
      const text = fs.readFileSync(path.join(libDir, file), 'utf8');
      for (const id of RULES) {
        if (!new RegExp(`type: '${id}'`).test(text)) continue;
        // a rule may legitimately be emitted from two files (the two halves of
        // raw-javascript-to-frontend); it needs a row that names it, not all of them
        const named = Object.entries(rows).some(([f, row]) => f === file && row.includes(`\`${id}\``));
        const namedAnywhere = Object.values(rows).some((row) => row.includes(`\`${id}\``));
        if (!named && !namedAnywhere) misfiled.push(`${id} emits in lib/${file}`);
        else if (!named && !rows[file]) misfiled.push(`lib/${file} has no row (emits ${id})`);
      }
    }
    assert(!misfiled.length,
      `AGENTS: the taxonomy sends a reader to the file that emits the rule (${[...new Set(misfiled)].slice(0, 6).join('; ') || 'all correct'})`);

    // …and nothing in the table that is not a rule (a rename leaves the old name
    // behind, which reads exactly like a rule nobody can find the emit site for)
    // `render-error` and `open-levels` are real ids the registry deliberately
    // does not carry; `view-gates` is the consumer's gate script, named in the
    // same row as the rules it neutralises
    const KNOWN_NON_RULES = new Set(['render-error', 'frozen-view-builder', 'open-levels', 'chain-house-layout', 'view-gates']);
    const tableRow = agents.split('\n').filter((l) => l.startsWith('| `lib/'));
    const named = [...new Set(tableRow.join('\n').match(/`[a-z][a-z0-9-]+`/g) ?? [])]
      .map((t) => t.slice(1, -1))
      .filter((t) => t.includes('-') && !t.endsWith('.mjs'));
    const ghosts = named.filter((t) => !RULES.includes(t) && !KNOWN_NON_RULES.has(t)
      && !/^(escape|note|opt|per|too|abap2ui5lint)/.test(t));
    assert(!ghosts.length,
      `AGENTS: the taxonomy names no rule that does not exist (ghosts: ${ghosts.join(', ') || 'none'})`);

    /* The quoted snapshot numbers, read off the snapshot. They were 988 controls
     * and 219 enums against an artefact holding 973 and 235 - retyped once and
     * never again. */
    const props = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8'));
    const controls = Object.keys(props.controls).length;
    const enums = Object.keys(props.enums).length;
    const kB = Math.round(fs.statSync(path.join(ROOT, 'data', 'properties.json')).size / 1024);
    const quoted = agents.match(/The (\d+) KB one-line snapshot \(`ui5Version` ([\d.]+), (\d+) controls, (\d+)\s*\n?enums\)/);
    assert(quoted, 'AGENTS: the snapshot header sentence is where the gate expects it');
    assert(quoted && Number(quoted[3]) === controls && Number(quoted[4]) === enums,
      `AGENTS: the quoted control/enum counts match the snapshot (says ${quoted?.[3]}/${quoted?.[4]}, is ${controls}/${enums})`);
    assert(quoted && quoted[2] === props.ui5Version,
      `AGENTS: …and the quoted ui5Version (says ${quoted?.[2]}, is ${props.ui5Version})`);
    assert(quoted && Math.abs(Number(quoted[1]) - kB) <= 5,
      `AGENTS: …and the file size, to within a rounding (says ${quoted?.[1]} KB, is ${kB} KB)`);

    /* The assertion count, as a FLOOR. An exact number would have to be edited by
     * every PR that adds one; a floor only fails when assertions are removed,
     * which is the direction worth catching. */
    const floorQuoted = agents.match(/over (\d+) assertions/);
    assert(floorQuoted, 'AGENTS: the build section quotes an assertion floor');
    // counted from the source rather than at runtime, so the comparison does not
    // depend on where in the file this assertion happens to sit
    const assertSites = (fs.readFileSync(path.join(ROOT, 'test', 'run.mjs'), 'utf8').match(/assert\(/g) ?? []).length;
    assert(floorQuoted && Number(floorQuoted[1]) <= assertSites,
      `AGENTS: the quoted assertion floor is one this suite still clears (says over ${floorQuoted?.[1]}, has ${assertSites} call sites)`);

    // the second published package, absent from this file entirely until 2026-08
    assert(/^## `@abap2ui5\/render-runtime`/m.test(agents)
      && agents.includes('render-runtime/package.json')
      && agents.includes('optional peer'),
    'AGENTS: the render runtime - the second package, the peer split, the workspace - has a section');
    assert(!/pins in `package\.json`/.test(agents),
      'AGENTS: the @openui5 pins are located in the workspace manifest, where they actually are');
});

// ------------------------------------------------- line endings ----
/* The suite reads repository files at 93 call sites and cuts fixtures apart
 * with \n-anchored patterns. On a Windows clone with the default
 * core.autocrlf=true those patterns match nothing, and a pattern that stops
 * matching does not fail - it passes by checking less. Six suites went red on
 * the windows-latest job for exactly that reason, while the LINTER itself was
 * measured to report identically on CRLF input.
 *
 * `.gitattributes` pins every checkout to LF. This is the gate that says so,
 * because the alternative is trusting a setting nobody re-reads. */
section('line endings', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const attrs = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
    assert(/^\*\s+text=auto\s+eol=lf$/m.test(attrs),
      'line endings: .gitattributes pins the whole tree to LF');

    const crlf = [];
    const skip = new Set(['node_modules', '.git', '.playwright']);
    const walk = (dir, rel = '') => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const at = path.join(dir, e.name);
        const key = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(at, key); continue; }
        if (!/\.(abap|mjs|json|jsonc|md|yml|xml|html|ts|sh)$/.test(e.name)) continue;
        if (fs.readFileSync(at).includes('\r\n')) crlf.push(key);
      }
    };
    walk(ROOT);
    assert(!crlf.length,
      `line endings: no tracked text file carries CRLF (${crlf.slice(0, 5).join(', ') || 'none'})`);
});

// ------------------------------------- workflows and the composite action ----
/* The Action is the surface every EXTERNAL consumer runs, and until it got a
 * CI job of its own nothing in this repository executed it: a broken `run:`
 * block shipped green. That job cannot run here, so what the suite pins is the
 * half that is checkable from the file - the pins, and the promise that every
 * input the shell reads is an input the action declares.
 */
section('workflows', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const WF = path.join(ROOT, '.github', 'workflows');
    const workflows = fs.readdirSync(WF).filter((n) => n.endsWith('.yml'));
    const action = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');

    /* Every third-party action is pinned by SHA. It was true of the workflows
     * and NOT of action.yml, which floated on actions/setup-node@v7 - the one
     * file that runs inside other people's CI. */
    const floating = [];
    for (const [name, text] of [['action.yml', action],
      ...workflows.map((n) => [n, fs.readFileSync(path.join(WF, n), 'utf8')])]) {
      for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm)) {
        const ref = m[1];
        if (ref.startsWith('./')) continue;            // this repository's own action
        if (!/@[0-9a-f]{40}$/.test(ref)) floating.push(`${name}: ${ref}`);
      }
    }
    assert(!floating.length,
      `workflows: every third-party action is pinned by SHA (floating: ${floating.join(', ') || 'none'})`);

    // …and a pinned SHA without the version comment is a pin nobody can read
    const unlabelled = [];
    for (const [name, text] of [['action.yml', action],
      ...workflows.map((n) => [n, fs.readFileSync(path.join(WF, n), 'utf8')])]) {
      for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*[^\s#]+@[0-9a-f]{40}(.*)$/gm)) {
        if (!/#\s*v?\d/.test(m[1])) unlabelled.push(name);
      }
    }
    assert(!unlabelled.length,
      `workflows: every SHA pin carries the version it stands for (bare: ${[...new Set(unlabelled)].join(', ') || 'none'})`);

    /* `npm install -g npm@latest` inside the PUBLISHING job hands whatever npm
     * shipped this morning the run that holds the OIDC identity. */
    const release = fs.readFileSync(path.join(WF, 'release.yml'), 'utf8');
    assert(!/npm@latest/.test(release) && /npm install -g npm@\d+\.\d+\.\d+/.test(release),
      'workflows: the publishing job installs a PINNED npm, not @latest');

    // a superseded push should stop costing runners
    for (const name of ['ci.yml', 'downstream.yml']) {
      assert(/^concurrency:/m.test(fs.readFileSync(path.join(WF, name), 'utf8')),
        `workflows: ${name} has a concurrency group`);
    }

    /* The action reads its inputs through env only (a `${{ }}` interpolated into
     * `run:` is a shell injection), and every env binding has to name an input
     * that exists - a typo there is silently the empty string. */
    const declared = new Set([...action.matchAll(/^ {2}([a-z][a-z0-9-]*):\n {4}description:/gm)].map((m) => m[1]));
    const referenced = [...action.matchAll(/\$\{\{\s*inputs(?:\.([a-z0-9-]+)|\['([^']+)'\])\s*\}\}/g)]
      .map((m) => m[1] ?? m[2]);
    const undeclaredInputs = [...new Set(referenced)].filter((i) => !declared.has(i));
    assert(declared.size > 5 && !undeclaredInputs.length,
      `action: every referenced input is declared (undeclared: ${undeclaredInputs.join(', ') || 'none'})`);
    /* The shell bodies themselves, extracted by indentation: a `${{ }}` inside
     * one is a command injection waiting for a crafted input, which is why every
     * value travels through `env:` instead. `if:` conditions are expressions,
     * not shell, and are correctly left out. */
    const shellBodies = [];
    {
      const lines = action.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const open = lines[i].match(/^(\s*)run:\s*(.*)$/);
        if (!open) continue;
        const indent = open[1].length;
        // a one-line `run: cmd` is its own body; `run: |` collects what follows
        if (!/^[|>]/.test(open[2])) { shellBodies.push(open[2]); continue; }
        const body = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && (lines[j].match(/^\s*/)[0].length <= indent)) break;
          body.push(lines[j]);
        }
        shellBodies.push(body.join('\n'));
      }
    }
    assert(shellBodies.length >= 3 && !shellBodies.some((b) => b.includes('${{')),
      `action: inputs reach the shell through env, never interpolated into a run: block (${shellBodies.length} shell bodies checked)`);

    // the outputs a consumer workflow can gate on
    const outputs = action.slice(action.indexOf('\noutputs:'), action.indexOf('\nruns:'));
    for (const name of ['problems', 'errors', 'warnings', 'hints', 'files', 'exit-code']) {
      assert(new RegExp(`^  ${name}:$`, 'm').test(outputs), `action: declares the '${name}' output`);
    }

    /* One Node version, said in four places: package.json engines, .nvmrc,
     * .node-version, and every workflow's `node-version:`. The version managers
     * read the dotfiles and nothing read them back, so they could say anything. */
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const floor = pkg.engines.node.replace(/^>=\s*/, '').split('.')[0];
    for (const name of ['.nvmrc', '.node-version']) {
      const at = path.join(ROOT, name);
      assert(fs.existsSync(at) && fs.readFileSync(at, 'utf8').trim().split('.')[0] === floor,
        `workflows: ${name} names the engines floor (${floor})`);
    }
    const wrongNode = [];
    for (const name of workflows) {
      const text = fs.readFileSync(path.join(WF, name), 'utf8');
      for (const m of text.matchAll(/node-version:\s*(\S+)/g)) {
        if (m[1].startsWith('${{')) continue;          // a matrix entry, checked by its own list
        if (String(m[1]).split('.')[0] !== floor) wrongNode.push(`${name}: ${m[1]}`);
      }
    }
    assert(!wrongNode.length,
      `workflows: every hardcoded node-version is the engines floor (off: ${wrongNode.join(', ') || 'none'})`);

    // the hygiene files a package published with provenance and consumed by nine
    // repositories owes a reader looking for where to report something
    for (const name of ['SECURITY.md', 'CONTRIBUTING.md']) {
      assert(fs.existsSync(path.join(ROOT, name)), `repo: ${name} exists`);
    }
    assert(fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8').includes('security/advisories/new'),
      'repo: SECURITY.md names the private reporting path, not a public issue');
    for (const name of ['CODEOWNERS', 'pull_request_template.md', 'ISSUE_TEMPLATE/config.yml']) {
      assert(fs.existsSync(path.join(ROOT, '.github', name)), `repo: .github/${name} exists`);
    }

    /* The badge wording drifts with the rule count and it is user-visible - the
     * action's input description said 83 while the registry had 93. Everywhere
     * that quotes the number rather than counting it is checked here; the badge
     * ITSELF counts (lib/report.mjs), which is why that file quotes nothing. */
    const { RULES } = await import('../lib/findings.mjs');
    const stale = [];
    for (const name of ['action.yml', 'cli.mjs', 'scripts/generate-schema.mjs', 'data/abap2ui5lint.schema.json']) {
      const text = fs.readFileSync(path.join(ROOT, name), 'utf8');
      for (const m of text.matchAll(/(\d+) rules passed/g)) {
        if (Number(m[1]) !== RULES.length) stale.push(`${name}: ${m[1]}`);
      }
    }
    assert(!stale.length,
      `action: every quoted rule count is today's (registry has ${RULES.length}; stale: ${stale.join(', ') || 'none'})`);
    assert(!/\d+ rules passed/.test(fs.readFileSync(path.join(ROOT, 'lib', 'report.mjs'), 'utf8')),
      'report: the badge writer quotes no count of its own - it counts the registry at run time');
});

// ------------------------------------------------------- used-by block ----
/* The README's "Used by" list is scraped off GitHub's dependents page, which
 * is markup nobody here owns and no API replaces. The suite cannot regenerate
 * it (that needs network), so what it pins instead is the parser against a
 * saved copy of that page, and the shape of the committed block — the two
 * halves that would fail silently: a layout change that parses to nothing,
 * and a block that quietly stopped naming anyone.
 */
section('used-by', async () => {
    const dep = await import('../scripts/generate-dependents.mjs');
    const page = fs.readFileSync(f('dependents-page.html'), 'utf8');
    const rows = dep.parseDependents(page);

    assert(rows.length === 3 && rows.every((r) => r.owner && r.repo),
      `used-by: every Box-row on the saved page yields one owner/repo (${rows.length} of 3)`);
    assert(rows.some((r) => r.owner === 'abap2UI5-addons' && r.repo === 'se16n')
      && !rows.some((r) => r.repo === 'abap2UI5-addons'),
      'used-by: the repository anchor is read, not the owner anchor beside it');
    assert(dep.parseDependents(page + page).length === 3,
      'used-by: a repository listed twice across pages is counted once');

    // the pager carries an opaque cursor, and "Previous" carries one too
    assert(/dependents_after=Y3Vyc29yOjMw$/.test(dep.nextPage(page) ?? ''),
      `used-by: the Next cursor is followed, the Previous one is not (${dep.nextPage(page)})`);
    assert(dep.nextPage(page.replace(/>\s*Next/, '>Done')) === null,
      'used-by: the last page ends the walk');

    const block = dep.renderBlock(rows);
    assert(block.startsWith(dep.START) && block.endsWith(dep.END)
      && block.includes('**3 public repositories**')
      && block.includes('- [abap2UI5/samples](https://github.com/abap2UI5/samples)'),
      'used-by: the block counts what it lists and links every entry');
    assert(dep.renderBlock([{ owner: 'a', repo: 'b' }]).includes('**1 public repository**'),
      'used-by: one dependent is not "1 repositories"');

    /* Walking the pager is the other half nothing else covers: the cursor cuts
     * a list that keeps moving, so a repository can appear on two pages and
     * would be listed twice. Stubbed fetch — the point is the walk, not GitHub.
     */
    {
      const realFetch = globalThis.fetch;
      const asked = [];
      const secondPage = page.replace(/>\s*Next/, '>Done');
      globalThis.fetch = async (url) => {
        asked.push(url);
        return { ok: true, status: 200, text: async () => (asked.length === 1 ? page : secondPage) };
      };
      const walked = await dep.collect();
      globalThis.fetch = realFetch;
      assert(asked.length === 2 && walked.length === 3,
        `used-by: the walk follows the cursor and counts each repository once (${asked.length} pages, ${walked.length} rows)`);
    }

    const readme = fs.readFileSync(dep.README_FILE, 'utf8');
    assert(dep.applyToReadme(readme, block) !== readme
      && dep.applyToReadme(dep.applyToReadme(readme, block), block) === dep.applyToReadme(readme, block),
      'used-by: rewriting the block replaces it rather than stacking copies');

    const committed = readme.slice(readme.indexOf(dep.START), readme.indexOf(dep.END));
    assert(committed.includes('do not edit by hand')
      && (committed.match(/^- \[[^\]]+\]\(https:\/\/github\.com\//gm) ?? []).length >= 1,
      'used-by: the committed block is generated and still names dependents');
});


// --------------------------------------------------- github-app spike ----
/* experimental/github-app/ imports six symbols out of lib/ and nothing here
 * used to import IT, so a rename in findings.mjs or report.mjs broke the spike
 * silently - "documentation that happens to execute" only holds while it still
 * executes. These assertions are deliberately about the SEAM (the imports
 * resolve, the payload has the shape GitHub's API requires, the config is read
 * through the CLI's own loader) and not about the rules, which the rest of the
 * suite already covers.
 */
section('github-app', async () => {
    const { CHECKABLE, lintSource, toAnnotations, summarize: appSummarize } =
      await import('../experimental/github-app/review.mjs');
    const src = fs.readFileSync(f('viewrules.clas.abap'), 'utf8');

    assert(CHECKABLE.test('src/zcl_app.clas.abap') && CHECKABLE.test('src/a.view.xml')
      && CHECKABLE.test('src/a.fragment.xml') && !CHECKABLE.test('src/a.testclasses.abap'),
    'github-app: the checkable-file pattern is the abapGit convention the CLI scans by');

    const found = lintSource('src/zcl_app.clas.abap', src);
    assert(found.length > 0 && found.every((x) => x.type),
      `github-app: lintSource lints in memory, no checkout (${found.length} findings)`);
    assert(!lintSource('src/zcl_app.clas.abap', src, { rules: { 'missing-accessibility': false } })
      .some((x) => x.type === 'missing-accessibility'),
    'github-app: the repo\'s rules block reaches the in-memory gate');

    const ann = toAnnotations('src/zcl_app.clas.abap', found);
    assert(ann.length === found.length && ann.every((a) => a.path === 'src/zcl_app.clas.abap'
      && Number.isInteger(a.start_line) && a.start_line >= 1 && a.start_line === a.end_line
      && ['failure', 'warning', 'notice'].includes(a.annotation_level)
      && a.message && a.title.length <= 255),
    'github-app: every annotation carries the fields the check-runs API requires');
    // the order is problemsOf's order, which is the order the CLI prints in
    const lines = ann.map((a) => a.start_line);
    assert(lines.every((l, i) => i === 0 || lines[i - 1] <= l),
      'github-app: annotations come out in source order, like the CLI report');

    const clean = appSummarize([], []);
    assert(clean.conclusion === 'neutral' && /nothing to check/.test(clean.title),
      'github-app: a pull request touching no view is neutral, not green');
    assert(appSummarize(['a.clas.abap'], []).conclusion === 'success',
      'github-app: no findings is a pass');
    const failed = appSummarize(['a.clas.abap'], found, 'warning');
    assert(failed.conclusion === 'failure' && /which is what fails this check/.test(failed.summary),
      `github-app: findings at or above failOn fail the check (${failed.conclusion})`);
    assert(appSummarize(['a.clas.abap'], found, 'never').conclusion === 'success',
      'github-app: failOn decides the conclusion, the same knob the CLI has');

    /* configAt used to run JSON.parse(stripJsonc(raw)) itself, so a key that
     * stops the CLI dead was silently ignored by the App - which contradicts its
     * one promise. It goes through the CLI's own validator now. */
    const { parseConfig } = await import('../lib/config.mjs');
    let cfgThrew = '';
    try { parseConfig('abap2ui5lint.jsonc', '{"tpyo": 1}'); } catch (e) { cfgThrew = e.message; }
    assert(/unknown key 'tpyo'/.test(cfgThrew),
      'github-app: the config text the App fetches is validated exactly as the CLI validates the file');
    let ruleThrew = '';
    try { parseConfig('abap2ui5lint.jsonc', '{"rules": {"no-such-rule": false}}'); } catch (e) { ruleThrew = e.message; }
    assert(/unknown rule 'no-such-rule'/.test(ruleThrew),
      'github-app: and an unknown rule id fails there too');
    assert(parseConfig('c', '{"ui5": "1.96", // a comment\n}').minUi5 === '1.96',
      'github-app: parseConfig still reads jsonc - comments and trailing commas');

    // the dry run is the only end-to-end path testable without registering an
    // App, and ci.yml runs it too
    {
      const cp = await import('node:child_process');
      const out = cp.execFileSync('node',
        [path.join(FIX, '..', '..', 'experimental', 'github-app', 'dryrun.mjs'), FIX, '--json'],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const payload = JSON.parse(out);
      assert(payload.name === 'abap2UI5-linter (property gate)' && payload.status === 'completed'
        && payload.output.annotations.length > 0 && payload.output.annotations.length <= 50,
      `github-app: dryrun prints a postable check-run payload, first batch capped at 50 (${payload.output.annotations.length})`);
    }
});

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
section('robustness', async () => {
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
});

// ------------------------------------------------------- rule coverage ----
/* Every rule the linter offers has to FIRE somewhere in this suite.
 *
 * The gap this closes was invisible by construction: 83 of the 84 rules were
 * asserted and the 84th (`escaped-brace-in-backtick`) simply had no test.
 * Nothing was in a position to say so — a rule that stops firing keeps this
 * suite green, ships, and reports nothing until somebody notices by hand.
 *
/* The 2026-08-30 round: the frontend's remaining closed sets (arity, arg
 * kinds, the lazily-required globals' release floors, the aggregation-item id
 * form and four small enums), two rules promoted out of the samples-controls
 * gate, and the reconstructor fix the stale-path work turned up. */
section('wire kinds and the 08-30 round', async () => {
  const wires = checkAbapSource(fs.readFileSync(f('wirekinds.clas.abap'), 'utf8')).findings;
  const of = (type) => wires.filter((x) => x.type === type);

  // --- the release floor of a CONTROL_GLOBAL target -------------------------
  const tooNew = of('frontend-action-too-new');
  assert(tooNew.length === 2, `frontend-action-too-new: the two lazily-required targets (got ${tooNew.map((x) => x.member).join() || 'none'})`);
  assert(tooNew.some((x) => x.control === 'THEMING' && x.since === '1.118'),
    'frontend-action-too-new: sap/ui/core/Theming is @since 1.118');
  assert(tooNew.some((x) => x.control === 'INVISIBLE_MESSAGE' && x.since === '1.78'),
    'frontend-action-too-new: InvisibleMessage is @since 1.78');
  assert(!tooNew.some((x) => x.control === 'MESSAGE_TOAST'),
    'frontend-action-too-new: a target with no floor is never reported');

  // --- arity and kind, from the CONTROL_METHODS mirror ----------------------
  const count = of('control-call-arg-count');
  assert(count.length === 1 && count[0].member === 'back' && count[0].count === 0,
    `control-call-arg-count: back declares no arguments (got ${count.map((x) => x.member).join() || 'none'})`);
  const kind = of('control-call-arg-kind');
  assert(kind.length === 2, `control-call-arg-kind: the int and the bool (got ${kind.map((x) => x.member).join() || 'none'})`);
  assert(kind.some((x) => x.member === 'setBadgeMinValue' && x.memberType === 'int' && x.value === 'nine'),
    'control-call-arg-kind: a non-numeric int arrives as NaN');
  assert(kind.some((x) => x.member === 'setExpanded' && x.memberType === 'bool' && x.value === 'abap_true'),
    'control-call-arg-kind: only X and true are true, so abap_true is FALSE');
  assert(!kind.some((x) => x.value === 'X'),
    'control-call-arg-kind: the ABAP boolean token is the accepted spelling');

  // --- the aggregation-item id form ----------------------------------------
  const agg = of('invalid-aggregation-item');
  assert(agg.length === 2, `invalid-aggregation-item: the two broken forms (got ${agg.map((x) => x.value).join() || 'none'})`);
  assert(agg.some((x) => x.value === 'carousel/pages/first' && x.member === 'id'),
    'invalid-aggregation-item: a non-numeric index is not the aggregation-item form at all');
  assert(agg.some((x) => x.value === 'carousel/items/0' && x.member === 'items' && x.control === 'sap.m.Carousel'),
    'invalid-aggregation-item: the aggregation segment is checked against the control');
  assert(!agg.some((x) => x.value === 'carousel/pages/2'),
    'invalid-aggregation-item: the correct form is left alone');

  // --- the four closed sets that ride on invalid-frontend-action ------------
  const bad = of('invalid-frontend-action').map((x) => x.value);
  for (const [value, what] of [['Loud', 'the InvisibleMessageMode enum, read from the snapshot'],
    ['MAYBE', 'setAsyncURLHandler names one of three built-in policies'],
    ['middle', 'the ScrollIntoView block enum'],
    ['numerical', 'the HTML inputmode set'],
    ['ALWAYS', 'cs_nav_mode is DEFAULT, FRESH or KEEP']]) {
    assert(bad.includes(value), `invalid-frontend-action: ${what} (got ${bad.join() || 'none'})`);
  }
  assert(!bad.includes('KEEP') && !bad.includes('sap_horizon'),
    'invalid-frontend-action: a released value in either slot is left alone');
  assert(!of('unknown-frontend-action').length,
    'unknown-frontend-action: SET_PUSH_STATE is consumed by the SERVER and queues no frontend action, so it is not an unknown one');

  // --- the two obsolete binder ARGUMENTS ------------------------------------
  const obsolete = checkAbapSource(fs.readFileSync(f('obsolete.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'obsolete-bind-argument');
  assert(obsolete.length === 2, `obsolete-bind-argument: view and custom_mapper (got ${obsolete.map((x) => x.member).join() || 'none'})`);
  const viewArg = obsolete.find((x) => x.member === 'view');
  assert(viewArg && viewArg.fixes?.length === 1,
    'obsolete-bind-argument: the inactive `view` argument is deleted by --fix');
  assert(obsolete.find((x) => x.member === 'custom_mapper')?.fixes === undefined,
    'obsolete-bind-argument: the mapper pair is still EVALUATED, so dropping one is not a mechanical fix');

  // --- the lifecycle fork that decides nothing ------------------------------
  const fork = checkAbapSource(fs.readFileSync(f('initfork.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'redundant-init-display');
  assert(fork.length === 2, `redundant-init-display: the OR and the fork (got ${fork.map((x) => x.member).join() || 'none'})`);
  assert(fork.some((x) => x.member === 'OR') && fork.some((x) => x.member === 'fork'),
    'redundant-init-display: both spellings of the same redundancy');

  // --- a boolean asked whether it is empty ----------------------------------
  const isInit = checkAbapSource(fs.readFileSync(f('isinitial.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'lifecycle-is-initial');
  assert(isInit.length === 2, `lifecycle-is-initial: the call and the attribute (got ${isInit.map((x) => x.member).join() || 'none'})`);
  assert(isInit.some((x) => x.member === 'check_on_init( )'),
    'lifecycle-is-initial: the lifecycle call takes the predicative form');
  assert(isInit.some((x) => x.member === 'mv_ready'),
    'lifecycle-is-initial: every other abap_bool follows the same rule');
  assert(!isInit.some((x) => x.member.toLowerCase() === 'ready'),
    'lifecycle-is-initial: a STRUCTURE COMPONENT may be any type and is never judged');

  // --- app state the serializer cannot reach, and a raw escape --------------
  const state = checkAbapSource(fs.readFileSync(f('appstate.clas.abap'), 'utf8')).findings;
  const priv = state.filter((x) => x.type === 'private-app-attribute');
  assert(priv.length === 1 && priv[0].member === 't_all',
    `private-app-attribute: only the PRIVATE instance attribute (got ${priv.map((x) => x.member).join() || 'none'})`);
  assert(!priv.some((x) => ['helper_state', 'registry'].includes(x.member)),
    'private-app-attribute: PROTECTED is reachable and CLASS-DATA is not instance state');
  const esc = state.filter((x) => x.type === 'escape-sequence-in-backtick');
  assert(esc.length === 2 && esc.every((x) => x.member === '\\n'),
    `escape-sequence-in-backtick: the toast and the attribute (got ${esc.length})`);
  assert(!esc.some((x) => x.value.includes('\\\\n')),
    'escape-sequence-in-backtick: a DOUBLED backslash is a backslash on purpose');

  // --- an ABAP date through the JS-string date formatter --------------------
  const dates = checkAbapSource(fs.readFileSync(f('dateformat.clas.abap'), 'utf8'))
    .findings.filter((x) => x.type === 'abap-date-formatter-mismatch');
  assert(dates.length === 2, `abap-date-formatter-mismatch: the d and the t (got ${dates.map((x) => x.member).join() || 'none'})`);
  assert(dates.some((x) => x.member === 'VALID_FROM' && x.value === 'd')
    && dates.some((x) => x.member === 'START_TIME' && x.value === 't'),
    'abap-date-formatter-mismatch: both ABAP date/time types are reported with the type that produced them');
  assert(!dates.some((x) => x.member === 'ISO_STAMP'),
    'abap-date-formatter-mismatch: a string field may well carry an ISO date, which is what new Date( ) parses');

  /* --- a stale path in a COMPLEX binding info, and the reconstructor fix that
   * had to come first: `WITH DEFAULT KEY` made the whole declaration
   * unparseable, so the attribute fell through to the scalar branch and every
   * rule that resolves against a ROW went silent for lack of a context. */
  const stale = checkAbapSource(fs.readFileSync(f('stalepath.clas.abap'), 'utf8'));
  assert(Array.isArray(stale.model?.T_ITEMS),
    `WITH DEFAULT KEY: the table is modelled as a table (got ${JSON.stringify(stale.model?.T_ITEMS)})`);
  const paths = stale.findings.filter((x) => x.type === 'unknown-binding-path');
  assert(paths.length === 1 && paths[0].value === 'exchangeRate',
    `unknown-binding-path: the complex form is resolved against the row (got ${paths.map((x) => x.value).join() || 'none'})`);

  /* --- the two rules the metadata harvest unblocked.
   *
   * On a 1.150 floor, and that is a property of the SUBJECT rather than of the
   * fixture: both properties carrying a harvested `setterMin` are @since
   * 1.149, and `member-too-new` reports and `continue`s before any other rule
   * sees the attribute. The user report this rule comes from was on 1.150 too. */
  const rows = checkAbapSource(fs.readFileSync(f('rowdefaults.clas.abap'), 'utf8'),
    { minUi5: '1.150' }).findings;

  const setter = rows.filter((x) => x.type === 'validating-setter-out-of-range');
  assert(setter.length === 1 && setter[0].member === 'recurrencePattern' && setter[0].count === 1,
    `validating-setter-out-of-range: the unfilled TYPE i reaches a setter that refuses it (got ${setter.length})`);

  const absent = rows.filter((x) => x.type === 'absent-boolean-overrides-default');
  assert(absent.length === 1 && absent[0].member === 'ICON_INSET',
    `absent-boolean-overrides-default: only the INCONSISTENTLY seeded field (got ${absent.map((x) => x.member).join() || 'none'})`);
  assert(!absent.some((x) => x.member === 'SELECTED'),
    'absent-boolean-overrides-default: a field NO row sets is ordinary data, not an omission');

  const { controls } = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8'));
  assert(controls['sap.m.StandardListItem'].properties.iconInset.defaultValue === true,
    'the snapshot carries defaultValue only where it is TRUE — the case an absent ABAP boolean overrides');
  assert(controls['sap.m.Button'].properties.text.defaultValue === undefined,
    'the snapshot does not carry a defaultValue where there is nothing to override');
  assert(controls['sap.ui.unified.calendar.MonthPicker'].properties.month.setterMin === undefined,
    'setterMin is a harvested LOWER BOUND, not "this setter throws" — MonthPicker.month 0 is January');
  assert(controls['sap.uxap.ObjectPageSubSection'].widensAggregation === true,
    'a class overriding the generic addAggregation accepts more than its metadata declares');

  /* --- ABAP the SYSTEM refuses, following the source-line-too-long precedent:
   * for a consumer whose only gate is `npx abap2ui5lint`, a class that does
   * not activate is the most severe thing this tool can find. */
  const hygiene = checkAbapSource(fs.readFileSync(f('abaphygiene.clas.abap'), 'utf8')).findings;
  const one = (type) => hygiene.filter((x) => x.type === type);
  assert(one('class-constructor-visibility').length === 1,
    'class-constructor-visibility: the runtime calls it, so the compiler requires it public');
  assert(one('value-header-default-reassigned')[0]?.member === 'SELECTABLE',
    'value-header-default-reassigned: the header assignment is a default, not an overridable one');
  assert(one('into-corresponding-inline-decl')[0]?.member === 'lt_carr',
    'into-corresponding-inline-decl: the inline declaration is 7.55 syntax');
  const conv = one('redundant-conv-i');
  assert(conv.length === 1 && conv[0].member === 'count',
    `redundant-conv-i: only the whole-RHS form over a target declared here (got ${conv.length})`);
});

/* ---------------------------------------------------------------------------
 * The abapGit round-trip family (abap-check §1): BOM, CRLF, trailing blanks,
 * missing final newline. Inline sources rather than committed fixtures on
 * purpose — this repository's own line-endings gate (and .gitattributes)
 * forbids committing exactly the bytes these rules exist to catch.
 * ------------------------------------------------------------------------- */
section('abapgit round trip', async () => {
    const { checkAbapRules } = await import('./observe.mjs');
    const { applyFixes } = await import('../lib/fix.mjs');
    const { severityOf } = await import('../lib/findings.mjs');
    const of = (src, type) => checkAbapRules(src).filter((x) => x.type === type);
    const clean = 'CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.\n';

    // --- byte-order-mark ------------------------------------------------------
    const bom = `﻿${clean}`;
    const bomF = of(bom, 'byte-order-mark');
    assert(bomF.length === 1 && bomF[0].offset === 0,
      'byte-order-mark: a BOM on a .abap file is reported at offset 0');
    assert(applyFixes(bom, bomF).output === clean,
      'byte-order-mark: the fix deletes exactly the one character');
    assert(of(clean, 'byte-order-mark').length === 0, 'byte-order-mark: a clean file is silent');

    // --- crlf-line-ending -----------------------------------------------------
    const crlf = clean.replace(/\n/g, '\r\n');
    const crlfF = of(crlf, 'crlf-line-ending');
    assert(crlfF.length === 1 && crlfF[0].value === 2 && crlfF[0].fixes.length === 2,
      `crlf-line-ending: ONE finding per file, one fix span per CR (got ${crlfF.length}/${crlfF[0]?.fixes?.length})`);
    assert(applyFixes(crlf, crlfF).output === clean,
      'crlf-line-ending: the fix converts the whole file to LF');
    assert(of(clean, 'crlf-line-ending').length === 0, 'crlf-line-ending: LF-only is silent');

    // --- trailing-whitespace --------------------------------------------------
    const tws = 'CLASS zcl_x DEFINITION PUBLIC.  \nENDCLASS.\t\n';
    const twsF = of(tws, 'trailing-whitespace');
    assert(twsF.length === 2 && twsF.map((x) => x.member).join() === '1,2',
      `trailing-whitespace: one finding per line, keyed by line number (got ${twsF.map((x) => x.member).join() || 'none'})`);
    assert(applyFixes(tws, twsF).output === clean,
      'trailing-whitespace: the fixes strip exactly the blanks');
    assert(of('DATA(x) = `text  ` && `y`.\n', 'trailing-whitespace').length === 0,
      'trailing-whitespace: blanks INSIDE a literal are content, not line endings');
    // the CRLF spelling: the \r is the separator, not trailing content, but
    // blanks in front of it are still trailing
    assert(of('CLASS zcl_x DEFINITION PUBLIC. \r\nENDCLASS.\r\n', 'trailing-whitespace').length === 1,
      'trailing-whitespace: a blank before the CR still counts, the CR itself does not');

    // --- missing-final-newline ------------------------------------------------
    const nofinal = 'CLASS zcl_x DEFINITION PUBLIC.\nENDCLASS.';
    const nfF = of(nofinal, 'missing-final-newline');
    assert(nfF.length === 1, 'missing-final-newline: the missing terminator is reported');
    assert(applyFixes(nofinal, nfF).output === `${nofinal}\n`,
      'missing-final-newline: the fix appends exactly one newline');
    assert(of(clean, 'missing-final-newline').length === 0, 'missing-final-newline: a terminated file is silent');
    assert(of('DATA(x) = 1.', 'missing-final-newline').length === 0,
      'missing-final-newline: a one-line snippet is not a file and is never judged');

    /* All four are WARNINGS, deliberately: unlike source-line-too-long nothing
     * fails to import — the tree merely never stops diffing (abap-check §1
     * puts only the 255-character line in the import-failure bucket). */
    for (const [src, type] of [[bom, 'byte-order-mark'], [crlf, 'crlf-line-ending'], [tws, 'trailing-whitespace'], [nofinal, 'missing-final-newline']]) {
      assert(severityOf(of(src, type)[0]) === 'warning', `${type}: a warning, not an error`);
    }
});

/* ---------------------------------------------------------------------------
 * Three structural rules from abap-check: the extended-check pragma, the
 * downport dialect, and the delete-by-loop-cursor runtime trap.
 * ------------------------------------------------------------------------- */
section('abap hygiene (2)', async () => {
    const { checkAbapRules } = await import('./observe.mjs');
    const { severityOf } = await import('../lib/findings.mjs');
    const of = (src, type) => checkAbapRules(src).filter((x) => x.type === type);

    // --- empty-catch-block ----------------------------------------------------
    const empty = 'TRY.\n  risky( ).\nCATCH cx_root.\nENDTRY.\n';
    const emptyF = of(empty, 'empty-catch-block');
    assert(emptyF.length === 1 && emptyF[0].member === 'cx_root' && severityOf(emptyF[0]) === 'hint',
      `empty-catch-block: an empty handler is a hint naming the exception (got ${emptyF.map((x) => x.member).join() || 'none'})`);
    assert(of('TRY.\n  risky( ).\nCATCH cx_root ##NO_HANDLER.\nENDTRY.\n', 'empty-catch-block').length === 0,
      'empty-catch-block: ##NO_HANDLER is the sanctioned empty handler and is silent');
    assert(of('TRY.\n  risky( ).\nCATCH cx_root INTO DATA(x).\n  log( x ).\nENDTRY.\n', 'empty-catch-block').length === 0,
      'empty-catch-block: a handler with a statement is not empty');
    assert(of('TRY.\n  risky( ).\nCATCH cx_root.\n  " nothing to do\nENDTRY.\n', 'empty-catch-block').length === 1,
      'empty-catch-block: a comment does not fill the block - SLIN reads it the same way');
    assert(of('TRY.\n  risky( ).\nCATCH cx_static_check.\nCATCH cx_root.\n  log( ).\nENDTRY.\n', 'empty-catch-block').length === 1,
      'empty-catch-block: the next CATCH ends the block, and only the empty one is reported');

    // --- boolc-instead-of-xsdbool ---------------------------------------------
    const two = 'DATA(a) = boolc( x > 1 ).\nDATA(b) = boolc( y < 2 ).\n';
    assert(of(two, 'boolc-instead-of-xsdbool').length === 2,
      'boolc-instead-of-xsdbool: every call site is its own finding');
    assert(of('DATA(a) = xsdbool( x > 1 ).\n', 'boolc-instead-of-xsdbool').length === 0,
      'boolc-instead-of-xsdbool: the mandated form is silent');
    assert(of('DATA(t) = `use boolc( x ) here`.\n', 'boolc-instead-of-xsdbool').length === 0,
      'boolc-instead-of-xsdbool: boolc inside a literal is prose, not a call');

    // --- delete-index-in-loop -------------------------------------------------
    // the clean current-row delete is LEGAL: the kernel adjusts the loop
    // cursor for a delete on the loop table, and so does @abaplint/runtime -
    // the first cut reported this shape and named a reviewed, working
    // samples-controls port (558), which is the corpus doctrine firing
    assert(of('LOOP AT t_rows INTO DATA(row).\n  DELETE t_rows INDEX sy-tabix.\nENDLOOP.\n', 'delete-index-in-loop').length === 0,
      'delete-index-in-loop: the innermost loop\'s own unclobbered cursor is the legal current-row delete');
    const hot = 'LOOP AT t_rows INTO DATA(row).\n  READ TABLE t_map WITH KEY k = row-k INTO DATA(m).\n  DELETE t_rows INDEX sy-tabix.\nENDLOOP.\n';
    const hotF = of(hot, 'delete-index-in-loop');
    assert(hotF.length === 1 && hotF[0].member === 't_rows' && severityOf(hotF[0]) === 'error',
      `delete-index-in-loop: a READ TABLE between the loop header and the DELETE clobbers sy-tabix (got ${hotF.map((x) => x.member).join() || 'none'})`);
    assert(of('LOOP AT t_rows INTO DATA(row).\n  LOOP AT t_other INTO DATA(o).\n  ENDLOOP.\n  DELETE t_rows INDEX sy-tabix.\nENDLOOP.\n', 'delete-index-in-loop').length === 1,
      'delete-index-in-loop: a completed inner loop leaves sy-tabix behind - the filter_itab incident');
    assert(of('LOOP AT t_rows INTO DATA(row).\n  DO 3 TIMES.\n  ENDDO.\n  DELETE t_rows INDEX sy-tabix.\nENDLOOP.\n', 'delete-index-in-loop').length === 1,
      'delete-index-in-loop: a DO between the LOOP and the DELETE is the app-352 dump shape');
    assert(of('LOOP AT t_rows INTO DATA(row).\n  DELETE t_rows INDEX sy-tabix.\n  READ TABLE t_map INDEX 1 INTO DATA(m2).\nENDLOOP.\n', 'delete-index-in-loop').length === 0,
      'delete-index-in-loop: a clobberer AFTER the delete runs after it every iteration - the loop header resets the cursor');
    assert(of('LOOP AT t_rows INTO DATA(row).\n  DELETE t_other INDEX sy-tabix.\nENDLOOP.\n', 'delete-index-in-loop').length === 0,
      'delete-index-in-loop: another table is another rule\'s business');
    // the filter_itab shape: the DELETE sits in an INNER loop over another
    // table, but an OUTER loop over the deleted table still encloses it -
    // sy-tabix is then the inner loop's, and the deleted index is wrong
    assert(of('LOOP AT t_rows INTO DATA(row).\n  LOOP AT t_other INTO DATA(o).\n    DELETE t_rows INDEX sy-tabix.\n  ENDLOOP.\nENDLOOP.\n', 'delete-index-in-loop').length === 1,
      'delete-index-in-loop: ANY enclosing loop over the table counts, not only the innermost');
    assert(of('LOOP AT t_rows INTO DATA(row).\nENDLOOP.\nREAD TABLE t_rows INDEX 1 INTO DATA(r).\nDELETE t_rows INDEX sy-tabix.\n', 'delete-index-in-loop').length === 0,
      'delete-index-in-loop: DELETE after READ TABLE outside the loop is correct and common');
    assert(of('METHOD a.\n  LOOP AT t_rows INTO DATA(row).\nENDMETHOD.\nMETHOD b.\n  DELETE t_rows INDEX sy-tabix.\nENDMETHOD.\n', 'delete-index-in-loop').length === 0,
      'delete-index-in-loop: a method boundary closes whatever a broken source left open');
    assert(of('LOOP AT me->t_rows INTO DATA(row).\n  READ TABLE t_map INDEX 1 INTO DATA(mm).\n  DELETE me->t_rows INDEX sy-tabix.\nENDLOOP.\n', 'delete-index-in-loop').length === 1,
      'delete-index-in-loop: the me-> spelling names the same table');
});

/* What is recorded is what the checks actually produced (test/observe.mjs),
 * not what the test source appears to mention, so a negated assertion or a
 * renamed idiom cannot pass for coverage. A rule may be exempt, but only in
 * writing, below. */
section('rule coverage', async () => {
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
});

// ----------------------------------------------- the docs' builder verbs ----
/* The rule reference shows code a reader copies, and 11 of its 49 examples
 * called methods the view builder does not have (`view->leaf( … )`,
 * `->_generic( name = … )`) - the ROLE names lib/builders.mjs uses internally,
 * which were the verbs of a builder that is gone. It rendered on the published
 * page and in the README, and no reader could have known.
 *
 * Derived from the builder rather than from a list of bad spellings, so a
 * future rename of a verb takes the docs with it. */
section('rule docs', async () => {
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
      for (const field of ['summary', 'detail', 'example', 'remedy', 'fixNote']) {
        const text = doc[field];
        if (typeof text !== 'string') continue;
        for (const [, verb] of text.matchAll(CHAIN_CALL)) {
          if (!REAL.has(verb)) wrong.push(`${id}.${field}: ->${verb}( )`);
        }
      }
    }
    assert(!wrong.length,
      `rule docs: every builder call names a method the builder has (${wrong.join('; ') || 'all real'})`);
});

/* ---------------------------------------------------------------------------
 * --screenshot: the render gate photographing instead of judging
 *
 * Runs against the real runtime like the gate assertions above do. What is
 * asserted is what the mode PROMISES and what silently broke while it was
 * being built: that a picture comes out at all, that it is of the view rather
 * than of an empty page (a sap.m.Page in a container of no height renders its
 * header and clips everything else - every check still passes and the picture
 * is blank), and that a class whose reconstruction is incomplete is refused
 * rather than photographed wrong.
 * ------------------------------------------------------------------------- */
section('screenshot', async () => {
    const { screenshotFiles, mockModelFor } = await import('../lib/index.mjs');
    const shots = await screenshotFiles([f('good.clas.abap')], { width: 400, height: 300 });
    assert(shots.length === 1 && Buffer.isBuffer(shots[0].png),
      `screenshot: the fixture comes back as a PNG (${shots[0]?.errors?.[0] ?? 'no png'})`);
    const png = shots[0].png;
    assert(png.slice(1, 4).toString() === 'PNG', 'screenshot: the buffer is a PNG');
    // IHDR carries the dimensions: full-page, so the WIDTH is the viewport's
    const width = png.readUInt32BE(16);
    assert(width === 400, `screenshot: the viewport is the one asked for (got ${width})`);
    assert(shots[0].errors.length === 0,
      `screenshot: the clean fixture photographs without errors (${shots[0].errors[0] ?? ''})`);
    /* The blank-picture regression, and the reason it needs its own assertion:
     * the whole view was in the DOM, correct and clipped to nothing, while every
     * check passed and the picture came back a header over an empty area. It is
     * caught differentially rather than by a magic byte count - the same view
     * with its content removed is what a clipped picture looks like, so a real
     * render has to be substantially bigger than that. */
    const { openRenderer } = await import('../lib/render.mjs');
    const shooter = await openRenderer({ theme: 'sap_horizon', css: true });
    const VIEW = (content) => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">`
      + `<Page title="Fixture">${content}</Page></mvc:View>`;
    try {
      const filled = await shooter.screenshot({ xml: VIEW('<content><Input value="{/NAME}"/><Button text="Go"/></content>'), model: { NAME: 'world' } });
      const empty = await shooter.screenshot({ xml: VIEW('') });
      assert(filled.png.length > empty.png.length * 1.2,
        `screenshot: the content is IN the picture, not clipped to a bare header (${filled.png.length} vs ${empty.png.length} bytes)`);
    } finally {
      await shooter.close();
    }

    /* The device matrix: one browser session, one entry per viewport, and the
     * size recorded so a caller can name the files apart. */
    const matrix = await screenshotFiles([f('good.clas.abap')], {
      sizes: [{ width: 390, height: 844 }, { width: 1280, height: 900 }],
    });
    assert(matrix.length === 2 && matrix.every((s) => s.png),
      `screenshot: every viewport comes back with a picture (${matrix.length} entries)`);
    assert(matrix[0].png.readUInt32BE(16) === 390 && matrix[1].png.readUInt32BE(16) === 1280,
      'screenshot: each picture is taken at the viewport it belongs to');

    /* Preview data. The model derived from a class only knows what the class
     * SEEDS literally, so a table filled by a SELECT photographs empty - which
     * is most real apps. A mock file next to the source fills it, with no flag
     * to remember. */
    {
      const dir = tempDir('a2u5-mock-');
      const source = path.join(dir, 'zcl_mock.clas.abap');
      fs.writeFileSync(source, `CLASS zcl_mock DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      TYPES: BEGIN OF ty_row,
               name TYPE string,
             END OF ty_row.
      DATA mt_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
  ENDCLASS.
  CLASS zcl_mock IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
      view->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\`     v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( n = \`Page\` )->a( n = \`title\` v = \`Rows\`
          )->ele( n = \`content\`
          )->ele( n = \`List\` )->a( n = \`items\` v = client->_bind( mt_rows )
          )->tag( n = \`StandardListItem\` )->a( n = \`title\` v = \`{NAME}\` ).
      client->view_display( view->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.
  `);
      const empty = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      fs.writeFileSync(path.join(dir, 'zcl_mock.mock.json'),
        JSON.stringify({ MT_ROWS: [{ NAME: 'Berlin' }, { NAME: 'Rome' }, { NAME: 'Lisbon' }] }));
      assert(mockModelFor(source)?.MT_ROWS?.length === 3,
        'screenshot: the mock file next to the class is the preview data, by convention');
      const filled = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      assert(filled[0].png.length > empty[0].png.length,
        `screenshot: the mocked rows are IN the picture (${filled[0].png.length} vs ${empty[0].png.length} bytes)`);

      /* Merged over the derived model, not replacing it: a mock file naming one
       * table must not cost the class its other fields. */
      fs.writeFileSync(path.join(dir, 'zcl_mock.mock.json'), '{ broken');
      const broken = await screenshotFiles([source], { sizes: [{ width: 600, height: 400 }] });
      assert(broken[0].png && broken[0].errors.some((e) => /not valid JSON/.test(e)),
        `screenshot: a broken mock file is reported next to the picture it did not fill (${broken[0].errors[0] ?? 'silent'})`);
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const refused = await screenshotFiles([f('frozenbuilder.clas.abap')]);
    assert(refused.every((s) => !s.png) && refused[0].errors.some((e) => /no view reconstructed/.test(e)),
      `screenshot: a class no view can be reconstructed from is refused with a reason (${refused[0]?.errors?.[0] ?? 'none'})`);
});
