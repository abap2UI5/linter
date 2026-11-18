/*
 * A type the class borrows from another class or interface of the run -
 * `s_db TYPE z2ui5_cl_sql_history_api=>ty_s_entry` (abap2UI5-addons/
 * sql-console, linter 0.11.0). The field was given the '' of a scalar, so
 * every path below it - {S_DB/TABNAME}, {S_DB/SQL_COMMAND}, {S_DB/COUNTER} -
 * was "the rows have no such field", on components the other class
 * declares. Now:
 *
 *   - the owner among the sources (the class index, classIndexOf): the type
 *     is copied in, its own types qualified with the owner, and judged
 *   - the owner not among them: the field is there, no path below it is
 *     judged ("unknown" is not "missing")
 *   - an interface (`zif_x=>ty`) is indexed for its types, and the CLI reads
 *     the interfaces under the configured paths for it
 *
 * Fixtures: test/fixtures/borrowed-types/. See test/review/README.md for
 * the harness.
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { classIndexOf, classIndexDeps } from '../../lib/guide-rules.mjs';
import { declaredTypesOf } from '../../lib/reconstruct.mjs';

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkFiles, prepareAbap }) {
  const opts = { render: false, properties: true };
  const dir = (n) => f(`borrowed-types/${n}`);
  const APP = dir('zcl_fx_history_app.clas.abap');
  const API = dir('zcl_fx_history_api.clas.abap');
  const INTF = dir('zif_fx_types.intf.abap');
  const read = (p) => fs.readFileSync(p, 'utf8');
  const paths = (r) => r.findings.filter((x) => x.type === 'unknown-binding-path').map((x) => x.value).sort();

  section('borrowed types: declaredTypesOf reads a class\'s and an interface\'s TYPES', () => {
    const api = declaredTypesOf(read(API));
    assert(api.name === 'zcl_fx_history_api' && api.kind === 'class', 'the class, by name');
    assert(api.structs.get('ty_s_entry').map((x) => x.name).join() === 'uuid,tabname,counter,sql_command,meta', 'its structure');
    assert(api.tables.get('ty_t_entry') === 'ty_s_entry', 'its table type');
    const intf = declaredTypesOf(read(INTF));
    assert(intf.name === 'zif_fx_types' && intf.kind === 'interface' && intf.structs.has('ty_s_tag'), 'an interface, by name');
    assert(declaredTypesOf('CLASS zcl_x DEFINITION PUBLIC.\n  PUBLIC SECTION.\nENDCLASS.\n') === null, 'no TYPES: nothing');
    const local = 'CLASS zcl_x DEFINITION PUBLIC.\n  PUBLIC SECTION.\nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\n  METHOD m.\n    TYPES: BEGIN OF ty_l, a TYPE string, END OF ty_l.\n  ENDMETHOD.\nENDCLASS.\n';
    assert(declaredTypesOf(local) === null, 'a TYPES inside a method is the method\'s');
    const index = classIndexOf([read(APP), read(API), read(INTF)]);
    assert(index.get('zif_fx_types')?.interface === true && index.get('zif_fx_types').types.structs.has('ty_s_tag'), 'the index holds the interface for its types');
  });

  section('unknown-binding-path: a type of another class of the run is judged like the class\'s own', () => {
    const classIndex = classIndexOf([read(APP), read(API), read(INTF)]);
    const r = checkAbapSource(read(APP), { ...opts, classIndex });
    assert(paths(r).join() === 'S_DB/META/OWNER,S_DB/TABNAMX,TAG/LABEL,TAG/LABLE',
      `only what the borrowed types do not have (got ${paths(r).join() || 'none'})`);
    const shape = prepareAbap(read(APP), { classIndex }).modelShape;
    assert(Object.keys(shape.MT_OUT[0].S_DB.META).join() === 'AUTHOR,STAMP',
      'the borrowed entry\'s ty_s_meta is its owner\'s, not the class\'s own of the same name');
    assert(Object.keys(shape.MT_HISTORY[0]).join() === 'UUID,TABNAME,COUNTER,SQL_COMMAND,META', 'a table typed by the other class\'s table type has its rows');
    assert(r.stats.pathsOpaque === 1, `the type of a class not among the sources is counted as not judged (got ${r.stats.pathsOpaque})`);
  });

  section('unknown-binding-path: a type whose owner is not among the sources is not judged', () => {
    const r = checkAbapSource(read(APP), opts);
    assert(paths(r).length === 0, `no path below a borrowed type is reported without its owner (got ${paths(r).join()})`);
    const row = prepareAbap(read(APP)).modelShape.MT_OUT[0];
    assert(row.S_DB === '' && row.DATE === '', 'the field is in the row, a scalar - no structure is guessed for it');
    // the field itself is still judged: a name the row does not have is reported
    const typo = checkAbapSource(read(APP).replace('{DATE}', '{DAET}'), opts);
    assert(paths(typo).join() === 'DAET', `a field the row lacks is still reported (got ${paths(typo).join() || 'none'})`);
  });

  section('borrowed types: checkFiles and the CLI build the index the types are read from', async () => {
    const results = await checkFiles([APP, API, INTF], opts);
    const app = results.find((x) => x.file === APP);
    assert(paths(app).join() === 'S_DB/META/OWNER,S_DB/TABNAMX,TAG/LABEL,TAG/LABLE', `checkFiles (got ${paths(app).join() || 'none'})`);
    const [alone] = await checkFiles([APP], opts);
    assert(paths(alone).length === 0, 'the app alone: nothing judged below the borrowed types');

    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const root = tempDir('borrowed-types');
    fs.mkdirSync(path.join(root, 'src'));
    for (const p of [APP, API, INTF]) fs.copyFileSync(p, path.join(root, 'src', path.basename(p)));
    const lint = (...args) => {
      const out = cp.spawnSync(process.execPath, [CLI, ...args, '--no-render', '--no-config', '--no-progress', '--format', 'json'],
        { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } }).stdout;
      return JSON.parse(out).stats.rules['unknown-binding-path'] ?? 0;
    };
    assert(lint('src') === 4, 'a directory: the app is checked, the other class and the interface are read for their types');
    assert(lint('src', '--all-classes') === 4, '--all-classes: the interface is still read');
  });

  /* 0.11.1's open end: an attribute typed DIRECTLY by another class's scalar
   * type was an object of unknown shape, and a collection-bound-to-property
   * on the text it was bound to. */
  section('collection-bound-to-property: an attribute typed by another class\'s scalar type is a scalar', () => {
    const owner = 'CLASS zcl_fx_titles DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    TYPES ty_title TYPE string.\n    TYPES ty_id TYPE c LENGTH 10.\n    TYPES ty_name TYPE ty_title.\n    TYPES: BEGIN OF ty_s_head,\n             title TYPE string,\n           END OF ty_s_head.\nENDCLASS.\nCLASS zcl_fx_titles IMPLEMENTATION.\nENDCLASS.\n';
    const app = (decl) => `CLASS zcl_fx_title_app DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_title TYPE ${decl}.\nENDCLASS.\nCLASS zcl_fx_title_app IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n    view->ele( n = \`View\` ns = \`mvc\`\n        )->a( n = \`xmlns\`     v = \`sap.m\`\n        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`\n        )->ele( \`Page\`\n            )->a( n = \`title\` v = client->_bind( mv_title ) ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n`;
    const hits = (decl) => checkAbapSource(app(decl), { ...opts, classIndex: classIndexOf([app(decl), owner]) })
      .findings.filter((x) => x.type === 'collection-bound-to-property').length;
    assert(declaredTypesOf(owner).scalars.get('ty_title') === 'string' && declaredTypesOf(owner).scalars.get('ty_name') === 'string', 'the owner\'s scalar types, an alias of one followed');
    assert(hits('zcl_fx_titles=>ty_title') === 0 && hits('zcl_fx_titles=>ty_id') === 0 && hits('zcl_fx_titles=>ty_name') === 0, 'a scalar of the owner binds to a text');
    assert(prepareAbap(app('zcl_fx_titles=>ty_title'), { classIndex: classIndexOf([owner]) }).modelShape.MV_TITLE === '', 'and is a scalar in the shape');
    assert(hits('zcl_fx_titles=>ty_s_head') === 1, 'a structure of the owner bound to a text is still reported');
    const a = classIndexDeps(app('zcl_fx_titles=>ty_title'), classIndexOf([owner]));
    assert(a !== classIndexDeps(app('zcl_fx_titles=>ty_title'), classIndexOf([owner.replace('ty_title TYPE string', 'ty_title TYPE i')])), 'the cache key follows a scalar type');
  });

  section('borrowed types: the cache key follows the borrowed type', () => {
    const a = classIndexDeps(read(APP), classIndexOf([read(APP), read(API), read(INTF)]));
    const b = classIndexDeps(read(APP), classIndexOf([read(APP), read(API).replace('counter     TYPE c LENGTH 20,', ''), read(INTF)]));
    const c = classIndexDeps(read(APP), classIndexOf([read(APP), read(API).replace('    CLASS-METHODS read', '    CLASS-METHODS reread'), read(INTF)]));
    assert(a !== b, 'a field dropped from the borrowed type re-judges the class that borrows it');
    assert(a === c, 'an edit elsewhere in the owner does not');
  });
}
