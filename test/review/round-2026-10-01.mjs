/*
 * The 2026-10-01 round: a faster property gate, new rules read out of the
 * framework's own closed sets and the UI5 sources, and fixes for rules that
 * had none. See test/review/README.md for the harness.
 *
 *   1. checkFiles( { jobs } ) spreads the property gate over worker threads;
 *      the results have to be the sequential run's, in the sequential order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export default async function ({ section, assert, checkFiles }) {
  section('round 2026-10-01: a pooled property gate returns the sequential results, in file order', async () => {
    // enough files for the pool to start threads (one per 64): the fixtures, twice over
    const own = fs.readdirSync(FIXTURES).filter((f) => /\.(clas\.abap|view\.xml|fragment\.xml)$/.test(f)).map((f) => path.join(FIXTURES, f));
    const files = [...own, ...own].slice(0, 140);
    assert(files.length >= 128, `enough files for two threads (${files.length})`);
    const opts = { render: false, minUi5: '1.71' };
    const strip = (rs) => JSON.stringify(rs);
    const one = await checkFiles(files, { ...opts, jobs: 1 });
    const pooled = await checkFiles(files, { ...opts, jobs: 3 });
    assert(pooled.length === one.length && pooled.every((r, i) => r.file === files[i]), 'one result per file, in the order the files were given');
    assert(strip(pooled) === strip(one), 'and every result is the sequential one, byte for byte');
    // options a thread cannot receive keep the run in this thread rather than failing it
    const odd = await checkFiles(files.slice(0, 130), { ...opts, jobs: 3, rules: { 'unknown-control': { severity: 'warning' } }, extra: () => 1 });
    assert(odd.length === 130, 'a function among the options runs sequentially instead of throwing');
  });
}
