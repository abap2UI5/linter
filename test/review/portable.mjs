/*
 * portable-app - the opt-in rule that reports everything outside the
 * abap2UI5 protocol's portable profile v1 (lib/portable.mjs), and the
 * vendored copy of the profile it judges against (data/portable-v1.json,
 * scripts/sync-portable-profile.mjs). See test/review/README.md for the
 * harness.
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {
  checkPortable, normalizeProfile, clientApiActionsOf, wireActionsOf,
  expressionViolations, bindingViolations, argumentViolations, bindingSegments,
  PORTABLE_REASONS, PORTABLE_PROFILE_URL,
} from '../../lib/portable.mjs';
import { RULES, OPT_IN, defaultSeverityOf } from '../../lib/findings.mjs';
import { RULE_DOCS } from '../../lib/rule-docs.mjs';

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const ROOT = path.join(FIX, '..', '..');
  const ON = { render: false, rules: { 'portable-app': 'warning' } };
  const portable = (r) => r.findings.filter((x) => x.type === 'portable-app');
  const good = fs.readFileSync(f('portable.clas.abap'), 'utf8');
  const bad = fs.readFileSync(f('portablebad.clas.abap'), 'utf8');
  const xml = fs.readFileSync(f('portable.view.xml'), 'utf8');
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'portable-v1.json'), 'utf8'));
  const profile = normalizeProfile(raw);

  section('portable-app: the vendored profile names the protocol commit it was copied at', () => {
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'portable-v1.source.json'), 'utf8'));
    const bytes = fs.readFileSync(path.join(ROOT, 'data', 'portable-v1.json'));
    assert(record.repository === 'abap2UI5/protocol' && record.path === 'profiles/portable-v1.json',
      `portable profile: vendored from ${record.repository} ${record.path}`);
    assert(/^[0-9a-f]{40}$/.test(record.commit),
      `portable profile: the source commit is recorded (abap2UI5/protocol@${record.commit})`);
    assert(crypto.createHash('sha256').update(bytes).digest('hex') === record.sha256,
      'portable profile: data/portable-v1.json is the verbatim copy the record hashes - refresh it with npm run sync-portable-profile, never by hand');
    assert(raw.profile === 'portable' && raw.version === 1, 'portable profile: it is the portable profile, version 1');
    assert(fs.realpathSync(new URL(PORTABLE_PROFILE_URL)) === fs.realpathSync(path.join(ROOT, 'data', 'portable-v1.json')),
      'portable profile: PORTABLE_PROFILE_URL points at the vendored copy');
    assert(profile.controls.size >= 60 && profile.controls.has('sap.m.Button') && profile.controls.get('sap.m.Button').events.has('press'),
      `portable profile: the controls and their members are read (${profile.controls.size} controls)`);
    assert(profile.clientActions.has('SET_FOCUS') && profile.grammar.functions.has('Math.max') && profile.formatters.size === 3,
      'portable profile: actions, the expression grammar and the formatters are read');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.scripts['sync-portable-profile'] === 'node scripts/sync-portable-profile.mjs' && pkg.files.includes('data/'),
      'portable profile: the refresh script is an npm script and the copy ships with the package');
  });

  section('portable-app: off by default, on through the rules block', () => {
    assert(OPT_IN.has('portable-app') && RULES.includes('portable-app') && RULE_DOCS['portable-app'],
      'portable-app: a registered, documented opt-in rule');
    assert(defaultSeverityOf('portable-app') === 'warning', 'portable-app: a warning once asked for');
    assert(!portable(checkAbapSource(bad, { render: false })).length,
      'portable-app: silent until a config asks for it');
    assert(!portable(checkAbapSource(bad, { render: false, rules: { 'portable-app': false } })).length,
      'portable-app: `false` keeps it off');
    const asError = portable(checkAbapSource(bad, { render: false, rules: { 'portable-app': 'error' } }));
    assert(asError.length > 10 && asError.every((x) => x.severity === 'error'),
      `portable-app: "error" makes every finding an error (${asError.length})`);
    assert(!portable(checkAbapSource(bad, { render: false, file: 'src/legacy/zcl_x.clas.abap', rules: { 'portable-app': { severity: 'error', exclude: ['/legacy/'] } } })).length,
      'portable-app: a path is waived through the rule\'s exclude list');
    assert(!portable(checkXmlSource(xml, { render: false })).length, 'portable-app: a raw view too - silent by default');
  });

  section('portable-app: a portable app reports nothing', () => {
    const r = checkAbapSource(good, ON);
    assert(r.docs.length === 2, `the portable fixture reconstructs its view and its popup (${r.docs.length})`);
    const found = portable(r);
    assert(!found.length, `portable-app: nothing on the portable fixture (${found.map((x) => `${x.line}:${x.reason} ${x.message}`).join('; ') || 'none'})`);
    // ...and nothing else of the run changed by asking for it
    const without = checkAbapSource(good, { render: false }).findings.map((x) => `${x.type}@${x.line}`).join(' ');
    const withIt = r.findings.map((x) => `${x.type}@${x.line}`).join(' ');
    assert(without === withIt, 'portable-app: switching it on adds its own findings and nothing else');
  });

  section('portable-app: one finding per construct, with the reason it misses the profile', () => {
    const found = portable(checkAbapSource(bad, ON));
    const lineOf = (needle) => bad.slice(0, bad.indexOf(needle)).split('\n').length;
    const at = (reason, needle, test = () => true) => found.some((x) => x.reason === reason && x.line === lineOf(needle) && test(x));
    assert(at('control', '`RatingIndicator`', (x) => x.control === 'sap.m.RatingIndicator'), 'control: a sap.m control the profile does not list');
    assert(at('control', '`Avatar` ns', (x) => x.control === 'sap.f.Avatar' && x.namespace === 'sap.f'), 'control: a control of an excluded namespace, naming it');
    assert(at('custom-control', '`Favicon`', (x) => x.control === 'z2ui5.cc.Favicon'), 'custom-control: z2ui5.cc');
    assert(at('member', '`iconFirst`', (x) => x.kind === 'property'), 'member: an unlisted property, named as one from the snapshot');
    assert(at('member', '`app:key`', (x) => x.kind === 'attribute'), 'member: a custom-data attribute');
    assert(at('binding', '{i18n>title}', (x) => /i18n>/.test(x.value)), 'binding: a named model other than device>');
    assert(at('binding', 'odata.type.String', (x) => /odata/.test(x.value)), 'binding: an odata type');
    assert(at('expression', "RegExp('^A')", (x) => /RegExp/.test(x.value)) && at('expression', "RegExp('^A')", (x) => /\.test\(\)/.test(x.value)),
      'expression: RegExp( ) and an unlisted method, one finding each');
    assert(at('event-argument', '$event.oSource', (x) => /\$event/.test(x.value) && x.control === 'sap.m.Input' && x.member === 'submit'),
      'event-argument: $event, with the control and event the wire is on');
    assert(at('event-argument', '$event.oSource', (x) => /selectedItem/.test(x.value)), 'event-argument: a parameter the closed list lacks');
    assert(at('event-argument', '.getKey()', (x) => /method call/.test(x.value)), 'event-argument: a method call on a UI5 object, the one-value arg = form');
    assert(at('event-wire', 'prevent_default_expr = ', (x) => x.control === 'sap.m.Link'), 'event-wire: prevent_default_expr');
    assert(at('frontend-action', 'cs_event-control_by_id', (x) => x.value === 'CONTROL_BY_ID'), 'frontend-action: CONTROL_BY_ID');
    assert(at('frontend-action', 'cs_event-control_global', (x) => x.value === 'CONTROL_GLOBAL ICON_POOL.registerFont'), 'frontend-action: an excluded CONTROL_GLOBAL target');
    assert(at('nested-view', 'nest_view_display', (x) => x.member === 'nest_view_display'), 'nested-view: nest_view_display( ) (decision Q1)');
    assert(at('client-api', 'switch_default_model_path', (x) => x.member === 'view_display'), 'client-api: view_display( switch_default_model_path = … )');
    const reasons = new Set(found.map((x) => x.reason));
    assert(PORTABLE_REASONS.every((r) => reasons.has(r)), `every reason has a fixture (missing: ${PORTABLE_REASONS.filter((r) => !reasons.has(r)).join(', ') || 'none'})`);
    assert(found.every((x) => x.message.includes('portable profile v1') || x.reason === 'nested-view'), 'every message names the profile');
    assert(found.every((x) => x.line > 0 && x.url?.endsWith('#portable-app')), 'every finding is placed and links its card');
    // the controls INSIDE an unknown control are still judged, its own members are not
    assert(!found.some((x) => x.reason === 'member' && x.control === 'sap.m.RatingIndicator'), 'an unknown control is one finding, not one per attribute');
  });

  section('portable-app: a raw view - wires, actions and templating', () => {
    const found = portable(checkXmlSource(xml, ON));
    const lineOf = (needle) => xml.slice(0, xml.indexOf(needle)).split('\n').length;
    const on = (needle) => found.filter((x) => x.line === lineOf(needle)).map((x) => x.reason);
    assert(!on("'___ZZZ_NAL'").length && !on("'SAVE'").length && !on("'SET_FOCUS'").length && !on("'LIVE'").length,
      `the portable wires stay silent (${found.map((x) => `${x.line}:${x.reason}`).join(' ')})`);
    assert(on("'CONTROL_BY_ID'").includes('frontend-action'), '.eF( ) with an excluded action');
    assert(on('.onPress').includes('event-wire'), 'a handler that is not a wire at all');
    assert(on('$event.getSource').includes('event-argument'), '$event in a raw wire');
    assert(on('template:if').includes('control'), 'XML templating is not an aggregation');
    assert(on('encodeURIComponent').includes('expression'), 'the content of the templating element is still judged');
  });

  section('portable-app: the expression grammar is the profile\'s, read as data', () => {
    const ok = [
      '${/QUANTITY} > 500', "!${/FLAG} && ${/A} === 'x'", '${/A} ? 1 : 2', 'Math.min(${/A}, 3) % 2',
      '${/NAME}.toUpperCase().startsWith(\'A\')', '${/LIST}.length >= 1', "${STATUS} !== 'E' || null", '(${/A} + ${/B}) * -1.5',
      "${device>/system/phone} ? 'S' : 'L'", "'{a}' + ${/X}",
    ];
    for (const e of ok) assert(!expressionViolations(e, profile).length, `grammar: ${e} is inside (${expressionViolations(e, profile).join(', ')})`);
    const outside = {
      "RegExp('a').test(${/X})": 'the call RegExp()', 'odata.compare(${/A}, ${/B})': 'the call odata.compare()',
      '[1, 2].length': 'an array or index [ ]', 'typeof ${/A}': 'the name typeof', 'Math.random()': 'the call Math.random()',
      '${/A}.substr(1)': 'the method .substr()', '${/A}.foo': 'the member .foo', '${/A} = 1': 'the operator =',
      '${i18n>key}': 'the named model i18n>', '${device>/nope}': 'the device model path /nope',
    };
    for (const [e, v] of Object.entries(outside)) assert(expressionViolations(e, profile).includes(v), `grammar: ${e} reports ${v} (${expressionViolations(e, profile).join(', ')})`);
    assert(expressionViolations('${/A} &gt; 1 &amp;&amp; ${/B}', profile).length === 0, 'grammar: XML entities are decoded first');
  });

  section('portable-app: binding forms', () => {
    const v = (x) => bindingViolations(x, profile).map((b) => `${b.reason}:${b.value}`);
    assert(bindingSegments('a \\{ b \\} {/X} c {= ${/Y} }').join('|') === '{/X}|{= ${/Y} }', 'segments: escaped braces are text');
    for (const okValue of ['{/MV}', '{TITLE}', '{device>/system/phone}', '{/A} %', '{path:\'/T\', templateShareable:false, sorter:{path:\'X\', descending:true}}',
      "{path:'/D', type:'sap.ui.model.type.Date', formatOptions:{pattern:'yyyy', source:{pattern:'yyyyMMdd'}}}",
      "{path:'/D', formatter:'z2ui5.Formatter.DateCreateObject'}", "{parts:['/A',{path:'/C'}], type:'sap.ui.model.type.Currency'}",
      '.c \\{ color:red \\}', '{0}']) {
      assert(!v(okValue).length, `binding: ${okValue} is inside (${v(okValue).join(', ')})`);
    }
    assert(v('{device>/foo}').includes('binding:the device model path /foo'), 'binding: a device path the profile does not provide');
    assert(v("{path:'/T', filters:[]}").includes('binding:the binding key filters'), 'binding: a key the profile does not list');
    assert(v("{path:'/D', type:'sap.ui.model.type.Float', formatOptions:{roundingMode:'HALF_UP'}}").includes('binding:the format option roundingMode'), 'binding: a format option it does not list');
    assert(v("{path:'/D', formatter:'.myFormatter'}").includes('binding:the formatter .myFormatter'), 'binding: an app formatter');
    assert(v("{parts:['meta>/X'], formatter:'Formatter.DateCreateObject'}").includes('binding:the named model meta>'), 'binding: a named model inside parts');
    assert(v('{= ${/A} }').length === 0 && v('{:= ${/A}.trim() }').length === 0, 'binding: expressions, one-time ones too');
  });

  section('portable-app: event arguments against the closed lists', () => {
    assert(!argumentViolations('${$parameters>/value}', profile, 'sap.m.Input', 'liveChange').length, 'args: a listed parameter');
    assert(argumentViolations('${$parameters>/item}', profile, 'sap.m.Input', 'liveChange').length === 1, 'args: an unlisted one');
    assert(!argumentViolations('${$source>/text}', profile, 'sap.m.Button', 'press').length, 'args: a v1 property of the source control');
    assert(argumentViolations('${$source>/iconFirst}', profile, 'sap.m.Button', 'press').length === 1, 'args: a property the profile does not list');
    assert(!argumentViolations('${$parameters>/whatever}', profile).length, 'args: without the control, the closed lists are not guessed at');
    assert(argumentViolations('$controller.textPath(${$parameters>/item})', profile).length >= 1, 'args: $controller helpers');
    assert(!argumentViolations('{"a":1}', profile).length && !argumentViolations('ROW_1', profile).length && !argumentViolations('${ID}', profile).length,
      'args: JSON, a constant and a row field are portable');
  });

  section('portable-app: decision Q10 - the client-API action names are read from either shape', async () => {
    const globals = { VIEW_SLOTS: ['destroy'], MESSAGE_TOAST: ['show'] };
    const shapes = {
      'pre-Q10 (one mixed list)': { frontendActions: { allowed: ['SET_NAV_ROUTING', 'HASH_BACK'], allowedGlobals: globals } },
      'Q10: clientApi beside wire': { frontendActions: { clientApi: ['SET_NAV_ROUTING'], wire: ['ROUTER', 'HASH_BACK'], allowedGlobals: globals } },
      'Q10: inside an object-valued allowed': { frontendActions: { allowed: { clientApi: ['SET_NAV_ROUTING'], wire: ['ROUTER', 'HASH_BACK'] }, allowedGlobals: globals } },
      'Q10: entries as objects': { frontendActions: { clientApi: [{ name: 'SET_NAV_ROUTING', wire: 'ROUTER sync' }], wireActions: [{ name: 'ROUTER' }, { name: 'HASH_BACK' }], allowedGlobals: globals } },
      'revision 0.3 (protocol 604d267): actions.api / actions.wire.custom': { actions: { api: ['SET_NAV_ROUTING'], wire: { system: { ROUTER: ['sync'] }, custom: ['HASH_BACK'] } }, frontendActions: { allowed: ['SET_NAV_ROUTING'], allowedGlobals: globals } },
    };
    const app = 'CLASS zcl_q10 DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\nCLASS zcl_q10 IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    client->follow_up_action( client->cs_event-set_nav_routing ).\n'
      + '    client->follow_up_action( client->cs_event-popup_close ).\n'
      + '    client->follow_up_action( client->cs_event-set_focus ).\n  ENDMETHOD.\nENDCLASS.\n';
    for (const [name, shape] of Object.entries(shapes)) {
      assert(clientApiActionsOf(shape).includes('SET_NAV_ROUTING'), `Q10 ${name}: the client-API names are found`);
      assert(wireActionsOf(shape).includes('HASH_BACK'), `Q10 ${name}: the wire actions are found`);
      const values = checkPortable({ source: app, abap: true, profile: shape }).map((x) => x.value);
      assert(values.join() === 'SET_FOCUS', `Q10 ${name}: a listed name and an alias of a listed wire pass, an unlisted one is reported (${values.join(', ')})`);
    }
    // a raw view's .eF( ) carries the WIRE name
    const viewXml = '<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc"><Button press=".eF(\'ROUTER\', \'sync\')"/></mvc:View>';
    const { parseXml } = await import('../../lib/properties.mjs');
    const shapeQ10 = { ...shapes['Q10: clientApi beside wire'], controls: { 'sap.m.Button': { events: [{ name: 'press' }] } }, documentRoots: ['sap.ui.core.mvc.View'] };
    assert(!checkPortable({ nodes: [parseXml(viewXml)], source: viewXml, profile: shapeQ10 }).length, 'Q10: a raw .eF( ) naming a wire action passes');
  });

  section('portable-app: the profile can be handed in, and the module is a leaf', async () => {
    const lifted = JSON.parse(JSON.stringify(raw));
    lifted.controls['sap.m.RatingIndicator'] = { properties: [{ name: 'value' }], aggregations: [], events: [] };
    const found = portable(checkAbapSource(bad, { ...ON, portableProfile: lifted }));
    assert(!found.some((x) => x.control === 'sap.m.RatingIndicator'), 'portableProfile: a profile handed in replaces the vendored one');
    const viaExport = await import('@abap2ui5/linter/portable');
    assert(viaExport.checkPortable === checkPortable, 'the module is reachable through the ./portable export');
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'portable.mjs'), 'utf8');
    assert(!/from '\.\/(render|index)\.mjs'|from '(node:)?(fs|http|os|module)'/.test(src),
      'lib/portable.mjs reaches neither the renderer, the entry point nor a Node-only module - a browser bundle can carry it');
    let threw = false;
    try { checkPortable({ nodes: [], source: '' }); } catch { threw = true; }
    assert(threw, 'checkPortable without a profile says so instead of judging against nothing');
  });

  section('portable-app: a class opts out with a directive, which is unjudged while the rule is off', () => {
    const waived = `" abap2ui5lint-disable portable-app -- a UI5-only admin app\n${bad}`;
    assert(!portable(checkAbapSource(waived, ON)).length, 'a disable directive at the top waives the whole class');
    const off = checkAbapSource(waived, { render: false }).findings;
    assert(!off.some((x) => x.type === 'unused-directive' && /portable-app/.test(x.message)),
      'the directive is not unused while the rule is off - it had nothing to suppress');
  });

  section('portable-app: the CLI takes it from abap2ui5lint.jsonc', () => {
    const dir = tempDir('abap2ui5lint-portable-');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.copyFileSync(f('portablebad.clas.abap'), path.join(dir, 'src', 'zcl_portable_bad.clas.abap'));
    fs.copyFileSync(f('portable.clas.abap'), path.join(dir, 'src', 'zcl_portable.clas.abap'));
    const CLI = path.join(ROOT, 'cli.mjs');
    const run = () => {
      try {
        return { out: cp.execFileSync('node', [CLI, 'src', '--no-render', '--format', 'json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } }), code: 0 };
      } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
    };
    const count = (out) => {
      const report = JSON.parse(out);
      const results = Array.isArray(report) ? report : report.results ?? report.files ?? [];
      return results.flatMap((r) => r.findings ?? r.messages ?? []).filter((x) => (x.type ?? x.ruleId) === 'portable-app').length;
    };
    const before = run();
    assert(count(before.out) === 0, 'CLI: no config, no portable-app');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{\n  // keep the app renderable by non-UI5 frontends\n  "rules": { "portable-app": "error" }\n}\n');
    const after = run();
    assert(after.code === 1 && count(after.out) > 10, `CLI: "portable-app": "error" in the config reports and fails the run (exit ${after.code}, ${count(after.out)} findings)`);
  });

  section('portable-app: a broken source does not throw with the rule on', () => {
    let checked = 0;
    for (const src of [good, bad]) {
      for (let i = 1; i < 40; i++) {
        const at = Math.floor((src.length * i) / 40);
        for (const ch of ['(', ')', '`', '{', '}', "'"]) {
          checked++;
          try { checkAbapSource(src.slice(0, at) + ch + src.slice(at), ON); } catch (e) {
            assert(false, `mutant at ${at} (${ch}) threw: ${e.message.slice(0, 100)}`);
          }
        }
      }
    }
    for (let i = 1; i < 30; i++) {
      const at = Math.floor((xml.length * i) / 30);
      checked++;
      try { checkXmlSource(xml.slice(0, at) + '{' + xml.slice(at), ON); } catch (e) { assert(false, `xml mutant threw: ${e.message}`); }
    }
    assert(checked > 400, `enough mutants (${checked})`);
  });
}
