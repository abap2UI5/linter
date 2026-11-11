/*
 * project-index — the objects the linted repository DEFINES, by name.
 *
 * A rule that asks "whose is this object" used to answer from the name alone:
 * `z2ui5_t_26` matches the framework's table family, so it was the
 * framework's table - also in the repository whose `src/` holds
 * `z2ui5_t_26.tabl.xml` (the abap2UI5-addons number their tables in that
 * family; admin-cockpit got 23 `non-released-api` warnings on its own nine).
 * A name is evidence about an object only until the object itself is in
 * reach, and for everything under the linted paths it is: abapGit writes one
 * file set per object, named `<object>.<type>[.<part>].<ext>`.
 *
 * So the index is read off FILE NAMES, never off contents - a table has no
 * ABAP source to parse, and a walk that opens nothing costs nothing:
 *
 *   objectNameOf(file)      'src/z2ui5_t_26.tabl.xml' -> 'z2ui5_t_26'
 *   ownObjectsOf(paths)     every object under the paths, lower case, sorted
 *
 * `ignore` is deliberately NOT applied: an ignored tree is not checked, but
 * what it defines is still the repository's own.
 *
 * No finding is emitted here. The one consumer today is `non-released-api`
 * (checkReleasedApi in abap-rules.mjs); the option that carries the list is
 * `ownObjects` (lib/defaults.mjs).
 */
import fs from 'fs';
import path from 'path';

/* abapGit object types are 4 letters (clas, intf, tabl, ddls, …). Requiring
 * the type keeps `package.devc.xml` (no object name) and a stray `notes.xml`
 * out. A namespaced object is written `#ns#name` and named `/ns/name`. */
const OBJECT_FILE = /^([^.]+)\.([a-z0-9]{4})\.(?:[\w.]+\.)?(?:abap|xml|asddls|asdcls|asbdef|json)$/i;

/** The object an abapGit file belongs to, lower case - or null. */
export function objectNameOf(file) {
  const m = OBJECT_FILE.exec(path.basename(String(file)));
  // `main.view.xml` is a raw XML view, not an abapGit object of type VIEW's
  // serialisation this linter would ever be asked about
  if (!m || /^package$/i.test(m[1]) || /^view$/i.test(m[2])) return null;
  return m[1].toLowerCase().replace(/#/g, '/');
}

/** Every object defined under `paths` (files or directories), lower case,
 *  sorted and unique. node_modules and dot-entries are skipped, a directory
 *  cycle is walked once (the same guard collectFiles has). */
export function ownObjectsOf(paths) {
  const names = new Set();
  const seen = new Set();
  const visit = (p) => {
    let st;
    try { st = fs.statSync(p); } catch { return; }
    if (!st.isDirectory()) {
      const name = objectNameOf(p);
      if (name) names.add(name);
      return;
    }
    let real;
    try { real = fs.realpathSync(p); } catch { real = path.resolve(p); }
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of fs.readdirSync(p)) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      visit(path.join(p, e));
    }
  };
  for (const p of paths ?? []) visit(p);
  return [...names].sort();
}
