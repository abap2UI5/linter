#!/usr/bin/env node
/*
 * score.mjs — what a model writes when asked for an abap2UI5 app, measured by
 * this linter.
 *
 * The question this answers is not "is the linter right". It is "does an AI
 * assistant, asked in the words a user would use, produce an app that works" -
 * and the only honest way to know is to ask, keep the answers, and run the
 * gate over them. Nearly every abap2UI5 example on the public web builds its
 * view with the frozen `z2ui5_cl_xml_view`, so a model that answers from
 * memory writes that API, confidently. Whether the documentation, the indexes,
 * the plugin and the MCP server move that number is a measurement, not an
 * opinion, and this is the instrument for it.
 *
 * It does NOT call a model. No keys, no vendor list, no per-run cost that
 * would keep it out of CI, and no pretence that this repository knows which
 * models matter next month. You run the prompts yourself - a fresh session per
 * model, nothing pasted in front of them - save each answer as a file, and
 * point this at the directory. The harness is the part worth keeping; the
 * answers are data.
 *
 * Usage:
 *   node experimental/evals/score.mjs --prompts            print the pack to paste
 *   node experimental/evals/score.mjs <answers-dir> [opts]
 *
 *     --label <name>     what to call this run in the report (default: the
 *                        directory's name, e.g. "opus-5-no-tooling")
 *     --render           also run the render gate: does the view LOAD, not
 *                        just name real controls. Needs @abap2ui5/linter-render
 *                        and a browser, so it is off by default
 *     --json-out <file>  write the full result as JSON, to compare runs later
 *
 * An answer file is <prompt-id>.clas.abap (also accepted: <prompt-id>.abap,
 * <prompt-id>.txt). A prompt with no file counts as "no answer" rather than
 * silently shrinking the denominator - a model that refuses is a result too.
 *
 * The run uses the linter's DEFAULTS deliberately: UI5 1.71, fail on warning,
 * distribution unset. That is the floor most systems serve and the verdict a
 * consumer gets with no configuration - which is the situation the measured
 * code would land in.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { CATEGORIES, RULE_DOCS } from '../../lib/rule-docs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const PROMPTS = JSON.parse(fs.readFileSync(path.join(HERE, 'prompts.json'), 'utf8'));

/* The report groups findings by the linter's own taxonomy and its own titles
 * (lib/rule-docs.mjs), never a second list here: a rule added there, or a
 * category renamed, shows up in the next run without this file being touched.
 * `Controls and members` is the interesting row for a model - a control,
 * property or enum value UI5 does not have is an invented name, which is the
 * failure mode a model has and a human does not. */
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.title]));

function usage(code = 0) {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const doc = text.slice(text.indexOf('/*') + 2, text.indexOf('*/'));
  process.stdout.write(doc.replace(/^ \* ?/gm, '').trim() + '\n');
  process.exit(code);
}

function printPrompts() {
  const lines = [
    '# abap2UI5 eval prompt pack',
    '',
    'Ask each of these in a FRESH session, with nothing else in the context -',
    'no documentation pasted in front of it, no project open. That is the',
    'situation being measured: what the model brings on its own.',
    '',
    'Save each answer as `<id>.clas.abap` in one directory, then:',
    '',
    '    node experimental/evals/score.mjs <that directory> --label <model-and-setup>',
    '',
    'If an answer contains several classes, keep the main app class in that file',
    'and put the others next to it under any other name - the scorer reads the',
    'whole directory and reports the file named after the prompt.',
    '',
  ];
  for (const p of PROMPTS) {
    lines.push(`## ${p.id}`, '', p.ask, '');
  }
  process.stdout.write(lines.join('\n'));
}

function parseArgs(argv) {
  const opts = { dir: null, label: null, render: false, jsonOut: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    else if (a === '--prompts') { printPrompts(); process.exit(0); }
    else if (a === '--render') opts.render = true;
    else if (a === '--label') opts.label = argv[++i];
    else if (a === '--json-out') opts.jsonOut = argv[++i];
    else if (a.startsWith('-')) { console.error(`unknown option ${a}`); usage(2); }
    else if (!opts.dir) opts.dir = a;
    else { console.error('one answers directory at a time'); usage(2); }
  }
  if (!opts.dir) { console.error('no answers directory given\n'); usage(2); }
  return opts;
}

/* An answer is found by the prompt id, in the three spellings a person
 * plausibly saves it as. Anything else in the directory is linted too (a
 * second class an answer needed) but is not reported as a prompt. */
function findAnswer(dir, id) {
  for (const ext of ['.clas.abap', '.abap', '.txt']) {
    const at = path.join(dir, id + ext);
    if (fs.existsSync(at)) return at;
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.dir) || !fs.statSync(opts.dir).isDirectory()) {
    console.error(`not a directory: ${opts.dir}`);
    process.exit(2);
  }
  const label = opts.label || path.basename(path.resolve(opts.dir));

  /* Every answer is copied into one temp tree as <id>.clas.abap, which is what
   * the linter walks. Copying rather than linting in place keeps the naming
   * tolerant above and gives the run a directory with no abap2ui5lint.jsonc
   * above it, so the defaults really are the defaults. */
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'a2u5-evals-'));
  const src = path.join(work, 'src');
  fs.mkdirSync(src);

  const answered = [];
  for (const p of PROMPTS) {
    const at = findAnswer(opts.dir, p.id);
    if (!at) continue;
    fs.copyFileSync(at, path.join(src, `${p.id}.clas.abap`));
    answered.push(p.id);
  }
  // other ABAP files in the directory: linted as context, not reported per prompt
  for (const name of fs.readdirSync(opts.dir)) {
    if (!name.endsWith('.abap')) continue;
    const id = name.replace(/\.clas\.abap$|\.abap$/, '');
    if (PROMPTS.some((p) => p.id === id)) continue;
    fs.copyFileSync(path.join(opts.dir, name), path.join(src, name.endsWith('.clas.abap') ? name : `${id}.clas.abap`));
  }

  if (!answered.length) {
    console.error(`no answer files in ${opts.dir} - expected <prompt-id>.clas.abap, e.g. ${PROMPTS[0].id}.clas.abap`);
    process.exit(2);
  }

  const report = path.join(work, 'report.json');
  const args = [path.join(ROOT, 'cli.mjs'), src, '--no-progress', '--fail-on', 'never',
    '--format', 'json', '--json-out', report];
  if (!opts.render) args.push('--no-render');
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (!fs.existsSync(report)) {
    console.error(run.stderr || run.stdout || 'the linter wrote no report');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(report, 'utf8'));

  const byId = new Map();
  for (const r of data.results || []) {
    const id = path.basename(r.file).replace(/\.clas\.abap$/, '');
    byId.set(id, r);
  }

  const rows = [];
  const categories = {};
  let current = 0, frozen = 0, noView = 0, unrecognised = 0, clean = 0, renderBroken = 0;

  for (const p of PROMPTS) {
    if (!answered.includes(p.id)) {
      rows.push({ id: p.id, state: 'no answer', findings: 0, worst: '', rules: [] });
      continue;
    }
    const r = byId.get(p.id);
    if (!r) {
      unrecognised++;
      rows.push({ id: p.id, state: 'not an app class', findings: 0, worst: '', rules: [] });
      continue;
    }
    const findings = r.findings || [];
    const isFrozen = findings.some((f) => f.type === 'frozen-view-builder');
    const state = r.usesBuilder ? 'current builder' : isFrozen ? 'frozen builder' : 'no view built';
    if (r.usesBuilder) current++;
    else if (isFrozen) frozen++;
    else noView++;

    for (const f of findings) {
      const cat = RULE_DOCS[f.type]?.category || 'other';
      (categories[cat] ??= { findings: 0, answers: new Set(), rules: {} });
      categories[cat].findings++;
      categories[cat].answers.add(p.id);
      categories[cat].rules[f.type] = (categories[cat].rules[f.type] || 0) + 1;
    }
    const broken = (r.renderErrors || []).length;
    if (broken) renderBroken++;
    if (r.usesBuilder && !findings.length && !broken) clean++;

    const worst = ['error', 'warning', 'hint'].find((s) => findings.some((f) => f.severity === s)) || '';
    rows.push({
      id: p.id,
      state,
      findings: findings.length,
      worst,
      renderErrors: broken,
      rules: [...new Set(findings.map((f) => f.type))],
    });
  }

  const total = PROMPTS.length;
  const pct = (n) => `${n}/${total} (${Math.round((n / total) * 100)}%)`;

  const out = [];
  out.push(`## ${label}`, '');
  out.push(`measured with the linter in this checkout, defaults (UI5 1.71, fail on warning,`);
  out.push(`distribution unset), render gate ${opts.render ? 'ON' : 'off'}`, '');
  out.push('| | |', '| --- | --- |');
  out.push(`| answered | ${pct(answered.length)} |`);
  out.push(`| **current builder** | **${pct(current)}** |`);
  out.push(`| **frozen builder** (\`z2ui5_cl_xml_view\`) | **${pct(frozen)}** |`);
  out.push(`| no view built | ${pct(noView)} |`);
  out.push(`| not an app class | ${pct(unrecognised)} |`);
  out.push(`| clean (builder, no findings${opts.render ? ', view loads' : ''}) | ${pct(clean)} |`);
  if (opts.render) out.push(`| view fails to load | ${pct(renderBroken)} |`);
  out.push('');

  const cats = Object.entries(categories).sort((a, b) => b[1].findings - a[1].findings);
  if (cats.length) {
    out.push('### findings by category', '');
    out.push('| category | findings | answers | top rules |', '| --- | --- | --- | --- |');
    for (const [cat, c] of cats) {
      const top = Object.entries(c.rules).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, n]) => `\`${id}\`${n > 1 ? ` ×${n}` : ''}`).join(', ');
      out.push(`| ${CATEGORY_LABEL[cat] || cat} | ${c.findings} | ${c.answers.size} | ${top} |`);
    }
    out.push('');
  }

  out.push('### per prompt', '');
  out.push('| prompt | state | findings | worst | rules |', '| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const rules = r.rules.slice(0, 4).map((id) => `\`${id}\``).join(', ')
      + (r.rules.length > 4 ? `, +${r.rules.length - 4}` : '');
    out.push(`| ${r.id} | ${r.state} | ${r.findings || ''} | ${r.worst} | ${rules} |`);
  }
  out.push('');
  process.stdout.write(out.join('\n'));

  if (opts.jsonOut) {
    const payload = {
      label,
      at: new Date().toISOString().slice(0, 10),
      linter: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
      render: opts.render,
      prompts: total,
      answered: answered.length,
      counts: { current, frozen, noView, unrecognised, clean, renderBroken },
      categories: Object.fromEntries(cats.map(([cat, c]) =>
        [cat, { findings: c.findings, answers: c.answers.size, rules: c.rules }])),
      rows,
      totals: data.totals,
    };
    fs.writeFileSync(opts.jsonOut, `${JSON.stringify(payload, null, 2)}\n`);
    process.stderr.write(`\nwrote ${opts.jsonOut}\n`);
  }

  fs.rmSync(work, { recursive: true, force: true });
}

main();
