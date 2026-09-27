/*
 * obsolete-custom-control - the eight abap2UI5 companion controls marked
 * `// OBSOLETE: replaced by …` in app/webapp/cc/*.js (Timer, Focus,
 * Scrolling, Title, LPTitle, Favicon, Info, History), in the three spellings
 * a class or a view can carry them: the builder tag, an XML view with any
 * prefix bound to z2ui5.cc, and the frozen builder's `_z2ui5( )->timer( )`
 * helpers. Fixtures: test/fixtures/obsoletecc.clas.abap (builder, three
 * prefixes, the silent neighbours), obsoletecclegacy.clas.abap (the frozen
 * builder), obsoletecc.view.xml (a custom `cc` prefix). The list itself is
 * the `obsolete` block of lib/cc-controls.mjs, gated by check-upstream; its
 * parsers are pinned here. See test/review/README.md for the harness.
 */
import fs from 'fs';
import path from 'path';
import { CC_CONTROLS, OBSOLETE_CC_CONTROLS, OBSOLETE_CC_HELPERS, ccMirrorScript } from '../../lib/cc-controls.mjs';
import { parseObsoleteHeader, replacementNames, parseCcHelpers } from '../../scripts/check-upstream.mjs';

const RULE = 'obsolete-custom-control';

/* A view class naming ONE companion control under a prefix bound to `uri`. */
const viewWith = (name, { prefix = 'z2ui5', uri = 'z2ui5.cc' } = {}) => `CLASS zcl_cc_one DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
ENDCLASS.

CLASS zcl_cc_one IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`         v = \`sap.m\`
        )->a( n = \`xmlns:mvc\`     v = \`sap.ui.core.mvc\`
        )->a( n = \`xmlns:${prefix}\` v = \`${uri}\`
        )->ele( \`Page\`
            )->tag( n = \`${name}\` ns = \`${prefix}\`
        )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
`;

export default async function ({ section, assert, f, tempDir, checkAbapSource, checkXmlSource, checkFiles }) {
  const opts = { render: false, properties: true };
  const of = (findings) => findings.filter((x) => x.type === RULE);
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

  section('obsolete-custom-control: the builder tag, under z2ui5, in the name form and under a custom prefix', () => {
    const src = fs.readFileSync(f('obsoletecc.clas.abap'), 'utf8');
    const r = checkAbapSource(src, opts);
    const hits = of(r.findings);
    assert(hits.map((x) => x.value).join() === 'Timer,Focus,History',
      `the three obsolete tags and nothing else (got ${hits.map((x) => x.value).join() || 'none'})`);
    assert(hits.every((x) => x.severity === 'error'), 'an error: obsolete controls must never be used');
    assert(hits[0].line === lineOf(src, 'n = `Timer`') && hits[1].line === lineOf(src, '`z2ui5:Focus`')
      && hits[2].line === lineOf(src, 'n = `History` ns = `cc`'), 'each on its own tag');
    assert(hits[0].control === 'z2ui5.cc.Timer' && /cs_event-start_timer/.test(hits[0].message)
      && /follow_up_action/.test(hits[0].message), `the message names the replacement (${hits[0].message})`);
    assert(/cs_event-set_focus/.test(hits[1].message) && /hash_set\( \)/.test(hits[2].message)
      && /app_state_set_active\( \)/.test(hits[2].message), 'each control names its own replacement');
    assert(!hits.some((x) => x.fixes?.length), 'no fix: the replacement moves the job from the view into the class');
    assert(r.findings.length === hits.length,
      `Storage, MessageManager, the sap.m Title, the core Title and the in-house app:History stay silent (got ${r.findings.map((x) => `${x.type}@${x.line}`).join(', ')})`);
  });

  section('obsolete-custom-control: an XML view with the namespace under a prefix of its own', () => {
    const xml = fs.readFileSync(f('obsoletecc.view.xml'), 'utf8');
    const r = checkXmlSource(xml, opts);
    const hits = of(r.findings);
    assert(hits.map((x) => x.value).join() === 'Scrolling,Favicon',
      `<cc:Scrolling> and <cc:Favicon> with xmlns:cc="z2ui5.cc" (got ${hits.map((x) => x.value).join() || 'none'})`);
    assert(hits[0].line === lineOf(xml, '<cc:Scrolling') && hits[1].line === lineOf(xml, '<cc:Favicon'), 'on their tags');
    assert(/cs_event-scroll_to/.test(hits[0].message) && /cs_event-scroll_into_view/.test(hits[0].message)
      && /cs_event-set_favicon/.test(hits[1].message), 'with their replacements');
    assert(r.findings.length === hits.length,
      `Geolocation, Dirty, sap.m Title, core:Title, app:Title and app:History stay silent (got ${r.findings.map((x) => `${x.type}@${x.line}`).join(', ')})`);
  });

  section('obsolete-custom-control: the frozen builder\'s helpers, beside frozen-view-builder', () => {
    const src = fs.readFileSync(f('obsoletecclegacy.clas.abap'), 'utf8');
    const r = checkAbapSource(src, opts);
    assert(r.frozenBuilder === 'z2ui5_cl_xml_view' && r.findings.some((x) => x.type === 'frozen-view-builder'),
      'still judged as a frozen-builder class');
    const hits = of(r.findings);
    assert(hits.map((x) => `${x.member}>${x.value}`).join() === 'timer>Timer,lp_title>LPTitle,info_frontend>Info',
      `_z2ui5( )->timer( ), ->lp_title( ) and a handle captured from _z2ui5( ) (got ${hits.map((x) => `${x.member}>${x.value}`).join() || 'none'})`);
    assert(hits[0].line === lineOf(src, '->timer(') && hits[2].line === lineOf(src, 'cc->info_frontend'), 'on the helper call');
    assert(/_z2ui5\( \)->timer\( \) writes z2ui5\.cc\.Timer/.test(hits[0].message) && /cs_event-start_timer/.test(hits[0].message),
      `the message names the helper, the control and the replacement (${hits[0].message})`);
    assert(/s_device/.test(hits[2].message) && /s_ui5/.test(hits[2].message), 'Info points at client->get( )-s_device / -s_ui5');
    assert(r.ruleHits[RULE] === 3 && r.ruleHits['frozen-view-builder'] === 1, 'the run summary counts both rules');
    assert(r.findings.length === 4,
      `storage( ), message_manager( ), the view's own title( ) and the names in a comment and a string stay silent (got ${r.findings.map((x) => `${x.type}@${x.line}`).join(', ')})`);
  });

  section('obsolete-custom-control: every obsolete control is reported, every live companion control is not', () => {
    for (const name of Object.keys(CC_CONTROLS)) {
      const hits = of(checkAbapSource(viewWith(name), opts).findings);
      if (OBSOLETE_CC_CONTROLS[name]) {
        assert(hits.length === 1 && hits[0].control === `z2ui5.cc.${name}`, `${name} is obsolete and reported`);
      } else {
        assert(hits.length === 0, `${name} is a live companion control and not reported`);
      }
    }
    // the prefix is nothing, the namespace it is bound to is everything
    assert(of(checkAbapSource(viewWith('Title', { uri: 'sap.m' }), opts).findings).length === 0,
      'a prefix named z2ui5 bound to sap.m is sap.m.Title');
    assert(of(checkAbapSource(viewWith('Timer', { prefix: 'legacy' }), opts).findings).length === 1,
      'any prefix bound to z2ui5.cc');
    assert(of(checkAbapSource(viewWith('History', { prefix: 'app', uri: 'zmy.app.controls' }), opts).findings).length === 0,
      'a History in an in-house library is not abap2UI5\'s');
    // a directive and the rules block address it like any other id
    assert(of(checkAbapSource(viewWith('Timer'), { ...opts, rules: { [RULE]: false } }).findings).length === 0,
      'switched off in the rules block');
    assert(of(checkAbapSource(viewWith('Timer'), { ...opts, rules: { [RULE]: 'warning' } }).findings)[0]?.severity === 'warning',
      'its severity can be lowered like any rule\'s');
  });

  section('obsolete-custom-control: the list, its replacements and its helpers', () => {
    assert(Object.keys(OBSOLETE_CC_CONTROLS).sort().join() === 'Favicon,Focus,History,Info,LPTitle,Scrolling,Timer,Title',
      'the eight controls abap2UI5 marks OBSOLETE');
    assert(Object.entries(OBSOLETE_CC_HELPERS).map(([h, n]) => `${h}>${n}`).sort().join()
      === 'favicon>Favicon,focus>Focus,history>History,info_frontend>Info,lp_title>LPTitle,scrolling>Scrolling,timer>Timer,title>Title',
      'the frozen builder helper per control, as z2ui5_cl_xml_view_cc names them');
    /* every cs_event constant a replacement names is one the client interface
     * releases - the fixture is the mirrored cs_event block */
    const csEvent = fs.readFileSync(f('cs_event.intf.abap'), 'utf8').toLowerCase();
    for (const [name, o] of Object.entries(OBSOLETE_CC_CONTROLS)) {
      for (const [, constant] of o.replacement.matchAll(/cs_event-(\w+)/g)) {
        assert(new RegExp(`\\b${constant}\\s+type\\b`).test(csEvent), `${name}: cs_event-${constant} is a released constant`);
      }
    }
    // the render gate CREATES a view naming one - obsolete is not broken
    const script = ccMirrorScript();
    assert(Object.keys(OBSOLETE_CC_CONTROLS).every((n) => script.includes(`'z2ui5/cc/${n}'`)),
      'the harness boots a mirror of every obsolete control');
  });

  section('obsolete-custom-control: check-upstream reads the headers and the helper class', () => {
    const timer = `sap.ui.define(["sap/ui/core/Control"], (Control) => {
  "use strict";

  // OBSOLETE: replaced by the frontend event cs_event-start_timer - kept for backward compatibility.
  return Control.extend("z2ui5.cc.Timer", {});
});`;
    const header = parseObsoleteHeader(timer);
    assert(header === 'replaced by the frontend event cs_event-start_timer - kept for backward compatibility.',
      `the header text after the colon (got ${header})`);
    assert(parseObsoleteHeader('// Invisible control that reads the browser storage\nreturn Control.extend("z2ui5.cc.Storage", {});') === null,
      'a live control has no header');
    assert(replacementNames(header).join() === 'cs_event,start_timer', `the API names a header points at (got ${replacementNames(header).join()})`);
    assert(replacementNames('replaced by client.get().s_device / s_ui5 - kept').join() === 's_device,s_ui5', 'Info\'s two structures');
    assert(replacementNames('handled by the framework now (client->hash_set( ), client->app_state_set_active( ))').join() === 'hash_set,app_state_set_active',
      'History\'s two methods');
    for (const [name, o] of Object.entries(OBSOLETE_CC_CONTROLS)) {
      assert(o.replacement.includes('client->'), `${name}: the replacement is spelled as a call on the client`);
    }
    const helpers = parseCcHelpers(`CLASS z2ui5_cl_xml_view_cc IMPLEMENTATION.
  METHOD timer.
    result = mo_view.
    mo_view->_generic( name   = \`Timer\`
                       ns     = \`z2ui5\`
                       t_prop = VALUE #( ( n = \`delayMS\` v = delayms ) ) ).
  ENDMETHOD.
  METHOD lp_title.
    result = mo_view.
    mo_view->_generic(
        name   = \`LPTitle\`
        ns     = \`z2ui5\` ).
  ENDMETHOD.
  METHOD demo_output.
    mo_view->_generic( ns   = \`html\`
                       name = \`style\` ).
  ENDMETHOD.
ENDCLASS.`);
    assert(JSON.stringify(helpers) === '{"timer":"Timer","lp_title":"LPTitle"}',
      `helper -> control, the z2ui5 namespace only, either argument order and layout (got ${JSON.stringify(helpers)})`);
  });

  section('obsolete-custom-control: the render gate creates the view and leaves the message to the rule', async () => {
    /* It used to be the other way round: no mirror, a module 404, and a
     * render-error that read like a broken view (abap2UI5/samples demo 004). */
    const dir = tempDir('obsolete-cc-');
    const file = path.join(dir, 'zcl_cc_one.clas.abap');
    fs.writeFileSync(file, viewWith('Timer'));
    const [r] = await checkFiles([file], { minUi5: '1.71' });
    assert(r.renderErrors.length === 0, `a view naming z2ui5:Timer creates (${r.renderErrors[0] || ''})`);
    assert(of(r.findings).length === 1 && r.findings.every((x) => x.type === RULE),
      `the rule is the one finding (got ${r.findings.map((x) => x.type).join(', ')})`);
  });
}
