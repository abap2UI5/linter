#!/usr/bin/env node
/*
 * Everything the App does to a pull request, minus GitHub: lint local files
 * through the same `lintSource`/`toAnnotations`/`summarize` the webhook path
 * uses, and print the check-run payload that WOULD be posted.
 *
 *   node experimental/github-app/dryrun.mjs test/fixtures
 *
 * A spike nobody can run is a spike nobody can judge. This is also the only
 * part of the App that is testable without registering one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CHECKABLE, lintSource, summarize, toAnnotations } from './review.mjs';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('-'));
if (!target) {
  console.error('usage: node experimental/github-app/dryrun.mjs <file-or-directory> [--json]');
  process.exit(2);
}

const walk = (p) => (fs.statSync(p).isDirectory()
  ? fs.readdirSync(p).flatMap((e) => walk(path.join(p, e)))
  : [p]);

const files = walk(target).filter((f) => CHECKABLE.test(f)).sort();

const findings = [];
const annotations = [];
const checked = [];
for (const file of files) {
  const found = lintSource(file, fs.readFileSync(file, 'utf8'));
  checked.push(file);
  findings.push(...found);
  annotations.push(...toAnnotations(file, found));
}

const { conclusion, title, summary } = summarize(checked, findings);
const payload = {
  name: 'abap2UI5-linter (property gate)',
  head_sha: '<head sha of the pull request>',
  status: 'completed',
  conclusion,
  output: { title, summary, annotations: annotations.slice(0, 50) },
};

if (args.includes('--json')) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`files       ${checked.length}`);
  console.log(`findings    ${findings.length}`);
  console.log(`conclusion  ${conclusion}`);
  console.log(`title       ${title}`);
  console.log(`annotations ${annotations.length}${annotations.length > 50 ? ' (50 with the check run, the rest PATCHed on)' : ''}`);
  for (const a of annotations.slice(0, 5)) {
    console.log(`  ${a.annotation_level.padEnd(7)} ${a.path}:${a.start_line}  ${a.title}`);
  }
  if (annotations.length > 5) console.log(`  … and ${annotations.length - 5} more (--json for all)`);
}
