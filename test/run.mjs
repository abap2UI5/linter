#!/usr/bin/env node
/*
 * test/run — fixture-based self-test of the two gates.
 *
 * The LOAD-BEARING few, the ones every other section leans on. This is a
 * sample and says so: `test/fixtures/` holds far more, one or two per rule
 * family, and each is introduced by the section that reads it. A header
 * pretending to list them all is a header that goes stale on the next rule.
 *
 *   good.clas.abap      reconstructs, no findings, renders clean — the
 *                       reference every "…and the legal form is left alone"
 *                       assertion is written against
 *   viewbuilder.clas.abap  the same view, built through a helper handle. The
 *                       PAIR is the proof: the two reconstruct byte-identical
 *                       documents, which is what makes one reconstructor
 *                       enough for both builder dialects
 *   post171.clas.abap   property gate: GenericTile.systemInfo @since 1.92
 *   broken.clas.abap    render gate: typo property + unknown control
 *   structure.clas.abap unknown control/property/aggregation, bad enum and
 *                       numeric values, 0..1 overfilled, excess end( )
 *   dumps.clas.abap     builder calls the view builder ASSERTs on
 *   rowpaths.clas.abap  relative binding paths inside a bound aggregation
 *   nested.clas.abap    nested structures and nested aggregation bindings
 *   sample.view.xml     raw XML path: no findings, renders clean
 *
 * What the suite is FOR, beyond the rules: the last sections gate everything
 * generated or written down — the schema, the rules page, types.d.ts against
 * the exports map, AGENTS.md against the artefacts, the workflows and the
 * composite action — and the rule-coverage gate at the end asserts that every
 * registered rule actually fired somewhere above.
 *
 * HOW IT RUNS. `node:test` and `node:assert`, both of which ship with Node 22:
 * no dependency, no runner to install, no build step - the same constraints
 * this project has always had. Each `section( )` is one `test( )`, they run in
 * order, and a section's failure is its own: this was a 3,700-line single
 * process where any TypeError mid-file aborted every remaining assertion AND
 * the coverage gate at the end, which made a crash and a coverage failure look
 * identical from the outside. Temp directories go through `tempDir( )` and are
 * removed in one `after( )`, so an aborted section leaks none.
 *
 *   npm test                       the whole suite
 *   node --test-name-pattern=fix test/run.mjs    one section
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { test, after } from 'node:test';
import nodeAssert from 'node:assert';
import { checkAbapSource, checkXmlSource, checkFiles, produced } from './observe.mjs';
import { prepareAbap } from '../lib/reconstruct.mjs';
import { elementBoundSlots } from '../lib/index.mjs';
import { severityOf, severityRank } from '../lib/findings.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const f = (n) => path.join(FIX, n);
export { FIX };

/* Every applyFixes call in this suite - and in every CLI subprocess it spawns
 * - runs with malformed fix spans as an ERROR rather than as a silent drop.
 * A rule that computes its offsets against the wrong text (the scrubbed copy,
 * another document of the same class) otherwise ships a fix that can never be
 * applied, and the only symptom is a finding that survives every --fix pass. */
process.env.ABAP2UI5LINT_STRICT_FIXES = 'true';

/*
 * The harness. `node:test` and `node:assert` ship with Node 22, so this is
 * still a suite with no dependency, no runner to install and no build step.
 *
 * `assert( )` deliberately does NOT throw. Every assertion in a section runs,
 * a failing one is recorded, and the SECTION fails at its end carrying all of
 * them - which is the behaviour this suite always had. What node:test adds is
 * the isolation it never had: a TypeError in one section used to abort every
 * remaining assertion AND the rule-coverage gate at the end, so a crash and a
 * coverage failure were indistinguishable. Now the section fails and the rest
 * of the suite, the coverage gate included, still runs and still reports.
 */
let bucket = [];
export const assert = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) bucket.push(msg);
};

/** One section of the suite: isolated, ordered, and failing with every one of
 *  its assertions rather than with the first. */
const runSection = (name, body, options = {}) => test(name, options, async () => {
  bucket = [];
  try {
    await body();
  } finally {
    const failures = bucket;
    bucket = [];
    nodeAssert.ok(!failures.length,
      `${failures.length} assertion(s) failed:\n  - ${failures.join('\n  - ')}`);
  }
});
export const section = (name, body) => runSection(name, body);

/* THE STATIC HALF (`npm run test:static`, test/static.mjs). Most of this
 * suite asks questions a browser has no part in - what a rule reports, what
 * the reconstructor rebuilds, what the CLI prints - and it used to be
 * unreachable without `npx playwright install chromium`, because the first
 * statement of the file renders. Under ABAP2UI5LINT_TEST_STATIC=1:
 *
 *   - a section written `section.browser( )` is SKIPPED (and reported as
 *     skipped, never as passed),
 *   - a check that does not say `render` runs without the render gate
 *     (test/observe.mjs), so the fixtures loaded at the top of this file load,
 *   - and Chromium is refused outright (ABAP2UI5LINT_NO_BROWSER, lib/render.mjs,
 *     inherited by every spawned CLI): a section that needs the browser and
 *     is not marked FAILS there. That is what keeps the marking true - CI runs
 *     both halves, so a new render test that forgets `.browser` is red.
 *
 * `npm test` is unchanged: every section runs, marked or not. */
export const STATIC = process.env.ABAP2UI5LINT_TEST_STATIC === '1';
section.browser = (name, body) => runSection(name, body, STATIC ? { skip: 'needs the render gate - npm test runs it' } : {});

/* Temp directories, cleaned up centrally.
 *
 * Every section that needed one used to mkdtemp and rm it itself, which is
 * correct right up until the section throws in between - and then the
 * directory outlives the run with nobody to notice. Registered here and
 * removed in one `after( )`, so an aborted section leaks nothing. Sections
 * still remove their own where they want the removal ASSERTED; a second
 * removal of a gone directory is a no-op. */
const tempDirs = [];
export const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/* The sections, by topic, in the order they always ran (test/sections/,
 * README there). Each module takes the shared harness `H` - the checks, the
 * helpers above, and every top-level name an earlier module declared - and
 * hands its own top-level names on through it. */
const H = { fs, os, path, fileURLToPath, pathToFileURL, test, after, nodeAssert, checkAbapSource, checkXmlSource, checkFiles, produced, prepareAbap, elementBoundSlots, severityOf, severityRank, f, FIX, assert, section, STATIC, tempDir };
await (await import('./sections/fixtures.mjs')).default(H);
await (await import('./sections/views.mjs')).default(H);
await (await import('./sections/config.mjs')).default(H);
await (await import('./sections/app-rules.mjs')).default(H);
await (await import('./sections/render.mjs')).default(H);
await (await import('./sections/view-values.mjs')).default(H);
await (await import('./sections/data.mjs')).default(H);
await (await import('./sections/fix.mjs')).default(H);
await (await import('./sections/cli-output.mjs')).default(H);
await (await import('./sections/artefacts.mjs')).default(H);
await (await import('./sections/robustness.mjs')).default(H);


/*
 * Review-round sections live in test/review/*.mjs, one file per topic, so
 * several fixes can grow their regression tests without every one of them
 * editing the tail of this file. Each file exports a default function that
 * takes the harness (`section`, `assert`, `f`, `FIX`, `tempDir`) and the
 * observed checks, and registers its sections through them - the same
 * isolation, the same rule-coverage accounting as a section written here.
 * Loaded BEFORE the rule-coverage gate: a rule whose only trigger lives in a
 * review file has to count, and the gate reads what was observed up to the
 * moment it runs.
 */
const REVIEW = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review');
if (fs.existsSync(REVIEW)) {
  for (const file of fs.readdirSync(REVIEW).filter((n) => n.endsWith('.mjs')).sort()) {
    const mod = await import(pathToFileURL(path.join(REVIEW, file)).href);
    await mod.default({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource, checkFiles, prepareAbap });
  }
}

/* What is recorded is what the checks actually produced (test/observe.mjs),
 * not what the test source appears to mention, so a negated assertion or a
 * renamed idiom cannot pass for coverage. A rule may be exempt, but only in
 * writing, below. */
section('rule coverage', async () => {
    const { RULES } = await import('../lib/findings.mjs');

    /* id -> why this rule cannot be produced by the fixture suite. Keep it
     * empty if you can: an exemption is a rule nothing proves. */
    const EXEMPT = {};

    const uncovered = RULES.filter((id) => !produced.has(id) && !(id in EXEMPT));
    assert(!uncovered.length,
      `rule coverage: every rule fires somewhere in the suite (never fired: ${uncovered.join(', ') || 'none'})`);

    const stale = Object.keys(EXEMPT).filter((id) => produced.has(id) || !RULES.includes(id));
    assert(!stale.length,
      `rule coverage: no stale exemption - a rule that fires needs none (${stale.join(', ') || 'none'})`);
});
await (await import('./sections/late.mjs')).default(H);
