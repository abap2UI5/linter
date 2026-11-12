/*
 * Named presets as the base of `extends` (lib/presets.mjs). Added 2026-11-12.
 */
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../lib/config.mjs';
import { PRESETS } from '../../lib/presets.mjs';

export default async function ({ section, assert, tempDir }) {
  const load = (text) => {
    const dir = tempDir('a2l-preset-');
    const file = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(file, text);
    try { return loadConfig(file); } catch (e) { return { error: e.message }; }
  };

  section('presets: extends names a preset, the file wins per key', () => {
    const strict = load('{ "extends": "abap2ui5:strict", "rules": { "chain-house-layout": "error" } }');
    assert(strict.failOn === 'hint', `the preset's failOn is the base (${strict.failOn})`);
    assert(strict.rules?.['chain-house-layout'] === 'error' && strict.rules?.['bound-aggregation-over-size-limit'] === 'warning',
      `the rules blocks merge per id, the file winning (${JSON.stringify(strict.rules)})`);
    assert(!('extends' in strict), 'and extends is resolved away');
    assert(load('{ "extends": "abap2ui5:adopt", "failOn": "warning" }').failOn === 'warning', 'a key of the file beats the preset');
    const bad = load('{ "extends": "abap2ui5:strikt" }');
    assert(/no preset \(known: abap2ui5:recommended, abap2ui5:strict, abap2ui5:adopt\)/.test(bad.error ?? ''), `an unknown preset is refused with the list (${bad.error})`);
  });

  section('presets: every preset is a valid config', () => {
    for (const name of Object.keys(PRESETS)) {
      const cfg = load(JSON.stringify({ extends: name }));
      assert(!cfg.error, `${name} loads (${cfg.error ?? 'ok'})`);
    }
  });
}
