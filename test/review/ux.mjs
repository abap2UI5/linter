/*
 * Directive validation, remedy wording and CLI UX - the 2026-09-25 round. See
 * test/review/README.md for the harness.
 *
 * Three groups. The directives: a directive naming no rule and a directive
 * that suppressed nothing are findings now (`unknown-directive-rule`,
 * `unused-directive`), with the did-you-mean and the deleting fix, and both
 * answer to the `rules` block and to a directive like any other id. The
 * wording: three remedies that sent the reader the wrong way. The CLI: what
 * a dry run would fix, which config a verdict was reached under, the config
 * error's pointer, `--explain` with a path, the `--all-classes` summary and
 * `--help`. The CLI sections spawn the real thing, the way explain.mjs does.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { applyFixes } from '../../lib/fix.mjs';
import { describe, RULES } from '../../lib/findings.mjs';
import { RULE_DOCS } from '../../lib/rule-docs.mjs';
import { loadConfig } from '../../lib/config.mjs';
import { playgroundSource } from '../../scripts/generate-rules-page.mjs';

/* A complete app class with the given lines inside its Button - every gate
 * runs, and a section adds the one thing it asks about. */
const frame = ({ attrs = '', main = '', pre = '' } = {}) =>
  `${pre}CLASS zcl_review_ux DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    INTERFACES z2ui5_if_app.\n    DATA mv_text TYPE string.\n`
  + '  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\n'
  + 'CLASS zcl_review_ux IMPLEMENTATION.\n\n  METHOD z2ui5_if_app~main.\n\n'
  + main
  + '    DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).\n'
  + '    view->ele( n = `View` ns = `mvc`\n'
  + '        )->a( n = `xmlns`     v = `sap.m`\n'
  + '        )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`\n'
  + '        )->ele( `Page`\n'
  + '          )->tag( `Button`\n'
  + '            )->a( n = `text` v = client->_bind( mv_text )\n'
  + attrs
  + '        )->end( ).\n\n'
  + '    client->view_display( view->stringify( ) ).\n\n  ENDMETHOD.\n\nENDCLASS.\n';

export default async function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd) => {
    try {
      return { out: cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env: ENV, cwd }), err: '', code: 0 };
    } catch (e) { return { out: e.stdout ?? '', err: e.stderr ?? '', code: e.status }; }
  };
  const opts = { render: false, properties: true, minUi5: '1.120' };
  const judge = (src, o = {}) => checkAbapSource(src, { ...opts, ...o }).findings;
  const of = (src, type, o) => judge(src, o).filter((x) => x.type === type);
  const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

  /* ── directives ─────────────────────────────────────────────────────── */

  section('directives: the fixture carries every shape, each reported where the directive stands', () => {
    const src = fs.readFileSync(f('directiverules.clas.abap'), 'utf8');
    const found = judge(src);
    const unknown = found.filter((x) => x.type === 'unknown-directive-rule');
    const unused = found.filter((x) => x.type === 'unused-directive');
    assert(unknown.map((x) => x.value).join(',') === 'Unknown-Property,binding-to-locl,render-error',
      `three ids no rule has, in source order (${unknown.map((x) => x.value).join(',')})`);
    assert(unknown.every((x) => x.severity === 'warning'), 'unknown-directive-rule is a warning');
    assert(unknown[0].suggestion === 'unknown-property' && unknown[0].fixes?.length === 1
      && src.slice(unknown[0].fixes[0].start, unknown[0].fixes[0].end) === 'Unknown-Property',
      'a case typo names the id it can only mean and the fix rewrites exactly that id');
    assert(!unknown[1].suggestion && !unknown[1].fixes && /--explain lists every id/.test(unknown[1].message),
      'binding-to-locl is no id up to case: no suggestion, no fix (no edit distance), and a pointer at the list');
    assert(/render error has no source line/.test(unknown[2].message) && !unknown[2].suggestion,
      'render-error is refused with its own reason: a directive cannot address the render gate');
    assert(unknown.every((x) => x.line === lineOf(src, x.value === 'render-error' ? 'next-line render-error' : `next-line ${x.value}`)
      && src.split('\n')[x.line - 1].slice(x.column - 1).startsWith(x.value)),
      'each unknown id is reported on its directive line, at the id itself');
    // the finding the typo'd directive was written for is still reported: nothing was waived
    assert(of(src, 'unknown-property').map((x) => x.member).join(',') === 'typo1,typo2', 'the two mistyped directives waive nothing');

    assert(unused.map((x) => x.member).join(',') === 'abap2ui5lint-disable-next-line,abap2ui5lint-disable-line,abap2ui5lint-disable',
      `a dead -next-line, a dead -line and a dead bare block (${unused.map((x) => x.member).join(',')})`);
    assert(unused.every((x) => x.severity === 'hint'), 'unused-directive is a hint');
    assert(unused[0].value === 'unknown-property' && unused[1].value === 'invalid-property-value, unknown-property' && unused[2].value === '',
      'the message names the ids that did not report; a bare directive names none');
    assert(unused[0].line === lineOf(src, 'dead: the line below') && unused[0].column === src.split('\n')[unused[0].line - 1].indexOf('"') + 1,
      'the finding sits on the comment');
    // the fixes: a directive alone on its line goes with the line, one behind code goes alone, a block stays
    const out = applyFixes(src, found).output;
    assert(!/dead: the line below/.test(out) && out.split('\n').length === src.split('\n').length - 1,
      '--fix deletes the dead -next-line directive together with its line');
    assert(/v = `Emphasized`\n/.test(out) && !/both dead/.test(out), '--fix deletes the dead -line comment and leaves its code');
    assert(/" abap2ui5lint-disable\n/.test(out) && /" abap2ui5lint-enable\n/.test(out) && !unused[2].fixes,
      'a dead block is reported without a fix: deleting half a pair would be a guess');
    assert(/next-line unknown-property -- a case typo/.test(out), 'the case typo is rewritten in place');
    const after = judge(out);
    assert(!after.some((x) => x.type === 'unused-directive' && x.fixes) && after.filter((x) => x.type === 'unknown-directive-rule').length === 2,
      'after --fix only the unfixable findings remain (the block, binding-to-locl, render-error)');
  });

  section('directives: a directive of which only some ids are dead is reported per id, without a fix', () => {
    const attrs = '            " abap2ui5lint-disable-next-line unknown-property, duplicate-id\n'
      + '            )->a( n = `typo` v = `x`\n';
    const src = frame({ attrs });
    const unused = of(src, 'unused-directive');
    assert(unused.length === 1 && unused[0].value === 'duplicate-id' && !unused[0].fixes,
      `duplicate-id is named as dead, unknown-property is not, and nothing is trimmed out of the list (${JSON.stringify(unused.map((x) => [x.value, x.fixes]))})`);
    assert(of(src, 'unknown-property').length === 0, 'the live half still waives');
  });

  section('directives: the two new ids answer to the rules block and to a directive like any other', () => {
    const dead = '            " abap2ui5lint-disable-next-line unknown-property\n            )->a( n = `type` v = `Emphasized`\n';
    const typo = '            " abap2ui5lint-disable-next-line Unknown-Property\n            )->a( n = `type` v = `Emphasized`\n';
    assert(of(frame({ attrs: dead }), 'unused-directive').length === 1 && of(frame({ attrs: typo }), 'unknown-directive-rule').length === 1,
      'premise: each shape reports once');
    assert(of(frame({ attrs: dead }), 'unused-directive', { rules: { 'unused-directive': false } }).length === 0
      && of(frame({ attrs: typo }), 'unknown-directive-rule', { rules: { 'unknown-directive-rule': false } }).length === 0,
      '"unused-directive": false / "unknown-directive-rule": false switch them off');
    assert(of(frame({ attrs: dead }), 'unused-directive', { rules: { 'unused-directive': 'warning' } })[0]?.severity === 'warning',
      'and a severity override lands on them');
    // a directive that NAMES the rule may waive its own finding - the way to say "I know"
    const named = frame({ attrs: dead, main: '    " abap2ui5lint-disable unused-directive\n' });
    assert(of(named, 'unused-directive').length === 0, '" abap2ui5lint-disable unused-directive waives the hint without reporting itself');
    const nextLine = frame({ attrs: `            " abap2ui5lint-disable-next-line unused-directive\n${dead}` });
    assert(of(nextLine, 'unused-directive').length === 0, 'a -next-line unused-directive above a dead directive waives it, and is used by doing so');
    const known = frame({ attrs: typo, main: '    " abap2ui5lint-disable unknown-directive-rule\n' });
    assert(of(known, 'unknown-directive-rule').length === 0 && of(known, 'unused-directive').length === 0,
      'the same for unknown-directive-rule');
    // a BARE directive cannot excuse its own finding: a catch-all that satisfied itself would never be reported
    const bare = frame({ main: '    " abap2ui5lint-disable\n' });
    const unusedBare = of(bare, 'unused-directive');
    assert(unusedBare.length === 1 && unusedBare[0].member === 'abap2ui5lint-disable' && unusedBare[0].line === lineOf(bare, '" abap2ui5lint-disable'),
      `a bare block that suppressed nothing is reported on its own line (${unusedBare.map((x) => x.line)})`);
    const bareLine = frame({ attrs: '            )->a( n = `type` v = `Emphasized`   " abap2ui5lint-disable-line\n' });
    assert(of(bareLine, 'unused-directive').length === 1 && of(bareLine, 'unused-directive')[0].fixes?.length === 1,
      'a bare -disable-line behind clean code is dead too, and the comment alone is deleted');
    // and a used one is silent, whatever its shape
    const used = frame({ attrs: '            " abap2ui5lint-disable-next-line\n            )->a( n = `typo` v = `x`\n' });
    assert(judge(used).filter((x) => x.type.endsWith('-directive') || x.type === 'unknown-property').length === 0,
      'a bare -next-line that waived a finding is used and silent');
  });

  section('directives: XML sources are judged the same way, inside their comments', () => {
    // `Emphasized` is valid (a directive above it is dead), `Emphasised` is not (a directive above it has work)
    const view = (line, type = 'Emphasized') => `<mvc:View xmlns="sap.m" xmlns:mvc="sap.ui.core.mvc">\n  ${line}\n  <Button type="${type}" text="x"/>\n</mvc:View>\n`;
    const dead = checkXmlSource(view('<!-- abap2ui5lint-disable-next-line invalid-property-value -->'), opts).findings;
    assert(dead.length === 1 && dead[0].type === 'unused-directive' && dead[0].line === 2 && dead[0].column === 3 && dead[0].fixes?.length === 1,
      `an XML directive that waives nothing is reported at its comment (${JSON.stringify(dead.map((x) => [x.type, x.line, x.column]))})`);
    const src = view('<!-- abap2ui5lint-disable-next-line invalid-property-value -->');
    assert(!/abap2ui5lint/.test(applyFixes(src, dead).output) && applyFixes(src, dead).output.split('\n').length === src.split('\n').length - 1,
      'the fix deletes the comment line');
    const typo = checkXmlSource(view('<!-- abap2ui5lint-disable-next-line Invalid-Property-Value -->', 'Emphasised'), opts).findings;
    assert(typo.some((x) => x.type === 'unknown-directive-rule' && x.suggestion === 'invalid-property-value') && typo.some((x) => x.type === 'invalid-property-value'),
      `a case typo in an XML directive is named, and waives nothing (${typo.map((x) => x.type).join(', ')})`);
    assert(checkXmlSource(view('<!-- abap2ui5lint-disable-next-line invalid-property-value -->', 'Emphasised'), opts).findings.length === 0,
      'spelled right, the directive waives the finding and is used');
    const behind = view('<Text text="x"/> <!-- abap2ui5lint-disable-line unknown-property -->');
    const hint = checkXmlSource(behind, opts).findings.find((x) => x.type === 'unused-directive');
    const cut = hint?.fixes ? applyFixes(behind, [hint]).output : '';
    assert(hint?.fixes && !/<!--/.test(cut) && /<Text text="x"\/>\n/.test(cut),
      'a comment behind an element is deleted alone, the element stays');
  });

  section('directives: both ids are registered, documented and their doc pair is honest', () => {
    for (const id of ['unknown-directive-rule', 'unused-directive']) {
      assert(RULES.includes(id) && RULE_DOCS[id]?.category === 'directives' && RULE_DOCS[id].fixNote, `${id} is a rule with a card and a fix note`);
    }
    // the unknown-directive-rule example is a case typo - so the --fix badge is honest, like unknown-control's
    const ex = judge(playgroundSource('unknown-directive-rule').source, { minUi5: '1.71' }).find((x) => x.type === 'unknown-directive-rule');
    assert(ex?.suggestion === 'unknown-property' && ex.fixes?.length === 1, 'the wrapped example carries the suggestion and the fix the fixNote promises');
  });

  /* ── remedy wording ─────────────────────────────────────────────────── */

  section('wording: three remedies that sent the reader the wrong way', () => {
    const nav = describe({ type: 'missing-on-navigated-branch' });
    assert(/check_on_navigated\( \) instead/.test(nav) && /check_on_init implies it/.test(nav) && /one-time seeding/.test(nav) && !/add ELSEIF/.test(nav),
      'missing-on-navigated-branch says: dispatch the display on check_on_navigated( ), not: add a second branch');
    const doc = RULE_DOCS['missing-on-navigated-branch'];
    assert(!/IF client->check_on_init/.test(doc.remedy) && /^IF client->check_on_navigated\( \)\./.test(doc.remedy) && /^IF client->check_on_init\( \)\./.test(doc.example),
      'its card shows the rename: the init dispatcher becomes a navigated one');
    const remedy = judge(playgroundSource('missing-on-navigated-branch', 'remedy').source, { minUi5: '1.71' }).map((x) => x.type);
    assert(!remedy.includes('redundant-init-display') && !remedy.includes('missing-on-navigated-branch'),
      `following the remedy does not run into redundant-init-display (${remedy.join(', ') || 'clean'})`);
    assert(/keep a `check_on_init\( \)` branch only for what must happen once/i.test(doc.detail), 'the detail says when an init branch stays');

    const ctl = RULE_DOCS['unknown-control'];
    assert(ctl.example.includes('`Objectstatus`') && ctl.remedy.includes('`ObjectStatus`'), 'unknown-control shows a case typo, the one shape the linter suggests');
    const ex = judge(playgroundSource('unknown-control').source, { minUi5: '1.71' }).find((x) => x.type === 'unknown-control');
    assert(ex?.suggestion === 'ObjectStatus' && ex.fixes?.length === 1, `the example is suggested and fixed, as the --fix badge says (${ex?.suggestion})`);

    assert(/one end\( \) more than the tree is deep/.test(describe({ type: 'excess-shut' })) && !/shut\( \)/.test(describe({ type: 'excess-shut' })),
      'excess-shut names the verb the developer wrote: end( )');
  });

  /* ── the two one-line rule changes ──────────────────────────────────── */

  section('event-arg-single-row-table: the value is cut between tokens, never inside a backtick literal', () => {
    const wire = (row) => frame({ attrs: `            )->a( n = \`press\` v = client->_event( val = \`GO\` t_arg = VALUE #( ( ${row} ) ) )\n` });
    const one = of(wire('`a literal well beyond forty characters, one token`'), 'event-arg-single-row-table');
    assert(one.length === 1 && one[0].value === '`a literal well beyond forty characters, one token`',
      `a single long literal is shown whole, no ellipsis inside it (${one[0]?.value})`);
    const many = of(wire('mv_text && `two words` && mv_text && `a longer literal here` && mv_text'), 'event-arg-single-row-table');
    assert(many.length === 1 && many[0].value.endsWith('…') && many[0].value.length <= 41
      && ((many[0].value.match(/`/g) ?? []).length % 2 === 0) && !/ …$/.test(many[0].value),
      `a long row is cut at a token boundary with an ellipsis, the literals whole (${many[0]?.value})`);
    assert(many[0].message.includes(many[0].value) && !/…[^…]*…/.test(many[0].message.split(' — ')[0]),
      'the message shows the cut value once and does not truncate it a second time');
    const short_ = of(wire('`${PRODUCT}`'), 'event-arg-single-row-table');
    assert(short_.length === 1 && short_[0].value === '`${PRODUCT}`' && !short_[0].value.includes('…'), 'a short row gets no ellipsis');
  });

  section('lifecycle-is-initial: a lifecycle call with an argument is read too', () => {
    const src = frame({ main: '    IF client->check_on_event( `GO` ) IS NOT INITIAL.\n      mv_text = `x`.\n    ENDIF.\n' });
    const found = of(src, 'lifecycle-is-initial');
    assert(found.length === 1 && found[0].member === 'check_on_event( )' && found[0].value === 'IS NOT INITIAL',
      `check_on_event( \`GO\` ) IS NOT INITIAL is reported (${JSON.stringify(found.map((x) => [x.member, x.value]))})`);
    assert(found[0].fixes?.length === 1 && /IF client->check_on_event\( `GO` \)\.\n/.test(applyFixes(src, found).output),
      'and the fix makes it the predicative call');
    assert(of(frame({ main: '    IF client->check_on_event( `GO` ).\n      mv_text = `x`.\n    ENDIF.\n' }), 'lifecycle-is-initial').length === 0,
      'the predicative form with an argument stays silent');
  });

  /* ── CLI ─────────────────────────────────────────────────────────────── */

  section('cli: --fix-dry-run lists what it would fix, one path:line:col rule-id per line, before the count', () => {
    const dir = tempDir('abap2ui5lint-ux-dry-');
    const target = path.join(dir, 'zcl_dry.clas.abap');
    fs.copyFileSync(f('directiverules.clas.abap'), target);
    const before = fs.readFileSync(target, 'utf8');
    const r = run([target, '--no-render', '--no-config', '--fix-dry-run']);
    const lines = r.out.split('\n');
    const count = lines.findIndex((l) => /^would fix 3 problem\(s\) in 1 file\(s\)/.test(l));
    assert(count === 3, `the count line follows the list (${count}: ${lines.slice(0, 5).join(' | ')})`);
    const listed = lines.slice(0, count);
    assert(listed.every((l) => new RegExp(`^${path.relative(process.cwd(), target).replace(/[.\\/]/g, '\\$&')}:\\d+:\\d+ [a-z-]+$`).test(l)),
      `each line is path:line:col rule-id (${listed.join(' | ')})`);
    assert(listed.map((l) => l.split(' ')[1]).join(',') === 'unknown-directive-rule,unused-directive,unused-directive'
      && listed.map((l) => Number(l.split(':')[1])).join(',') === '15,19,21',
      `the three fixable findings, in line order (${listed.join(' | ')})`);
    assert(fs.readFileSync(target, 'utf8') === before, 'and nothing was written');
    assert(!/^[^\n]*:\d+:\d+ [a-z-]+$/m.test(run([target, '--no-render', '--no-config', '--fix-dry-run', '--format', 'json']).out),
      'the list never lands inside --format json');
  });

  section('cli: the stylish report names the config it ran under and what its ignore dropped', () => {
    const dir = tempDir('abap2ui5lint-ux-cfg-');
    fs.mkdirSync(path.join(dir, 'src', 'generated'), { recursive: true });
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'src', 'zcl_good.clas.abap'));
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'src', 'generated', 'zcl_gen1.clas.abap'));
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(dir, 'src', 'generated', 'zcl_gen2.clas.abap'));
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "ignore": ["/generated/"], "render": false }\n');
    const r = run(['--stats'], dir);
    assert(r.code === 0, `premise: the corpus is clean (exit ${r.code}: ${r.err.trim()})`);
    const lines = r.out.split('\n');
    const success = lines.findIndex((l) => /^Success!/.test(l));
    assert(success >= 0 && lines[success + 1] === 'config: abap2ui5lint.jsonc' && lines[success + 2] === '2 files ignored by config',
      `config and ignore count follow the count line (${lines.slice(success, success + 3).join(' | ')})`);
    assert(/^sources +1 app class$/m.test(r.out), 'the ignored files were not read');
    // no ignore, no second line; --quiet, neither
    fs.writeFileSync(path.join(dir, 'abap2ui5lint.jsonc'), '{ "paths": ["src"], "render": false }\n');
    const plain = run([], dir).out;
    assert(/^config: abap2ui5lint\.jsonc$/m.test(plain) && !/ignored by config/.test(plain), 'without ignore patterns only the config line prints');
    assert(!/config:/.test(run(['--quiet'], dir).out), '--quiet drops it with the run summary');
    // never as prose inside a machine format, and not without a config
    const json = run(['--format', 'json'], dir).out;
    assert(!/config:/.test(json) && JSON.parse(json).files === 3, 'the json document is untouched');
    assert(!/config:/.test(run(['--format', 'markdown'], dir).out), 'and so is markdown');
    assert(!/config:/.test(run(['src', '--no-config', '--no-render'], dir).out), 'a run without a config says nothing about one');
  });

  section('cli: an unknown rule in the config points at --explain and the page, with the did-you-mean', () => {
    const dir = tempDir('abap2ui5lint-ux-badcfg-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    const threw = (text) => { fs.writeFileSync(cfg, text); try { loadConfig(cfg); return ''; } catch (e) { return e.message; } };
    const typo = threw('{ "rules": { "Unknown-Control": false } }');
    assert(/unknown rule 'Unknown-Control' in 'rules' - did you mean 'unknown-control'\?/.test(typo), `a case typo is named (${typo})`);
    assert(/abap2ui5lint --explain lists every id, and so does https:\/\/abap2ui5\.github\.io\/linter\//.test(typo) && !/README/.test(typo),
      'the pointer is --explain and the rules page, not the README table that no longer exists');
    const none = threw('{ "rules": { "no-such-rule": false } }');
    assert(/unknown rule 'no-such-rule' in 'rules' \(abap2ui5lint --explain/.test(none), `no guess where there is no case match (${none})`);
    assert(/did you mean 'render-error'/.test(threw('{ "rules": { "Render-Error": false } }')), 'the pseudo-rule is a candidate too');
    const cli = run(['src', '--no-render', '--config', cfg]);
    assert(cli.code === 2 && /did you mean 'render-error'/.test(cli.err), 'the CLI prints the same line and exits 2');
  });

  section('cli: --explain with a path says it takes rule ids only', () => {
    const r = run(['--explain', 'unknown-control', f('good.clas.abap')]);
    assert(r.code === 2 && r.out === '', `exit 2 and nothing on stdout (exit ${r.code})`);
    assert(/--explain takes rule ids only, no path and no other option/.test(r.err) && !/no rule '/.test(r.err),
      `the message says what --explain takes, not "no rule '<path>'" (${r.err.trim()})`);
    assert(r.err.includes(f('good.clas.abap')), 'and names the argument that is not an id');
    // a bare `src` is a path where one exists (the consumer's checkout), an id answer where none does
    const repo = tempDir('abap2ui5lint-ux-explain-');
    fs.mkdirSync(path.join(repo, 'src'));
    const dir = run(['--explain', 'src'], repo);
    assert(dir.code === 2 && /takes rule ids only/.test(dir.err), `a bare directory name is a path too (${dir.err.trim()})`);
    const still = run(['--explain', 'unknown-controll']);
    assert(still.code === 2 && /no rule 'unknown-controll'/.test(still.err), 'a mistyped id still gets the id answer');
  });

  section('cli: the --all-classes summary tells app classes from helpers', () => {
    const dir = tempDir('abap2ui5lint-ux-all-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'zcl_app.clas.abap'));
    for (const n of ['a', 'b']) {
      fs.writeFileSync(path.join(dir, `zcl_helper_${n}.clas.abap`),
        `CLASS zcl_helper_${n} DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\n\nCLASS zcl_helper_${n} IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n`);
    }
    const all = run([dir, '--no-render', '--no-config', '--all-classes', '--stats']).out;
    assert(/^sources +3 classes \(1 app class building a view, 2 helpers\)$/m.test(all),
      `helpers are called helpers (${all.match(/^sources.*$/m)?.[0]})`);
    const app = run([dir, '--no-render', '--no-config', '--stats']).out;
    assert(/^sources +1 app class$/m.test(app), 'a plain corpus keeps its one phrase');
  });

  section('cli: --help says which settings are config-only', () => {
    const help = run(['--help']).out;
    assert(/"ignore"/.test(help) && /"rules"/.test(help) && /abap2ui5lint\.jsonc only/.test(help) && /--init writes that file/.test(help),
      '--help names ignore and the per-rule switches as config-only, and points at --init');
    assert(/unknown-directive-rule, unused-directive/.test(help), 'and says a directive is itself judged');
  });
}
