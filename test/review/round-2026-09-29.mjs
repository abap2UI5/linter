/*
 * The 2026-09-29 round: defects reported against the published 0.8.3, each
 * reproduced first and pinned here with the input that showed it - the report
 * cut off at 64 KiB when it went into a pipe, the render gate under pnpm and
 * without a browser, a baseline that called every entry of an unlinted file
 * stale, a `--fix` that deleted a namespace a helper still used, a view that
 * was not well-formed passing the property gate, and the smaller ones behind
 * them. See test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function ({ section, assert, f, FIX, tempDir }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, { cwd, input, env = {} } = {}) => {
    const r = cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...ENV, ...env }, cwd, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. a report into a pipe is the whole report ─────────────────────── */

  /* `process.exit( )` after a report dropped whatever the pipe had not taken
   * yet: a failing `--json` run piped into a reader that is not instantly
   * there came out as exactly 65,536 bytes. The reader here sleeps before it
   * reads, which is what any real consumer (jq behind a slow job log, a
   * workflow step) does often enough - and the only reliable way to see it. */
  const piped = (args) => {
    const cmd = `{ node ${JSON.stringify(CLI)} ${args.map((a) => JSON.stringify(a)).join(' ')}; echo "exit=$?" >&2; } | { sleep 1; cat; }`;
    const r = cp.spawnSync('sh', ['-c', cmd], { encoding: 'utf8', env: ENV, maxBuffer: 64 * 1024 * 1024 });
    return { out: r.stdout ?? '', code: Number(/exit=(\d+)/.exec(r.stderr ?? '')?.[1]) };
  };

  section('round 2026-09-29: a failing report piped into a slow reader arrives whole', () => {
    const dir = tempDir('a2l-pipe-');
    const src = fs.readFileSync(f('structure.clas.abap'), 'utf8');
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(dir, `zcl_pipe${i}.clas.abap`), src.replace(/zcl_structure/gi, `zcl_pipe${i}`));
    }
    const r = piped([dir, '--no-render', '--no-config', '--no-progress', '--json']);
    let doc = null;
    try { doc = JSON.parse(r.out); } catch { /* truncated */ }
    assert(r.out.length > 64 * 1024, `the report is larger than a pipe buffer, or this proves nothing (${r.out.length} bytes)`);
    assert(doc !== null, `the --json document parses - nothing was cut off at 64 KiB (${r.out.length} bytes, ends ${JSON.stringify(r.out.slice(-40))})`);
    assert(r.code === 1, `and the exit code still says the run failed (${r.code})`);
    assert(doc?.results?.length === 30, `every file is in it (${doc?.results?.length})`);

    // --explain is a documentation command with an early exit of its own
    const ids = run(['--explain']).out.split('\n').map((l) => /^\s+([a-z0-9-]+)\s/.exec(l)?.[1]).filter(Boolean).slice(0, 80);
    const direct = run(['--explain', ...ids]).out;
    const e = piped(['--explain', ...ids]);
    assert(direct.length > 64 * 1024, `--explain over ${ids.length} ids is larger than a pipe buffer (${direct.length} bytes)`);
    assert(e.out === direct && e.code === 0, `and arrives whole through a slow pipe too (${e.out.length} of ${direct.length} bytes, exit ${e.code})`);
  });
}
