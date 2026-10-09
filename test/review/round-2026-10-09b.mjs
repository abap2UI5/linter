/*
 * The second 2026-10-09 round. See test/review/README.md for the harness.
 *
 *   1. a waiver in a class that builds no view, for a rule that never runs
 *      on such a class, is unjudged - not unused-directive
 *   2. linear where test/review/timing-sweep.mjs found it was not: many
 *      views with unused namespace declarations, many unclosed calls, a long
 *      run of blanks after a statement's first word
 *   3. a name used in a method reads that method's variable: a literal or a
 *      template is resolved per scope, not as the last write in the class
 */
import { scalesLinearly } from '../timing.mjs';
import { parenRegion } from '../../lib/abap.mjs';

export default function ({ section, assert, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const unused = (src, o = {}) => checkAbapSource(src, { ...opts, ...o }).findings
    .filter((x) => x.type === 'unused-directive').map((x) => x.value);

  /* ── 1. what a view-less class is judged by ──────────────────────────── */

  /* An app class whose view another class builds is judged by the source
   * rules and the ABAP rules that read the class (VIEWLESS_APP_RULE in
   * lib/index.mjs). unbound-public-attribute is not one of them - every
   * attribute the views class binds would be reported - so a waiver of it
   * there had nothing to suppress and was reported as unused-directive,
   * with a fix that deletes the waiver the class needs the day its view
   * moves back in. */
  const viewless = (directive, extra = '') => 'CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + `    ${directive}\n    DATA mv_count TYPE i.\n${extra}ENDCLASS.\n`
    + 'CLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    mv_count = mv_count + 1.\n'
    + '    client->view_display( zcl_q_views=>main( client ) ).\n  ENDMETHOD.\nENDCLASS.\n';
  section('round 2026-10-09b: a view-less class\'s waiver for a rule it is not judged by is unjudged', () => {
    const waiver = '" abap2ui5lint-disable-next-line unbound-public-attribute -- the views class binds it';
    const r = checkAbapSource(viewless(waiver), opts);
    assert(r.appWithoutView === true, 'the fixture is an app class without a view');
    assert(unused(viewless(waiver)).length === 0,
      `unbound-public-attribute never runs on a view-less app class: unjudged (got ${unused(viewless(waiver))})`);
    assert(unused(viewless('" abap2ui5lint-disable-next-line unknown-property')).length === 0,
      'nor a property-walk rule: nothing walked a view');
    assert(unused(viewless('" abap2ui5lint-disable-next-line event-on-disabled-control')).length === 0,
      'nor a walk rule whose id merely looks like a class rule (event-…)');
    assert(JSON.stringify(unused(viewless('" abap2ui5lint-disable-next-line binding-to-local'))) === '["binding-to-local"]',
      'a rule the view-less class IS judged by, with nothing to waive: unused, as before');
    assert(JSON.stringify(unused(viewless('" abap2ui5lint-disable-next-line default-key-table'))) === '["default-key-table"]',
      'a source rule with nothing to waive: unused, as before');
    const helper = viewless('" abap2ui5lint-disable-next-line unbound-public-attribute').replace('    INTERFACES z2ui5_if_app.\n', '');
    assert(unused(helper, { allClasses: true }).length === 0,
      'a helper class under --all-classes: the same - only the source rules ran');
    assert(JSON.stringify(unused(helper.replace('unbound-public-attribute', 'trailing-whitespace'), { allClasses: true })) === '["trailing-whitespace"]',
      'and its waiver of a source rule with nothing to waive is still unused');
    const frozen = 'CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    " abap2ui5lint-disable-next-line unbound-public-attribute\n    DATA mv_count TYPE i.\nENDCLASS.\n'
      + 'CLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_xml_view=>factory( ).\n'
      + '    client->view_display( view->page( )->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    assert(checkAbapSource(frozen, opts).findings.some((x) => x.type === 'frozen-view-builder') && unused(frozen).length === 0,
      'a class on the frozen builder: judged by frozen-view-builder alone, the waiver is unjudged');
  });

  section('round 2026-10-09b: SOURCE_RULES is every id checkSourceRules( ) emits', async () => {
    const fs = await import('node:fs');
    const { SOURCE_RULES } = await import('../../lib/abap-rules.mjs');
    const s = fs.readFileSync(new URL('../../lib/abap-rules.mjs', import.meta.url), 'utf8');
    const called = s.slice(s.indexOf('export function checkSourceRules('));
    const names = [...called.slice(0, called.indexOf('\n}\n')).matchAll(/\b(check\w+|obsolete\w+)\(/g)].map((m) => m[1]).filter((n) => n !== 'checkSourceRules');
    const body = (name) => {
      const at = s.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
      const rest = s.slice(at + 1);
      return rest.slice(0, rest.search(/^(?:export )?(?:async )?function |^(?:export )?const /m));
    };
    const emitted = new Set(names.flatMap((n) => [...body(n).matchAll(/type: '([a-z0-9-]+)'/g)].map((m) => m[1])));
    assert(names.length === 4 && JSON.stringify([...emitted].sort()) === JSON.stringify([...SOURCE_RULES].sort()),
      `the set matches the emit sites of ${names.join(', ')} (missing: ${[...emitted].filter((id) => !SOURCE_RULES.has(id)).join(', ') || 'none'}; extra: ${[...SOURCE_RULES].filter((id) => !emitted.has(id)).join(', ') || 'none'})`);
  });

  /* ── 2. linear ───────────────────────────────────────────────────────── */

  section('round 2026-10-09b: many views, many unclosed calls, a long blank run - all linear', () => {
    /* The unused-namespace stand-down counted a prefix's uses in the whole
     * source once per FINDING, and every document reports its own unused
     * declarations: 200 views with 40 unused prefixes each took 5.7 s. */
    const views = (k) => {
      const xmlns = Array.from({ length: 40 }, (_, j) => `        )->a( n = \`xmlns:p${j}\` v = \`sap.p${j}\``).join('\n');
      return 'CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA client TYPE REF TO z2ui5_if_client.\n'
        + Array.from({ length: k }, (_, i) => `    METHODS v${i}.`).join('\n')
        + '\nENDCLASS.\nCLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    me->client = client.\n    v0( ).\n  ENDMETHOD.\n'
        + Array.from({ length: k }, (_, i) => `  METHOD v${i}.\n    client->view_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = \`View\` ns = \`mvc\`\n`
          + `        )->a( n = \`xmlns\` v = \`sap.m\`\n        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`\n${xmlns}\n`
          + '        )->ele( `Page` )->stringify( ) ).\n  ENDMETHOD.').join('\n') + '\nENDCLASS.\n';
    };
    const ns = checkAbapSource(views(2), opts).findings.filter((x) => x.type === 'unused-namespace-declaration');
    assert(ns.length === 80, `the shape reports what it should: 40 unused prefixes per view (${ns.length})`);
    const many = scalesLinearly(views, (src) => checkAbapSource(src, opts), 50);
    assert(many.ok, `views with unused declarations: linear (${many.small} ms -> ${many.big} ms)`);

    /* An unclosed call's argument list ran to the end of the file, so every
     * rule that reads one read the rest of the class per call: 2,000 of them
     * took 11 s. It ends at the statement now. */
    const unclosed = (k) => 'CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv TYPE string.\nENDCLASS.\n'
      + 'CLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + Array(k).fill('    view->tag( `Input` )->a( n = `value` v = client->_bind( mv ).').join('\n')
      + '\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const calls = scalesLinearly(unclosed, (src) => checkAbapSource(src, opts), 500);
    assert(calls.ok, `unclosed calls: linear (${calls.small} ms -> ${calls.big} ms)`);

    /* `\s*\)?\s*` in unescaped-text-in-attribute's write reader split a run
     * of blanks every possible way before failing: `CLASS-METHODS` and 32,000
     * blanks took a second. */
    const blanks = (k) => 'CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + `    CLASS-METHODS${' '.repeat(k)}class_constructor.\nENDCLASS.\nCLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\n`
      + '  METHOD class_constructor.\n  ENDMETHOD.\nENDCLASS.\n';
    const run = scalesLinearly(blanks, (src) => checkAbapSource(src, opts), 8000);
    assert(run.ok, `a long blank run after the first word: linear (${run.small} ms -> ${run.big} ms)`);
  });

  section('round 2026-10-09b: an unclosed call ends at its statement; a comment is not code', () => {
    const src = 'x = foo( a = 1.\ny = bar( b = 2 ).\n';
    const r = parenRegion(src, src.indexOf('('));
    assert(r.body === ' a = 1' && r.end === src.length, `the body stops at the period, the end still says "unclosed" (${JSON.stringify(r)})`);
    const commented = 'x = foo( a = 1 " a comment with ) and . in it\n  b = 2 ).';
    assert(parenRegion(commented, commented.indexOf('(')).body.trim().endsWith('b = 2'),
      'a ) and a . in a trailing comment neither close nor end the call');
    const star = 'x = foo( a = 1\n* b = 2 ). in a comment line\n  c = 3 ).';
    assert(parenRegion(star, star.indexOf('(')).body.trim().endsWith('c = 3'), 'nor in a * comment line');
    const literal = 'x = foo( a = `. ) ` b = |{ c }. | ).';
    assert(parenRegion(literal, literal.indexOf('(')).body === ' a = `. ) ` b = |{ c }. | ', 'nor in a literal or a template');
  });

  /* ── 3. scopes ───────────────────────────────────────────────────────── */

  /* The literal half of the 2026-10-09 template guard. A name assigned a
   * literal was read class-wide - the last such assignment anywhere - so a
   * helper's parameter `type` was main's `DATA(type) = \`Bogus\``, and of
   * two methods' locals of one name both read the later one. The
   * declaration guard the template half got would have refused every name
   * declared twice; the reconstructor reads the scope instead: the method's
   * own variable where the name is one (an inline or a DATA declaration, a
   * parameter), the class's attribute everywhere else. */
  const scoped = (main, helpers, definition = '') => 'CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
    + `    DATA mv_type TYPE string.\n${definition}ENDCLASS.\nCLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n`
    + '    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
    + `${main}    client->view_display( page->stringify( ) ).\n  ENDMETHOD.\n${helpers}ENDCLASS.\n`;
  const invalid = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'invalid-property-value').map((x) => x.value);
  section('round 2026-10-09b: a literal is the value of its own method\'s variable', () => {
    const param = scoped('    DATA(type) = `Bogus`.\n    add( page = page type = mv_type ).\n',
      '  METHOD add.\n    page->tag( `Button` )->a( n = `type` v = type ).\n  ENDMETHOD.\n',
      '    METHODS add IMPORTING page TYPE REF TO z2ui5_cl_ui5_view_builder type TYPE string.\n');
    assert(!prepareAbap(param).docs.join('').includes('Bogus') && !invalid(param).length,
      `a helper's parameter is not main's local of the same name (${invalid(param).join() || 'none'})`);
    const two = scoped('    DATA(lv_type) = `Emphasized`.\n    page->tag( `Button` )->a( n = `type` v = lv_type ).\n    other( page ).\n',
      '  METHOD other.\n    DATA(lv_type) = `Bogus`.\n    page->tag( `Button` )->a( n = `type` v = lv_type ).\n  ENDMETHOD.\n',
      '    METHODS other IMPORTING page TYPE REF TO z2ui5_cl_ui5_view_builder.\n');
    const docs = prepareAbap(two).docs.join('');
    assert(docs.includes('type="Emphasized"') && docs.includes('type="Bogus"'), `two methods' locals of one name keep their own values (${docs.slice(-160)})`);
    assert(JSON.stringify(invalid(two)) === '["Bogus"]', `and only the wrong one is reported (${invalid(two).join() || 'none'})`);
    const late = scoped('    page->tag( `Button` )->a( n = `type` v = lv_type ).\n    DATA lv_type TYPE string.\n    lv_type = `Bogus`.\n', '');
    assert(!prepareAbap(late).docs.join('').includes('Bogus'), 'a local written only after the use is not its value there');
    const attribute = scoped('    page->tag( `Button` )->a( n = `type` v = mv_type ).\n    seed( ).\n',
      '  METHOD seed.\n    mv_type = `Emphasized`.\n  ENDMETHOD.\n', '    METHODS seed.\n');
    assert(prepareAbap(attribute).docs.join('').includes('type="Emphasized"'), 'an attribute set in another method still resolves class-wide, as before');
    const shadowed = scoped('    page->tag( `Button` )->a( n = `type` v = mv_type ).\n    seed( ).\n',
      '  METHOD seed.\n    DATA mv_type TYPE string.\n    mv_type = `Bogus`.\n  ENDMETHOD.\n', '    METHODS seed.\n');
    assert(!prepareAbap(shadowed).docs.join('').includes('Bogus'), 'a local that shadows the attribute in another method is not the attribute');
  });

  section('round 2026-10-09b: a template is resolved in its own method, and only whole', () => {
    const two = scoped('    DATA(expr) = |Emphasized|.\n    page->tag( `Button` )->a( n = `type` v = expr ).\n    other( page ).\n',
      '  METHOD other.\n    DATA(expr) = |Bogus|.\n    page->tag( `Button` )->a( n = `type` v = expr ).\n  ENDMETHOD.\n',
      '    METHODS other IMPORTING page TYPE REF TO z2ui5_cl_ui5_view_builder.\n');
    const docs = prepareAbap(two).docs.join('');
    assert(docs.includes('type="Emphasized"') && docs.includes('type="Bogus"'),
      `a name declared in two methods resolves in each to its own template (${docs.slice(-160)})`);
    /* samples app 000: `DATA(width) = |{ tenths DIV 10 }.{ tenths MOD 10 }em|`
     * in one method, another `width` elsewhere. Read in its scope, the
     * template expanded to the guess `.em`, which the render gate refuses as
     * a CSSSize; a template with a piece the scan cannot compute is not
     * expanded at all. */
    const partial = scoped('    DATA(tenths) = lines( mt_x ).\n    DATA(width) = |{ tenths DIV 10 }.{ tenths MOD 10 }em|.\n'
      + '    page->tag( `Link` )->a( n = `width` v = width ).\n', '');
    const doc = prepareAbap(partial).docs.join('');
    assert(!/width="/.test(doc), `a partly computable template leaves the attribute unresolved, not guessed (${doc.slice(-80)})`);
  });
}
