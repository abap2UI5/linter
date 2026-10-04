#!/usr/bin/env node
/*
 * sync-portable-profile — vendor abap2UI5/protocol's portable profile.
 *
 * The `portable-app` rule judges an app against the protocol's portable view
 * profile (profiles/portable-v1.json in abap2UI5/protocol: the controls, members,
 * binding forms, expression grammar, frontend actions and client API a non-UI5
 * frontend renders). That repository is not a dependency here, so the file is
 * COPIED, byte for byte, to data/portable-v1.json, and where it came from is
 * recorded beside it in data/portable-v1.source.json:
 *
 *   { repository, path, commit, sha256 }
 *
 * `commit` is the protocol commit the copy was read at, `sha256` the hash of
 * the copied bytes - npm test recomputes it, so a hand edit of the vendored
 * file fails the suite instead of passing as "the profile".
 *
 *   node scripts/sync-portable-profile.mjs                   fetch protocol main from GitHub
 *   node scripts/sync-portable-profile.mjs --local <dir>     read a protocol checkout (its HEAD;
 *                                                           the file must be committed there)
 *   node scripts/sync-portable-profile.mjs --check [...]     compare only, write nothing
 *
 * Exit codes: 0 written / in sync, 1 drift (--check) or a refused local copy,
 * 2 sources unreachable.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPOSITORY = 'abap2UI5/protocol';
export const PROFILE_PATH = 'profiles/portable-v1.json';
export const VENDORED = path.join(ROOT, 'data', 'portable-v1.json');
export const SOURCE_RECORD = path.join(ROOT, 'data', 'portable-v1.source.json');

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const TIMEOUT_MS = 20000;
async function fetchRetrying(url, init = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return res;
      last = new Error(`${url}: HTTP ${res.status}`);
      if (res.status === 404) break;
    } catch (e) { last = e; }
  }
  throw last;
}

/** The profile as upstream has it: `{ bytes, commit }`. */
async function readUpstream(local) {
  if (local) {
    const git = (...args) => execFileSync('git', ['-C', local, ...args], { encoding: 'utf8' }).trim();
    const commit = git('rev-parse', 'HEAD');
    // a copy of an uncommitted file would record a commit that does not hold it
    try { git('diff', '--quiet', 'HEAD', '--', PROFILE_PATH); } catch {
      const e = new Error(`${PROFILE_PATH} has uncommitted changes in ${local} - commit them first, the record has to name a commit that holds the copied bytes`);
      e.refused = true;
      throw e;
    }
    return { bytes: fs.readFileSync(path.join(local, PROFILE_PATH)), commit };
  }
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'abap2ui5-linter-sync' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const head = await (await fetchRetrying(`https://api.github.com/repos/${REPOSITORY}/commits/main`, { headers })).json();
  const commit = head.sha;
  // the contents API in its raw media type: one host for both reads
  const raw = await fetchRetrying(`https://api.github.com/repos/${REPOSITORY}/contents/${PROFILE_PATH}?ref=${commit}`, {
    headers: { ...headers, accept: 'application/vnd.github.raw' },
  });
  return { bytes: Buffer.from(await raw.arrayBuffer()), commit };
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const localAt = args.indexOf('--local');
  const local = localAt !== -1 ? args[localAt + 1] : null;
  const check = args.includes('--check');
  if (localAt !== -1 && !local) {
    console.error('sync-portable-profile: --local needs the path of an abap2UI5/protocol checkout');
    process.exit(2);
  }
  let upstream;
  try {
    upstream = await readUpstream(local);
  } catch (e) {
    console.error(`sync-portable-profile: ${e.message}`);
    process.exit(e.refused ? 1 : 2);
  }
  try { JSON.parse(upstream.bytes.toString('utf8')); } catch (e) {
    console.error(`sync-portable-profile: upstream ${PROFILE_PATH} is not JSON (${e.message})`);
    process.exit(2);
  }
  const hash = sha256(upstream.bytes);
  const record = fs.existsSync(SOURCE_RECORD) ? JSON.parse(fs.readFileSync(SOURCE_RECORD, 'utf8')) : { commit: '(none)', sha256: null };
  if (check) {
    if (record.sha256 === hash) {
      console.log(`portable profile in sync with ${REPOSITORY}@${upstream.commit.slice(0, 7)} (vendored from ${record.commit.slice(0, 7)})`);
      process.exit(0);
    }
    console.log(`portable profile drifted: ${REPOSITORY}@${upstream.commit.slice(0, 7)} ${PROFILE_PATH} is not the copy vendored from ${record.commit.slice(0, 7)} - run npm run sync-portable-profile and review what portable-app now reports`);
    process.exit(1);
  }
  fs.writeFileSync(VENDORED, upstream.bytes);
  fs.writeFileSync(SOURCE_RECORD, `${JSON.stringify({
    note: `Verbatim copy of ${REPOSITORY} ${PROFILE_PATH}, read at the commit below - the profile the portable-app rule judges against. Refresh with npm run sync-portable-profile (scripts/sync-portable-profile.mjs); never hand-edit data/portable-v1.json, npm test recomputes the hash.`,
    repository: REPOSITORY,
    path: PROFILE_PATH,
    commit: upstream.commit,
    sha256: hash,
  }, null, 2)}\n`);
  console.log(`${record.sha256 === hash ? 'unchanged' : 'updated'}: data/portable-v1.json from ${REPOSITORY}@${upstream.commit.slice(0, 7)}`);
}
