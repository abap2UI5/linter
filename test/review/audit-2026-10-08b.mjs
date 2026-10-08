/*
 * The 2026-10-08 audit, second round: the known improvements left over from
 * the first one, and the defects a second read found. See
 * test/review/README.md for the harness.
 *
 *   1. --fix runs to a fixed point (bounded) instead of "N deferred"
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes, MAX_FIX_PASSES } from '../../lib/fix.mjs';

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
}
