/*
 * --watch: the run, again on every change. See test/review/README.md for the
 * harness.
 *
 * Three sections: the refusals (every single-run mode and output is refused
 * with exit 2 before anything is watched), one REAL loop - a spawned CLI over
 * a temp directory, a fixture copied in while it runs, the config edited,
 * broken and fixed while it runs, and a SIGINT at the end - and the same loop
 * with the render gate on, where the browser has to be reused and Ctrl+C has
 * to stay exit 0 against Playwright's own SIGINT handler. Every wait polls the
 * child's stdout against a deadline; there is no fixed sleep anywhere, so a
 * section costs what the loop costs (a few hundred milliseconds per turn: the
 * 250 ms debounce plus one property-gate run; one cold browser start for the
 * render section) and never a second more.
 */
import fs from 'fs';
import path from 'path';
import cp from 'child_process';

export default function ({ section, assert, f, FIX, tempDir }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };

  /* Ctrl+C, and what a PARENT PROCESS can ask for on each platform.
   *
   * POSIX: `child.kill('SIGINT')` delivers the signal, the loop's own handler
   * runs - closes the watchers, drops the warm renderer, exits 0 - and that
   * exit code is the thing worth asserting, because it is what a shell sees
   * and what the render section exists for (Playwright's own handler would
   * end the process with 130 instead).
   *
   * Windows has no signal delivery between processes. `subprocess.kill()`
   * there ends the target with TerminateProcess whatever signal NAME it is
   * handed, so the child never reaches its handler and the exit event carries
   * `{ code: null, signal: 'SIGINT' }`. A real Ctrl+C in a console does reach
   * a Node process on Windows - the runtime synthesizes SIGINT from the
   * console control handler - but no parent can generate that event, so the
   * assertion below is not a thing the platform can be asked to do rather
   * than a thing the loop gets wrong: every OTHER assertion in both sections
   * passes there, which is what says the watch loop itself is fine.
   *
   * So the exit code is asserted where it can be asked for, and the half that
   * holds everywhere - the loop ENDS, rather than hanging on the watcher
   * handles it keeps open - is asserted on every platform. Both sections
   * failed on the windows-latest leg from the day --watch landed (#108) until
   * this split was written; nothing about the product changed with it.
   */
  const WINDOWS = process.platform === 'win32';
  const endsOnCtrlC = (end, what) => {
    const got = end.code ?? end.signal;
    if (WINDOWS) {
      assert(end.code !== 'timeout',
        `${what}: killed, the watch ends instead of hanging on its watchers `
        + `(got ${got}; Windows cannot deliver the signal, so the exit CODE is asserted on POSIX only)`);
      return;
    }
    assert(end.code === 0, `${what} (got ${got})`);
  };

  section('watch: the single-run modes and outputs are refused', async () => {
    const refused = (args) => {
      try {
        cp.execFileSync('node', [CLI, f('good.clas.abap'), '--no-render', '--no-config', '--watch', ...args],
          { encoding: 'utf8', stdio: 'pipe', env: ENV });
        return { code: 0, err: '' };
      } catch (e) { return { code: e.status, err: e.stderr ?? '' }; }
    };
    for (const [args, why] of [
      [['--stdin'], 'nothing to watch'],
      [['--screenshot', 'x.png'], 'a mode that ends'],
      [['--update-baseline'], 'a mode that ends'],
      [['--fix'], 'rewrites the files it watches'],
      [['--fix-dry-run'], 'the same pass'],
      [['--badge', 'b.json'], 'a verdict written to disk'],
      [['--badge-corpus', 'c.json'], 'ditto'],
      [['--sarif-out', 's.sarif'], 'one document per run'],
      [['--json-out', 'j.json'], 'one document per run'],
    ]) {
      const r = refused(args);
      assert(r.code === 2 && /--watch cannot be combined with/.test(r.err) && r.err.includes(args[0]),
        `watch: --watch with ${args[0]} is refused with exit 2 and names the flag (${why}; exit ${r.code}: ${r.err.trim().split('\n')[0]})`);
    }
    for (const format of ['json', 'markdown', 'sarif', 'checkstyle', 'junit']) {
      const r = refused(['--format', format]);
      assert(r.code === 2 && /--watch prints the stylish report only/.test(r.err) && r.err.includes(format),
        `watch: --watch with --format ${format} is refused - one document per run, not a loop (exit ${r.code})`);
    }
    const shorthand = refused(['--json']);
    assert(shorthand.code === 2 && /stylish report only/.test(shorthand.err),
      'watch: the --json shorthand is refused the same way');
    // …and none of that stops a badge NAMED IN THE CONFIG from being stood
    // down silently: it is not a flag, so it is not refused, and a watch
    // writes no badge (asserted in the loop below through the absent file)
  });

  section('watch: a live loop over a directory', async () => {
    const dir = tempDir('a2ui5-watch-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{ "badge": "badge.json" }\n');

    const child = cp.spawn('node', [CLI, dir, '--watch', '--no-render', '--no-progress', '--config', cfg],
      { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

    /* Poll against a deadline: a condition met early returns early, one never
     * met fails with what the child had said so far. Generous, because a CI
     * runner under load is the machine this has to pass on. */
    const until = async (pred, what, ms = 30000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (child.exitCode !== null) return `watch: ${what} - the child exited early (${child.exitCode})\n${err}`;
        if (Date.now() - t0 > ms) return `watch: ${what} - not within ${ms} ms\n--- stdout ---\n${out}\n--- stderr ---\n${err}`;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    };
    const clean = () => (out.match(/^Success! No findings detected\.$/gm) ?? []).length;
    const failing = () => (out.match(/^2 problems \(2 errors, 0 warnings, 0 hints\)$/gm) ?? []).length;

    try {
      let miss = await until(() => clean() === 1, 'the first report appears on stdout');
      assert(!miss, miss ?? 'watch: the first run reports the clean fixture');
      miss = await until(() => /watching .* - Ctrl\+C stops/.test(err), 'the watch announces itself on stderr');
      assert(!miss, miss ?? 'watch: after the first report, stderr says what is watched and how to stop');
      assert(/abap2ui5lint\.jsonc/.test(err), 'watch: the config file is named among the watched paths');

      // a NEW file under the watched directory: the second report carries it
      fs.copyFileSync(f('dumps.clas.abap'), path.join(dir, 'dumps.clas.abap'));
      miss = await until(() => failing() === 1, 'a second report after a file is added');
      assert(!miss, miss ?? 'watch: a new class under the directory re-runs the check and reports its two errors');
      assert(/^-+ \d\d:\d\d:\d\d  changed: .*dumps\.clas\.abap -+$/m.test(err),
        `watch: a separator on stderr carries the time and the changed file (${err.split('\n').find((l) => l.includes('changed:')) ?? 'no separator'})`);

      // an EDIT to the config: read again, so the rules block takes effect
      fs.writeFileSync(cfg, '{ "badge": "badge.json", "rules": { "duplicate-property": false, "attribute-without-element": false } }\n');
      miss = await until(() => clean() === 2, 'a third report after the config is edited');
      assert(!miss, miss ?? 'watch: an edited config is re-read and the switched-off rules stop reporting');

      // a BROKEN config: printed, and the loop is still alive for the fix
      fs.writeFileSync(cfg, '{ "rules": { "no-such-rule": false } }\n');
      miss = await until(() => /unknown rule 'no-such-rule'/.test(err), 'a config error is printed on stderr');
      assert(!miss, miss ?? 'watch: a config error is one line on stderr, not the end of the loop');
      fs.writeFileSync(cfg, '{}\n');
      miss = await until(() => failing() === 2, 'the run after the config is fixed again');
      assert(!miss, miss ?? 'watch: the loop survived the broken config and reports again once it is fixed');
      assert(child.exitCode === null, 'watch: the process is still running after a failing report (a watch never exits 1)');
      assert(!fs.existsSync(path.join(dir, 'badge.json')),
        'watch: a badge named in the config is not written by a watch - a verdict is one run, a watch is not');
    } finally {
      child.kill('SIGINT');
    }
    const end = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 10000))]);
    endsOnCtrlC(end, 'watch: Ctrl+C ends the watch with exit 0');
  });

  /* The render gate under --watch: one browser for the whole session, and
   * Ctrl+C still exit 0. The second half is the one that was wrong: Playwright
   * answers SIGINT itself - closes the browser, then exits the process with
   * 130 - and its handler was registered before the loop's, so a watch with
   * the render gate on ended with the exit code of a killed process. The loop
   * opens its renderer with handleSIGINT: false and closes it itself now. */
  section('watch: the render gate keeps one browser and Ctrl+C is still exit 0', async () => {
    const dir = tempDir('a2ui5-watch-render-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'good.clas.abap'));
    const child = cp.spawn('node', [CLI, dir, '--watch', '--render', '--no-progress', '--no-config'],
      { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
    const until = async (pred, what, ms = 90000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (child.exitCode !== null) return `watch/render: ${what} - the child exited early (${child.exitCode})\n${err}`;
        if (Date.now() - t0 > ms) return `watch/render: ${what} - not within ${ms} ms\n--- stdout ---\n${out}\n--- stderr ---\n${err}`;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    };
    try {
      let miss = await until(() => /^Success! No findings detected\.$/m.test(out), 'the first report, through a cold browser');
      assert(!miss, miss ?? 'watch/render: the first run renders the clean fixture');
      assert(!/render gate .* not installed|stepping aside/i.test(err), `watch/render: the render gate actually ran (${err.trim().split('\n')[0]})`);
      const t = Date.now();
      fs.copyFileSync(f('broken.clas.abap'), path.join(dir, 'broken.clas.abap'));
      miss = await until(() => /render-error/.test(out), 'a second report carrying a render error');
      assert(!miss, miss ?? 'watch/render: a broken view added to the directory fails the render gate on the next run');
      /* Warm, not merely working: a cold render run launches a browser and
       * boots UI5 (seconds); the warm one only loads the view. The bound is
       * generous - a loaded runner is the machine this has to pass on - and
       * still an order of magnitude under a cold start. */
      const took = Date.now() - t;
      assert(took < 20000, `watch/render: the second run reused the browser (${took} ms from the change to the report)`);
    } finally {
      child.kill('SIGINT');
    }
    const end = await Promise.race([exited, new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 15000))]);
    endsOnCtrlC(end, "watch/render: Ctrl+C ends a rendering watch with exit 0, not Playwright's 130");
  });
}
