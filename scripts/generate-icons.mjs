#!/usr/bin/env node
/*
 * Builds data/icons.json — the SAP icon-font snapshot the icon rules read.
 *
 * Per icon name: the OpenUI5 version its glyph first reached the font in.
 * That is what lets the gate answer, statically:
 *   does this icon name exist at all?          -> unknown-icon
 *   does it exist on the target release?       -> icon-too-new
 *
 * Why this needs its own data file. An unknown `sap-icon://` name is not an
 * error anywhere: IconPool resolves it at render time, finds nothing, and the
 * control renders with no icon. Nothing in abaplint, in ui5lint or in the
 * browser console says a word, so the defect ships and surfaces months later
 * as "not all icons are shown", reported by whoever runs the oldest release.
 * The metadata snapshot (data/properties.json) cannot answer it — an icon is a
 * font glyph, not a control member, so it carries no `@since` in any control's
 * JSDoc. The names live in one generated registry module instead, which is
 * what this script reads.
 *
 * Source: the icon registry of the OpenUI5 npm packages, one per minor release
 * from the floor up to the version this repository pins —
 *   sap/ui/core/IconPool.js        (up to ~1.87, the map is inline there)
 *   sap/ui/core/_IconRegistry.js   (newer releases, after the registry split)
 * Both spell an entry `'name': 0xe0ff,`, so one regex reads either. A name's
 * `since` is the first scanned version that has it; a name already present at
 * the floor is recorded as the floor itself and means "at or before" — the
 * font predates the floor and nothing below it is scanned, which is why the
 * icon-too-new rule stays silent for a target under FLOOR.
 *
 * The font is nearly, but not quite, additive, so `removed` is recorded as
 * well: `binary` (@since 1.104) is spelled `non-binary` from 1.120 on — same
 * codepoint 0xe29d, renamed glyph. A name that leaves the font renders nothing
 * from that release on, which is the same silent failure one release later,
 * and only a scan across versions can see it.
 *
 * Unlike generate-metadata.mjs this reads the REGISTRY, not node_modules: the
 * point is the history across releases, and only one version of a package can
 * be installed at a time. So it needs network, and it is not part of `npm
 * test` — the committed data file is the contract, and test/run.mjs checks its
 * shape rather than regenerating it.
 *
 * Run:  node scripts/generate-icons.mjs
 *       node scripts/generate-icons.mjs --out <file>
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The oldest release abap2UI5 supports, and therefore the oldest one worth
 * scanning: it is also the linter's default target. Everything already in the
 * font at this point is simply "old" — the exact release it arrived in is
 * before the range anything here can target. */
const FLOOR = '1.71';
const PKG = '@openui5/sap.ui.core';
const REGISTRY_FILES = [
  'package/src/sap/ui/core/_IconRegistry.js',
  'package/src/sap/ui/core/IconPool.js',
];

/* `'name': 0xe0ff,` — the one line shape both registry modules use. The
 * codepoint is what distinguishes a real entry from the module's other
 * string-keyed objects, so it is part of the pattern rather than dropped. */
const ENTRY = /['"]([a-zA-Z0-9_.-]+)['"]\s*:\s*0x[0-9a-fA-F]{4}/g;

const outArg = process.argv.indexOf('--out');
const OUT = outArg !== -1 && process.argv[outArg + 1]
  ? path.resolve(process.argv[outArg + 1])
  : path.join(ROOT, 'data', 'icons.json');

/** The version this repository pins — the newest release the scan can reach,
 *  and the one data/properties.json is generated from. Scanning past it would
 *  claim knowledge the rest of the snapshot does not have. */
function pinnedVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const v = pkg.optionalDependencies?.[PKG];
  if (!v) throw new Error(`package.json declares no ${PKG} — nothing to pin the scan to`);
  return v.replace(/^[^\d]*/, '');
}

const minorOf = (v) => v.split('.').slice(0, 2).join('.');

/** The newest patch of every minor from FLOOR up to `pinned`. A patch release
 *  never adds a glyph, so one per minor is the whole history at a 79th of the
 *  downloads. */
async function versionsToScan(pinned) {
  const { stdout } = await run('npm', ['view', PKG, 'versions', '--json'], { maxBuffer: 1 << 28 });
  const [, floorMinor] = FLOOR.split('.').map(Number);
  const [, pinMinor] = pinned.split('.').map(Number);
  const newest = new Map();
  for (const v of JSON.parse(stdout)) {
    const m = /^1\.(\d+)\.(\d+)$/.exec(v);
    if (!m) continue;
    const minor = +m[1];
    if (minor < floorMinor || minor > pinMinor) continue;
    const prev = newest.get(minor);
    if (!prev || +m[2] > +/\.(\d+)$/.exec(prev)[1]) newest.set(minor, v);
  }
  return [...newest.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** The icon names of one release. Packs the tarball into a scratch directory,
 *  unpacks the single registry file and throws the tarball away again — the
 *  full set is ~500 MB of packages for ~20 KB of data. */
async function iconsOf(version, scratch) {
  const dir = path.join(scratch, version);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await run('npm', ['pack', `${PKG}@${version}`, '--silent'], { cwd: dir, maxBuffer: 1 << 26 });
    const tgz = fs.readdirSync(dir).find((f) => f.endsWith('.tgz'));
    if (!tgz) throw new Error('npm pack produced no tarball');
    for (const file of REGISTRY_FILES) {
      try {
        await run('tar', ['xzf', tgz, file], { cwd: dir });
      } catch {
        continue; // this release keeps the registry in the other module
      }
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      /* Lower-cased on the way in, because that is the only spelling that
       * exists as far as UI5 is concerned: `IconPool.getIconInfo` resolves the
       * URI through URI.parse( ) and reads `parts.hostname`, which is
       * lower-cased. The registry does declare a few names with capitals
       * (`Chart-Tree-Map`, `Netweaver-business-client`) — storing those
       * verbatim would put a key in the data that no `sap-icon://` can ever
       * match, and leave every consumer to remember to fold the case. */
      const names = [...src.matchAll(ENTRY)].map((m) => m[1].toLowerCase());
      if (names.length) return new Set(names);
    }
    throw new Error('no icon registry found in the package');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const pinned = pinnedVersion();
const versions = await versionsToScan(pinned);
if (versions[0] !== undefined && minorOf(versions[0]) !== FLOOR) {
  throw new Error(`the floor ${FLOOR} is not on the registry — got ${versions[0]}`);
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'a2ui5-icons-'));

const since = new Map();
const lastSeen = new Map();
try {
  /* Sequential on purpose: the whole run is one npm pack per minor, and a
   * parallel fan-out over 79 releases is a burst the registry answers with
   * rate limits rather than speed. */
  for (const version of versions) {
    const names = await iconsOf(version, scratch);
    const minor = minorOf(version);
    let added = 0;
    for (const name of names) {
      lastSeen.set(name, minor);
      if (since.has(name)) continue;
      since.set(name, minor);
      added++;
    }
    process.stderr.write(`${version}: ${names.size} icons${added && minor !== FLOOR ? `, ${added} new` : ''}\n`);
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

/* Sorted by name so a regeneration produces a reviewable diff — new glyphs
 * appear next to their neighbours instead of at the end. */
const byName = (entries) => Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
const newest = minorOf(pinned);
const data = {
  floor: FLOOR,
  ui5Version: pinned,
  versions: versions.length,
  icons: byName([...since]),
  removed: byName([...lastSeen].filter(([, v]) => v !== newest)),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);

const post = [...since.values()].filter((v) => v !== FLOOR).length;
process.stderr.write(`\n${OUT}: ${since.size} icons, ${since.size - post} at ${FLOOR}, `
  + `${post} added after it, ${Object.keys(data.removed).length} gone again\n`);
