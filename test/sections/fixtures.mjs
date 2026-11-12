/*
 * test/sections/fixtures - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, path, test, after, checkAbapSource, checkFiles, prepareAbap, severityOf, severityRank, f, assert, section } = H;

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
section.browser('broken', async () => {
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
    const { checkAbapRules } = await import('../observe.mjs');
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
    const { checkAbapRules } = await import('../observe.mjs');
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

    /* A variable typed by something the class does not declare gets no
     * invented value in the render model: '' is only right for a string, and
     * strict validation rejects it on an object property (abap2UI5-addons/
     * popups sample_19 binds MultiInputExt addedTokens to a table typed by
     * z2ui5_cl_popup_context=>ty_t_token). A seed still reaches it, and a
     * built-in or local type keeps its initial value. */
    const foreign = prepareAbap(`CLASS zcl_foreign DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA mt_added TYPE zcl_other=>ty_t_token.
      DATA mv_matnr TYPE matnr.
      DATA mv_seeded TYPE zcl_other=>ty_name.
      DATA mv_text TYPE string.
  ENDCLASS.
  CLASS zcl_foreign IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      mv_seeded = \`Seed\`.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\`
          )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->ele( \`VBox\`
              )->tag( \`Text\` )->a( n = \`text\` v = client->_bind( mt_added )
              )->tag( \`Text\` )->a( n = \`text\` v = client->_bind( mv_matnr )
              )->tag( \`Text\` )->a( n = \`text\` v = client->_bind( mv_seeded )
              )->tag( \`Text\` )->a( n = \`text\` v = client->_bind( mv_text )
          )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`);
    assert(!('MT_ADDED' in foreign.model) && !('MV_MATNR' in foreign.model),
      `model: a variable of a type declared elsewhere is left out of the render model (${JSON.stringify(foreign.model)})`);
    assert(foreign.modelShape.MT_ADDED?.__unknownShape === true,
      'model: the shape still carries it, as a type whose paths are not judged');
    assert(foreign.model.MV_SEEDED === 'Seed' && foreign.model.MV_TEXT === '',
      'model: a seed still reaches a foreign-typed variable, and a built-in type keeps its initial value');
});

  Object.assign(H, { results, by, good, vbuilder, post, bareFrag, broken, struct, has, depLate, depNow, deadLib, deadLibOld, smartSap, smartOpen, smartUnset, rules, hasR, vr, hasV, dumps, hasD, posSrc, dup, rows, rowPathFindings, nested, nestedPaths, nestedTypes, nestedTypePaths, prep });
}
