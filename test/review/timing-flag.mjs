/*
 * --timing: where a check spends its time (lib/timing.mjs). Not a question
 * about speed - test/timing.mjs asks that - but about the accounting: every
 * unit rule under its own name, the rules that share a function under the
 * pass they run in, the rest of checkAbapRules( ) as one entry, so the parts
 * add up to the whole. See test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { UNIT_RULES } from '../../lib/rules/index.mjs';
import { slowest } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const run = (cwd, args) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' } }), code: 0 };
    } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
  };

  section('timing: a result carries where its check spent its time, and only when asked', () => {
    const src = fs.readFileSync(f('abaphygiene.clas.abap'), 'utf8');
    const plain = checkAbapSource(src, { render: false });
    assert(plain.timings === undefined, 'without timing there is nothing to carry');
    const r = checkAbapSource(src, { render: false, timing: true });
    const labels = Object.keys(r.timings);
    assert(labels.every((k) => /^(reconstruct|properties|portable|abap-model|rule:[a-z0-9-]+|pass:[a-z-]+( \(other\))?)$/.test(k)),
      `every label is one of the known kinds (${labels.filter((k) => !/^(reconstruct|properties|portable|abap-model|rule:|pass:)/.test(k)).join(', ') || 'all'})`);
    const classRules = UNIT_RULES.filter((u) => u.scope === 'class').map((u) => `rule:${u.id}`);
    assert(classRules.every((k) => k in r.timings), 'each class-scoped unit rule has its own entry');
    assert(['reconstruct', 'abap-model', 'pass:lifecycle', 'rule:control-state-lost-on-rebuild'].every((k) => k in r.timings),
      'the reconstruction, the model and the separable passes have theirs');
    assert(!('abap-rules' in r.timings) && Object.values(r.timings).every((ms) => typeof ms === 'number' && ms >= 0),
      'the total of checkAbapRules( ) is split, never reported beside its parts');
    assert(JSON.stringify(r.findings.map((x) => x.type)) === JSON.stringify(plain.findings.map((x) => x.type)), 'timing changes no finding');
  });

  section('timing: slowest( ) ranks the entries and gives each its share', () => {
    const line = slowest(new Map([['rule:a', 10], ['pass:b', 1500], ['reconstruct', 490]]), 2);
    assert(line === 'pass:b 1.5s (75%), reconstruct 490ms (25%)', `the two largest, in seconds or milliseconds, with shares of the whole (${line})`);
  });

  section('timing: --timing adds the slowest line and stats.timings, and leaves the cache alone', () => {
    const dir = tempDir('timing-cli');
    fs.mkdirSync(path.join(dir, 'src'));
    for (const n of ['abaphygiene.clas.abap', 'good.clas.abap']) fs.copyFileSync(f(n), path.join(dir, 'src', n));
    const text = run(dir, ['src', '--no-render', '--no-config', '--all-classes', '--timing']);
    assert(/^slowest\s+[^,]+? \d+(ms|\.\ds) \(\d+%\)/m.test(text.out), `the summary has a slowest line (exit ${text.code})`);
    const one = run(dir, ['src/good.clas.abap', '--no-render', '--no-config', '--timing']);
    assert(/^slowest /m.test(one.out), '--timing shows the summary for one file too');
    const json = JSON.parse(run(dir, ['src', '--no-render', '--no-config', '--all-classes', '--timing', '--format', 'json']).out);
    const t = json.stats.timings;
    assert(Object.keys(t).length > 10 && Object.values(t).every((v, i, all) => i === 0 || all[i - 1] >= v), 'stats.timings, slowest first');
    const quiet = JSON.parse(run(dir, ['src', '--no-render', '--no-config', '--all-classes', '--format', 'json']).out);
    assert(JSON.stringify(quiet.stats.timings) === '{}', 'and {} without the flag');
    run(dir, ['src', '--no-render', '--no-config', '--all-classes', '--timing', '--cache']);
    assert(!fs.existsSync(path.join(dir, '.abap2ui5lintcache')), 'a timed run neither reads nor writes the cache - a replayed verdict took no time');
  });
}
