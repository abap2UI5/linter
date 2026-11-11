#!/usr/bin/env node
/*
 * npm run test:static - the suite without the render gate, and without a
 * browser on the machine: every section but the ones written
 * `section.browser( )` (see test/run.mjs). The loop for rule and
 * reconstructor work, and the half that runs after a bare `npm ci`.
 *
 * A script rather than an env prefix in package.json, because `VAR=1 cmd` is
 * not a command on Windows and the CI matrix has one. Arguments are handed
 * to node:  npm run test:static -- --test-name-pattern=baseline
 */
import cp from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const suite = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs');
const r = cp.spawnSync(process.execPath, ['--test', ...process.argv.slice(2), suite], {
  stdio: 'inherit',
  env: { ...process.env, ABAP2UI5LINT_TEST_STATIC: '1', ABAP2UI5LINT_NO_BROWSER: '1' },
});
process.exit(r.status ?? 1);
