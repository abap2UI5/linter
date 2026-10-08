/*
 * The 2026-10-08 audit, second round: the known improvements left over from
 * the first one, and the defects a second read found. See
 * test/review/README.md for the harness.
 *
 *   1. --fix runs to a fixed point (bounded) instead of "N deferred"
 *   2. chain-house-layout reads literals with the shared literalEnd( )
 *   3. default-key-table and a long run of blank lines are linear
 *   4. the config's `ignore` count is the same walk, no file read twice
 *   5. --update-baseline beside a machine format says its line on stderr
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes, MAX_FIX_PASSES } from '../../lib/fix.mjs';
import { collectFiles } from '../../lib/index.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource }) {
  const opts = { render: false };
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. --fix to a fixed point ───────────────────────────────────────── */

  /* One pass applies every fix whose span overlaps none applied before it;
   * an overlapping one was "deferred to the next run", and a fix that left a
   * shape another rule fixes (a deleted trailing t_arg row leaves the one-row
   * table event-arg-single-row-table rewrites) needed a second --fix that
   * nothing announced. The CLI now repeats the pass in memory, re-checking
   * what changed, and writes the result once: the text the old --fix reached
   * when it was run until it changed nothing. */
  section('audit 2026-10-08b: --fix runs to the fixed point repeated runs reached', () => {
    const rules = { 'chain-house-layout': 'warning' };
    const names = ['abaprules.clas.abap', 'nested.clas.abap', 'obsolete.clas.abap', 'chainlayout.clas.abap', 'guiderules.clas.abap'];
    const dir = tempDir('a2l-fixpoint-');
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.json'), JSON.stringify({ rules }));
    const expected = {};
    let multi = 0;
    for (const name of names) {
      let src = fs.readFileSync(f(name), 'utf8');
      fs.writeFileSync(path.join(dir, name), src);
      // what the old --fix did per invocation, until an invocation changed nothing
      let passes = 0;
      for (; passes < 20; passes++) {
        const out = applyFixes(src, checkAbapSource(src, { ...opts, rules, file: name }).findings).output;
        if (out === src) break;
        src = out;
      }
      if (passes > 1) multi++;
      expected[name] = src;
    }
    assert(multi > 0, `at least one fixture needs more than one pass (${multi})`);
    const first = run(['.', '--no-render', '--no-progress', '--fix'], dir);
    for (const name of names) {
      assert(fs.readFileSync(path.join(dir, name), 'utf8') === expected[name], `${name}: one --fix writes what repeated runs reached`);
    }
    assert(/fixed \d+ problem\(s\) in \d+ file\(s\) in [2-9] passes\n/.test(first.out) && !/deferred/.test(first.out),
      `the summary names the passes and defers nothing (${/fixed .*/.exec(first.out)?.[0]})`);
    const second = run(['.', '--no-render', '--no-progress', '--fix'], dir);
    assert(!/fixed \d+ problem/.test(second.out), 'a second --fix has nothing left to do');
    assert(MAX_FIX_PASSES === 10, `bounded like ESLint's (${MAX_FIX_PASSES})`);

    // a dry run walks the same passes and writes nothing
    const dry = tempDir('a2l-fixpoint-dry-');
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dry, 'abaprules.clas.abap'));
    const r = run(['abaprules.clas.abap', '--no-render', '--no-config', '--no-progress', '--fix-dry-run'], dry);
    assert(/would fix \d+ problem\(s\) in 1 file\(s\) in 2 passes/.test(r.out) && / \(pass 2\)$/m.test(r.out)
      && fs.readFileSync(path.join(dry, 'abaprules.clas.abap'), 'utf8') === fs.readFileSync(f('abaprules.clas.abap'), 'utf8'),
    `the dry run lists the second pass's fix and leaves the file alone (${/would fix .*/.exec(r.out)?.[0]})`);
  });

  /* ── 2. chain-house-layout and a template's embedded expression ──────── */

  /* classify( ) read a template up to its first `|`: in
   * `|{ concat_lines_of( table = mt sep = `|` ) }|` that is the one in the
   * backtick, the backtick behind it opened a literal that ran to the line
   * end, and the `)` closing the a( ) went with it - the crammed Button
   * behind it was reported and its fix never re-laid it, on any pass. */
  section('audit 2026-10-08b: chain-house-layout reads a | inside an embedded expression as text', () => {
    const mk = (sep) => `CLASS zcl_t DEFINITION PUBLIC.
  PUBLIC SECTION.
    INTERFACES z2ui5_if_app.
    DATA mt TYPE string_table.
ENDCLASS.
CLASS zcl_t IMPLEMENTATION.
  METHOD z2ui5_if_app~main.
    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
    view->ele( n = \`View\` ns = \`mvc\`
        )->a( n = \`xmlns\` v = \`sap.m\`
        )->a( n = \`xmlns:mvc\` v = \`sap.ui.core.mvc\`
        )->ele( \`Page\`
            )->tag( \`Text\` )->a( n = \`text\` v = |{ concat_lines_of( table = mt sep = \`${sep}\` ) }| )->tag( \`Button\` ).
    client->view_display( view->stringify( ) ).
  ENDMETHOD.
ENDCLASS.
`;
    const fixed = (src) => applyFixes(src, checkAbapSource(src, { ...opts, rules: { 'chain-house-layout': 'warning' } })
      .findings.filter((x) => x.type.startsWith('chain'))).output;
    const comma = fixed(mk(','));
    const pipe = fixed(mk('|'));
    assert(/\n {12}\)->tag\( `Button` \)\./.test(comma), 'the comma separator: the Button gets its own line');
    assert(pipe === comma.replace('sep = `,`', 'sep = `|`'), `a | separator is re-laid the same way (${pipe.split('\n')[13]?.trim()})`);
  });

  /* ── 3. linear in the size of the class ──────────────────────────────── */

  /* default-key-table sliced the rest of the class and matched `(\w+)\s*$`
   * against everything before each declaration: 10,000 of them took a
   * minute. And ten regexes anchored on `^\s*` under /m let every blank
   * line start a scan over all the blank lines behind it - 20,000 empty
   * lines in a definition took seconds, 100,000 minutes. */
  section('audit 2026-10-08b: 10,000 keyless tables and 100,000 blank lines are linear', () => {
    let decl = '';
    for (let i = 0; i < 10000; i++) decl += `    DATA mt_${i} TYPE TABLE OF string.\n`;
    const keys = `CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n${decl}ENDCLASS.\nCLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n`;
    let t = Date.now();
    const found = checkAbapSource(keys, { ...opts, rules: { 'default-key-table': 'warning' } }).findings.filter((x) => x.type === 'default-key-table');
    const keysMs = Date.now() - t;
    assert(found.length === 10000 && found[0].member === 'mt_0' && found[9999].member === 'mt_9999',
      `every declaration reported under its own name (${found.length}, ${found[0]?.member} … ${found.at(-1)?.member})`);
    assert(keysMs < 8000, `in linear time (${keysMs} ms; a minute before)`);
    const chain = checkAbapSource('CLASS zcl_t DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n'
      + '    DATA: mt_a TYPE TABLE OF string,\n          mt_b TYPE STANDARD TABLE OF i WITH EMPTY KEY,\n          mt_c TYPE STANDARD TABLE OF i.\n'
      + 'ENDCLASS.\nCLASS zcl_t IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n', opts)
      .findings.filter((x) => x.type === 'default-key-table').map((x) => x.member);
    assert(chain.join() === 'mt_a,mt_c', `a chained declaration: each element on its own (${chain.join()})`);

    const rules = fs.readFileSync(f('abaprules.clas.abap'), 'utf8');
    const lines = rules.split('\n');
    const shape = (src) => checkAbapSource(src, opts).findings.map((x) => `${x.type} ${x.member ?? ''}`).sort().join('\n');
    const base = shape(rules);
    for (const at of [5, Math.floor(lines.length / 2)]) {
      const padded = [...lines.slice(0, at), '\n'.repeat(100000), ...lines.slice(at)].join('\n');
      t = Date.now();
      const got = shape(padded);
      const ms = Date.now() - t;
      assert(ms < 8000, `100,000 blank lines at line ${at}: ${ms} ms`);
      assert(got === base, `and the same findings as without them (line ${at})`);
    }
  });

  /* ── 4. one walk for the `ignore` count ──────────────────────────────── */

  section('audit 2026-10-08b: collectFiles counts what ignore kept out in the same walk', () => {
    const dir = tempDir('a2l-ignorewalk-');
    const app = (name) => `CLASS ${name} DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\nENDCLASS.\nCLASS ${name} IMPLEMENTATION.\n  METHOD z2ui5_if_app~main.\n  ENDMETHOD.\nENDCLASS.\n`;
    fs.mkdirSync(path.join(dir, 'src', 'gen'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'zcl_a.clas.abap'), app('zcl_a'));
    fs.writeFileSync(path.join(dir, 'src', 'gen', 'zcl_b.clas.abap'), app('zcl_b'));
    fs.writeFileSync(path.join(dir, 'src', 'gen', 'zcl_c.clas.abap'), 'CLASS zcl_c DEFINITION PUBLIC.\nENDCLASS.\n');
    const src = path.join(dir, 'src');
    const reads = new Map();
    const read = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
      reads.set(String(p), (reads.get(String(p)) ?? 0) + 1);
      return read.call(this, p, ...rest);
    };
    let files;
    const ignored = [];
    try {
      files = collectFiles([src], { ignore: ['/gen/'], onIgnored: (p) => ignored.push(p) });
    } finally {
      fs.readFileSync = read;
    }
    assert(files.length === 1 && files[0].endsWith('zcl_a.clas.abap'), `the ignored tree is not collected (${files.map((x) => path.basename(x))})`);
    assert(ignored.length === 1 && ignored[0].endsWith('zcl_b.clas.abap'), `the one checkable file in it is counted (${ignored.map((x) => path.basename(x))})`);
    assert([...reads.values()].every((n) => n === 1), `no file is read twice (${JSON.stringify([...reads].map(([p, n]) => [path.basename(p), n]))})`);
    assert(JSON.stringify(collectFiles([src], { ignore: ['/gen/'] })) === JSON.stringify(files), 'without the callback the same files');
    // a file under an ignored tree that is also NAMED is collected, and not counted
    const both = [];
    const named = collectFiles([src, path.join(src, 'gen', 'zcl_b.clas.abap')], { ignore: ['/gen/'], onIgnored: (p) => both.push(p) });
    assert(named.length === 2 && !both.length, `named explicitly, it is checked (${named.length} files, ${both.length} counted)`);
  });

  /* ── 5. --update-baseline beside a machine format ────────────────────── */

  section('audit 2026-10-08b: --update-baseline --format json keeps stdout for the machine', () => {
    const dir = tempDir('a2l-baselinejson-');
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dir, 'abaprules.clas.abap'));
    const json = run(['abaprules.clas.abap', '--no-render', '--no-config', '--no-progress', '--update-baseline', '--format', 'json'], dir);
    assert(json.code === 0 && json.out === '' && /baseline: wrote \d+ finding/.test(json.err), `the line is on stderr (stdout ${JSON.stringify(json.out.slice(0, 60))})`);
    const plain = run(['abaprules.clas.abap', '--no-render', '--no-config', '--no-progress', '--update-baseline'], dir);
    assert(/baseline: wrote \d+ finding/.test(plain.out), 'stylish: it IS the report, on stdout');
  });
}
