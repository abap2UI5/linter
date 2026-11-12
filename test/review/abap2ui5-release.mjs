/*
 * The abap2UI5 release an app runs on (`abap2ui5` in abap2ui5lint.jsonc,
 * --abap2ui5): rule abap2ui5-api-too-new, data/abap2ui5-since.json and its
 * module mirror lib/abap2ui5-since.mjs. Added 2026-11-12.
 */
import fs from 'fs';
import path from 'path';
import { ABAP2UI5_SINCE } from '../../lib/abap2ui5-since.mjs';
import { moduleText } from '../../scripts/generate-abap2ui5-since.mjs';
import { loadConfig } from '../../lib/config.mjs';

export default async function ({ section, assert, FIX, tempDir, checkAbapSource }) {
  const ROOT = path.join(FIX, '..', '..');
  const app = (body) => 'CLASS zcl_rel DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
    + 'CLASS zcl_rel IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n' + body + '\n  ENDMETHOD.\nENDCLASS.\n';
  const hits = (src, abap2ui5) => checkAbapSource(src, { render: false, abap2ui5 }).findings
    .filter((x) => x.type === 'abap2ui5-api-too-new').map((x) => `${x.member}:${x.value}@${x.since}`);

  section('abap2ui5-api-too-new: a client name newer than the configured release', () => {
    const src = app('    client->follow_up_action( client->_event_client( client->cs_event-set_focus ) ).\n'
      + '    IF client->check_on_event( `X` ).\n    ENDIF.\n    DATA(t) = `client->hash_set( )`.');
    assert(hits(src, '1.140.0').join() === 'cs_event:SET_FOCUS@1.142.0,method:check_on_event@1.141.0',
      `both names newer than 1.140.0 are reported, the quoted one is not (${hits(src, '1.140.0').join()})`);
    assert(hits(src, '1.142.0').length === 0, 'on 1.142.0 both exist');
    assert(hits(src, undefined).length === 0, 'without a release nothing is judged');
    const off = checkAbapSource(src, { render: false, abap2ui5: '1.140.0' }).findings.find((x) => x.member === 'method');
    assert(off && off.line === 9 && src.split('\n')[8].slice(off.column - 1).startsWith('check_on_event'), `the finding points at the method name (${off?.line}:${off?.column})`);
  });

  section('abap2ui5-api-too-new: the release is a config key and a flag', () => {
    const dir = tempDir('a2l-rel-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{ "abap2ui5": "1.140.0" }');
    assert(loadConfig(cfg).abap2ui5 === '1.140.0', 'the config carries it');
    fs.writeFileSync(cfg, '{ "abap2ui5": 1.14 }');
    let refused = '';
    try { loadConfig(cfg); } catch (e) { refused = e.message; }
    assert(/'abap2ui5' must be a quoted release/.test(refused), `a number is refused by name (${refused})`);
  });

  section('abap2ui5-since: the module mirrors the data file', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'abap2ui5-since.json'), 'utf8'));
    const text = fs.readFileSync(path.join(ROOT, 'lib', 'abap2ui5-since.mjs'), 'utf8');
    assert(text === moduleText(data), 'lib/abap2ui5-since.mjs is generated from the data file - node scripts/generate-abap2ui5-since.mjs --module');
    assert(ABAP2UI5_SINCE.first && Object.values(ABAP2UI5_SINCE.clientEvents).every((v) => v === "main" || /^\d+\.\d+\.\d+$/.test(v)), "every date is a release, or main");
  });
}
