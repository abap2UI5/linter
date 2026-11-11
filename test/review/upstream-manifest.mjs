/*
 * The manifest of the sets the linter mirrors from abap2UI5 - the seam in
 * scripts/check-upstream.mjs (deriveUpstream / readManifest / --manifest /
 * --emit-manifest) and the vendored copy (data/abap2ui5-manifest.json,
 * scripts/sync-manifest.mjs).
 *
 * The first section is the one that matters day to day: the hand-maintained
 * mirrors in lib/ are compared with the vendored manifest HERE, offline, on
 * every run of the suite. That comparison used to exist only against
 * upstream's main, weekly and over the network. See test/review/README.md
 * for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { deriveUpstream, readManifest, MANIFEST_SCHEMA } from '../../scripts/check-upstream.mjs';
import { changedKeys, VENDORED_MANIFEST, MANIFEST_PATH } from '../../scripts/sync-manifest.mjs';

export default function ({ section, assert, FIX, tempDir }) {
  const ROOT = path.join(FIX, '..', '..');
  const run = (script, args) => {
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, encoding: 'utf8' });
    return { out: r.stdout, err: r.stderr, code: r.status };
  };
  const vendored = () => JSON.parse(fs.readFileSync(VENDORED_MANIFEST, 'utf8'));
  const written = (manifest, name = 'manifest') => {
    const file = path.join(tempDir(name), 'linter-manifest.json');
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    return file;
  };

  section('upstream manifest: every mirror in lib/ is in step with the vendored manifest', () => {
    const r = run('check-upstream.mjs', ['--manifest', VENDORED_MANIFEST]);
    const drift = r.out.split('\n').filter((l) => /^DRIFT|^ {2}[-+!?] /.test(l)).slice(0, 8).join(' | ');
    assert(r.code === 0 && /all mirrors in sync/.test(r.out),
      `the mirrors and data/abap2ui5-manifest.json agree - edit one, edit the other (exit ${r.code}${drift ? `: ${drift}` : ''}${r.err ? `: ${r.err.trim()}` : ''})`);
    assert((r.out.match(/^ok /gm) ?? []).length > 60, 'and that is a comparison of every mirrored set, not of a few');
  });

  section('upstream manifest: the vendored copy is a manifest, and names the sets it has to', () => {
    const m = readManifest(fs.readFileSync(VENDORED_MANIFEST, 'utf8'));
    assert(m.schema === MANIFEST_SCHEMA, 'the schema this linter reads');
    for (const key of ['formatters', 'messageBoxTypes', 'clientEvents', 'frontendEvents', 'bindingMethods', 'cssProperties', 'filterOperators', 'urlPolicies']) {
      assert(m[key].length > 0, `${key} is not empty`);
    }
    assert(Object.keys(m.companionControls).length > 10 && Object.values(m.companionControls).every((cc) => Array.isArray(cc.properties) && Array.isArray(cc.events) && cc.base),
      'every companion control has its properties, events and base');
    assert(m.objects['src/02']?.includes('z2ui5_if_client') && Object.keys(m.globalTargets).length > 5, 'the object layout and the global targets are there');
  });

  section('upstream manifest: deriveUpstream is the parsers, as one object', () => {
    const carrier = (js) => js.split('\n').map((l) => `    js = js && \`${l.replace(/`/g, '``')}\` && |\\n|.`).join('\n');
    const up = deriveUpstream({
      formatterSrc: 'return {\n    DateCreateObject(s) {\n      return 1;\n    },\n    other() {\n    },\n};',
      clientIntfSrc: 'CONSTANTS:\n  BEGIN OF cs_event,\n    popup_close TYPE string VALUE `POPUP_CLOSE`,\n  END OF cs_event.',
      // where ct_box_type lives now: the message service, not z2ui5_cl_ui5_frontend
      frontendClassSrc: 'METHOD box_resolve.\n  ct_box_type = VALUE #( ( `show` )\n    ( `alert` ) ).\nENDMETHOD.',
      actionSrc: carrier('const GLOBAL_TARGETS = {\n  POPUP: { methods: { setWithinArea: 1 } },\n};\nconst FILTER_OPERATORS = new Set(["EQ", "BT"]);\nconst handlers = {\n  OPEN_NEW_TAB: evOpen,\n};'),
      ccSrc: { Dirty: 'sap.ui.define(["sap/ui/core/Control"], (Control) => {\n  return Control.extend("z2ui5.cc.Dirty", { metadata: { properties: { isDirty: {} }, events: { change: {} } } });\n});' },
      srcPaths: ['src/02/z2ui5_if_client.intf.abap', 'src/01/02/z2ui5_cl_ui5_handler.clas.abap', 'src/01/02/z2ui5_cl_ui5_handler.clas.testclasses.abap', 'README.md'],
    });
    assert(up.schema === MANIFEST_SCHEMA && up.formatters.join() === 'DateCreateObject,other' && up.clientEvents.join() === 'POPUP_CLOSE', 'formatters and client events');
    assert(up.messageBoxTypes.join() === 'show,alert', `the box types are read out of whichever class holds ct_box_type (${up.messageBoxTypes.join()})`);
    assert(JSON.stringify(up.globalTargets) === '{"POPUP":["setWithinArea"]}' && up.filterOperators.join() === 'EQ,BT' && up.frontendEvents.join() === 'OPEN_NEW_TAB', 'the action sets, out of the embedded carrier');
    assert(JSON.stringify(up.companionControls) === '{"Dirty":{"properties":["isDirty"],"events":["change"],"base":"sap/ui/core/Control","obsolete":null}}', 'a companion control');
    assert(JSON.stringify(up.objects) === '{"src/02":["z2ui5_if_client"],"src/01/02":["z2ui5_cl_ui5_handler"]}' && up.frozenBuilderHelpers === null, 'objects by package; no frozen builder in this tree');
    assert(readManifest(JSON.stringify(up)).formatters.length === 2, 'what it derives is a manifest readManifest accepts');
  });

  section('upstream manifest: a file of another shape is refused before anything is compared', () => {
    const refused = (text, re, what) => {
      let msg = '';
      try { readManifest(text); } catch (e) { msg = e.message; }
      assert(re.test(msg), `${what} (${msg || 'accepted'})`);
    };
    refused('{', /not JSON/, 'not JSON');
    refused('[]', /expected a JSON object/, 'an array');
    refused(JSON.stringify({ ...vendored(), schema: 99 }), /schema 99 - this linter reads schema 1/, 'another schema');
    refused(JSON.stringify({ ...vendored(), formatters: {} }), /'formatters' must be an array/, 'a list that is an object');
    refused(JSON.stringify({ ...vendored(), globalTargets: undefined }), /'globalTargets' must be an object/, 'a missing set');
    const bad = run('check-upstream.mjs', ['--manifest', written({ schema: 1 }, 'bad-manifest')]);
    assert(bad.code === 2 && /cannot read the manifest/.test(bad.err), `through the CLI that is exit 2, not a list of drifts (exit ${bad.code})`);
    const gone = run('check-upstream.mjs', ['--manifest', path.join(tempDir('no-manifest'), 'nope.json')]);
    assert(gone.code === 2 && /cannot read the manifest/.test(gone.err), 'a file that is not there is exit 2');
    const both = run('check-upstream.mjs', ['--manifest', VENDORED_MANIFEST, '--local', '.']);
    assert(both.code === 2 && /cannot be combined with --local/.test(both.err), '--manifest and --local are two answers to one question');
  });

  section('upstream manifest: a set that moved upstream is drift, an emptied one is the generator\'s fault', () => {
    const m = vendored();
    const dropped = m.formatters[0];
    const changed = { ...m, formatters: m.formatters.slice(1), globalTargets: { ...m.globalTargets, NEW_TARGET: ['run'] } };
    const r = run('check-upstream.mjs', ['--manifest', written(changed, 'drift-manifest')]);
    assert(r.code === 1 && r.out.includes(`'${dropped}' is gone upstream`) && r.out.includes("upstream has 'NEW_TARGET'"),
      `both directions are reported, exit 1 (exit ${r.code})`);
    const empty = run('check-upstream.mjs', ['--manifest', written({ ...m, bindingMethods: [] }, 'empty-manifest')]);
    assert(empty.code === 2 && /the manifest carries none - its generator lost the set/.test(empty.err),
      `an empty required set is exit 2 and names the generator, not this script's parser (exit ${empty.code}: ${empty.err.trim().slice(0, 120)})`);
  });

  section('upstream manifest: sync-manifest copies abap2UI5\'s file, and --check says what differs', () => {
    const checkout = tempDir('abap2ui5-checkout');
    const file = path.join(checkout, MANIFEST_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(VENDORED_MANIFEST, file);
    const same = run('sync-manifest.mjs', ['--local', checkout, '--check']);
    assert(same.code === 0 && /is abap2UI5's manifest/.test(same.out), `the same file is in sync (exit ${same.code})`);
    const m = vendored();
    fs.writeFileSync(file, `${JSON.stringify({ ...m, urlPolicies: [...m.urlPolicies, 'NEW_POLICY'] }, null, 2)}\n`);
    const differs = run('sync-manifest.mjs', ['--local', checkout, '--check']);
    assert(differs.code === 1 && /differs from abap2UI5's manifest in: urlPolicies/.test(differs.out), `a changed set is named, exit 1 (${differs.out.trim().split('\n')[0]})`);
    fs.writeFileSync(file, '{"schema":1}');
    const bad = run('sync-manifest.mjs', ['--local', checkout, '--check']);
    assert(bad.code === 2 && /cannot read the manifest/.test(bad.err), 'a file that is no manifest is never copied');
    assert(changedKeys('{"a":1,"b":[1]}', '{"a":1,"b":[2],"c":0}').join() === 'b,c', 'changedKeys names the top-level keys that differ');
    assert(fs.readFileSync(VENDORED_MANIFEST, 'utf8') === `${JSON.stringify(m, null, 2)}\n`, '--check wrote nothing');
  });
}
