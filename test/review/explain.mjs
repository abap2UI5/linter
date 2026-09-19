/*
 * --explain: the rule reference, in the terminal. See test/review/README.md
 * for the harness.
 *
 * Five sections, all but one through a spawned CLI: a known id prints what
 * RULE_DOCS holds for it (summary, detail, the before/after pair, the card's
 * URL) and several ids print in the order given; the bare flag lists every
 * id in the page's order; an unknown id is exit 2 with the one did-you-mean
 * lib/suggest.mjs makes, or a pointer at the list where there is none; a
 * path or any other option on the line is refused with exit 2 - --init
 * included, which must not answer first. The footer is a pure function
 * (`explainFooter`) and is tested as one, plus the negative through the CLI
 * (a piped stderr is not a terminal); where util-linux `script` is installed
 * the terminal case runs for real as well.
 */
import cp from 'child_process';
import path from 'path';
import { RULES, RENDER_RULE } from '../../lib/findings.mjs';
import { RULE_DOCS, CATEGORIES, ruleUrl } from '../../lib/rule-docs.mjs';
import { explainFooter, ruleIndex } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, checkFiles }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env: ENV }), err: '', code: 0 };
    } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
  };
  // the terminal wraps a paragraph between words; compare with the whitespace folded
  const flat = (s) => String(s).replace(/\s+/g, ' ').trim();

  section('explain: a known id prints its summary, detail, example pair and card URL', () => {
    const id = 'duplicate-property';
    const doc = RULE_DOCS[id];
    const r = run(['--explain', id]);
    assert(r.code === 0 && r.err === '', `explain: exit 0 and nothing on stderr (exit ${r.code}: ${r.err.trim()})`);
    const text = flat(r.out);
    assert(/^duplicate-property\s+\(error\)/.test(r.out), `explain: the first line is the id with its default severity (${r.out.split('\n')[0]})`);
    assert(text.includes(flat(doc.summary)), 'explain: the summary line is printed');
    assert(text.includes(flat(doc.detail)), 'explain: the detail paragraph is printed, wrapped between words');
    assert(r.out.includes(`reported:\n    ${doc.example.split('\n')[0]}`) && r.out.includes(`fixed:\n    ${doc.remedy.split('\n')[0]}`),
      'explain: the before/after pair is printed as code, under "reported:" and "fixed:"');
    assert(r.out.includes(ruleUrl(id)), `explain: the card URL is printed (${ruleUrl(id)})`);
    assert(!/undefined|\[object/.test(r.out), 'explain: no field is missing from the rendering');

    // a fixable rule says so, and carries its fix note
    const fix = run(['--explain', 'unknown-control']);
    assert(/^unknown-control\s+\(error, --fix\)/.test(fix.out), 'explain: a fixable rule is marked --fix on its first line');
    assert(flat(fix.out).includes(flat(`--fix: ${RULE_DOCS['unknown-control'].fixNote}`)), 'explain: the fix note is printed under the detail');

    // several ids, in the order given; the pseudo-rule is one of them
    const many = run(['--explain', 'render-error', 'unknown-control', id]);
    assert(many.code === 0, `explain: several ids in one call (exit ${many.code}: ${many.err.trim()})`);
    const at = (x) => many.out.indexOf(`${x}  (`);
    assert(at('render-error') === 0 && at('render-error') < at('unknown-control') && at('unknown-control') < at(id),
      'explain: the ids print in the order given, render-error (the page has a card for it) included');
    assert((many.out.match(/https:\/\/abap2ui5\.github\.io\/linter\/#/g) ?? []).length === 3, 'explain: one card URL per id');
    const twice = run(['--explain', id, id]);
    assert((twice.out.match(new RegExp(`^${id}  \\(`, 'gm')) ?? []).length === 1, 'explain: a repeated id prints once');
  });

  section('explain: no id lists every rule id with its summary in the page order', () => {
    const r = run(['--explain']);
    assert(r.code === 0 && r.err === '', `explain: the bare flag is exit 0 (exit ${r.code}: ${r.err.trim()})`);
    const lines = r.out.split('\n');
    const listed = lines.filter((l) => /^  [a-z0-9-]+\s{2,}\S/.test(l)).map((l) => l.trim().split(/\s+/)[0]);
    const missing = RULES.filter((id) => !listed.includes(id));
    assert(!missing.length, `explain: every RULES id is listed (missing: ${missing.join(', ') || 'none'})`);
    assert(listed.includes(RENDER_RULE), 'explain: render-error is listed too, as the page lists it');
    assert(listed.length === RULES.length + 1 && new Set(listed).size === listed.length,
      `explain: nothing else is listed and nothing twice (${listed.length} lines for ${RULES.length + 1} ids)`);
    for (const id of ['unknown-control', 'chain-house-layout', RENDER_RULE]) {
      const line = lines.find((l) => l.startsWith(`  ${id} `));
      assert(line && flat(line).includes(flat(RULE_DOCS[id].summary)), `explain: ${id} carries its summary on its line`);
    }
    /* The page's order, and this is the same computation the generator makes
     * (PAGE_RULES sorted, then filtered per CATEGORY in declaration order),
     * so the terminal and the browser put a rule under the same heading. */
    const expected = CATEGORIES.flatMap((cat) => [...RULES, RENDER_RULE].sort().filter((id) => RULE_DOCS[id].category === cat.id));
    assert(listed.join(' ') === expected.join(' '), 'explain: the ids come in the rules page order - category by category, alphabetical within one');
    const index = ruleIndex();
    assert(index.flatMap((c) => c.ids).join(' ') === expected.join(' ') && index.every((c, i) => c.id === CATEGORIES[i].id),
      'explain: ruleIndex( ) is that order, with the category ids alongside');
    for (const cat of CATEGORIES) {
      assert(lines.includes(cat.title), `explain: the category heading "${cat.title}" is printed`);
    }
    assert(/^\d+ rules - abap2ui5lint --explain <id> for one, https:\/\/abap2ui5\.github\.io\/linter\/ for the page$/m.test(r.out),
      'explain: the closing line says how to read one, and where the page is');
  });

  section('explain: an unknown id is exit 2 with the one did-you-mean, or a pointer at the list', () => {
    const r = run(['--explain', 'Duplicate_Property']);
    assert(r.code === 2 && r.out === '', `explain: a misspelt id is exit 2 with nothing on stdout (exit ${r.code})`);
    assert(/no rule 'Duplicate_Property' - did you mean duplicate-property\?/.test(r.err),
      `explain: the id it can only have meant, up to case and separators (${r.err.trim()})`);
    const nope = run(['--explain', 'unknown-controll']);
    assert(nope.code === 2 && /no rule 'unknown-controll'/.test(nope.err) && !/did you mean/.test(nope.err),
      `explain: a real typo is not guessed at (${nope.err.trim()})`);
    assert(/abap2ui5lint --explain` lists every id/.test(nope.err) && nope.err.includes('https://abap2ui5.github.io/linter/'),
      'explain: …and is pointed at the list and the page instead');
    // one bad id among good ones: nothing is half printed
    const mixed = run(['--explain', 'duplicate-property', 'no-such-rule']);
    assert(mixed.code === 2 && mixed.out === '' && /no rule 'no-such-rule'/.test(mixed.err),
      'explain: every id is checked before anything prints');
  });

  section('explain: a path or any other option on the line is refused', () => {
    for (const [args, what] of [
      [[f('good.clas.abap'), '--explain', 'duplicate-property'], 'a path before it'],
      [['--explain', 'duplicate-property', '--no-render'], 'a run option'],
      [['--explain', '--json'], 'a format'],
      [['--no-config', '--explain'], 'an option before the bare flag'],
      [['--init', '--explain', 'duplicate-property'], '--init, which must not answer first'],
      [['--explain', 'duplicate-property', '--watch'], '--watch'],
    ]) {
      const r = run(args);
      assert(r.code === 2 && r.out === '' && /--explain is a documentation command/.test(r.err),
        `explain: refused with exit 2 and a sentence - ${what} (exit ${r.code}: ${r.err.trim().split('\n')[0]})`);
    }
    const r = run(['--init', '--explain', 'duplicate-property']);
    assert(r.code === 2 && !/wrote abap2ui5lint\.jsonc/.test(r.out), 'explain: --init wrote nothing on the way to the refusal');
    assert(/not --init$/m.test(r.err) && /not src \(a path\)$/m.test(run(['src', '--explain', 'duplicate-property']).err),
      'explain: the refusal names what it found, and says when that was a path');
    // a bare word BEHIND the flag is an id, not a path - the ids run up to the
    // next option - so `--explain duplicate-property src` is an unknown id
    const word = run(['--explain', 'duplicate-property', 'src']);
    assert(word.code === 2 && word.out === '' && /no rule 'src'/.test(word.err),
      `explain: a word behind the flag is read as a rule id (exit ${word.code}: ${word.err.trim()})`);
  });

  section('explain: the footer names the command for the ids a run reported', async () => {
    const results = await checkFiles([f('dumps.clas.abap')], { render: false });
    const reported = ['attribute-without-element', 'duplicate-property'];
    const tty = { tty: true };
    const line = explainFooter(results, tty);
    assert(line === `abap2ui5lint: what each id means, in the terminal: abap2ui5lint --explain ${reported.join(' ')}`,
      `footer: one line naming abap2ui5lint --explain with the ids reported, in report order (${line})`);
    assert(explainFooter(results, { tty: false }) === null, 'footer: nothing where stderr is not a terminal');
    assert(explainFooter(results, { ...tty, quiet: true }) === null, 'footer: nothing in --quiet');
    for (const format of ['json', 'markdown', 'sarif', 'checkstyle', 'junit']) {
      assert(explainFooter(results, { ...tty, format }) === null, `footer: nothing beside --format ${format}`);
    }
    assert(explainFooter(results, { ...tty, format: 'stylish' }) === line, 'footer: the stylish report is the one it follows');
    const clean = await checkFiles([f('good.clas.abap')], { render: false });
    assert(explainFooter(clean, tty) === null, 'footer: nothing after a clean run - there is no id to explain');
    // more than three distinct ids: the first three and "..."
    const many = await checkFiles([f('abaphygiene.clas.abap'), f('dumps.clas.abap')], { render: false });
    const ids = [...new Set(many.flatMap((r) => r.findings.map((x) => x.type)))];
    assert(ids.length > 3, `footer: the fixture pair reports more than three rules (${ids.length})`);
    const cut = explainFooter(many, tty);
    const named = cut.replace(/^.*--explain /, '').split(' ');
    assert(named.length === 4 && named[3] === '...' && named.slice(0, 3).every((id) => ids.includes(id)),
      `footer: the first three ids and "..." beyond (${cut})`);
    const wide = explainFooter(many, { ...tty, limit: 100 }).replace(/^.*--explain /, '').split(' ');
    assert(wide.length === ids.length && !wide.includes('...') && ids.every((id) => wide.includes(id)),
      `footer: the cut is a parameter - wide enough, every id is named and nothing is elided (${wide.length} of ${ids.length})`);

    // through the CLI: a piped stderr is not a terminal, so the report is
    // byte for byte what it was and stderr stays empty
    const r = run([f('dumps.clas.abap'), '--no-render', '--no-config']);
    assert(r.code === 1 && r.err === '' && /^2 problems /m.test(r.out),
      `footer: nothing on a piped stderr (exit ${r.code}, stderr: ${JSON.stringify(r.err)})`);

    /* …and on a real terminal. util-linux `script` lends the child a pty;
     * where it is not installed (macOS ships a BSD script with other flags,
     * Windows none) the case is covered by the function above and said so. */
    let hasScript = false;
    try { hasScript = /util-linux/.test(cp.execFileSync('script', ['--version'], { encoding: 'utf8', stdio: 'pipe' })); } catch { /* absent */ }
    if (hasScript) {
      let typed = '';
      try {
        typed = cp.execFileSync('script', ['-qec', `node ${JSON.stringify(CLI)} ${JSON.stringify(f('dumps.clas.abap'))} --no-render --no-config --no-progress`, '/dev/null'],
          { encoding: 'utf8', stdio: 'pipe', env: ENV });
      } catch (e) { typed = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
      assert(typed.includes(`abap2ui5lint --explain ${reported.join(' ')}`),
        `footer: on a terminal the line follows the report (${typed.split('\n').filter((l) => l.includes('--explain')).join(' | ') || 'no footer in ' + typed.length + ' chars'})`);
      assert(typed.indexOf('2 problems') < typed.indexOf('--explain'), 'footer: …after the count line, not before the report');
    } else {
      assert(true, 'footer: util-linux script not installed - the terminal case is covered by the function only');
    }
  });
}
