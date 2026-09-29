#!/usr/bin/env node
/*
 * peer-range — the optional-peer range on @abap2ui5/linter-render, generated
 * rather than hand-extended, plus the tiny semver reader the checks need.
 *
 * The range used to be a UNION that grew a clause per release:
 *
 *   "^0.1.0 || ^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0"
 *
 * `npm version --workspaces` moves both versions and no dependency range, so
 * every release had to append one more `|| ^0.N.0` by hand — and RELEASING.md
 * records that the step was missed for three releases running. An out-of-range
 * OPTIONAL peer is an ERESOLVE *error*, not a warning, so a forgotten clause
 * did not weaken a guarantee, it forbade exactly the pairing both READMEs tell
 * people to install.
 *
 * The bounded form says the same thing in a line nothing has to append to:
 *
 *   ">=0.1.0 <0.6.0"
 *
 * Lower bound: the oldest runtime line still supported, a deliberate
 * compatibility decision (see FLOOR). Upper bound: derived from the workspace
 * version, so a release moves it by running this script instead of by
 * remembering a rule.
 *
 *   npm run sync-peer-range           write the range into package.json
 *   npm run sync-peer-range -- --check  exit 1 if it is stale (npm test does this)
 *   node scripts/peer-range.mjs --satisfies "<range>" "<version>"
 *                                     exit 0 if the range admits the version
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * The oldest linter-render line this linter still works with. The package was
 * renamed from @abap2ui5/render-runtime after 0.7.0, so no older line of it
 * exists under this name; the older lines are the LEGACY range below. The
 * first line published under this name is 0.8.0 - the floor said 0.7.0, a
 * version the registry never had, so the range admitted a release that
 * cannot be installed and read as if one could.
 *
 * Raising it is an install failure for everyone still on that line, so it is
 * justified only by something the linter genuinely cannot work without — never
 * by the range looking untidy. (A missing `less-openui5` is NOT such a reason:
 * a screenshot then comes back unstyled and the gate does not care.)
 */
export const FLOOR = '0.8.0';

/*
 * The name the runtime was published under up to 0.7.0, and the range that
 * name keeps. It is FROZEN, not generated: nothing is published under it any
 * more, so the lines it has are the lines it will ever have - and a project
 * that installed one of them keeps an admissible pairing when it upgrades the
 * linter (lib/render.mjs still looks it up, after the current name).
 *
 * Only 0.7.0 of those lines serves the UI5 release the snapshot is (1.152);
 * 0.1.0-0.6.1 serve 1.151, and a 1.152 member then fails the render gate as
 * "unknown setting". The range is deliberately NOT narrowed to 0.7.0 for
 * that: an out-of-range optional peer is an ERESOLVE, so narrowing would turn
 * a partly wrong render gate into an `npm install` that fails outright for
 * every project still on those lines. The CLI names the version gap on
 * stderr instead (runtimeSnapshotMismatch in lib/render.mjs), with the
 * command that closes it.
 */
export const LEGACY = Object.freeze({ name: '@abap2ui5/render-runtime', range: '>=0.1.0 <0.8.0' });

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v).trim());
  return m ? m.slice(1, 4).map(Number) : null;
};

const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);

/** The first version that is NOT compatible with `v` under npm's caret rule:
 *  below 1.0.0 the MINOR is the compatibility boundary, from 1.0.0 on the
 *  major is. */
export function breakingAfter(v) {
  const [maj, min] = parse(v);
  return maj === 0 ? `0.${min + 1}.0` : `${maj + 1}.0.0`;
}

/** The range this repository should carry, given the runtime it releases with. */
export const expectedRange = (runtimeVersion) => `>=${FLOOR} <${breakingAfter(runtimeVersion)}`;

/**
 * Does `range` admit `version`? A deliberately small reader — enough for the
 * shapes a manifest in this ecosystem legitimately carries, and no more:
 *
 *   ^x.y.z   >=x.y.z   >x.y.z   <=x.y.z   <x.y.z   =x.y.z   x.y.z   x   *
 *
 * joined by spaces (AND) and by `||` (OR). Returns null for anything it cannot
 * read, which every caller treats as "do not claim to know" rather than as
 * false: a range this cannot parse is a range it cannot keep honest. Written
 * here rather than taken from `semver` because this package has no runtime
 * dependencies and is not about to grow one for eleven lines of comparison.
 */
export function satisfies(range, version) {
  const v = parse(version);
  if (!v) return null;
  const alternatives = String(range).split('||');
  let known = false;
  for (const alt of alternatives) {
    const terms = alt.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) continue;
    let all = true;
    let readable = true;
    for (const term of terms) {
      if (term === '*' || term === 'x') continue;
      const m = /^(\^|>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+.*)$/.exec(term);
      if (!m) { readable = false; break; }
      const bound = parse(m[2]);
      if (!bound) { readable = false; break; }
      const op = m[1] || '=';
      const c = cmp(v, bound);
      const ok = op === '^' ? (c >= 0 && cmp(v, parse(breakingAfter(m[2]))) < 0)
        : op === '>=' ? c >= 0
          : op === '>' ? c > 0
            : op === '<=' ? c <= 0
              : op === '<' ? c < 0
                : c === 0;
      if (!ok) { all = false; break; }
    }
    if (!readable) continue;
    known = true;
    if (all) return true;
  }
  return known ? false : null;
}

const PKG = path.join(ROOT, 'package.json');
const RUNTIME_PKG = path.join(ROOT, 'linter-render', 'package.json');

export function currentAndExpected() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const rt = JSON.parse(fs.readFileSync(RUNTIME_PKG, 'utf8'));
  return {
    name: rt.name,
    runtimeVersion: rt.version,
    current: pkg.peerDependencies?.[rt.name],
    expected: expectedRange(rt.version),
    legacyCurrent: pkg.peerDependencies?.[LEGACY.name],
  };
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--satisfies');
  if (at !== -1) {
    const [range, version] = args.slice(at + 1);
    if (!range || !version) {
      console.error('usage: peer-range.mjs --satisfies "<range>" "<version>"');
      process.exit(2);
    }
    const verdict = satisfies(range, version);
    if (verdict === null) {
      console.error(`peer-range: '${range}' is a range shape this reader does not know`);
      process.exit(2);
    }
    console.log(verdict ? `${version} satisfies ${range}` : `${version} does NOT satisfy ${range}`);
    process.exit(verdict ? 0 : 1);
  }

  const { name, runtimeVersion, current, expected, legacyCurrent } = currentAndExpected();
  if (args.includes('--check')) {
    if (current !== expected) {
      console.error(`package.json peerDependencies["${name}"] is stale: '${current}' should be '${expected}'`
        + ` (the workspace releases ${runtimeVersion}) — run: npm run sync-peer-range`);
      process.exit(1);
    }
    if (legacyCurrent !== LEGACY.range) {
      console.error(`package.json peerDependencies["${LEGACY.name}"] is '${legacyCurrent}', the frozen range is '${LEGACY.range}'`
        + ' — run: npm run sync-peer-range');
      process.exit(1);
    }
    console.log(`peerDependencies["${name}"] is '${expected}' — up to date`);
  } else {
    const raw = fs.readFileSync(PKG, 'utf8');
    const pkg = JSON.parse(raw);
    pkg.peerDependencies[name] = expected;
    pkg.peerDependencies[LEGACY.name] = LEGACY.range;
    pkg.peerDependenciesMeta[LEGACY.name] = { optional: true };
    // rewritten through the same 2-space JSON npm itself writes, so a release
    // diff is one line and not a reformat of the whole manifest
    fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`peerDependencies["${name}"] = '${expected}' (was '${current}')`);
  }
}
