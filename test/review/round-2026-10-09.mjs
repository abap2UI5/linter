/*
 * The 2026-10-09 round: an adversarial read of the 2026-10-08 branch as a
 * whole, the extension's corpus fuzz, and the render harness's attribution.
 * See test/review/README.md for the harness.
 *
 *   1. a name written once with a template resolves only where it is ONE
 *      variable - a method parameter of the same name is another
 *   2. linear on long input: a long hyphenated token (commercial-ui5-host),
 *      thousands of PUBLIC attributes (unbound-public-attribute), thousands
 *      of captured client handles (client-handle-capture), and a block of
 *      commented-out lines in prepareAbap (what the VS Code extension runs on
 *      every edit)
 *   3. an answer that arrives after a document's render window is charged to
 *      that document, never to the next one on the page
 */
import http from 'node:http';
import { openRenderer } from '../../lib/render.mjs';
import { scalesLinearly } from '../timing.mjs';

export default function ({ section, assert, checkAbapSource, prepareAbap }) {
  const opts = { render: false };
  const app = (definition, body) => `CLASS zcl_q DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${definition}`
    + '    DATA mv TYPE string.\nENDCLASS.\nCLASS zcl_q IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
    + `${body}\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n`
    + '    view->ele( `Page` )->tag( `Input` )->a( n = `value` v = client->_bind_edit( mv ) ).\n'
    + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';

  /* ── 1. one template, one variable ───────────────────────────────────── */

  /* The 2026-10-08 corpus round resolved a name the class writes once with a
   * string template to that template, class-wide. A helper's parameter of the
   * same name is a different variable: `v = type` in `add( )` came out as
   * main's `DATA(type) = |Bogus|`, and the Button was reported (and rendered)
   * with a type nobody passed. */
  section('round 2026-10-09: a template name shadowed by a parameter is not resolved', () => {
    const src = 'CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_type TYPE string.\n'
      + '    METHODS add IMPORTING page TYPE REF TO z2ui5_cl_ui5_view_builder type TYPE string.\nENDCLASS.\n'
      + 'CLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(type) = |Bogus|.\n'
      + '    DATA(page) = z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->ele( `Page` ).\n'
      + '    add( page = page type = mv_type ).\n    client->view_display( page->stringify( ) ).\n  ENDMETHOD.\n'
      + '  METHOD add.\n    page->tag( `Button` )->a( n = `type` v = type ).\n  ENDMETHOD.\nENDCLASS.\n';
    const docs = prepareAbap(src).docs.join('');
    assert(!docs.includes('Bogus'), `the parameter is not main's template (${docs})`);
    const found = checkAbapSource(src, opts).findings.filter((x) => x.type === 'invalid-property-value').map((x) => x.value);
    assert(!found.length, `no invalid-property-value for a value nobody passes (${found.join() || 'none'})`);
    // the shape the resolution exists for still resolves
    const one = src.replace('type TYPE string.', 'kind TYPE string.').replace('v = type', 'v = expr')
      .replace('DATA(type) = |Bogus|.', 'DATA(expr) = |Emphasized|.');
    assert(prepareAbap(one).docs.join('').includes('type="Emphasized"'), 'a name declared once still resolves to its template');
  });

  /* ── 2. linear on long input ─────────────────────────────────────────── */

  /* Each of these read the whole class once per item: a regex tried at every
   * word boundary inside one long `a-a-a-…` run (commercial-ui5-host's
   * optional subdomain), three regex scans of the class per PUBLIC attribute
   * (unbound-public-attribute), a scan for the captured name per capture
   * (client-handle-capture). And prepareAbap's model readers, anchored on
   * `^\s*` under /m, ran every blanked comment line into all the blank lines
   * behind it - the VS Code extension runs it on every edit, so a large
   * commented-out block stalled the editor (0.8.5: 2,000 such lines 1 s,
   * 8,000 lines 16 s). Judged by scalesLinearly( ): n against 4n, best of
   * three, so a loaded runner cannot fail it. */
  section('round 2026-10-09: long tokens, many attributes, many captures, comment blocks - all linear', () => {
    const check = (src) => checkAbapSource(src, opts);
    const cases = [
      ['a long hyphenated token', (n) => app('', `    x = ${'a-'.repeat(n)}b.`), check, 6000],
      ['PUBLIC attributes, each written once', (n) => app(Array.from({ length: n }, (_, i) => `    DATA mv_${i} TYPE string.\n`).join(''),
        Array.from({ length: n }, (_, i) => `    mv_${i} = \`x\`.`).join('\n')), check, 1500],
      ['captured client handles', (n) => app('', Array.from({ length: n }, (_, i) => `    lv = client->_bind( mv_${i} ).`).join('\n')), check, 2000],
      ['commented-out lines', (n) => app('', Array.from({ length: n }, (_, i) => `*      ls_row-f${i} = VALUE #( a = 1 ).  " t[ 1 ]-x`).join('\n')), prepareAbap, 2000],
    ];
    for (const [what, make, run, n] of cases) {
      const r = scalesLinearly(make, run, n);
      assert(r.ok, `${what}: four times the input, not sixteen times the time (${r.small} ms -> ${r.big} ms)`);
    }
    // what the rewritten readers decide is what the regexes decided
    const vocab = app('    DATA mv_bound TYPE string.\n    DATA mv_path TYPE string.\n    DATA mv_flag TYPE abap_bool.\n    DATA mv_nested TYPE string.\n    DATA mv_free TYPE string.\n',
      '    mv_bound = mv_path && mv_flag && mv_nested && mv_free.\n'
      + '    DATA(a) = client->_bind( val = mv_bound ).\n    DATA(p) = `{/MV_PATH}`.\n    view->a( n = `visible` b = mv_flag ).\n'
      + '    DATA(c) = client->_bind( conv( f( mv_nested ) ) ).');
    const unbound = checkAbapSource(vocab, opts).findings.filter((x) => x.type === 'unbound-public-attribute').map((x) => x.member).sort();
    assert(unbound.join() === 'mv_free,mv_nested', `bound through _bind, a path and b =; a name two parens deep is not (${unbound.join()})`);
    const host = (url) => checkAbapSource(app('', `    DATA(u) = \`${url}\`.`), opts).findings.filter((x) => x.type === 'commercial-ui5-host').map((x) => x.value);
    assert(host('https://sapui5.hana.ondemand.com/resources/sap-ui-core.js').join() === 'sapui5.hana.ondemand.com/resources/sap-ui-core.js'
      && host('x-hana.ondemand.com/resources/x').join() === 'hana.ondemand.com/resources/x'
      && host('a-b.hana.ondemand.com/resources/').join() === 'a-b.hana.ondemand.com/resources/',
    'the host is read as before: a subdomain from the start of its run, a bare host after a hyphen');
  });

  /* ── 3. a late answer is charged to the document that asked ──────────── */

  /* A document is not done when its view is destroyed: a control that sent
   * a request reports what came back whenever it comes back, and the page
   * meanwhile renders the next document - whose window then collected the
   * error (samples-controls apps 118/168, charged to 180-185 depending on the
   * run). The harness now counts the requests in flight and lets them settle
   * into the window of the document that sent them; a page still waiting
   * after the bound is reloaded, so the answer is lost rather than misfiled. */
  section('round 2026-10-09: an answer after the render window is charged to its own document', async () => {
    const server = http.createServer((req) => setTimeout(() => req.socket.destroy(), 400));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/late`;
    const late = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:core="sap.ui.core"><core:HTML content="'
      + `&lt;script&gt;fetch(&quot;${url}&quot;).catch(() =&gt; window.uiErrors.push(&quot;LOG: late answer&quot;))&lt;/script&gt;"/></mvc:View>`;
    const clean = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Text text="clean"/></mvc:View>';
    try {
      for (const [label, settleTimeout, own] of [['settled', undefined, true], ['past the bound', 100, false]]) {
        const renderer = await openRenderer({ pages: 1, ...(settleTimeout ? { settleTimeout } : {}) });
        try {
          const first = await renderer.render({ xml: late });
          // clean documents on the same page for longer than the answer takes
          const after = [];
          const t = Date.now();
          while (Date.now() - t < 1200) after.push(...(await renderer.render({ xml: clean })));
          assert(!after.length, `${label}: no later document is charged with it (${after.join(' | ') || 'clean'})`);
          assert(first.includes('LOG: late answer') === own,
            `${label}: ${own ? 'the document that sent the request gets its answer' : 'the page is reloaded and the answer dropped'} (${first.join(' | ') || 'none'})`);
        } finally {
          await renderer.close();
        }
      }
    } finally {
      server.close();
    }
  });
}
