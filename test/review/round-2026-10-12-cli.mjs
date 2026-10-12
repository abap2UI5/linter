/*
 * The 2026-10-12 review round, the CLI's flag handling: the combinations
 * that did something else than what was typed, and the baseline on a run
 * whose walk collected nothing. See test/review/README.md for the harness.
 *
 *   1. a value flag does not take the next option as its value
 *   2. the baseline has its say on an empty walk too (stale, prune, missing)
 *   3. --update-baseline refuses the files it would leave unwritten
 *   4. the default abap2ui5lint-baseline.json is read where it was written
 *   5. --stdin --update-baseline needs --stdin-filename
 *   6. --deprecated-at equal to --ui5 is refused like one below it
 *   7. --no-config --config <file> is refused as contradictory
 *   8. --badge twice (or --badge-corpus twice) is refused, as in the config
 *   9. --cache-location without --cache, --stdin-filename without --stdin
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function ({ section, assert, f, FIX, tempDir }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd, input) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };
  const base = ['--no-render', '--no-config', '--no-progress'];
  // a directory with one class that has findings under src/
  const corpus = (prefix) => {
    const dir = tempDir(prefix);
    fs.mkdirSync(path.join(dir, 'src'));
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dir, 'src', 'abaprules.clas.abap'));
    return dir;
  };
  const entriesOf = (file) => Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).findings);

  /* ── 1. a value flag and the next option ─────────────────────────────── */

  /* `value( )` took whatever followed: `--allow --no-render` allowed a
   * control called `--no-render` and ran the render gate the user had just
   * switched off, `--sarif-out --json` wrote a file literally named `--json`
   * and printed the stylish report. */
  section('round 2026-10-12: a value flag refuses the next option as its value', () => {
    const dir = corpus('a2l-flagvalue-');
    for (const [flag, next] of [['--allow', '--no-render'], ['--sarif-out', '--json'], ['--baseline', '--update-baseline'],
      ['--config', '--no-render'], ['--stdin-filename', '--stdin'], ['--badge', '--no-render'], ['--format', '-v']]) {
      const r = run(['src', '--no-render', '--no-config', flag, next], dir);
      assert(r.code === 2 && r.err.includes(`${flag} needs a value`) && r.err.includes(`'${next}'`),
        `${flag} ${next}: refused with exit 2, naming the flag and what it got (exit ${r.code}: ${r.err.split('\n')[0]})`);
    }
    assert(!fs.existsSync(path.join(dir, '--json')), 'no file named --json was written');
    // a value that merely starts with a dash-free word is still a value
    const ok = run(['src', ...base, '--allow', 'sap.m.Avatar.displaySize'], dir);
    assert(ok.code !== 2, `--allow <name> is still accepted (exit ${ok.code})`);
  });

  /* ── 2. the baseline on an empty walk ────────────────────────────────── */

  /* The `no checkable app classes` return ran BEFORE the baseline block, so
   * the run in which every entry is stale by construction - the classes were
   * deleted, or moved under `ignore` - was green: no stale entry reported
   * (exit 0), --update-baseline kept the entries, and a named baseline that
   * was not there was no error. */
  section('round 2026-10-12: the baseline has its say when the walk collects nothing', () => {
    const dir = corpus('a2l-emptybase-');
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    assert(run(['src', ...base, '--baseline', bl, '--update-baseline'], dir).code === 0 && entriesOf(bl).length > 0,
      'the class is baselined');
    fs.rmSync(path.join(dir, 'src', 'abaprules.clas.abap'));

    const stale = run(['src', ...base, '--baseline', bl], dir);
    assert(stale.code === 1 && /no checkable app classes/.test(stale.out) && /STALE/.test(stale.out) && /! stale: src\/abaprules/.test(stale.out),
      `stylish: the empty run reports the stale entries and exits 1 (exit ${stale.code}: ${stale.out.split('\n').slice(0, 3).join(' | ')})`);
    const advisory = run(['src', ...base, '--baseline', bl, '--advisory'], dir);
    assert(advisory.code === 0 && /STALE/.test(advisory.out), `--advisory still promises exit 0 (exit ${advisory.code})`);

    const json = run(['src', ...base, '--baseline', bl, '--format', 'json'], dir);
    let doc = null;
    try { doc = JSON.parse(json.out); } catch { /* asserted below */ }
    assert(json.code === 1 && doc && doc.problems === 0 && Array.isArray(doc.baseline?.stale) && doc.baseline.stale.length === entriesOf(bl).length,
      `json: the empty document carries the stale entries and the run exits 1 (exit ${json.code}, stale ${doc?.baseline?.stale?.length})`);
    for (const format of ['checkstyle', 'junit', 'sarif']) {
      const r = run(['src', ...base, '--baseline', bl, '--format', format], dir);
      assert(r.code === 1 && r.out.trim().length > 0 && !/stale/i.test(r.out),
        `${format}: the empty document stays the document, the stale entries decide the exit code (exit ${r.code})`);
    }

    const missing = run(['src', ...base, '--baseline', path.join(dir, 'nope.json')], dir);
    assert(missing.code === 2 && /baseline file not found/.test(missing.err),
      `a named baseline that is not there is an error on an empty walk too (exit ${missing.code}: ${missing.err.trim()})`);

    const update = run(['src', ...base, '--baseline', bl, '--update-baseline'], dir);
    assert(update.code === 0 && entriesOf(bl).length === 0 && /baseline: wrote 0 finding/.test(update.out),
      `--update-baseline over the empty walk prunes the entries of the files that are gone (exit ${update.code}, ${entriesOf(bl).length} left)`);
    const clean = run(['src', ...base, '--baseline', bl], dir);
    assert(clean.code === 0 && /no checkable app classes/.test(clean.out), `and the pruned baseline is green again (exit ${clean.code})`);
  });

  /* ── 3. --update-baseline and the files beside the report ────────────── */

  /* The update returned right after writing its file, so a --json-out,
   * --sarif-out or badge beside it was never written - and the Action always
   * adds --json-out for its outputs, which then stayed empty, silently. */
  section('round 2026-10-12: --update-baseline refuses the outputs it would leave unwritten', () => {
    const dir = corpus('a2l-updateout-');
    for (const [flag, file] of [['--json-out', 'o/r.json'], ['--sarif-out', 'o/r.sarif'], ['--badge', 'o/b.json'], ['--badge-corpus', 'o/c.json']]) {
      const r = run(['src', ...base, '--update-baseline', flag, file], dir);
      assert(r.code === 2 && /--update-baseline cannot be combined with/.test(r.err) && r.err.includes(flag),
        `${flag}: refused with exit 2 and the flag named (exit ${r.code}: ${r.err.trim().slice(0, 100)})`);
      assert(!fs.existsSync(path.join(dir, file)) && !fs.existsSync(path.join(dir, 'abap2ui5lint-baseline.json')),
        `${flag}: and neither the file nor the baseline was written`);
    }
    // the machine --format keeps its contract (audit 2026-10-08b): the line on stderr, stdout empty
    const json = run(['src', ...base, '--update-baseline', '--format', 'json'], dir);
    assert(json.code === 0 && json.out === '' && /baseline: wrote/.test(json.err), `--format json beside the update is still exit 0 with the line on stderr (exit ${json.code})`);
  });

  /* ── 4. the default baseline file is read where it was written ───────── */

  /* `--update-baseline` without `--baseline` wrote abap2ui5lint-baseline.json
   * and no later run looked for it: the file sat there and every run kept
   * reporting the debt it had just frozen. */
  section('round 2026-10-12: abap2ui5lint-baseline.json is read where --update-baseline put it', () => {
    const dir = corpus('a2l-defaultbase-');
    const before = run(['src', ...base], dir);
    assert(before.code === 1, `the corpus has findings (exit ${before.code})`);
    const update = run(['src', ...base, '--update-baseline'], dir);
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    assert(update.code === 0 && fs.existsSync(bl), 'the default file is written into the current directory');
    assert(/baseline: the next run reads it from there/.test(update.out) && /--baseline abap2ui5lint-baseline\.json/.test(update.out) && /"baseline"/.test(update.out),
      `and the update says where the next run finds it and how to pin it (${update.out.split('\n').find((l) => /next run/.test(l))})`);
    const after = run(['src', ...base], dir);
    assert(after.code === 0 && /suppressed by abap2ui5lint-baseline\.json/.test(after.out),
      `the next run, with no flag at all, reads it (exit ${after.code}: ${after.out.split('\n').find((l) => /baseline/.test(l))})`);
    // still a baseline: a stale entry fails the run
    fs.rmSync(path.join(dir, 'src', 'abaprules.clas.abap'));
    assert(run(['src', ...base], dir).code === 1, 'the default baseline is applied with the stale-entry rule like a named one');

    /* next to the config, when there is one: the config directory is the
     * repository, the cwd is wherever the developer stands */
    const repo = corpus('a2l-defaultcfg-');
    fs.writeFileSync(path.join(repo, 'abap2ui5lint.json'), '{ "paths": ["src"] }');
    const sub = path.join(repo, 'sub');
    fs.mkdirSync(sub);
    const fromSub = run(['--no-render', '--no-progress', '--update-baseline'], sub);
    const atConfig = path.join(repo, 'abap2ui5lint-baseline.json');
    assert(fromSub.code === 0 && fs.existsSync(atConfig) && !fs.existsSync(path.join(sub, 'abap2ui5lint-baseline.json')),
      `with a config the default is written next to the config, not into the cwd (exit ${fromSub.code}: ${fromSub.err.trim()})`);
    assert(/next to the config/.test(fromSub.out) && /abap2ui5lint\.json/.test(fromSub.out), 'and the follow-up names the config to pin it in');
    const read = run(['--no-render', '--no-progress'], sub);
    assert(read.code === 0 && /suppressed by/.test(read.out), `and read from there on the next run from the same cwd (exit ${read.code})`);
    const elsewhere = run(['--no-render', '--no-progress'], repo);
    assert(elsewhere.code === 0 && /suppressed by abap2ui5lint-baseline\.json/.test(elsewhere.out), `and from the repository root (exit ${elsewhere.code})`);
  });

  /* ── 5. --stdin --update-baseline ────────────────────────────────────── */

  /* A baseline entry is keyed on the file's path; an update over a source
   * called <stdin> wrote `<stdin>|...` entries no later run can match. */
  section('round 2026-10-12: --stdin --update-baseline needs --stdin-filename', () => {
    const dir = tempDir('a2l-stdinbase-');
    const src = fs.readFileSync(f('abaprules.clas.abap'), 'utf8');
    const bl = path.join(dir, 'bl.json');
    const r = run(['--stdin', ...base, '--baseline', bl, '--update-baseline'], dir, src);
    assert(r.code === 2 && /--stdin --update-baseline needs --stdin-filename/.test(r.err) && !fs.existsSync(bl),
      `without a name: refused, nothing written (exit ${r.code}: ${r.err.trim()})`);
    const named = run(['--stdin', ...base, '--stdin-filename', 'abaprules.clas.abap', '--baseline', bl, '--update-baseline'], dir, src);
    assert(named.code === 0 && entriesOf(bl).every((k) => k.startsWith('abaprules.clas.abap|')),
      `with --stdin-filename the entries carry the file's key (exit ${named.code}: ${entriesOf(bl)[0]})`);
  });

  /* ── 6. --deprecated-at equal to --ui5 ───────────────────────────────── */

  /* The horizon covers the versions AFTER the target and up to itself; equal
   * to the target that range is empty, and the check (`!withinUi5Floor(ui5,
   * horizon)`) let equality through - a run that reported nothing, silently. */
  section('round 2026-10-12: a deprecation horizon equal to the target is refused like one below it', () => {
    const dir = corpus('a2l-horizoneq-');
    const equal = run(['src', ...base, '--ui5', '1.136', '--deprecated-at', '1.136'], dir);
    assert(equal.code === 2 && /deprecatedAt 1\.136 is equal to the ui5 target 1\.136/.test(equal.err) && /has to lie past the target/.test(equal.err),
      `equal: exit 2 with the horizon rule (exit ${equal.code}: ${equal.err.trim()})`);
    const below = run(['src', ...base, '--ui5', '1.136', '--deprecated-at', '1.71'], dir);
    assert(below.code === 2 && /below the ui5 target/.test(below.err), `below: unchanged wording (exit ${below.code})`);
    const past = run(['src', ...base, '--ui5', '1.71', '--deprecated-at', '1.136'], dir);
    assert(past.code !== 2, `past the target: accepted (exit ${past.code})`);
    // the config's spelling is judged the same way (the two halves may come from different places)
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.json'), '{ "ui5": "1.120", "deprecatedAt": "1.120" }');
    const cfg = run(['src', '--no-render', '--no-progress'], dir);
    assert(cfg.code === 2 && /equal to the ui5 target/.test(cfg.err), `from the config too (exit ${cfg.code})`);
  });

  /* ── 7. --no-config --config ─────────────────────────────────────────── */

  section('round 2026-10-12: --no-config beside --config <file> is refused', () => {
    const dir = corpus('a2l-noconfig-');
    const cfg = path.join(dir, 'abap2ui5lint.json');
    fs.writeFileSync(cfg, '{ "failOn": "never" }');
    const r = run(['src', '--no-render', '--no-progress', '--no-config', '--config', cfg], dir);
    assert(r.code === 2 && /--no-config and --config .* contradict each other/.test(r.err),
      `exit 2, the message names both (exit ${r.code}: ${r.err.trim()})`);
    assert(run(['src', '--no-render', '--no-progress', '--config', cfg], dir).code === 0, 'the config alone is read (failOn never)');
  });

  /* ── 8. the same badge kind twice ────────────────────────────────────── */

  /* lib/config.mjs refuses a `badge` list naming one kind twice; the flags
   * accepted it and wrote the same badge to two files. */
  section('round 2026-10-12: --badge twice on the command line is refused like in the config', () => {
    const dir = corpus('a2l-badgetwice-');
    for (const flag of ['--badge', '--badge-corpus']) {
      const r = run(['src', ...base, flag, 'a.json', flag, 'b.json'], dir);
      assert(r.code === 2 && r.err.includes(`${flag} given twice`) && /one file per badge kind/.test(r.err),
        `${flag} twice: exit 2 (exit ${r.code}: ${r.err.trim()})`);
      assert(!fs.existsSync(path.join(dir, 'a.json')) && !fs.existsSync(path.join(dir, 'b.json')), `${flag}: no badge was written`);
    }
    const both = run(['src', ...base, '--badge', 'a.json', '--badge-corpus', 'b.json'], dir);
    assert(both.code !== 2 && fs.existsSync(path.join(dir, 'a.json')) && fs.existsSync(path.join(dir, 'b.json')),
      `one of each kind is still the way to ask for both (exit ${both.code})`);
  });

  /* ── 9. flags with nothing to act on ─────────────────────────────────── */

  section('round 2026-10-12: --cache-location without --cache and --stdin-filename without --stdin are refused', () => {
    const dir = corpus('a2l-noop-');
    const loc = run(['src', ...base, '--cache-location', 'c.json'], dir);
    assert(loc.code === 2 && /--cache-location has no effect without --cache/.test(loc.err), `--cache-location alone: exit 2 (exit ${loc.code}: ${loc.err.trim()})`);
    const withCache = run(['src', ...base, '--cache', '--cache-location', 'c.json'], dir);
    assert(withCache.code !== 2 && fs.existsSync(path.join(dir, 'c.json')), `with --cache it is the cache file (exit ${withCache.code})`);
    // the config's "cache": true switches the cache on too, so the location is judged after it
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.json'), '{ "cache": true }');
    const cfg = run(['src', '--no-render', '--no-progress', '--cache-location', 'd.json'], dir);
    assert(cfg.code !== 2 && fs.existsSync(path.join(dir, 'd.json')), `with "cache": true in the config it is accepted (exit ${cfg.code}: ${cfg.err.trim()})`);
    const name = run(['src', ...base, '--stdin-filename', 'x.clas.abap'], dir);
    assert(name.code === 2 && /--stdin-filename has no effect without --stdin/.test(name.err), `--stdin-filename alone: exit 2 (exit ${name.code}: ${name.err.trim()})`);
  });
}
