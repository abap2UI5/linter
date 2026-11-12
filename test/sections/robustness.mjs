/*
 * test/sections/robustness - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, path, test, after, checkAbapSource, checkXmlSource, produced, severityOf, f, FIX, assert, section, by, good, broken, has, rules, rows, view, bad, xml } = H;


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
    const { checkAbapRules } = await import('../observe.mjs');
    const { applyFixes } = await import('../../lib/fix.mjs');
    const { severityOf } = await import('../../lib/findings.mjs');
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
    const twsLines = twsF.map((x) => tws.slice(0, x.offset).split('\n').length).join();
    assert(twsF.length === 2 && twsLines === '1,2',
      `trailing-whitespace: one finding per line (got ${twsLines || 'none'})`);
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
    const { checkAbapRules } = await import('../observe.mjs');
    const { severityOf } = await import('../../lib/findings.mjs');
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
}
