/*
 * test/sections/view-values - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, checkAbapSource, checkXmlSource, checkFiles, elementBoundSlots, severityOf, f, FIX, assert, section, tempDir, results, by, good, post, broken, has, rules, view, bad, xml } = H;


// ------------------------------------------------ round 2: new rules ----
section('xmlns (6)', async () => {
    const { checkAbapRules } = await import('../observe.mjs');

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
    const { applyFixes } = await import('../../lib/fix.mjs');
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

/* ------------------------------------------------------- enum key vs value --
 *
 * A UI5 enum is a `{ Key: "Value" }` map, and for 227 of the snapshot's 235
 * the two are the same string - which is why this gate judged the VALUES for
 * a year and nobody noticed. For the eight where they differ the spellings
 * are not interchangeable, and which one is right depends on how the value
 * reaches the control:
 *
 *   XMLTemplateProcessor   parseValue( ) (KEY -> value), then isValid( )
 *   setProperty / binding  validateProperty -> isValid( ) alone, no parse
 *
 * and isValid( ) is keyed by VALUE. So a VIEW has to write the key, and the
 * gate had it exactly backwards: it rejected `intervalType="OneMonth"` -
 * copied verbatim out of the demo kit, where it has shipped for years - and
 * accepted `"One Month"`, which parses to undefined and leaves the property
 * at its default. Found rebuilding the Team Calendar demo app
 * (abap2UI5/samples-controls z2ui5_cl_smpc_demo_003), where it was waived
 * with a disable comment rather than written the way the gate asked.
 *
 * The fixture is the whole point of the pair: every attribute in it is
 * CORRECT, so it must produce no invalid-property-value at all - and it is
 * rendered, which is the only check that answers the question first-hand.
 */
const enumKeySrc = fs.readFileSync(f('enumkey.clas.abap'), 'utf8');
const enumKeyRendered = await checkFiles([f('enumkey.clas.abap')]);
section('enum key vs value', async () => {
    const { applyFixes } = await import('../../lib/fix.mjs');
    const values = (src, minUi5 = '1.71') => checkAbapSource(src, { render: false, minUi5 })
      .findings.filter((x) => x.type === 'invalid-property-value');
    const pcv = (value) => view('  )->ele( `PlanningCalendar` )->ele( `views` )'
      + `)->tag( \`PlanningCalendarView\` )->a( n = \`intervalType\` v = \`${value}\` )`);

    // the negative counter-case, and the false positive this rule change is about
    assert(!values(pcv('OneMonth')).length,
      `enum key: the KEY is the spelling an XML view needs, and is left alone (got ${values(pcv('OneMonth')).map((x) => x.value).join() || 'none'})`);

    const written = values(pcv('One Month'));
    assert(written.length === 1 && written[0].enumValueForm === true && written[0].suggestion === 'OneMonth',
      `enum key: the runtime VALUE is reported with the key to write (got ${written.length} finding(s), suggestion ${written[0]?.suggestion})`);
    assert(written[0]?.allowed?.includes('OneMonth') && !written[0]?.allowed?.includes('One Month'),
      `enum key: the allowed list names the keys, not the values (got ${JSON.stringify(written[0]?.allowed)})`);
    assert(/parseValue\( \)/.test(written[0]?.message || '') && /keeps its default/.test(written[0]?.message || ''),
      'enum key: the message says WHY the value form is wrong, not merely that it is');
    assert(applyFixes(pcv('One Month'), written).output.includes('v = `OneMonth`'),
      'enum key: --fix rewrites the value into the key');

    // …and everything around it is unchanged
    const typo = values(pcv('OneMonthh'));
    assert(typo.length === 1 && typo[0].enumValueForm === undefined,
      'enum key: a real typo is still a plain invalid-property-value, with no parseValue story attached');
    assert(!values(view('  )->tag( `Button` )->a( n = `type` v = `Emphasized` )')).length,
      'enum key: an enum whose key IS its value is judged exactly as before');

    /* The second shape, and the one that shows this is not one enum's quirk:
     * a PREFIXED value (`POST` for `Post`, `sapIllus-NoData` for `NoData`).
     * Read at 1.120 because httpRequestMethod is @since 1.81 and a member
     * past the floor never reaches the value check at all. */
    assert(!values(enumKeySrc, '1.120').length,
      `enum key: the fixture is correct as written, at a floor that judges every member (got ${values(enumKeySrc, '1.120').map((x) => `${x.member}=${x.value}`).join() || 'none'})`);
    const post = values(enumKeySrc.replace('v = `Post`', 'v = `POST`'), '1.120');
    assert(post.length === 1 && post[0].enumValueForm === true && post[0].suggestion === 'Post',
      `enum key: FileUploaderHttpRequestMethod.Post = "POST" - the same defect with a prefix instead of a space (got ${post[0]?.suggestion})`);

    /* The per-value @since table is keyed by the runtime VALUE, because that
     * is what the attribute parses to - so a written KEY has to be translated
     * back through it or enum-value-too-new goes blind on exactly the eight
     * enums this change is about. CalendarIntervalType.OneMonth is @1.46. */
    const tooNew = (minUi5) => checkAbapSource(pcv('OneMonth'), { render: false, minUi5 })
      .findings.filter((x) => x.type === 'enum-value-too-new');
    assert(tooNew('1.40').length === 1 && tooNew('1.40')[0].since === '1.46',
      `enum key: the KEY still finds the VALUE's @since (got ${tooNew('1.40').map((x) => x.since).join() || 'none'})`);
    assert(!tooNew('1.71').length,
      'enum key: …and is silent once the floor reaches it');

});

/* First-hand, in a browser: the key form renders, the value form does not.
 * The render gate turns UI5's future mode on around view creation, which is
 * what makes parseValue( ) returning undefined an error rather than a line in
 * a log nobody reads. Its own section, so the static half keeps the rest. */
section.browser('enum key vs value: UI5 takes the key and refuses the value', async () => {
    assert(!enumKeyRendered[0].renderErrors.length,
      `enum key: the fixture RENDERS - UI5 takes the key (${enumKeyRendered[0].renderErrors[0] || ''})`);
    const dir = tempDir('abap2ui5lint-enumkey-');
    const broken = path.join(dir, 'enumkey.clas.abap');
    fs.writeFileSync(broken, enumKeySrc.replace('n = `intervalType` v = `OneMonth`', 'n = `intervalType` v = `One Month`'));
    const brokenRun = await checkFiles([broken]);
    assert(brokenRun[0].renderErrors.some((e) => /Value 'One Month' is not valid/.test(e)),
      `enum key: …and the value form does NOT render - UI5 says so in as many words, which is the claim the whole rule rests on (${brokenRun[0].renderErrors[0] || 'no render error'})`);
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
    const { RULE_DOCS } = await import('../../lib/rule-docs.mjs');
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

    /* --render itself starts a browser - its own section below. */
    assert(/--render/.test(runErr([good, '--no-config', '--nonsense']).err),
      'cli: the usage line offers --render next to --no-render');

    // --render-pages: the pool size is a closed shape too - anything that is
    // not a positive integer would otherwise silently fall back to 4
    for (const bad of ['0', '-1', '2.5', 'four']) {
      const r = runErr([good, '--no-render', '--no-config', '--render-pages', bad]);
      assert(r.code === 2 && /--render-pages takes a positive integer/.test(r.err),
        `cli: --render-pages '${bad}' is refused instead of silently meaning 4 (exit ${r.code})`);
    }
    // `--render-pages` asks for the gate; only a LATER --no-render wins over it
    // (the comment at its parsing) - in that order the run needs no browser
    assert(runErr([good, '--no-config', '--render-pages', '2', '--no-render']).code === 0,
      'cli: --render-pages 2 is accepted, and a later --no-render still wins');

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

/* --- --render, the promise that the gate ran -------------------------------
 * The unit tests above decide the fallback; what this pins is that the flag
 * REACHES that decision - an unknown option exits 2 with "unknown option",
 * which would make the whole promise unwritable. The runtime is installed
 * here, so the run itself is an ordinary one - and starts a browser, which
 * is why it is a section of its own. */
section.browser('cli: --render demands the render gate', async () => {
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const r = cp.spawnSync('node', [CLI, f('good.clas.abap'), '--no-config', '--render'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } });
    assert(r.status !== 2, `cli: --render is a known flag, so a job can demand the render gate (exit ${r.status}: ${(r.stderr || '').split('\n')[0]})`);
});

  Object.assign(H, { enumKeySrc, enumKeyRendered });
}
