/*
 * The 2026-10-12 hygiene round: the numbers the repository quotes about
 * itself. See test/review/README.md for the harness.
 *
 *   1. the package size the README, AGENTS.md, RELEASING.md and release.yml
 *      quote is the tarball's - four places said ~340 kB (one ~240 kB) while
 *      `npm pack` produced ~600 kB, and nothing counted
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default function ({ section, assert }) {
  /* ── 1. the quoted package size is the measured one ──────────────────── */

  /* Same idea as the rule-count gate in test/run.mjs: everywhere that quotes
   * the number rather than measuring it is read here and compared with the
   * measurement. The README's "~N kB" is the figure; the other three places
   * have to agree with the README, and the README has to be within a quarter
   * of what `npm pack` actually produces - the tarball, since that is what
   * `npx @abap2ui5/linter` downloads and the sentence is about that line. */
  section('round 2026-10-12: the quoted package size is the tarball\'s', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const quoted = /~(\d+) kB\s+and no dependencies/.exec(readme);
    assert(quoted, 'README: the first paragraph quotes the package size as "~N kB and no dependencies"');
    const figure = Number(quoted?.[1]);

    const elsewhere = [];
    for (const name of ['AGENTS.md', 'RELEASING.md', '.github/workflows/release.yml']) {
      const text = fs.readFileSync(path.join(ROOT, name), 'utf8');
      const sizes = [...text.matchAll(/~(\d+) kB/g)].map((m) => Number(m[1]));
      if (!sizes.length || sizes.some((n) => n !== figure)) elsewhere.push(`${name}: ${sizes.join('/') || 'no figure'}`);
    }
    assert(!elsewhere.length,
      `size: every other place quotes the README's ~${figure} kB (disagrees: ${elsewhere.join(', ') || 'none'})`);

    // npm is npm.cmd on Windows, which Node refuses to spawn without a shell
    const pack = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'],
      { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 60_000 });
    assert(pack.status === 0 && pack.stdout.trim().startsWith('['),
      `size: npm pack --dry-run --json runs (${pack.status} ${(pack.stderr || '').slice(0, 200)})`);
    const [tarball] = JSON.parse(pack.stdout.trim());
    const measured = tarball.size / 1024;
    assert(Math.abs(measured - figure) <= figure * 0.25,
      `size: the README's ~${figure} kB is within 25% of the tarball (${Math.round(measured)} kB, ${tarball.files.length} files)`);
  });
}
