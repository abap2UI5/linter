/*
 * The 2026-10-08 audit, third round: the candidates the second one left, and
 * what a read of the modules no round had covered yet found. See
 * test/review/README.md for the harness.
 *
 *   1. the stylish report prints no control character out of the source
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { formatStylish, githubAnnotations, summarize, terminalSafe } from '../../lib/report.mjs';

export default function ({ section, assert, f, FIX, tempDir, checkAbapSource, checkXmlSource }) {
  const opts = { render: false };
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, cwd, input) => {
    const r = cp.spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8', env: ENV, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. terminal injection ───────────────────────────────────────────── */

  /* A message quotes the source, and the file under review is not trusted:
   * an ESC in a property value went to the reviewer's terminal raw - an
   * escape SEQUENCE that clears, retitles or recolours it, or hides the line.
   * The stylish report and the annotations print it as a visible \xNN. */
  section('audit 2026-10-08c: the stylish report prints no control character from the source', () => {
    const xml = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m"><Button type="\u001b]0;pwned\u0007\u001b[2J\u009b31m‮" text="x"/></mvc:View>';
    const r = checkXmlSource(xml, { ...opts, file: 'esc.view.xml' });
    assert(r.findings.some((x) => x.type === 'invalid-property-value' && x.message.includes('\u001b')),
      'the finding quotes the value as written (the JSON keeps it)');
    const text = formatStylish([r], summarize([r]), { color: false });
    assert(!/[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/.test(text),
      `no control character reaches the stylish report (${JSON.stringify(text.split('\n')[1])})`);
    assert(text.includes('type="\\x1B]0;pwned\\x07\\x1B[2J\\x9B31m\\u202E"'), 'each one is shown, visibly');
    const ann = githubAnnotations([r]).join('\n');
    assert(!/[\u001b\u0007\u009b‮]/.test(ann), 'nor an annotation');
    assert(terminalSafe('a\tb\r\nc') === 'a b  c', 'a tab or line break is a blank: the stylish line stays one line');
    assert(terminalSafe('Grüße – ok') === 'Grüße – ok', 'printable text is untouched');

    // the CLI end to end, with a file NAME that carries one too
    const dir = tempDir('a2l-esc-');
    fs.writeFileSync(path.join(dir, 'e\u001b[1mvil.view.xml'), xml);
    const out = run(['.', '--no-render', '--no-config', '--no-progress', '--verbose'], dir);
    assert(!/[\u001b\u0007\u009b]/.test(out.out) && /e\\x1B\[1mvil\.view\.xml/.test(out.out),
      `the CLI's stdout carries none, the path included (${JSON.stringify(out.out.split('\n')[0])})`);
  });
}
