/*
 * The binding-value readers (lib/binding-paths.mjs) and the two rules that
 * read named models and absolute paths off a binding value. Found by the
 * 2026-11-12 org-wide bug hunt; each section fails on the code as it was.
 * See test/review/README.md for the harness.
 *
 *   1. invalid-expression-binding: a brace or parenthesis inside a string
 *      literal of the expression is text, not structure
 *   2. unknown-model reads `path: 'm>…'` and the `parts` entries too
 *   3. unknown-binding-path reads a composite value, the string entries of
 *      `parts` and a double-quoted `path:`
 */
const frame = (attrs) =>
  'CLASS zcl_bindvals DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n    DATA mv_other TYPE string.\nENDCLASS.\n\n'
  + 'CLASS zcl_bindvals IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page`\n'
  + '          )->tag( `Text`\n'
  + '            )->a( n = `text` v = client->_bind( mv_other )\n'
  + attrs
  + '        )->end( ).\n'
  + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';

export default async function ({ section, assert, checkAbapSource, checkXmlSource }) {
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const of = (src, type) => checkAbapSource(src, opts).findings.filter((x) => x.type === type);
  const attr = (n, v) => `            )->a( n = \`${n}\` v = \`${v}\`\n`;

  /* ── 1. string literals inside an expression binding ─────────────────── */

  section('invalid-expression-binding: a brace or parenthesis in a string literal is balanced', () => {
    const xml = (v) => `<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Text text="${v}"/></mvc:View>`;
    const hits = (v) => checkXmlSource(xml(v), { render: false, file: 'x.view.xml' }).findings.filter((x) => x.type === 'invalid-expression-binding');
    for (const v of ["{= ${/a} + ' :-)' }", "{= ${/a} === '}' }", "{= ${/a} ? '(' + ${/a} : '' }", "{= 'it\\'s (' }"]) {
      assert(hits(v).length === 0, `${v} is balanced (${hits(v).length})`);
    }
    assert(hits('{= ${/a} + (1 }').length === 1, 'an unclosed parenthesis outside a literal is still one');
  });

  /* ── 2. unknown-model over every spelling of a path ──────────────────── */

  /* binding-paths.mjs leaves `m>X` to unknown-model, which only matched
   * `{m>…}`: the same foreign model written as a complex binding info or as
   * a `parts` entry was judged by no rule at all. */
  section('unknown-model: path: and parts entries name a model too', () => {
    const hits = of(frame(attr('tooltip', "{ path: 'ui>/x' }") + attr('busy', "{ parts: [ 'i18n>A', { path: 'device>/system/phone' } ], formatter: '.f' }")), 'unknown-model');
    assert(hits.map((x) => x.value).sort().join() === 'i18n,ui', `ui> and i18n> are reported, device> is not (${hits.map((x) => x.value).join()})`);
    const once = of(frame(attr('tooltip', "{ parts: [ { path: 'ui>/x' } ] }")), 'unknown-model');
    assert(once.length === 1, `an object entry of parts is one finding, not two (${once.length})`);
    const dq = of(frame(attr('tooltip', '{ path: "Device>/system/phone" }')), 'unknown-model');
    assert(dq.length === 1 && dq[0].suggestion === 'device', 'a double-quoted path, with the case miss suggested');
  });

  /* ── 3. unknown-binding-path over every spelling of an absolute path ──── */

  section('unknown-binding-path: composite values, parts strings and double quotes are judged', () => {
    const values = (a) => of(frame(a), 'unknown-binding-path').map((x) => x.value).sort().join();
    assert(values(attr('tooltip', 'Hello {/NOPE}!')) === '/NOPE', 'a path inside a composite value');
    assert(values(attr('tooltip', '{/MV_OTHER} {/GONE}')) === '/GONE', 'two embedded bindings: only the missing one');
    assert(values(attr('tooltip', "{ parts: [ '/MV_OTHER', \"/P2\" ], formatter: '.f' }")) === '/P2', 'a string entry of parts');
    assert(values(attr('tooltip', '{ path: "/DQ" }')) === '/DQ', 'a double-quoted path:');
    // what stays silent
    assert(values(attr('tooltip', '{/MV_OTHER}')) === '', 'a whole-value binding that exists');
    assert(values(attr('tooltip', 'see \\{/NOPE}')) === '', 'an escaped brace is text');
    // a member of a json = abap_true field: an object on the client whose shape the class does not declare
    const json = frame('            )->a( n = `tooltip` v = |\\{{ client->_bind( val = mv_text json = abap_true path = abap_true ) }/a/b\\} and \\{{ client->_bind( val = mv_text json = abap_true path = abap_true ) }/c\\}|\n');
    assert(of(json, 'unknown-binding-path').length === 0, `a path into a json-bound field is not judged (${of(json, 'unknown-binding-path').map((x) => x.value).join()})`);
    const whole = of(frame(attr('tooltip', '{/NOPE}')), 'unknown-binding-path');
    assert(whole.length === 1, `a whole-value {/X} is still reported once (${whole.length})`);
  });
}
