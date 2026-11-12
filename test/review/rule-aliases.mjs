/*
 * Renamed rules keep their old id for one minor line (lib/rule-aliases.mjs):
 * in the config's `rules` block, in a source directive and in a baseline
 * key. The map is empty until a rule is renamed; these sections add an
 * entry for the run and take it out again. Added 2026-11-12.
 */
import fs from 'fs';
import path from 'path';
import { RULE_ALIASES, canonicalRule } from '../../lib/rule-aliases.mjs';
import { loadConfig } from '../../lib/config.mjs';
import { migrateKey } from '../../lib/baseline.mjs';

export default async function ({ section, assert, tempDir, checkAbapSource }) {
  const withAlias = (fn) => {
    RULE_ALIASES['button-typo'] = 'unknown-property';
    try { return fn(); } finally { delete RULE_ALIASES['button-typo']; }
  };

  section('rule aliases: an old id is read as the new one', () => withAlias(() => {
    assert(canonicalRule('button-typo') === 'unknown-property' && canonicalRule('unknown-property') === 'unknown-property', 'canonicalRule maps the old id and leaves the new one');

    const dir = tempDir('a2l-alias-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{ "rules": { "button-typo": "hint" } }');
    assert(loadConfig(cfg).rules?.['unknown-property'] === 'hint', 'the config block takes the old id for the new rule');
    fs.writeFileSync(cfg, '{ "rules": { "button-typo": "hint", "unknown-property": false } }');
    let refused = '';
    try { loadConfig(cfg); } catch (e) { refused = e.message; }
    assert(/old name of 'unknown-property'/.test(refused), `both names in one block is refused (${refused})`);

    const src = 'CLASS zcl_alias DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\n'
      + 'CLASS zcl_alias IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    client->view_display( z2ui5_cl_ui5_view_builder=>factory( )->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m`\n'
      + '        " abap2ui5lint-disable-next-line button-typo\n'
      + '        )->tag( `Button` )->a( n = `typ` v = `x` )->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const types = checkAbapSource(src, { render: false }).findings.map((x) => x.type);
    assert(!types.includes('unknown-property'), 'a directive naming the old id waives the new rule');
    assert(!types.includes('unknown-directive-rule') && !types.includes('unused-directive'), `and is neither unknown nor unused (${types.join()})`);

    assert(migrateKey('src/a.clas.abap|button-typo|sap.m.Button|typ|') === 'src/a.clas.abap|unknown-property|sap.m.Button|typ|', 'a baseline key carrying the old id is the new rule\'s');
  }));

  section('rule aliases: the map holds only renamed ids', async () => {
    const { RULES } = await import('../../lib/findings.mjs');
    const bad = Object.entries(RULE_ALIASES).filter(([old, now]) => RULES.includes(old) || !RULES.includes(now));
    assert(!bad.length, `an old id is no current rule, and the new one is (${bad.map(([o, n]) => `${o}->${n}`).join(', ') || 'none'})`);
  });
}
