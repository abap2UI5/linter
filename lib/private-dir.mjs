import fs from 'fs';

/* A cache directory in the shared tmpdir that is this user's own - or not.
 *
 * A name there can be taken before the first run: another account creates
 * `abap2ui5-theme-css-<your uid>` (or a symlink of that name) first,
 * `mkdirSync( { recursive } )` accepts what is there, and every preview reads
 * that account's CSS again. So the directory is checked
 * after it is made, before anything is read from it or written to it: a
 * directory itself (lstat - not a link to one), owned by this process's uid,
 * and closed to group and others. Anything else and the cache is skipped
 * for the run - the theme compiles every time, which costs speed only - and
 * stderr says so once (rule 12: stdout is the report).
 *
 * Where there is no uid (Windows: no getuid, and mode bits that do not model
 * the ACL), the tmpdir is the user's own profile folder, and only the lstat
 * applies. The test (test/review/theme-cache.mjs) hands it a directory and a
 * uid. Not a public export: lib/render.mjs is the one caller. */
export function privateCacheDir(dir, { getuid = process.getuid, warn = (m) => process.stderr.write(`${m}\n`) } = {}) {
  let why = null;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    const uid = typeof getuid === 'function' ? getuid.call(process) : undefined;
    if (!st.isDirectory()) why = 'it is not a directory';
    else if (uid !== undefined && st.uid !== uid) why = `it belongs to uid ${st.uid}, not to this process (${uid})`;
    else if (uid !== undefined && (st.mode & 0o077) !== 0) why = `group or others may write or read it (mode ${(st.mode & 0o777).toString(8)})`;
  } catch (e) {
    why = `it cannot be made (${e.code ?? e.message})`;
  }
  if (why) warn(`abap2ui5lint: the theme cache ${dir} is not used - ${why}; themes compile anew for this run.`);
  return !why;
}
