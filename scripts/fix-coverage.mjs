#!/usr/bin/env node
/*
 * fix-coverage - which findings a corpus gets, and how many of them --fix
 * can repair. The question behind "more fixes": a fix is worth writing where
 * a rule fires often AND the repair is mechanical (AGENTS.md rule 6), and
 * only a count over real code says where the first half holds.
 *
 *   node scripts/fix-coverage.mjs <path>... [--config <file>]
 *
 * Runs the property gate (no render) over the paths with every class
 * collected (--all-classes), the way `node cli.mjs` would, and prints per
 * rule: findings, findings that carry a fix, and whether the rule CAN fix
 * at all (a fixNote on its card). A rule that fires often with no fixNote is
 * a candidate - or a rule whose repair needs a decision only the author can
 * make (a text, a version), which is said on its card.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { RULE_DOCS } from '../lib/rule-docs.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (!args.length) {
  console.error('usage: node scripts/fix-coverage.mjs <path>... [--config <file>]');
  process.exit(2);
}
let out;
try {
  out = execFileSync('node', [path.join(ROOT, 'cli.mjs'), ...args, '--no-render', '--all-classes', '--format', 'json', '--fail-on', 'never'], { encoding: 'utf8', maxBuffer: 1 << 30 });
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(2);
}
const report = JSON.parse(out);
const by = new Map();
for (const r of report.results) {
  for (const f of r.findings) {
    const row = by.get(f.type) ?? { n: 0, fixed: 0 };
    row.n++;
    if (f.fixes?.length || f.fix) row.fixed++;
    by.set(f.type, row);
  }
}
const rows = [...by].sort((a, b) => b[1].n - a[1].n);
console.log('findings  with fix  fixable  rule');
for (const [type, { n, fixed }] of rows) {
  const can = RULE_DOCS[type]?.fixNote ? 'yes' : '-';
  console.log(`${String(n).padStart(8)}  ${String(fixed).padStart(8)}  ${can.padStart(7)}  ${type}`);
}
const total = rows.reduce((s, [, r]) => s + r.n, 0);
const fixed = rows.reduce((s, [, r]) => s + r.fixed, 0);
console.log(`\n${total} findings, ${fixed} with a fix (${total ? Math.round((100 * fixed) / total) : 0} %)`);
