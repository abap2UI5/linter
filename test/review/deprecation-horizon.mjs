/*
 * The deprecation horizon (`deprecatedAt`, `--deprecated-at`) and native
 * markup in a view. See test/review/README.md for the harness.
 *
 * The target (`ui5`) answers "does this exist on the system" and holds a
 * deprecation only once it is in effect there. The horizon is a second,
 * optional bound for "is this legacy": what took effect after the target and
 * up to the horizon is `deprecated-after-target`, a hint that names the
 * replacement and says whether the target has it yet. Native XHTML/SVG is
 * deprecated in an XML view since 1.120 - `native-html-in-view` once the
 * target is there, `deprecated-after-target` before it.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe } from '../../lib/findings.mjs';
import { loadConfig } from '../../lib/config.mjs';
import { cacheContext } from '../../lib/cache.mjs';

export default function ({ section, assert, f, tempDir, checkXmlSource, checkAbapSource }) {
  const xml = fs.readFileSync(f('horizon.view.xml'), 'utf8');
  const judge = (opts) => checkXmlSource(xml, { render: false, ...opts }).findings;
  const ofType = (found, type) => found.filter((x) => x.type === type);

  section('deprecation horizon: unset, nothing new is reported', () => {
    const found = judge({ minUi5: '1.71' });
    assert(!ofType(found, 'deprecated-after-target').length && !ofType(found, 'native-html-in-view').length,
      `no horizon, a 1.71 target: neither rule fires (${found.map((x) => x.type).join(', ') || 'none'})`);
  });

  section('deprecation horizon: 1.71 target, 1.136 horizon', () => {
    const found = ofType(judge({ minUi5: '1.71', deprecatedAt: '1.136' }), 'deprecated-after-target');
    const by = (kind, control) => found.find((x) => x.kind === kind && x.control === control);
    const page = by('control', 'sap.m.MessagePage');
    assert(page && page.since === '1.112' && page.replacement === 'sap.m.IllustratedMessage'
      && page.replacementSince === '1.98' && page.replacementAvailable === false,
      `MessagePage: deprecated 1.112, its replacement named and newer than the target (${JSON.stringify(page)})`);
    const message = describe(page);
    assert(/keep this until the floor reaches 1\.98/.test(message) && !message.includes('{@link'),
      `the message says to keep it, and reads the link markup as a name (${message})`);
    const input = by('member', 'sap.m.Input');
    assert(input && input.member === 'valueHelpOnly' && input.since === '1.119' && !input.replacement,
      `Input valueHelpOnly: a member, no replacement to name (${JSON.stringify(input)})`);
    const native = found.filter((x) => x.kind === 'native-markup');
    assert(native.length === 2 && native.some((x) => x.control === 'html:div' && x.namespace === 'XHTML')
      && native.some((x) => x.control === 'svg:svg' && x.namespace === 'SVG'),
      `native markup: one finding per island - the div and the svg, not the span (${native.map((x) => x.control).join(', ')})`);
    assert(native.every((x) => x.replacement === 'sap.ui.core.HTML' && x.replacementAvailable === true),
      'native markup: sap.ui.core.HTML is the replacement, and every target has it');
    assert(!found.some((x) => x.control === 'sap.m.ActionSheet'),
      'a deprecation past the horizon (ActionSheet, 1.149) is not reported');
    assert(found.every((x) => x.severity === undefined || x.severity === 'hint'), 'a hint, never more');
    // the target's own rules are untouched by the horizon
    const plain = judge({ minUi5: '1.71' }).map((x) => x.type).sort().join();
    const withHorizon = judge({ minUi5: '1.71', deprecatedAt: '1.136' })
      .filter((x) => x.type !== 'deprecated-after-target').map((x) => x.type).sort().join();
    assert(plain.includes('invalid-property-value') && plain === withHorizon,
      `every other finding is the same with and without the horizon (${plain} | ${withHorizon})`);
  });

  section('deprecation horizon: a deprecation in effect at the target stays with the target rules', () => {
    const found = judge({ minUi5: '1.120', deprecatedAt: '1.136' });
    assert(ofType(found, 'control-deprecated').some((x) => x.control === 'sap.m.MessagePage')
      && ofType(found, 'member-deprecated').some((x) => x.member === 'valueHelpOnly'),
      'a 1.120 target: MessagePage and valueHelpOnly are control-/member-deprecated');
    assert(!ofType(found, 'deprecated-after-target').length,
      `…and nothing is reported twice as after-target (${ofType(found, 'deprecated-after-target').map((x) => x.control).join(', ')})`);
    const native = ofType(found, 'native-html-in-view');
    assert(native.length === 2 && native.every((x) => x.since === '1.120'),
      `a 1.120 target: native markup is native-html-in-view, once per island (${native.map((x) => x.control).join(', ')})`);
    assert(/FUTURE FATAL/.test(describe(native[0])), 'the message names the [FUTURE FATAL] the browser logs');
  });

  section('deprecation horizon: the replacement is available once the target has it', () => {
    const page = ofType(judge({ minUi5: '1.100', deprecatedAt: '1.136' }), 'deprecated-after-target')
      .find((x) => x.control === 'sap.m.MessagePage');
    assert(page && page.replacementAvailable === true && /exists on 1\.100 already/.test(describe(page)),
      `a 1.100 target has IllustratedMessage (1.98): move now (${page && describe(page)})`);
  });

  section('deprecation horizon: equal to the target adds nothing', () => {
    const found = judge({ minUi5: '1.136', deprecatedAt: '1.136' });
    assert(!ofType(found, 'deprecated-after-target').length, 'horizon == target: no after-target finding');
  });

  section('deprecation horizon: a builder class is judged the same way', () => {
    const src = 'CLASS zcl_horizon DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
      + 'CLASS zcl_horizon IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc`\n'
      + '        )->a( n = `xmlns`      v = `sap.m`\n'
      + '        )->a( n = `xmlns:mvc`  v = `sap.ui.core.mvc`\n'
      + '        )->a( n = `xmlns:html` v = `http://www.w3.org/1999/xhtml`\n'
      + '        )->ele( `Page`\n'
      + '            )->tag( `MessagePage`\n'
      + '            )->tag( n = `div` ns = `html` ).\n\n'
      + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';
    const at = (opts) => checkAbapSource(src, { render: false, ...opts }).findings;
    const after = ofType(at({ minUi5: '1.71', deprecatedAt: '1.136' }), 'deprecated-after-target');
    assert(after.some((x) => x.control === 'sap.m.MessagePage') && after.some((x) => x.kind === 'native-markup'),
      `the class: MessagePage and the html:div (${after.map((x) => x.control).join(', ')})`);
    assert(!ofType(at({ minUi5: '1.71' }), 'deprecated-after-target').length, 'the class without a horizon: silent');
    assert(ofType(at({ minUi5: '1.120' }), 'native-html-in-view').length === 1, 'the class on a 1.120 target: native-html-in-view');
  });

  section('deprecation horizon: config and CLI', () => {
    const dir = tempDir('a2l-horizon-');
    const cfg = path.join(dir, 'abap2ui5lint.json');
    fs.writeFileSync(cfg, JSON.stringify({ ui5: '1.71', deprecatedAt: '1.136' }));
    assert(loadConfig(cfg).deprecatedAt === '1.136', 'the config key is read');
    fs.writeFileSync(cfg, '{ "deprecatedAt": 1.136 }');
    let error = '';
    try { loadConfig(cfg); } catch (e) { error = e.message; }
    assert(/deprecatedAt.*quoted/.test(error), `an unquoted number is refused (${error})`);

    const cli = path.resolve(path.dirname(f('horizon.view.xml')), '../../cli.mjs');
    const run = (...args) => cp.spawnSync(process.execPath, [cli, f('horizon.view.xml'), '--no-render', '--no-config', '--format', 'json', '--fail-on', 'never', ...args], { encoding: 'utf8' });
    const ok = run('--ui5', '1.71', '--deprecated-at', '1.136');
    const types = JSON.parse(ok.stdout).results.flatMap((r) => r.findings.map((x) => x.type));
    assert(ok.status === 0 && types.includes('deprecated-after-target'), `--deprecated-at reaches the gate (${ok.status}: ${ok.stderr})`);
    const below = run('--ui5', '1.136', '--deprecated-at', '1.71');
    assert(below.status === 2 && /below the ui5 target/.test(below.stderr),
      `a horizon below the target is refused, not silently ignored (${below.status}: ${below.stderr.trim()})`);
  });

  section('deprecation horizon: part of the cache context', () => {
    const base = { version: '1', snapshot: 's', options: { minUi5: '1.71' } };
    assert(cacheContext(base) !== cacheContext({ ...base, options: { minUi5: '1.71', deprecatedAt: '1.136' } }),
      'a cached result under one horizon is not replayed under another');
  });
}
