/*
 * The 2026-10-01 round: a faster property gate, new rules read out of the
 * framework's own closed sets and the UI5 sources, and fixes for rules that
 * had none. See test/review/README.md for the harness.
 *
 *   1. checkFiles( { jobs } ) spreads the property gate over worker threads;
 *      the results have to be the sequential run's, in the sequential order.
 *   2. unknown-message-box-type: a box type outside the server's ct_box_type
 *      opens as a plain show( ) box; the message-type letters have a fix.
 *   3. bind-path-as-value: _bind_path( ) / _bind( path = abap_true ) as an
 *      attribute's whole value is the TEXT of the path.
 *   4. html-content-not-markup: core:HTML content jQuery reads as a selector.
 *   5. raw-javascript-to-frontend's two new view shapes: an inline on…=
 *      handler in markup and a javascript: URL in a URI property.
 *   6. navigation-lost-on-rebuild: the navigation twin of
 *      control-state-lost-on-rebuild (abap2UI5's backlog item
 *      navcontainer-position-not-reissued, measured on samples-controls).
 *   7. new fixes: abapdoc-html-tag, control-call-arg-kind, duplicate-property.
 */
import { applyFixes } from '../../lib/fix.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/* An app class whose view is one chain; `chain` goes inside the Page,
 * `main` after the display, `defs`/`methods` extend the class. */
const app = ({ chain = '', main = '', defs = '', methods = '' } = {}) =>
  'CLASS zcl_review_1001 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n' + defs
  + 'ENDCLASS.\n\nCLASS zcl_review_1001 IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n'
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc` )->a( n = `xmlns:core` v = `sap.ui.core`\n'
  + '        )->ele( `Page`\n'
  + '          )->tag( `Text` )->a( n = `text` v = client->_bind( mv_text )\n'
  + chain
  + '        )->end( ).\n'
  + '    client->view_display( view->stringify( ) ).\n' + main + '  ENDMETHOD.\n' + methods + 'ENDCLASS.\n';

export default async function ({ section, assert, checkFiles, checkAbapSource, checkXmlSource }) {
  const opts = { render: false, minUi5: '1.120' };
  const of = (src, type) => checkAbapSource(src, opts).findings.filter((x) => x.type === type);
  const fixed = (src, type) => applyFixes(src, of(src, type)).output;

  section('round 2026-10-01: a pooled property gate returns the sequential results, in file order', async () => {
    // enough files for the pool to start threads (one per 64): the fixtures, twice over
    const own = fs.readdirSync(FIXTURES).filter((f) => /\.(clas\.abap|view\.xml|fragment\.xml)$/.test(f)).map((f) => path.join(FIXTURES, f));
    const files = [...own, ...own].slice(0, 140);
    assert(files.length >= 128, `enough files for two threads (${files.length})`);
    const opts = { render: false, minUi5: '1.71' };
    const strip = (rs) => JSON.stringify(rs);
    const one = await checkFiles(files, { ...opts, jobs: 1 });
    const pooled = await checkFiles(files, { ...opts, jobs: 3 });
    assert(pooled.length === one.length && pooled.every((r, i) => r.file === files[i]), 'one result per file, in the order the files were given');
    assert(strip(pooled) === strip(one), 'and every result is the sequential one, byte for byte');
    // options a thread cannot receive keep the run in this thread rather than failing it
    const odd = await checkFiles(files.slice(0, 130), { ...opts, jobs: 3, rules: { 'unknown-control': { severity: 'warning' } }, extra: () => 1 });
    assert(odd.length === 130, 'a function among the options runs sequentially instead of throwing');
  });

  section('round 2026-10-01: unknown-message-box-type - a type the server does not know, and the letter fix', () => {
    const src = app({ main: '    client->message_box_display( text = `x` type = `E` ).\n'
      + '    client->message_box_display( text = `y` type = `fatal` ).\n'
      + '    client->message_box_display( text = `z` type = `Warning` ).\n'
      + '    client->message_box_display( text = `w` type = lv_type ).\n' });
    const hits = of(src, 'unknown-message-box-type');
    assert(hits.length === 2 && hits.every((h) => h.severity === 'warning'), `two warnings - letter case is free, a variable is not judged (${hits.length})`);
    assert(hits[0].value === 'E' && hits[0].fixes?.length === 1 && hits[1].value === 'fatal' && !hits[1].fixes, 'the letter carries a fix, the word does not');
    const out = fixed(src, 'unknown-message-box-type');
    assert(out.includes('type = `error` )') && of(out, 'unknown-message-box-type').length === 1, '--fix writes the box type; the word stays reported');
  });

  section('round 2026-10-01: bind-path-as-value - a bare path as the whole value, and the fix to a binding', () => {
    const src = app({ chain: '          )->tag( `Text` )->a( n = `text` v = client->_bind_path( mv_text )\n'
      + '          )->tag( `Input` )->a( n = `value` v = client->_bind( val = mv_text path = abap_true )\n'
      + '          )->tag( `Text` )->a( n = `text` t = client->_bind_path( mv_text )\n'
      + '          )->tag( `Text` )->a( n = `text` v = |\\{= $\\{{ client->_bind_path( mv_text ) }\\} \\}|\n' });
    const hits = of(src, 'bind-path-as-value');
    assert(hits.length === 2 && hits.every((h) => h.severity === 'error' && h.value === '/MV_TEXT'), `the two whole-value writes, as errors (${hits.length})`);
    const out = fixed(src, 'bind-path-as-value');
    assert(out.includes('v = client->_bind( mv_text )') && out.includes('v = client->_bind( val = mv_text )'), '--fix: _bind_path -> _bind, and the path argument deleted');
    assert(of(out, 'bind-path-as-value').length === 0 && out.includes('t = client->_bind_path( mv_text )'), 'and the text parameter and the template are left alone');
  });

  section('round 2026-10-01: html-content-not-markup - text where sap.ui.core.HTML wants a tag', () => {
    const src = app({ chain: '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = `Welcome back`\n'
      + '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = `  <div>fine</div>`\n'
      + '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = `Total: <b>3</b>`\n'
      + '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = client->_bind( mv_text )\n' });
    const hits = of(src, 'html-content-not-markup');
    assert(hits.length === 2 && hits.every((h) => h.severity === 'error'), `plain text and text-led markup, not a tag-led value or a binding (${hits.length})`);
    assert(hits[0].fixes?.length === 1 && !hits[1].fixes, 'only plain text has the fix');
    assert(fixed(src, 'html-content-not-markup').includes('v = `<span>Welcome back</span>`'), '--fix wraps it in a span');
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc" xmlns:core="sap.ui.core"><Page><core:HTML content="Welcome back"/></Page></mvc:View>\n';
    const x = checkXmlSource(xml, opts).findings.filter((f) => f.type === 'html-content-not-markup');
    assert(x.length === 1 && applyFixes(xml, x).output.includes('content="&lt;span&gt;Welcome back&lt;/span&gt;"'), 'in a raw view the fix writes the entities');
  });

  section('round 2026-10-01: raw-javascript-to-frontend - an inline handler in markup and a javascript: URL', () => {
    const src = app({ chain: '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<div onclick="go()">x</div>`\n'
      + '          )->tag( n = `HTML` ns = `core` )->a( n = `content` v = `<p>prose about onclick= handlers</p>`\n'
      + '          )->tag( `Link` )->a( n = `text` v = `go` )->a( n = `href` v = `javascript:void(0)`\n'
      + '          )->tag( `Link` )->a( n = `text` v = `ok` )->a( n = `href` v = `https://abap2ui5.org`\n' });
    const hits = of(src, 'raw-javascript-to-frontend');
    assert(hits.length === 2 && hits.map((h) => h.value).join() === 'inline handler,javascript: URL', `the handler and the URL, not the prose (${hits.map((h) => h.value)})`);
    const xml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Page><Link text="x" href="javascript:void(0)"/></Page></mvc:View>\n';
    assert(!checkXmlSource(xml, opts).findings.some((f) => f.type === 'raw-javascript-to-frontend'), 'a raw view is out of scope, as for the other view shapes');
  });

  section('round 2026-10-01: navigation-lost-on-rebuild - a bound field names the page a handler navigated to', () => {
    const view = '          )->ele( `NavContainer` )->a( n = `id` v = `nav` )->a( n = `initialPage` v = `p1`\n'
      + '            )->tag( `Page` )->a( n = `id` v = `p1`\n'
      + '            )->tag( `Page` )->a( n = `id` v = `p2`\n'
      + '          )->end(\n'
      + '          )->tag( `Select` )->a( n = `selectedKey` v = client->_bind( mv_page )\n';
    const wire = (target) => `    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( \`nav\` ) ( \`to\` ) ( ${target} ) ) ).\n`;
    const cls = (handler, { display = '', decl = '    DATA mv_page TYPE string.\n' } = {}) => app({
      chain: view, main: display, defs: decl + '    METHODS on_event.\n',
      methods: '  METHOD on_event.\n' + handler + '  ENDMETHOD.\n',
    });
    const NAV = 'navigation-lost-on-rebuild';
    const direct = of(cls('    mv_page = client->get_event_arg( ).\n' + wire('mv_page')), NAV);
    assert(direct.length === 1 && direct[0].severity === 'hint' && direct[0].field === 'mv_page' && direct[0].value === 'nav', `(a) the call navigates to the bound field (${direct.length})`);
    assert(of(cls('    DATA(key) = client->get_event_arg( ).\n    mv_page = key.\n' + wire('key')), NAV).length === 1, '(b) the handler copies its target into the field');
    assert(of(cls(wire('`p2`'), { decl: '    DATA mv_page TYPE string VALUE `p2`.\n' }), NAV).length === 1, '(c) the field holds one of the container\'s page ids');
    assert(of(cls(wire('client->get_event_arg( )')), NAV).length === 0, 'a non-literal target alone is not a field naming a page (apps 096, 242)');
    assert(of(cls(wire('`p2`'), { decl: '    DATA mv_page TYPE string VALUE `slide`.\n' }), NAV).length === 0, 'a field holding no page id is not one');
    assert(of(cls('    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( `nav` ) ( `back` ) ) ).\n    mv_page = `p1`.\n'), NAV).length === 0, 'a stack-relative call is not judged');
    const remedied = cls('    DATA(key) = client->get_event_arg( ).\n    mv_page = key.\n' + wire('key'), { display: '    IF mv_page IS NOT INITIAL.\n  ' + wire('mv_page') + '    ENDIF.\n' });
    assert(of(remedied, NAV).length === 0, 'a display-path navigation of the same container silences it, whatever its argument (app 585)');
    const noSnapshot = checkAbapSource(cls('    mv_page = client->get_event_arg( ).\n' + wire('mv_page')), { ...opts, properties: false }).findings;
    assert(noSnapshot.some((f) => f.type === NAV), 'it needs no metadata: still judged with the property gate off');
  });

  section('round 2026-10-01: the new fixes - abapdoc-html-tag, control-call-arg-kind, duplicate-property', () => {
    const doc = app({ defs: '    "! Returns the <name> of <em>the</em> row\n    METHODS x.\n', methods: '  METHOD x.\n  ENDMETHOD.\n' });
    const tag = of(doc, 'abapdoc-html-tag');
    assert(tag.length === 1 && tag[0].fixes?.length === 2, `one finding, two bracket edits (${tag.length})`);
    assert(fixed(doc, 'abapdoc-html-tag').includes('"! Returns the &lt;name&gt; of <em>the</em> row'), 'the tag is escaped, the ABAP Doc markup is not');

    const call = (v) => `    client->follow_up_action( val = client->cs_event-control_by_id t_arg = VALUE #( ( \`p\` ) ( \`setExpanded\` ) ( \`${v}\` ) ) ).\n`;
    const kinds = app({ chain: '          )->tag( `Panel` )->a( n = `id` v = `p`\n', main: call('abap_true') + call('TRUE') + call('FALSE') + call('1') });
    const k = of(kinds, 'control-call-arg-kind');
    assert(k.length === 4 && k.filter((h) => h.fixes).length === 3, `four findings, three with a fix (${k.length}, ${k.filter((h) => h.fixes).length})`);
    const kOut = fixed(kinds, 'control-call-arg-kind');
    assert(kOut.includes('( `X` )') && kOut.includes('( `true` )') && kOut.includes('( `false` )') && kOut.includes('( `1` )'), 'abap_true -> X, TRUE -> true, FALSE -> false, and 1 stays');

    const dup = app({ chain: '          )->tag( `Button` )->a( n = `text` v = `A`\n            )->a( n = `text`  v = `A`\n            )->a( n = `icon` v = `sap-icon://add`\n            )->a( n = `icon` v = `sap-icon://edit`\n' });
    const d = of(dup, 'duplicate-property');
    assert(d.length === 2 && d[0].fixes?.length === 1 && !d[1].fixes, `the repeat has a fix, the conflict does not (${d.length})`);
    const dOut = fixed(dup, 'duplicate-property');
    assert(dOut.includes('->a( n = `text` v = `A`\n            )->a( n = `icon` v = `sap-icon://add`') && of(dOut, 'duplicate-property').length === 1, 'the second write is deleted and the chain still closes');
  });
}
