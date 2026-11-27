/*
 * The compiled-theme cache in the shared tmpdir (`privateCacheDir( )` in
 * lib/private-dir.mjs, for lib/render.mjs), reviewed on 2026-11-27. The cache's name carries the
 * uid and is made 0700 - but a name in /tmp can be taken first: another
 * account creates `abap2ui5-theme-css-<your uid>` (or a symlink of that name),
 * `mkdirSync( { recursive } )` accepted it, and every preview read that
 * account's CSS. The directory is checked after it is made; anything not a
 * private directory of this uid is skipped, said once on stderr.
 * See test/review/README.md for the harness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { privateCacheDir } from '../../lib/private-dir.mjs';

export default function ({ section, assert, tempDir }) {
  const posix = typeof process.getuid === 'function';
  const check = (dir, opts = {}) => {
    const said = [];
    const ok = privateCacheDir(dir, { warn: (m) => said.push(m), ...opts });
    return { ok, said };
  };

  section('theme cache: a directory it makes itself is used, and is 0700', () => {
    const dir = path.join(tempDir('theme-cache-'), 'abap2ui5-theme-css-me');
    const { ok, said } = check(dir);
    assert(ok === true, 'a fresh cache is used');
    assert(said.length === 0, `nothing said: ${said.join(' | ')}`);
    if (posix) assert((fs.lstatSync(dir).mode & 0o777) === 0o700, 'made 0700');
    // and again: the one it made before is still its own
    assert(check(dir).ok === true, 'the existing private cache is used');
  });

  section('theme cache: one open to group or others is skipped, and that is said once', () => {
    if (!posix) return;
    const dir = path.join(tempDir('theme-cache-'), 'abap2ui5-theme-css-me');
    fs.mkdirSync(dir);
    fs.chmodSync(dir, 0o777);
    const { ok, said } = check(dir);
    assert(ok === false, 'a world-writable cache is not used');
    assert(said.length === 1 && /mode 777/.test(said[0]) && said[0].includes(dir), `one line naming it: ${said.join(' | ')}`);
    fs.chmodSync(dir, 0o750);
    assert(check(dir).ok === false, 'readable by the group is not private either');
  });

  section('theme cache: one another uid owns is skipped', () => {
    if (!posix) return;
    const dir = path.join(tempDir('theme-cache-'), 'abap2ui5-theme-css-me');
    fs.mkdirSync(dir, { mode: 0o700 });
    const owner = fs.lstatSync(dir).uid;
    const { ok, said } = check(dir, { getuid: () => owner + 1 });
    assert(ok === false, 'a cache of another account is not used');
    assert(said.length === 1 && /belongs to uid/.test(said[0]), said.join(' | '));
  });

  section('theme cache: a symlink or a file under the name is skipped', () => {
    const base = tempDir('theme-cache-');
    const elsewhere = path.join(base, 'theirs');
    fs.mkdirSync(elsewhere, { mode: 0o700 });
    const link = path.join(base, 'abap2ui5-theme-css-link');
    let linked = true;
    try { fs.symlinkSync(elsewhere, link, 'dir'); } catch { linked = false; /* no symlinks here (Windows without the right) */ }
    if (linked) {
      const { ok, said } = check(link);
      assert(ok === false, 'a link to a directory is not the cache');
      assert(said.length === 1 && /not a directory/.test(said[0]), said.join(' | '));
    }
    const file = path.join(base, 'abap2ui5-theme-css-file');
    fs.writeFileSync(file, 'x');
    const { ok, said } = check(file);
    assert(ok === false, 'a file under the name is not the cache');
    assert(said.length === 1, said.join(' | '));
  });

  section('theme cache: without a uid (Windows) only the lstat decides', () => {
    const dir = path.join(tempDir('theme-cache-'), 'abap2ui5-theme-css-me');
    fs.mkdirSync(dir);
    if (posix) fs.chmodSync(dir, 0o777);
    assert(check(dir, { getuid: null }).ok === true, 'mode bits that do not model the ACL are not read');
  });
}
