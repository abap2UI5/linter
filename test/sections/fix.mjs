/*
 * test/sections/fix - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, checkAbapSource, checkXmlSource, f, FIX, assert, section, tempDir, by, rules, nested, view, bad, xml } = H;


// ------------------------------------------------------------------- fix ----
section('fix', async () => {
    const os = await import('node:os');
    const cp = await import('node:child_process');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { checkAbapRules } = await import('../observe.mjs');

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
    /* six: --fix runs to its fixed point, and the TRAILING row's deletion
     * leaves a one-row t_arg that event-arg-single-row-table's second pass
     * writes as arg = (what a second --fix used to do) */
    assert(/would fix 6 problem\(s\) in 1 file\(s\) in 2 passes/.test(dry) && fs.readFileSync(target, 'utf8') === original,
      'fix: the dry run reports what it would do and leaves the file alone');

    const out = run();
    const fixed = fs.readFileSync(target, 'utf8');
    assert(/fixed 6 problem\(s\) in 1 file\(s\) in 2 passes/.test(out), 'fix: the five mechanical corrections are applied, and the one they leave');
    assert(/client->_bind\( name \)/.test(fixed) && !/_bind_edit/.test(fixed),
      'fix: obsolete-binder becomes client->_bind( )');
    assert(/client->follow_up_action\( val   = client->cs_event-urlhelper/.test(fixed)
      && !/_event_client/.test(fixed),
    'fix: obsolete-frontend-event becomes client->follow_up_action( )');
    assert(/b = abap_true/.test(fixed),
      'fix: unconverted-abap-boolean moves onto b =, the token kept verbatim');
    assert(/`\$\{BARE_BRACE\}`/.test(fixed) && /`\$\{RESOLVED\}`/.test(fixed) && /`\{0\} selected`/.test(fixed),
      'fix: event-arg-unresolved gains its $, the already-correct and quoted forms untouched');
    assert(/val = `TRAILING` arg = `first` \)/.test(fixed)
      && /val = `MIDDLE` t_arg = VALUE #\( \( `first` \) \( `` \) \( `third` \) \)/.test(fixed),
    'fix: the trailing empty t_arg row is deleted (and the one row left written as arg =), the load-bearing middle one kept');
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
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { checkAbapRules, checkAbapSource } = await import('../observe.mjs');

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

    // --- redundant-serializable: delete the line, and only the own-line form --
    {
      const src = 'CLASS z2ui5_cl_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
        + '    INTERFACES if_serializable_object.\n    INTERFACES z2ui5_if_app.\n'
        + 'ENDCLASS.\n';
      const found = checkAbapRules(src).filter((x) => x.type === 'redundant-serializable');
      assert(found.length === 1 && found[0].fixes?.length === 1,
        'fix: redundant-serializable carries the deletion');
      assert(applyFixes(src, found).output
        === 'CLASS z2ui5_cl_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
          + '    INTERFACES z2ui5_if_app.\nENDCLASS.\n',
        'fix: redundant-serializable deletes the whole line, indentation included');

      // chained: both names in ONE statement - reported, never fixed
      const chained = 'CLASS z2ui5_cl_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
        + '    INTERFACES: if_serializable_object, z2ui5_if_app.\nENDCLASS.\n';
      const two = checkAbapRules(chained).filter((x) => x.type === 'redundant-serializable');
      assert(two.length === 1 && two[0].fixes === undefined,
        'redundant-serializable: a chained declaration is reported without a fix');

      // an app that does NOT ask for it, and a serializable class that is no app
      const clean = 'CLASS z2ui5_cl_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
        + '    INTERFACES z2ui5_if_app.\nENDCLASS.\n';
      const plain = 'CLASS zcl_data DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
        + '    INTERFACES if_serializable_object.\nENDCLASS.\n';
      assert(checkAbapRules(clean).concat(checkAbapRules(plain))
        .filter((x) => x.type === 'redundant-serializable').length === 0,
        'redundant-serializable: nothing to say about an app without the line, or a non-app with it');
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

// the 2026-09 round two: seven more rules whose correction is mechanical -
// a token inserted, an argument deleted, a line moved, a literal split at
// its escapes. Each asserted through applyFixes under strict-span mode, and
// each with the shape the fix deliberately declines
section('fix (3)', async () => {
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { checkAbapRules, checkAbapSource } = await import('../observe.mjs');
    const one = (src, type) => checkAbapRules(src).filter((x) => x.type === type);

    // --- redundant-init-display: the OR form, either way round ----------------
    {
      const src = 'METHOD main.\n  IF client->check_on_init( ) OR client->check_on_navigated( ).\n    client->view_display( x ).\n  ENDIF.\nENDMETHOD.';
      const found = one(src, 'redundant-init-display');
      assert(found.length === 1 && found[0].fixes?.length === 1, 'fix: redundant-init-display OR carries a deletion');
      assert(applyFixes(src, found).output === 'METHOD main.\n  IF client->check_on_navigated( ).\n    client->view_display( x ).\n  ENDIF.\nENDMETHOD.',
        'fix: redundant-init-display drops the init call and the OR');
      const flipped = src.replace('check_on_init( ) OR client->check_on_navigated( )', 'check_on_navigated( ) OR client->check_on_init( )');
      assert(applyFixes(flipped, one(flipped, 'redundant-init-display')).output === applyFixes(src, found).output,
        'fix: redundant-init-display drops the init side whichever side it is');
      const commented = src.replace(' OR ', ' " why\n     OR ');
      const c = one(commented, 'redundant-init-display');
      assert(c.length === 1 && !c[0].fixes, 'fix: redundant-init-display leaves a span with a comment inside alone');
    }
    // --- redundant-init-display: the fork ------------------------------------
    {
      const src = 'METHOD main.\n  IF client->check_on_init( ).\n    client->view_display( view->stringify( ) ).\n  ELSEIF client->check_on_navigated( ).\n    client->view_display( view->stringify( ) ).\n  ENDIF.\nENDMETHOD.';
      const found = one(src, 'redundant-init-display');
      assert(found.length === 1 && found[0].member === 'fork' && found[0].fixes?.length === 1,
        'fix: redundant-init-display fork carries the deletion of the init arm');
      assert(applyFixes(src, found).output === 'METHOD main.\n  IF client->check_on_navigated( ).\n    client->view_display( view->stringify( ) ).\n  ENDIF.\nENDMETHOD.',
        'fix: redundant-init-display fork keeps the navigated arm as the IF');
    }

    // --- binding-to-reference: object references only, never a fix ----------
    {
      const src = 'DATA mt_data TYPE REF TO data.\nDATA mo_obj TYPE REF TO zcl_x.\nDATA mr_rows TYPE REF TO ty_t_rows.\n'
        + ')->a( n = `items` v = client->_bind( mt_data )\n)->a( n = `x` v = client->_bind( val = mo_obj ) )\n)->a( n = `y` v = client->_bind( mr_rows ) )';
      const found = one(src, 'binding-to-reference');
      assert(found.map((x) => x.member).join() === 'mo_obj', `binding-to-reference: only the object reference (got ${found.map((x) => x.member).join()})`);
      assert(!found[0].fixes, 'binding-to-reference carries no fix');
    }

    // --- unescaped-brace-in-style: every brace, backtick literals only --------
    {
      const src = 'DATA(css) = `<style>.box {color:red} .b {x:1}</style>`.';
      const found = one(src, 'unescaped-brace-in-style');
      assert(found.length === 1 && found[0].fixes?.length === 4, 'fix: unescaped-brace-in-style carries one insertion per brace');
      assert(applyFixes(src, found).output === 'DATA(css) = `<style>.box \\{color:red\\} .b \\{x:1\\}</style>`.',
        'fix: unescaped-brace-in-style escapes every brace of the sheet');
      const mixed = 'DATA(css) = `<style>.box {color:red}` && |.b { expr }</style>|.';
      const m = one(mixed, 'unescaped-brace-in-style');
      assert(m.length === 1 && !m[0].fixes, 'fix: unescaped-brace-in-style declines a sheet with a brace in a template');
    }

    // --- collapsed-brace-in-style: the doubled backslash, every segment -------
    {
      const src = 'DATA(css) = |<style>.a \\{color:red\\}| && |.b \\{x:1\\}</style>|.';
      const found = one(src, 'collapsed-brace-in-style');
      assert(found.length === 1 && found[0].count === 4 && found[0].fixes?.length === 4,
        `fix: collapsed-brace-in-style counts and fixes across every template segment (count ${found[0]?.count}, fixes ${found[0]?.fixes?.length})`);
      assert(applyFixes(src, found).output === 'DATA(css) = |<style>.a \\\\\\{color:red\\\\\\}| && |.b \\\\\\{x:1\\\\\\}</style>|.',
        'fix: collapsed-brace-in-style writes the form a template needs');
    }

    // --- class-constructor-visibility: the line moves up --------------------
    {
      const src = 'CLASS zcl DEFINITION.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n  PRIVATE SECTION.\n    CLASS-METHODS class_constructor.\n    DATA x TYPE i.\nENDCLASS.';
      const found = one(src, 'class-constructor-visibility');
      assert(found.length === 1 && found[0].fixes?.length === 2, 'fix: class-constructor-visibility carries the insertion and the deletion');
      assert(applyFixes(src, found).output === 'CLASS zcl DEFINITION.\n  PUBLIC SECTION.\n    CLASS-METHODS class_constructor.\n    INTERFACES z2ui5_if_app.\n  PRIVATE SECTION.\n    DATA x TYPE i.\nENDCLASS.',
        'fix: class-constructor-visibility moves the line under PUBLIC SECTION');
      const commented = src.replace('class_constructor.', 'class_constructor.   " why');
      const c = one(commented, 'class-constructor-visibility');
      assert(c.length === 1 && !c[0].fixes, 'fix: class-constructor-visibility declines a line with a comment');
      const other = 'CLASS a DEFINITION.\n  PUBLIC SECTION.\n    DATA y TYPE i.\nENDCLASS.\nCLASS b DEFINITION.\n  PRIVATE SECTION.\n    CLASS-METHODS class_constructor.\nENDCLASS.';
      const o = one(other, 'class-constructor-visibility');
      assert(o.length === 1 && !o[0].fixes, 'fix: class-constructor-visibility never moves a line into another class');
    }

    // --- escape-sequence-in-backtick: split at the escapes -------------------
    {
      const src = 'client->message_toast_display( `saved,\\n and closed` ).\n)->a( n = `text` v = `\\tlead` )';
      const found = one(src, 'escape-sequence-in-backtick');
      assert(found.length === 2 && found.every((x) => x.fixes?.length === 1), 'fix: escape-sequence-in-backtick carries one rewrite per literal');
      assert(applyFixes(src, found).output === 'client->message_toast_display( `saved,` && |\\n| && ` and closed` ).\n)->a( n = `text` v = |\\t| && `lead` )',
        'fix: escape-sequence-in-backtick concatenates a template per escape and drops empty pieces');
    }

    // --- json-bind-on-scalar-property: the argument goes ---------------------
    {
      const src = `CLASS zcl_j DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
      DATA manifest TYPE string.
  ENDCLASS.
  CLASS zcl_j IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          )->tag( \`Text\` )->a( n = \`text\` v = client->_bind( val = manifest json = abap_true )
          )->end( ).
      client->view_display( v->stringify( ) ).
    ENDMETHOD.
  ENDCLASS.`;
      const found = checkAbapSource(src).findings.filter((x) => x.type === 'json-bind-on-scalar-property');
      assert(found.length === 1 && found[0].fixes?.length === 1, 'fix: json-bind-on-scalar-property carries the deletion');
      assert(applyFixes(src, found).output.includes('client->_bind( val = manifest )'),
        'fix: json-bind-on-scalar-property leaves the plain bind');
    }
});

// the flow rules: what runs whenever a call runs (branchTail), and the one
// spelling rule get_event( ) needs - plus the did-you-mean the closed-set
// rules gained, each asserted as message + fix under strict-span mode
section('flow rules and did-you-mean', async () => {
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { checkAbapRules, checkAbapSource, checkXmlSource } = await import('../observe.mjs');
    const one = (src, type) => checkAbapRules(src).filter((x) => x.type === type);

    // --- the fixture carries all five, once each ------------------------------
    {
      const src = fs.readFileSync(f('flow.clas.abap'), 'utf8');
      const found = checkAbapSource(src).findings;
      const of = (type) => found.filter((x) => x.type === type);
      assert(of('unconditional-popup-display').length === 1 && of('unconditional-popup-display')[0].member === 'popup_display',
        'unconditional-popup-display: the popup at the top level of main( )');
      assert(of('display-after-nav-app-call').length === 1 && of('display-after-nav-app-call')[0].member === 'view_display',
        'display-after-nav-app-call: the display behind the hand-over in the SAVE branch');
      assert(of('double-display-in-branch').length === 1 && of('double-display-in-branch')[0].member === 'MAIN',
        `double-display-in-branch: the second MAIN display in the OTHER branch (got ${of('double-display-in-branch').length})`);
      assert(of('popup-without-close-wire').length === 1, 'popup-without-close-wire: the Dialog nothing wires');
      const ec = of('event-name-case-mismatch');
      assert(ec.length === 1 && ec[0].value === 'save' && ec[0].member === 'SAVE' && ec[0].fixes?.length === 1,
        'event-name-case-mismatch: `save` raised against WHEN `SAVE`, with the fix');
      assert(applyFixes(src, ec).output.includes('client->_event( `SAVE` )'), 'fix: event-name-case-mismatch writes the handler\'s spelling');
      assert(!of('event-without-handler').length, 'event-name-case-mismatch: the case-blind rule does not report the same raise');
    }

    // --- unconditional-popup-display: guards and branches excuse it ------------
    {
      const main = (body) => `METHOD z2ui5_if_app~main.\n${body}\nENDMETHOD.`;
      assert(one(main('  IF client->check_on_init( ).\n    RETURN.\n  ENDIF.\n  client->popup_display( x( ) ).'), 'unconditional-popup-display').length === 0,
        'unconditional-popup-display: a RETURN guard makes the rest conditional');
      assert(one(main('  IF client->check_on_init( ).\n    client->popup_display( x( ) ).\n  ENDIF.'), 'unconditional-popup-display').length === 0,
        'unconditional-popup-display: a popup inside a branch is fine');
      assert(one(main('  CHECK client->check_on_event( `OPEN` ).\n  client->popover_display( x( ) ).'), 'unconditional-popup-display').length === 0,
        'unconditional-popup-display: a CHECK guard counts');
      assert(one('METHOD on_event.\n  client->popup_display( x( ) ).\nENDMETHOD.', 'unconditional-popup-display').length === 0,
        'unconditional-popup-display: only main( ) is judged');
    }

    // --- display-after-nav-app-call / double-display: boundaries ---------------
    {
      assert(one('METHOD on_event.\n  IF x = 1.\n    client->nav_app_call( NEW zcl_x( ) ).\n    RETURN.\n  ENDIF.\n  client->view_display( r( ) ).\nENDMETHOD.', 'display-after-nav-app-call').length === 0,
        'display-after-nav-app-call: a RETURN ends the flow');
      assert(one('METHOD on_event.\n  IF x = 1.\n    client->nav_app_call( NEW zcl_x( ) ).\n  ELSE.\n    client->view_display( r( ) ).\n  ENDIF.\nENDMETHOD.', 'display-after-nav-app-call').length === 0,
        'display-after-nav-app-call: the ELSE arm is another flow');
      assert(one('METHOD main.\n  client->view_display( a( ) ).\n  IF x = 1.\n    client->view_display( b( ) ).\n  ENDIF.\nENDMETHOD.', 'double-display-in-branch').length === 0,
        'double-display-in-branch: a display in a nested block is its own flow');
      assert(one('METHOD main.\n  client->view_display( a( ) ).\n  client->popup_display( b( ) ).\nENDMETHOD.', 'double-display-in-branch').length === 0,
        'double-display-in-branch: two different slots are two displays');
      assert(one('METHOD main.\n  client->view_display( a( ) ).\n  client->view_display( b( ) ).\nENDMETHOD.', 'double-display-in-branch').length === 1,
        'double-display-in-branch: the same slot twice in one flow');
    }

    // --- all three read the BLANKED source: a quoted call is not a call --------
    {
      // The shape that reported the framework's own Hello World sample: a
      // MessageStrip that tells the reader what the class does quotes the very
      // call it makes, and scrub( ) keeps literal content.
      const quoted = (call) => `METHOD z2ui5_if_app~main.\n  DATA(t) = \`the view is handed to ${call} \`.\n  client->view_display( r( ) ).\nENDMETHOD.`;
      assert(one(quoted('client->view_display( ).'), 'double-display-in-branch').length === 0,
        'double-display-in-branch: a display call inside a string literal is prose, not a call');
      assert(one(quoted('client->popup_display( ).'), 'unconditional-popup-display').length === 0,
        'unconditional-popup-display: a popup call inside a string literal is prose, not a call');
      assert(one(quoted('client->nav_app_call( ).'), 'display-after-nav-app-call').length === 0,
        'display-after-nav-app-call: a hand-over inside a string literal is prose, not a call');
    }

    // --- popup-without-close-wire: any wire in the method excuses it -----------
    {
      const dlg = (tail) => `METHOD r.\n  DATA(p) = z2ui5_cl_ui5_view_builder=>factory( ).\n  p->ele( \`Dialog\` )->a( n = \`title\` v = \`x\` ).\n${tail}\nENDMETHOD.`;
      assert(one(dlg('  p->ele( `buttons` )->tag( `Button` )->a( n = `press` v = client->_event( `CLOSE` ) ).'), 'popup-without-close-wire').length === 0,
        'popup-without-close-wire: a button wired in a second statement counts');
      assert(one(dlg('  p->a( n = `afterClose` v = client->_event( `CLOSE` ) ).'), 'popup-without-close-wire').length === 0,
        'popup-without-close-wire: an afterClose wire counts');
      assert(one(dlg(''), 'popup-without-close-wire').length === 1, 'popup-without-close-wire: no wire at all');
    }

    // --- event-name-case-mismatch: two handled spellings are no candidate ------
    {
      const src = 'view->tag( `Button` )->a( n = `press` v = client->_event( `save` ) ).\nCASE client->get_event( ).\n  WHEN `SAVE`.\n  WHEN `Save`.\nENDCASE.';
      assert(one(src, 'event-name-case-mismatch').length === 0, 'event-name-case-mismatch: two handled spellings of one name are left alone');
    }

    // --- class-constructor-visibility: the chained form ------------------------
    {
      const src = 'CLASS zcl DEFINITION.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n  PRIVATE SECTION.\n    CLASS-METHODS: other, class_constructor.\nENDCLASS.';
      const found = one(src, 'class-constructor-visibility');
      assert(found.length === 1 && !found[0].fixes && src.slice(found[0].offset).startsWith('class_constructor'),
        'class-constructor-visibility: the chained CLASS-METHODS: form is reported, at the name, without a fix');
      assert(one(src.replace('PRIVATE SECTION.\n    CLASS-METHODS: other, class_constructor.', 'PRIVATE SECTION.').replace('INTERFACES z2ui5_if_app.', 'CLASS-METHODS: class_constructor, other.'), 'class-constructor-visibility').length === 0,
        'class-constructor-visibility: the chained form inside the PUBLIC SECTION is fine');
    }

    // --- did-you-mean: the eight closed-set rules, message and fix --------------
    {
      const cls = (leaf, extra = '') => `CLASS zcl_j DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
  ENDCLASS.
  CLASS zcl_j IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(v) = z2ui5_cl_ui5_view_builder=>factory( ).
      v->ele( n = \`View\` ns = \`mvc\`
          )->a( n = \`xmlns\` v = \`sap.m\` )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
          ${leaf}
          )->end( ).
      client->view_display( v->stringify( ) ).
      ${extra}
    ENDMETHOD.
  ENDCLASS.
`;
      const dym = (src, type, suggestion, fixed, xml = false) => {
        const r = xml ? checkXmlSource(src) : checkAbapSource(src);
        const found = r.findings.filter((x) => x.type === type);
        assert(found.length === 1 && found[0].suggestion === suggestion && found[0].fixes?.length === 1,
          `did-you-mean: ${type} suggests ${suggestion} (got ${found[0]?.suggestion}, fixes ${found[0]?.fixes?.length})`);
        assert(found[0].message.endsWith(`did you mean ${suggestion}?`), `did-you-mean: ${type} says it in the message`);
        assert(applyFixes(src, found).output.includes(fixed), `did-you-mean: ${type} --fix writes it (${fixed})`);
      };
      dym(cls(')->ele( `Page` )->ele( `Content` )->tag( `Button` )->end( )'), 'unknown-control', 'content', ')->ele( `content` )');
      dym(cls(')->ele( `page` )->tag( `Button` )->end( )'), 'unknown-aggregation', 'Page', ')->ele( `Page` )');
      dym(cls(')->tag( `Button` )->a( n = `Text` v = `x` )'), 'unknown-property', 'text', 'a( n = `text` v = `x` )');
      dym(cls(')->tag( `Button` )->a( n = `type` v = `emphasized` )'), 'invalid-property-value', 'Emphasized', 'v = `Emphasized`');
      dym(cls(')->tag( `SearchField` )->a( n = `search` v = client->_event( val = `GO` t_arg = VALUE #( ( `${$parameters>/Query}` ) ) ) )', 'IF client->check_on_event( `GO` ). ENDIF.'),
        'unknown-event-parameter', 'query', '${$parameters>/query}');
      dym(cls(')->tag( `Button` )->a( n = `icon` v = `sap-icon://textFormatting` )'), 'unknown-icon', 'text-formatting', 'sap-icon://text-formatting');
      dym(cls(')->tag( `Button` )->a( n = `id` v = `btnGo` )', 'client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `btngo` ) ( `focus` ) ) ).'),
        'frontend-action-unknown-id', 'btnGo', '( `btnGo` ) ( `focus` )');
      dym(cls(')->tag( `Button` )->a( n = `id` v = `btnGo` )', 'client->popover_display( xml = v->stringify( ) by_id = `btngo` ).'),
        'popover-anchor-unknown-id', 'btnGo', 'by_id = `btnGo`');
      dym('<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Button type="emphasized" text="x"/></mvc:View>',
        'invalid-property-value', 'Emphasized', 'type="Emphasized"', true);
      // a real typo gets no suggestion: the linter does not guess at edit distance
      const typo = checkAbapSource(cls(')->ele( `Page` )->tag( `Buttom` )->end( )')).findings.find((x) => x.type === 'unknown-control');
      assert(typo && !typo.suggestion && !typo.fixes, 'did-you-mean: a real typo gets no suggestion and no fix');
    }
});
}
