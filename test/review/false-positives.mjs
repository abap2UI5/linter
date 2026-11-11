/*
 * False positives in a baseline - the `falsePositives` block
 * (lib/baseline.mjs), the issue built from a marked entry
 * (lib/false-positive.mjs) and the CLI around both: the note of a normal
 * run names the marked entries apart, `--report-false-positives` prints one
 * issue per key, `--update-baseline` keeps a mark as long as its entry
 * lives. See test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadBaseline, loadFalsePositives, applyBaseline, writeBaseline } from '../../lib/baseline.mjs';
import { falsePositiveIssue, sourceExcerpt, ISSUES_URL } from '../../lib/false-positive.mjs';

/* A class with one finding that needs no view: an access to the framework's
 * draft table. */
const SOURCE = `CLASS zcl_fp DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    METHODS read.
ENDCLASS.

CLASS zcl_fp IMPLEMENTATION.
  METHOD read.
    SELECT SINGLE * FROM z2ui5_t_01 INTO @DATA(ls_draft).
    DATA(text) = |a \`literal\` in a {
      ls_draft-id } template|.
  ENDMETHOD.
ENDCLASS.
`;
const KEY = 'src/zcl_fp.clas.abap|non-released-api||src/01|z2ui5_t_01';
const REASON = 'the table is read through a wrapper the framework releases';

export default function ({ section, assert, FIX, tempDir }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (cwd, args) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe', env: ENV }), err: '', code: 0 };
    } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
  };
  const project = (name, baseline) => {
    const dir = tempDir(name);
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'zcl_fp.clas.abap'), SOURCE);
    if (baseline) fs.writeFileSync(path.join(dir, 'abap2ui5lint-baseline.json'), JSON.stringify(baseline, null, 2));
    return dir;
  };
  const ARGS = ['src', '--all-classes', '--no-render', '--no-config'];

  section('false positives: the baseline block is read, validated and written back', () => {
    const dir = tempDir('fp-file');
    const file = path.join(dir, 'b.json');
    const write = (o) => fs.writeFileSync(file, JSON.stringify(o));
    write({ findings: { [KEY]: 1 } });
    assert(loadFalsePositives(file).size === 0, 'a baseline without the block marks nothing');
    write({ findings: { [KEY]: 1 }, falsePositives: { [KEY]: `  ${REASON} ` } });
    assert(loadBaseline(file).get(KEY) === 1, 'the entries load as before');
    assert(loadFalsePositives(file).get(KEY) === REASON, 'the reason is read, trimmed');
    const throws = (o, re, what) => {
      write(o);
      let msg = '';
      try { loadBaseline(file); } catch (e) { msg = e.message; }
      assert(re.test(msg), `${what} (${msg || 'no error'})`);
    };
    throws({ findings: { [KEY]: 1 }, falsePositives: { 'x|y|||': REASON } }, /not in 'findings'/, 'a mark on a key that is no entry is refused');
    throws({ findings: { [KEY]: 1 }, falsePositives: { [KEY]: ' ' } }, /non-empty string/, 'a mark without a reason is refused');
    throws({ findings: { [KEY]: 1 }, falsePositives: [KEY] }, /must be an object/, 'the block has to be an object');
    writeBaseline(file, new Map([[KEY, 1], ['other|rule|||', 2]]), { falsePositives: new Map([[KEY, REASON], ['gone|rule|||', 'x']]) });
    const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(JSON.stringify(back.falsePositives) === JSON.stringify({ [KEY]: REASON }), 'written for the keys that are still entries, and only those');
    writeBaseline(file, new Map([[KEY, 1]]));
    assert(!('falsePositives' in JSON.parse(fs.readFileSync(file, 'utf8'))), 'no block where nothing is marked - the file of every existing baseline is unchanged');
  });

  section('false positives: applyBaseline names the findings a marked entry suppressed', () => {
    const finding = { type: 'non-released-api', member: 'src/01', value: 'z2ui5_t_01', line: 9, column: 26, message: 'm' };
    const results = [{ file: path.resolve('src/zcl_fp.clas.abap'), findings: [{ ...finding }, { type: 'other', value: 'v' }] }];
    const r = applyBaseline(results, new Map([[KEY, 1]]), process.cwd(), { falsePositives: new Map([[KEY, REASON]]) });
    assert(r.suppressed === 1 && r.falsePositives.length === 1 && r.falsePositives[0].reason === REASON
      && r.falsePositives[0].finding.line === 9, 'the suppressed finding comes back with its reason');
    const plain = applyBaseline([{ file: path.resolve('src/zcl_fp.clas.abap'), findings: [{ ...finding }] }], new Map([[KEY, 1]]));
    assert(plain.suppressed === 1 && plain.falsePositives.length === 0, 'without marks the result is what it was, plus an empty list');
  });

  section('false positives: the issue carries the template\'s sections and a link that opens it', () => {
    const finding = { type: 'non-released-api', member: 'src/01', value: 'z2ui5_t_01', line: 9, column: 26, severity: 'warning', message: 'z2ui5_t_01 is not part of the released API' };
    const issue = falsePositiveIssue({ finding, file: 'src/zcl_fp.clas.abap', reason: REASON, source: SOURCE, version: '0.9.0', ui5: '1.71', distribution: 'openui5' });
    assert(issue.title === 'non-released-api on z2ui5_t_01', `the title names the rule and what it flagged (${issue.title})`);
    for (const heading of ['**Rule id**', '**The finding**', '**The source it reported**', '**Why it is correct**', '**Version**']) {
      assert(issue.body.includes(heading), `the body has the template's ${heading}`);
    }
    assert(issue.body.includes('9:26  warning  z2ui5_t_01 is not part of the released API  non-released-api'), 'the finding as it was printed');
    assert(issue.body.includes('SELECT SINGLE * FROM z2ui5_t_01') && issue.body.includes(REASON)
      && issue.body.includes('@abap2ui5/linter 0.9.0, ui5 1.71, distribution openui5'), 'source, reason and versions');
    const fenceLine = issue.body.split('\n').find((l) => /^`+abap$/.test(l));
    assert(fenceLine && fenceLine.length - 4 > 1, `the fence is longer than the backticks inside the excerpt (${fenceLine})`);
    const url = new URL(issue.url);
    assert(issue.url.startsWith(`${ISSUES_URL}?`) && url.searchParams.get('labels') === 'false-positive'
      && url.searchParams.get('template') === 'false-positive.md' && url.searchParams.get('title') === issue.title
      && url.searchParams.get('body') === issue.body, 'the link prefills the template with title and body');
    const long = falsePositiveIssue({ finding, reason: REASON, source: `${'x'.repeat(2000)}\n`.repeat(12) });
    assert(long.url.length < 7000 && !new URL(long.url).searchParams.get('body').includes('xxxx')
      && long.body.includes('xxxx'), 'an excerpt too long for a URL stays in the printed body and leaves the link');
    assert(sourceExcerpt(SOURCE, 9, 1).split('\n').length === 3 && sourceExcerpt(SOURCE, 999) === '' && sourceExcerpt(null, 3) === '',
      'the excerpt is the lines around the finding, nothing for a line that is not there');
  });

  section('false positives: the run names the marked entries, --report-false-positives prints the issue', () => {
    const dir = project('fp-cli', { findings: { [KEY]: 1 }, falsePositives: { [KEY]: REASON } });
    const normal = run(dir, ARGS);
    assert(normal.code === 0 && /1 finding\(s\) suppressed/.test(normal.out)
      && /1 of them marked as false positives/.test(normal.out) && /--report-false-positives/.test(normal.out),
    `the note counts them apart and names the command (exit ${normal.code}: ${normal.out.trim().split('\n').pop()})`);
    const report = run(dir, ['src', '--all-classes', '--no-config', '--report-false-positives']);
    assert(report.code === 0 && report.out.includes('# non-released-api on z2ui5_t_01')
      && report.out.includes('**Why it is correct**') && report.out.includes(REASON)
      && report.out.includes(`file it: ${ISSUES_URL}?`) && /nothing has been sent/.test(report.out),
    `the issue, its link and the promise that nothing left the machine (exit ${report.code}: ${report.err.trim()})`);
    assert(!/Success|problem/.test(report.out), 'no lint report beside it');
    const json = run(dir, [...ARGS, '--format', 'json']);
    assert(JSON.parse(json.out).baseline?.falsePositives === 1, 'the json document counts them in its baseline block');
  });

  section('false positives: nothing marked, no baseline, and the flags it cannot stand beside', () => {
    const unmarked = project('fp-none', { findings: { [KEY]: 1 } });
    const none = run(unmarked, ['src', '--all-classes', '--no-config', '--report-false-positives']);
    assert(none.code === 0 && /no baseline entry .* is marked as a false positive/.test(none.out), `nothing marked is said, exit 0 (${none.out.trim()})`);
    assert(!/marked as false positives/.test(run(unmarked, ARGS).out), 'an unmarked baseline keeps its old note');
    const bare = project('fp-bare', null);
    const noBaseline = run(bare, ['src', '--all-classes', '--no-config', '--report-false-positives']);
    assert(noBaseline.code === 2 && /needs a baseline/.test(noBaseline.err), `no baseline is exit 2 (exit ${noBaseline.code})`);
    for (const flag of [['--update-baseline'], ['--fix'], ['--format', 'json']]) {
      const r = run(unmarked, ['src', '--report-false-positives', ...flag]);
      assert(r.code === 2 && /--report-false-positives cannot be combined/.test(r.err), `refused beside ${flag.join(' ')} (exit ${r.code})`);
    }
  });

  section('false positives: --update-baseline keeps a mark while its entry lives', () => {
    const dir = project('fp-update', { findings: { [KEY]: 1 }, falsePositives: { [KEY]: REASON } });
    const file = path.join(dir, 'abap2ui5lint-baseline.json');
    assert(run(dir, [...ARGS, '--update-baseline']).code === 0 && loadFalsePositives(file).get(KEY) === REASON, 'the finding is still there: the mark stays');
    fs.writeFileSync(path.join(dir, 'src', 'zcl_fp.clas.abap'), SOURCE.replace('z2ui5_t_01', 'zmy_table'));
    assert(run(dir, [...ARGS, '--update-baseline']).code === 0 && loadFalsePositives(file).size === 0
      && loadBaseline(file).size === 0, 'the finding is gone: entry and mark go together');
  });
}
