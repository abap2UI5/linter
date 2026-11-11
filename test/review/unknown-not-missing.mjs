/*
 * "Unknown" is not "missing" - two rules that answered from what they could
 * not see:
 *
 *   unknown-binding-path   a row component typed by the component of a
 *                          structure the class does not declare
 *                          (`gname TYPE seqg3-gname`) was dropped from the
 *                          row, and every binding to it reported as a field
 *                          the rows do not have
 *   non-released-api       a `z2ui5_t_<n>` the linted repository ships itself
 *                          was reported as the framework's table, from its
 *                          name alone
 *
 * See test/review/README.md for the harness.
 */
import fs from 'fs';
import path from 'path';
import { objectNameOf, ownObjectsOf } from '../../lib/project-index.mjs';

/* A table of `rowFields` bound to a List, its item showing `{<path>}`. */
const listOf = (rowFields, paths, data = 'DATA mt_locks TYPE ty_lock_rows.') => `CLASS zcl_lock DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    TYPES:
      BEGIN OF ty_lock_row,
${rowFields.map((f) => `        ${f},`).join('\n')}
      END OF ty_lock_row,
      ty_lock_rows TYPE STANDARD TABLE OF ty_lock_row WITH EMPTY KEY.
    ${data}
ENDCLASS.

CLASS zcl_lock IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\`     v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\`
            )->ele( \`Table\`
                )->a( n = \`items\` v = client->_bind( mt_locks )
                )->ele( \`columns\`
                    )->ele( \`Column\`
                        )->tag( \`Text\`
                            )->a( n = \`text\` v = \`Lock\`
                    )->end(
                )->end(
                )->ele( \`items\`
                    )->ele( \`ColumnListItem\`
${paths.map((p) => `                        )->tag( \`Text\`\n                            )->a( n = \`text\` v = \`{${p}}\``).join('\n')}
                    )->end(
                )->end(
            )->end(
        )->end(
    )->end( ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
`;

export default async function ({ section, assert, tempDir, checkAbapSource, checkFiles, prepareAbap }) {
  const opts = { render: false, properties: true };
  const paths = (r) => r.findings.filter((x) => x.type === 'unknown-binding-path').map((x) => x.value);

  section('unknown-binding-path: a component typed by a void structure\'s component is a field of the row', () => {
    const src = listOf(['gname TYPE seqg3-gname', 'garg  TYPE seqg3-garg', 'name  TYPE string'], ['GNAME', 'GARG', 'NAME', 'GNAEM']);
    const row = prepareAbap(src).modelShape.MT_LOCKS[0];
    assert(Object.keys(row).join() === 'GNAME,GARG,NAME', `all three components are in the row shape (got ${Object.keys(row).join()})`);
    const got = paths(checkAbapSource(src, opts));
    assert(got.join() === 'GNAEM', `only the name the row does not declare is reported (got ${got.join() || 'none'})`);
  });

  section('unknown-binding-path: a component typed by the class\'s own structure component resolves like its type', () => {
    const src = listOf(['name TYPE string', 'copy TYPE ty_other-name', 'len  TYPE c LENGTH 10', 'neg  TYPE i VALUE -1'], ['COPY', 'LEN', 'NEG', 'NOPE']);
    const got = paths(checkAbapSource(src, opts));
    assert(got.join() === 'NOPE', `the dashed type keeps LENGTH and a negative VALUE readable (got ${got.join() || 'none'})`);
  });

  section('unknown-binding-path: rows of a wholly void type are not judged', () => {
    const src = listOf(['name TYPE string'], ['GNAME', 'ANYTHING'], 'DATA mt_locks TYPE STANDARD TABLE OF seqg3 WITH EMPTY KEY.');
    assert(paths(checkAbapSource(src, opts)).length === 0, 'nothing is known about the fields of seqg3, so nothing is said');
  });

  section('run summary: the paths that could not be judged are counted, and said', async () => {
    const src = listOf(['name TYPE string'], ['NAME'], 'DATA mt_locks TYPE ty_lock_rows.\n    DATA ms_void TYPE seqg3.')
      .replace(")->ele( \`Table\`", ")->tag( \`Text\` )->a( n = \`text\` v = |\\{{ client->_bind_path( ms_void ) }/GNAME\\}|\n            )->ele( \`Table\`");
    const r = checkAbapSource(src, opts);
    assert(r.stats.paths >= 2 && r.stats.pathsOpaque === 1,
      `one path leads into the void structure, the others were judged (paths ${r.stats.paths}, opaque ${r.stats.pathsOpaque})`);
    assert(paths(r).length === 0, 'and it is not reported: unknown is not missing');
    const known = checkAbapSource(listOf(['name TYPE string'], ['NAME']), opts);
    assert(known.stats.paths >= 1 && known.stats.pathsOpaque === 0, 'a class that declares what it binds leaves nothing unjudged');
    const { runStats, formatStylish, summarize } = await import('../../lib/report.mjs');
    const text = (results) => formatStylish(results, summarize(results), { stats: runStats(results), color: false });
    assert(runStats([r, known]).pathsOpaque === 1 && runStats([r, known]).paths === r.stats.paths + known.stats.paths, 'the run adds them up');
    assert(/not judged\s+1 of \d+ binding paths, each into a type the class does not declare/.test(text([{ ...r, file: 'a.clas.abap' }, { ...known, file: 'b.clas.abap' }])),
      'the summary carries the caveat');
    assert(!/not judged/.test(text([{ ...known, file: 'b.clas.abap' }, { ...known, file: 'c.clas.abap' }])), 'and no such line where everything was judged');
  });

  section('project-index: an object is read off its abapGit file name', () => {
    assert(objectNameOf('src/z2ui5_t_26.tabl.xml') === 'z2ui5_t_26', 'a table');
    assert(objectNameOf('src/Z2UI5_CL_X.clas.locals_imp.abap') === 'z2ui5_cl_x', 'a class include, case folded');
    assert(objectNameOf('src/zi_view.ddls.asddls') === 'zi_view', 'a CDS view');
    assert(objectNameOf('src/#ns#cl_thing.clas.abap') === '/ns/cl_thing', 'a namespaced object');
    assert(objectNameOf('src/package.devc.xml') === null && objectNameOf('README.md') === null
      && objectNameOf('src/main.view.xml') === null, 'a package, a document and a raw view are no objects');
  });

  const ADDON = `CLASS zcl_addon DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS save.
ENDCLASS.

CLASS zcl_addon IMPLEMENTATION.
  METHOD save.
    DATA ls_row TYPE z2ui5_t_26.
    MODIFY z2ui5_t_26 FROM @ls_row.
    SELECT SINGLE * FROM z2ui5_t_01 INTO @DATA(ls_draft).
    DATA(lo_util) = NEW z2ui5_cl_ui5_own_helper( ).
  ENDMETHOD.
ENDCLASS.
`;
  const api = (r) => r.findings.filter((x) => x.type === 'non-released-api').map((x) => x.value);

  section('non-released-api: an object the repository defines is its own, whatever its name', () => {
    const before = api(checkAbapSource(ADDON, { ...opts, allClasses: true }));
    assert(before.join() === 'z2ui5_t_26,z2ui5_t_01,z2ui5_cl_ui5_own_helper',
      `from the name alone all three are the framework's (got ${before.join()})`);
    const after = api(checkAbapSource(ADDON, { ...opts, allClasses: true, ownObjects: ['z2ui5_t_26', 'z2ui5_cl_ui5_own_helper'] }));
    assert(after.join() === 'z2ui5_t_01', `with the repository's objects known, only the framework's table is left (got ${after.join()})`);
  });

  section('non-released-api: the CLI path - ownObjectsOf reads tables beside the classes', async () => {
    const dir = tempDir('own-objects');
    fs.mkdirSync(path.join(dir, 'src', '.hidden'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'z2ui5_t_26.tabl.xml'), '<abapGit/>\n');
    fs.writeFileSync(path.join(dir, 'src', '.hidden', 'z2ui5_t_27.tabl.xml'), '<abapGit/>\n');
    fs.writeFileSync(path.join(dir, 'src', 'zcl_addon.clas.abap'), ADDON);
    const own = ownObjectsOf([path.join(dir, 'src')]);
    assert(own.join() === 'z2ui5_t_26,zcl_addon', `the table and the class, not what a dot-directory holds (got ${own.join()})`);
    const [r] = await checkFiles([path.join(dir, 'src', 'zcl_addon.clas.abap')], { ...opts, allClasses: true, ownObjects: own });
    assert(api(r).join() === 'z2ui5_t_01,z2ui5_cl_ui5_own_helper', `checkFiles hands the list to the rule (got ${api(r).join()})`);
  });
}
