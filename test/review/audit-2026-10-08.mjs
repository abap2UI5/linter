/*
 * The 2026-10-08 audit: defects in the plumbing every rule stands on, each
 * found by a read-only audit with a repro and fixed together. See
 * test/review/README.md for the harness.
 *
 *   1. the comment/literal readers (scrub, blankLiterals, splitStatements):
 *      a template's embedded expression over two lines, a `|` in a literal
 *      inside one, a BOM in front of a `*` comment - each left a `'` in
 *      comment text opening a literal that ran to the end of the file, and
 *      most ABAP rules went silent behind it
 *   2. --cache and the class index: built over every file of the run, and a
 *      subclass's entry keyed on its superclass's facts
 *   3. --cache and the linter's own code (the fingerprint in the context)
 *   4. baseline keys free of source positions, old keys still matching
 *   5. view-never-displayed and a helper that RETURNS its stringified view
 *   6. `"rules": { "<opt-in>": true }` switches the rule on
 *   7. a numeric `ui5` in the config is refused
 *   8. a pragma behind an argument value is no part of it
 *   9. --advisory exits 0 under --max-warnings
 *  10. --fix keeps a CRLF file CRLF
 *  11. the cache drops `docModels`, and keeps the entries of files a run did
 *      not look at
 *  12. a BOM is no column
 *  13. the annotations and the XML formats write `/` paths
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scrub, blankLiterals, splitStatements, parseNamedArgs } from '../../lib/abap.mjs';
import { applyFixes } from '../../lib/fix.mjs';
import { applyBaseline, buildBaseline, loadBaseline, migrateKey } from '../../lib/baseline.mjs';
import { cacheable, saveCache, loadCache, cacheContext, linterFingerprint } from '../../lib/cache.mjs';
import { isOptInEnabled } from '../../lib/findings.mjs';
import { parseConfig } from '../../lib/config.mjs';
import { githubAnnotations, formatCheckstyle, formatJunit } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource }) {
  const opts = { render: false };
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };
  const shape = (findings) => findings.map((x) => `${x.line}:${x.column} ${x.type} ${x.member ?? ''} ${x.value ?? ''}`).sort();
  const rules = fs.readFileSync(f('abaprules.clas.abap'), 'utf8');
  const insertAt = (src, line, text) => { const ls = src.split('\n'); ls.splice(line, 0, text); return ls.join('\n'); };

  section('audit 2026-10-08: a template expression over two lines, then a comment with a quote in it', () => {
    const base = shape(checkAbapSource(insertAt(rules, 8, '    DATA(lv_tmp) = |Hello { to_upper( `world` ) }|. " don\'t care\n'), opts).findings);
    assert(base.length > 5, `the fixture reports enough to notice a silence (${base.length})`);
    const split = insertAt(rules, 8, '    DATA(lv_tmp) = |Hello { to_upper(\n        `world` ) }|. " don\'t care');
    const got = shape(checkAbapSource(split, opts).findings);
    assert(JSON.stringify(got) === JSON.stringify(base),
      `the same findings whether the expression is on one line or two (${got.length} vs ${base.length})`);
    const s = scrub(split);
    assert(!s.includes("don't") && s.includes('`world` ) }|.'), 'scrub blanks the comment behind the closing template, keeps the code');
    assert(!blankLiterals(s).includes('scratch'), 'blankLiterals still blanks the literals behind it');
  });

  section('audit 2026-10-08: a `|` in a backtick literal inside an embedded expression', () => {
    const base = shape(checkAbapSource(insertAt(rules, 8, '    DATA(lv_x) = |{ concat_lines_of( table = lt_t sep = `,` ) }|.\n'), opts).findings);
    const pipe = insertAt(rules, 8, '    DATA(lv_x) = |{ concat_lines_of( table = lt_t sep = `|` ) }|.\n');
    const got = shape(checkAbapSource(pipe, opts).findings);
    assert(JSON.stringify(got) === JSON.stringify(base), `a | inside the expression's literal is text (${got.length} vs ${base.length})`);
    const stmts = splitStatements('x = |{ f( sep = `|` ) }|. " it\'s\ny = 1.');
    assert(stmts.length === 2 && stmts[1].text.trim().endsWith('y = 1'), `the statement splitter ends the template where it ends (${stmts.length})`);
    const open = 'x = |a { f( " it\'s | {\n b ) } c|.\ny = 1.';
    assert(scrub(open) === open.replace(/" it's \| \{/, (c) => ' '.repeat(c.length)),
      `a " inside an open expression starts a comment, and the expression goes on on the next line (${JSON.stringify(scrub(open))})`);
  });

  section('audit 2026-10-08: a literal ends at its line - a desync costs one line, never the file', () => {
    const src = "x = 'unterminated\ny = `a`.\nz = |b|.";
    assert(blankLiterals(src) === "x = '            \ny = ` `.\nz = | |.", `the next lines keep their literals (${JSON.stringify(blankLiterals(src))})`);
    assert(splitStatements(src).length === 2, 'and the splitter still finds both statements behind it');
  });

  section('audit 2026-10-08: a BOM in front of a * comment line', () => {
    const head = "* Generated - don't edit by hand\n";
    const plain = checkAbapSource(head + rules, opts).findings;
    const bom = checkAbapSource(`\uFEFF${head}${rules}`, opts).findings;
    const extra = bom.filter((x) => !plain.some((p) => p.type === x.type && p.line === x.line && p.column === x.column));
    assert(plain.length > 5 && bom.length === plain.length + 1 && extra.length === 1 && extra[0].type === 'byte-order-mark',
      `the BOM adds its own finding and changes nothing else (${plain.length} vs ${bom.length}: ${extra.map((x) => x.type).join()})`);
    assert(scrub(`\uFEFF${head}`) === `${' '.repeat(head.length)}\n`, 'scrub blanks the mark and the comment line behind it');
  });

  section('audit 2026-10-08: a BOM is not a column', () => {
    const src = 'CLASS zcl_x DEFINITION PUBLIC.  \nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n';
    const col = (s) => checkAbapSource(s, { ...opts, allClasses: true }).findings.find((x) => x.type === 'trailing-whitespace');
    const plain = col(src);
    const bom = col(`\uFEFF${src}`);
    assert(plain && bom && bom.line === 1 && bom.column === plain.column,
      `line 1 counts its columns after the mark (${bom?.column} vs ${plain?.column})`);
    const mark = checkAbapSource(`\uFEFF${src}`, { ...opts, allClasses: true }).findings.find((x) => x.type === 'byte-order-mark');
    assert(mark?.line === 1 && mark.column === 1, 'the mark itself stays at 1:1');
  });

  section('audit 2026-10-08: --cache judges a class against its superclass, and re-judges it when that changes', () => {
    const dir = tempDir('a2ui5-audit-cache-');
    const base = 'CLASS zcl_base DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    CONSTANTS: BEGIN OF cs_event, popup_close TYPE string VALUE `POPUP_CLOSE`, END OF cs_event.\n'
      + 'ENDCLASS.\n\nCLASS zcl_base IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n';
    const baseless = base.replace(/ {4}CONSTANTS: BEGIN OF cs_event.*\n/, '');
    const child = 'CLASS zcl_child DEFINITION PUBLIC INHERITING FROM zcl_base.\n  PUBLIC SECTION.\n    METHODS z2ui5_if_app~main REDEFINITION.\nENDCLASS.\n\n'
      + 'CLASS zcl_child IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `Close` )->a( n = `press` v = client->_event( cs_event-popup_close ) ).\n'
      + '    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const B = path.join(dir, 'zcl_base.clas.abap');
    const C = path.join(dir, 'zcl_child.clas.abap');
    const ARGS = ['.', '--no-render', '--no-config', '--cache', '--json'];
    const wired = () => {
      const r = run(ARGS, dir);
      const doc = JSON.parse(r.out);
      return doc.results.find((x) => x.file.endsWith('zcl_child.clas.abap')).findings.some((x) => x.type === 'frontend-action-as-backend-event');
    };
    fs.writeFileSync(B, base);
    fs.writeFileSync(C, child);
    assert(!wired(), 'the inherited cs_event is the class\'s own constant - no finding');
    fs.writeFileSync(B, baseless);
    assert(wired(), 'the superclass loses its cs_event: the CACHED subclass is judged again and reports the wire');

    // a run that misses only the subclass still knows the superclass
    fs.rmSync(path.join(dir, '.abap2ui5lintcache'));
    assert(wired(), 'cold: reported');
    fs.appendFileSync(C, '* touched\n');
    assert(wired(), 'only the subclass changed: the class index still holds the (cached) superclass');
  });

  section('audit 2026-10-08: the cache keeps the entries of files the run did not look at, drops gone ones, and not docModels', () => {
    const dir = tempDir('a2ui5-audit-cache2-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'a.clas.abap'));
    fs.copyFileSync(f('broken.clas.abap'), path.join(dir, 'b.clas.abap'));
    const ARGS = ['--no-render', '--no-config', '--cache', '--json'];
    const stored = () => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, '.abap2ui5lintcache'), 'utf8')).files).map((k) => path.basename(k)).sort().join();
    run(['a.clas.abap', ...ARGS], dir);
    run(['b.clas.abap', ...ARGS], dir);
    assert(stored() === 'a.clas.abap,b.clas.abap', `a run over b keeps a's entry (${stored()})`);
    fs.rmSync(path.join(dir, 'a.clas.abap'));
    run(['b.clas.abap', ...ARGS], dir);
    assert(stored() === 'b.clas.abap', `an entry whose file is gone is dropped (${stored()})`);

    const file = path.join(dir, 'unit.json');
    saveCache(file, 'ctx', { [path.join(dir, 'b.clas.abap')]: { hash: 'new', result: {} } },
      { [path.join(dir, 'b.clas.abap')]: { hash: 'old', result: {} }, [path.join(dir, 'gone.clas.abap')]: { hash: 'x', result: {} } });
    const back = loadCache(file, 'ctx');
    assert(Object.keys(back).length === 1 && back[path.join(dir, 'b.clas.abap')].hash === 'new', 'saveCache: this run wins, a gone file is dropped');

    const r = checkAbapSource(fs.readFileSync(f('good.clas.abap'), 'utf8'), opts);
    assert('docModels' in r && !('docModels' in cacheable(r)), 'cacheable( ) drops the per-document models with the documents');
  });

  section('audit 2026-10-08: the cache context carries a fingerprint of the linter\'s own code', () => {
    const fp = linterFingerprint();
    assert(/^[0-9a-f]{64}$/.test(fp) && linterFingerprint() === fp, 'one sha-256 per process');
    const store = { version: '1', snapshot: '1.152.0', options: {} };
    assert(cacheContext(store) === cacheContext(store), 'the context is stable within a run');
    const dir = tempDir('a2ui5-audit-cache3-');
    fs.copyFileSync(f('broken.clas.abap'), path.join(dir, 'b.clas.abap'));
    const ARGS = ['b.clas.abap', '--no-render', '--no-config', '--cache', '--json'];
    const first = JSON.parse(run(ARGS, dir).out).problems;
    // a cache written by other code: same version, same settings, another context
    const cacheFile = path.join(dir, '.abap2ui5lintcache');
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const e of Object.values(raw.files)) e.result.findings = [];
    raw.context = 'written-by-another-build';
    fs.writeFileSync(cacheFile, JSON.stringify(raw));
    assert(JSON.parse(run(ARGS, dir).out).problems === first, 'a cache from another build of the linter is not replayed');
  });

  section('audit 2026-10-08: baseline keys carry no source position', () => {
    const dir = tempDir('a2ui5-audit-bl-');
    const file = path.join(dir, 'x.clas.abap');
    const src = fs.readFileSync(f('rowpaths.clas.abap'), 'utf8');
    fs.writeFileSync(file, src);
    const check = (s) => [{ file, findings: checkAbapSource(s, opts).findings }];
    const before = check(src);
    const dkt = before[0].findings.find((x) => x.type === 'default-key-table');
    assert(dkt && !('dedupe' in dkt) && dkt.value === undefined, 'default-key-table: no offset in value, no dedupe field left on the finding');
    const baseline = buildBaseline(before, dir);
    assert([...baseline.keys()].includes('x.clas.abap|default-key-table||t_flights|'), `the key is line-free (${[...baseline.keys()].join(' ; ')})`);

    const moved = `* a line inserted above everything\n${src}`;
    fs.writeFileSync(file, moved);
    const after = check(moved);
    const applied = applyBaseline(after, baseline, dir);
    assert(applied.stale.length === 0 && after[0].findings.length === 0,
      `a line inserted above: still suppressed, nothing stale (${applied.stale.map((s) => s.key).join()} / ${after[0].findings.map((x) => x.type).join()})`);

    // a baseline written before: the offset in the key
    const legacy = new Map([...baseline].map(([k, n]) => [k.replace(/\|default-key-table\|\|t_flights\|$/, '|default-key-table||t_flights|349'), n]));
    const again = check(moved);
    const old = applyBaseline(again, legacy, dir);
    assert(old.stale.length === 0 && again[0].findings.length === 0, 'an old key with an offset still matches, wherever the code moved');
    const blFile = path.join(dir, 'bl.json');
    fs.writeFileSync(blFile, JSON.stringify({ findings: { 'x.clas.abap|default-key-table||t_flights|349': 1, 'x.clas.abap|default-key-table||t_flights|12': 1 } }));
    assert(loadBaseline(blFile).get('x.clas.abap|default-key-table||t_flights|') === 2, 'loadBaseline migrates old keys, adding up their counts');
    assert(migrateKey('a|trailing-whitespace||17|3') === 'a|trailing-whitespace|||3', 'a line number in member is dropped too');
    assert(migrateKey('a|unknown-binding-path|sap.m.Text|text|CARID') === 'a|unknown-binding-path|sap.m.Text|text|CARID'
      && migrateKey('a|invalid-property-value|sap.m.Input|maxLength|12') === 'a|invalid-property-value|sap.m.Input|maxLength|12',
      'another rule\'s key - a number in it included - is left alone');
  });

  section('audit 2026-10-08: view-never-displayed and a helper that returns the stringified view', () => {
    const helper = (assign, sig) => 'CLASS zcl_helper DEFINITION PUBLIC.\n  PUBLIC SECTION.\n'
      + `    METHODS stringify\n      IMPORTING client TYPE REF TO z2ui5_if_client\n      ${sig}.\nENDCLASS.\n\n`
      + 'CLASS zcl_helper IMPLEMENTATION.\n  METHOD stringify.\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->ele( `Page` ).\n'
      + `    ${assign} = view->stringify( ).\n  ENDMETHOD.\nENDCLASS.\n`;
    const never = (src) => checkAbapSource(src, opts).findings.filter((x) => x.type === 'view-never-displayed').length;
    assert(never(helper('result', 'RETURNING VALUE(result) TYPE string')) === 0, 'RETURNING: the caller displays it');
    assert(never(helper('ev_xml', 'EXPORTING ev_xml TYPE string')) === 0, 'EXPORTING: the same');
    assert(never(helper('DATA(lv_xml)', 'RETURNING VALUE(result) TYPE string')) === 1, 'a local that goes nowhere is still never displayed');
    assert(never(helper('lv_xml', 'IMPORTING lv_xml TYPE string')) === 1, 'an IMPORTING parameter hands nothing out');
    assert(never(fs.readFileSync(f('nodisplay.clas.abap'), 'utf8')) === 1, 'the fixture app is still reported');
  });

  section('audit 2026-10-08: `true` switches an opt-in rule on', () => {
    assert(isOptInEnabled({ 'chain-house-layout': true }, 'chain-house-layout'), 'isOptInEnabled( true )');
    assert(!isOptInEnabled({ 'chain-house-layout': false }, 'chain-house-layout') && !isOptInEnabled({}, 'chain-house-layout'), 'false and absent stay off');
    const src = fs.readFileSync(f('nested.clas.abap'), 'utf8');
    const n = (r) => checkAbapSource(src, { ...opts, rules: r }).findings.filter((x) => x.type === 'chain-house-layout').length;
    assert(n({ 'chain-house-layout': true }) > 0 && n({ 'chain-house-layout': true }) === n({ 'chain-house-layout': 'warning' }),
      `"chain-house-layout": true reports what "warning" reports (${n({ 'chain-house-layout': true })})`);
    assert(n({ 'unknown-control': true }) === 0, 'and true on a default rule changes nothing about the opt-in one');
  });

  section('audit 2026-10-08: a numeric ui5 in the config is refused', () => {
    let msg = '';
    try { parseConfig('x.json', '{ "ui5": 1.120 }'); } catch (e) { msg = e.message; }
    assert(/'ui5' must be a version string/.test(msg) && /1\.12\b/.test(msg), `refused, and the message says why (${msg})`);
    try { parseConfig('x.json', '{ "minUi5": 1.71 }'); msg = ''; } catch (e) { msg = e.message; }
    assert(/'minUi5' must be a version string/.test(msg), `the alias too, under its own name (${msg})`);
    assert(parseConfig('x.json', '{ "ui5": "1.120" }').minUi5 === '1.120', 'the quoted form keeps its trailing zero');
  });

  section('audit 2026-10-08: a pragma behind an argument value is no part of it', () => {
    assert(parseNamedArgs('n = `type` v = `Bogus` ##NO_TEXT').v === '`Bogus`', 'parseNamedArgs drops the pragma');
    assert(parseNamedArgs('v = `a ##b`').v === '`a ##b`', 'a ## inside the literal is text');
    const app = (v) => 'CLASS zcl_p DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\n\nCLASS zcl_p IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n'
      + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
      + '    view->ele( n = `View` ns = `mvc` )->a( n = `xmlns` v = `sap.m` )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
      + '        )->ele( `Page` )->tag( `Button` )->a( n = `text` v = `Go` )\n'
      + `            ->a( n = \`type\` v = ${v}\n`
      + '        )->end( ).\n    client->view_display( view->stringify( ) ).\n  ENDMETHOD.\nENDCLASS.\n';
    const types = (v) => checkAbapSource(app(v), opts).findings.map((x) => `${x.type}:${x.value ?? ''}`).filter((t) => /invalid-property-value|unresolved-attribute-value/.test(t));
    assert(JSON.stringify(types('`Bogus` ##NO_TEXT')) === JSON.stringify(types('`Bogus`')) && types('`Bogus`').includes('invalid-property-value:Bogus'),
      `judged like the value without the pragma (${types('`Bogus` ##NO_TEXT').join()})`);
    assert(JSON.stringify(types("'Bogus' ##NO_TEXT")) === JSON.stringify(types("'Bogus'")), 'a quoted literal as well');
  });

  section('audit 2026-10-08: --advisory exits 0 under --max-warnings', () => {
    const dir = tempDir('a2ui5-audit-adv-');
    fs.writeFileSync(path.join(dir, 'x.clas.abap'), 'CLASS zcl_x DEFINITION PUBLIC.  \nENDCLASS.\nCLASS zcl_x IMPLEMENTATION.\nENDCLASS.\n');
    const ARGS = ['x.clas.abap', '--no-render', '--no-config', '--all-classes', '--max-warnings', '0'];
    const capped = run(ARGS, dir);
    assert(capped.code === 1 && /exceed --max-warnings 0/.test(capped.err), `over the cap fails (exit ${capped.code})`);
    const adv = run([...ARGS, '--advisory'], dir);
    assert(adv.code === 0 && /exceed --max-warnings 0 \(not failing/.test(adv.err), `--advisory: still said, exit 0 (exit ${adv.code}: ${adv.err.trim()})`);
    const never = run([...ARGS, '--fail-on', 'never'], dir);
    assert(never.code === 0, `--fail-on never: exit 0 (${never.code})`);
  });

  section('audit 2026-10-08: --fix keeps a CRLF file CRLF', () => {
    const lf = fs.readFileSync(f('nested.clas.abap'), 'utf8');
    const crlf = lf.replace(/\n/g, '\r\n');
    const fix = (src, r) => {
      const found = checkAbapSource(src, { ...opts, rules: r }).findings;
      return applyFixes(src, found).output;
    };
    const off = { 'chain-house-layout': 'warning', 'crlf-line-ending': false };
    const fixedLf = fix(lf, off);
    assert(fixedLf !== lf, 'the chain is rewritten');
    const fixedCrlf = fix(crlf, off);
    assert(!/[^\r]\n/.test(fixedCrlf) && fixedCrlf.replace(/\r\n/g, '\n') === fixedLf,
      'crlf-line-ending off: the same rewrite, every line break CRLF');
    assert(!checkAbapSource(fixedCrlf, { ...opts, rules: off }).findings.some((x) => x.type === 'chain-house-layout'),
      'and a CRLF chain in the house layout is not reported again');
    const both = fix(crlf, { 'chain-house-layout': 'warning' });
    assert(!both.includes('\r'), 'crlf-line-ending on: every fix writes LF, as its own fix does');
  });

  section('audit 2026-10-08: annotations, checkstyle and junit write / paths', () => {
    const result = { file: ['src', '01', 'x.clas.abap'].join('\\'), kind: 'abap', findings: [{ type: 'unknown-control', severity: 'error', message: 'm', line: 1, column: 1 }], renderErrors: [] };
    const sep = path.sep;
    try {
      path.sep = '\\'; // what Windows hands the formatters
      const ann = githubAnnotations([result]).join('\n');
      const cs = formatCheckstyle([result]);
      const ju = formatJunit([result]);
      assert(ann.includes('file=src/01/x.clas.abap') && !ann.includes('\\'), `annotation: ${ann.split('::')[1]}`);
      assert(cs.includes('name="src/01/x.clas.abap"') && ju.includes('src/01/x.clas.abap') && !/src\\/.test(cs + ju), 'checkstyle and junit too');
    } finally {
      path.sep = sep;
    }
  });
}
