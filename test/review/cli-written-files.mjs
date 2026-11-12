/*
 * The files the CLI writes, and the paths it writes into the machine
 * formats. Found by the 2026-11-12 org-wide bug hunt; each section fails on
 * the code as it was. See test/review/README.md for the harness.
 *
 *   1. a config that extends a base in another directory and names its own
 *      baseline writes it (the base's root was kept beside the child's path)
 *   2. --update-baseline creates the directory --baseline names
 *   3. --screenshot shot.PNG is one picture called shot.PNG, not shot.PNG.png
 *   4. checkstyle and junit name a file relative to the cwd, like every
 *      other format
 *   5. --init writes a file that ends in one newline
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function ({ section, assert, f, FIX, tempDir }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  section('extends: a child naming its own baseline writes it in its own tree', () => {
    const dir = tempDir('a2l-extbl-');
    fs.mkdirSync(path.join(dir, 'shared'));
    fs.mkdirSync(path.join(dir, 'app', 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shared', 'abap2ui5lint.jsonc'), '{ "baseline": "base-baseline.json", "render": false }');
    fs.writeFileSync(path.join(dir, 'app', 'abap2ui5lint.jsonc'), '{ "extends": "../shared/abap2ui5lint.jsonc", "baseline": "my-baseline.json", "paths": ["src"] }');
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dir, 'app', 'src', 'abaprules.clas.abap'));
    const r = run(['--update-baseline', '--no-progress'], path.join(dir, 'app'));
    assert(r.code === 0 && fs.existsSync(path.join(dir, 'app', 'my-baseline.json')),
      `the child's baseline is written next to it (${r.code}: ${r.err.trim().slice(0, 200)})`);
    // the base's own baseline keeps the base's tree
    const only = tempDir('a2l-extbl2-');
    fs.mkdirSync(path.join(only, 'shared'));
    fs.mkdirSync(path.join(only, 'app', 'src'), { recursive: true });
    fs.writeFileSync(path.join(only, 'shared', 'abap2ui5lint.jsonc'), '{ "baseline": "base-baseline.json", "render": false }');
    fs.writeFileSync(path.join(only, 'app', 'abap2ui5lint.jsonc'), '{ "extends": "../shared/abap2ui5lint.jsonc", "paths": ["src"] }');
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(only, 'app', 'src', 'abaprules.clas.abap'));
    const b = run(['--update-baseline', '--no-progress'], path.join(only, 'app'));
    assert(b.code === 0 && fs.existsSync(path.join(only, 'shared', 'base-baseline.json')), `the inherited one is written beside the base (${b.code})`);
  });

  section('--update-baseline creates the directory the baseline file is named in', () => {
    const dir = tempDir('a2l-bldir-');
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dir, 'abaprules.clas.abap'));
    const r = run(['abaprules.clas.abap', '--no-render', '--no-config', '--no-progress', '--baseline', path.join('lint', 'deep', 'bl.json'), '--update-baseline'], dir);
    assert(r.code === 0 && fs.existsSync(path.join(dir, 'lint', 'deep', 'bl.json')), `written (${r.code}: ${r.err.trim().slice(0, 200)})`);
  });

  section.browser('--screenshot keeps a name ending in .PNG as it is', () => {
    const dir = tempDir('a2l-shotcase-');
    fs.copyFileSync(f('good.clas.abap'), path.join(dir, 'zcl_app.clas.abap'));
    const r = run(['zcl_app.clas.abap', '--no-config', '--screenshot', 'view.PNG'], dir);
    assert(r.code === 0 && fs.existsSync(path.join(dir, 'view.PNG')) && !fs.existsSync(path.join(dir, 'view.PNG.png')),
      `one picture, called view.PNG (${r.code}: ${fs.readdirSync(dir).join()})`);
  });

  section('checkstyle and junit name the file relative to the working directory', () => {
    const dir = tempDir('a2l-xmlpath-');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(dir, 'src', 'abaprules.clas.abap'));
    const abs = path.join(dir, 'src', 'abaprules.clas.abap');
    for (const format of ['checkstyle', 'junit']) {
      const r = run([abs, '--no-render', '--no-config', '--no-progress', '--format', format], dir);
      assert(r.out.includes('"src/abaprules.clas.abap"') && !r.out.includes(dir), `${format}: src/abaprules.clas.abap, not the absolute path`);
    }
  });

  section('--init writes a file ending in exactly one newline', () => {
    const dir = tempDir('a2l-initend-');
    assert(run(['--init'], dir).code === 0, 'written');
    const raw = fs.readFileSync(path.join(dir, 'abap2ui5lint.jsonc'), 'utf8');
    assert(raw.endsWith('}\n') && !raw.endsWith('\n\n') && !/[ \t]+$/m.test(raw), `no trailing blanks, one final newline (${JSON.stringify(raw.slice(-8))})`);
  });
}
