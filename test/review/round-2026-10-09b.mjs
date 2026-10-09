/*
 * The second 2026-10-09 round. See test/review/README.md for the harness.
 *
 *   1. a waiver in a class that builds no view, for a rule that never runs
 *      on such a class, is unjudged - not unused-directive
 */
export default function ({ section, assert, checkAbapSource }) {
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
}
