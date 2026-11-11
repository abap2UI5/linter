#!/usr/bin/env node
/*
 * sync-manifest — vendor the manifest abap2UI5 writes of the sets this
 * linter mirrors.
 *
 * abap2UI5 generates `.github/shared/linter-manifest.json` from its own
 * sources (its generate-linter-manifest.mjs; the shape is deriveUpstream( )
 * in scripts/check-upstream.mjs). The copy here, data/abap2ui5-manifest.json,
 * is the abap2UI5 state the hand-maintained mirrors in lib/ are in step with:
 * `npm test` runs `check-upstream --manifest` over it, so a mirror edited
 * without the manifest - or the other way round - fails the suite offline,
 * where it used to wait for the weekly network comparison.
 *
 * Updating for an upstream change is therefore one move in two files: refresh
 * the copy with this script, then make the mirrors agree with it (the test
 * names every set that does not).
 *
 *   node scripts/sync-manifest.mjs                  fetch abap2UI5 main from GitHub
 *   node scripts/sync-manifest.mjs --local <dir>    read an abap2UI5 checkout
 *   node scripts/sync-manifest.mjs --check [...]    compare only, write nothing
 *
 * Exit codes: 0 written / in sync, 1 the copy differs (--check), 2 the
 * manifest is unreachable or is not one.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readManifest } from './check-upstream.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = '.github/shared/linter-manifest.json';
export const MANIFEST_URL = `https://raw.githubusercontent.com/abap2UI5/abap2UI5/main/${MANIFEST_PATH}`;
export const VENDORED_MANIFEST = path.join(ROOT, 'data', 'abap2ui5-manifest.json');

/** The top-level keys in which two manifests (text) differ. */
export function changedKeys(a, b) {
  const [x, y] = [JSON.parse(a), JSON.parse(b)];
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const localAt = args.indexOf('--local');
  const local = localAt === -1 ? null : args[localAt + 1];
  if (localAt !== -1 && (!local || local.startsWith('--'))) {
    console.error('sync-manifest: --local needs the path of an abap2UI5 checkout');
    process.exit(2);
  }
  let text;
  try {
    if (local) text = fs.readFileSync(path.join(local, MANIFEST_PATH), 'utf8');
    else {
      const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`${MANIFEST_URL}: HTTP ${res.status}${res.status === 404 ? ' - abap2UI5 main does not publish the manifest (yet)' : ''}`);
      text = await res.text();
    }
    readManifest(text); // a file of another shape is not copied
  } catch (e) {
    console.error(`sync-manifest: cannot read the manifest — ${e.message}`);
    process.exit(2);
  }
  const current = fs.existsSync(VENDORED_MANIFEST) ? fs.readFileSync(VENDORED_MANIFEST, 'utf8') : null;
  const rel = path.relative(ROOT, VENDORED_MANIFEST);
  if (current === text) {
    console.log(`sync-manifest: ${rel} is abap2UI5's manifest`);
    process.exit(0);
  }
  const changed = current === null ? [] : changedKeys(current, text);
  if (check) {
    console.log(`sync-manifest: ${rel} ${current === null ? 'is missing' : `differs from abap2UI5's manifest in: ${changed.join(', ') || 'formatting only'}`}`);
    console.log('  refresh it (npm run sync-manifest), then bring the mirrors in lib/ in step: npm test names each set that is not');
    process.exit(1);
  }
  fs.writeFileSync(VENDORED_MANIFEST, text);
  console.log(`sync-manifest: wrote ${rel}${changed.length ? ` (changed: ${changed.join(', ')})` : ''}`);
  console.log('  now run: node scripts/check-upstream.mjs --manifest data/abap2ui5-manifest.json');
}
