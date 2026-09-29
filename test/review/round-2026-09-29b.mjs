/*
 * The 2026-09-29 second pass: a review of the first round's own fixes and of
 * the modules that round did not reach (the reconstructor, --fix, the
 * formatters, the cache, the config). Every defect was reproduced before it
 * was fixed, and each section below fails on the code as it was. See
 * test/review/README.md for the harness.
 */
import cp from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function ({ section, assert, f, FIX, tempDir, checkXmlSource }) {
  const CLI = path.join(FIX, '..', '..', 'cli.mjs');
  const ENV = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
  const run = (args, { cwd, input, env = {} } = {}) => {
    const r = cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...ENV, ...env }, cwd, input });
    return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
  };

  /* ── 1. a baseline entry of a file the run walked past is stale ──────── */

  /* The first round scoped staleness to the files a run LINTED, so that one
   * file checked out of a baselined `src` no longer called every other entry
   * stale. It scoped it one step too far: a class under the walked directory
   * that is no longer collected - it stopped building a view - was not
   * "linted" either, so its entries were kept forever, and --update-baseline
   * over the whole directory kept them too. A suppression outliving what it
   * suppressed, with no command left that could remove it. */
  section('round 2026-09-29b: an entry of a class the walk no longer collects is stale, and an update drops it', () => {
    const dir = tempDir('a2l-scope-');
    const src = path.join(dir, 'src');
    fs.mkdirSync(src);
    fs.copyFileSync(f('wires.clas.abap'), path.join(src, 'zcl_a.clas.abap'));
    fs.copyFileSync(f('abaprules.clas.abap'), path.join(src, 'zcl_b.clas.abap'));
    const bl = path.join(dir, 'abap2ui5lint-baseline.json');
    const base = ['--no-render', '--no-config', '--no-progress', '--baseline', bl];
    const entries = () => Object.keys(JSON.parse(fs.readFileSync(bl, 'utf8')).findings);
    assert(run(['src', ...base, '--update-baseline'], { cwd: dir }).code === 0, 'the directory is baselined');
    const bEntries = entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|'));
    assert(bEntries.length > 0, `with entries for zcl_b (${bEntries.length})`);

    // zcl_b becomes a plain helper: no builder, no app interface - not collected
    fs.writeFileSync(path.join(src, 'zcl_b.clas.abap'),
      'CLASS zcl_b DEFINITION PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\n\n'
      + 'CLASS zcl_b IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n');
    const whole = run(['src', ...base], { cwd: dir });
    const staleLines = whole.out.split('\n').filter((l) => /! stale:/.test(l));
    assert(whole.code === 1 && staleLines.length === bEntries.length && staleLines.every((l) => l.includes('src/zcl_b.clas.abap|')),
      `a run over src calls zcl_b's entries stale - it walked past the class (${whole.code}: ${staleLines.length} of ${bEntries.length})`);

    const one = run([path.join('src', 'zcl_a.clas.abap'), ...base], { cwd: dir });
    assert(one.code === 0 && !/STALE/.test(one.out), `a run over zcl_a alone still does not judge zcl_b (${one.code})`);

    assert(run([path.join('src', 'zcl_a.clas.abap'), ...base, '--update-baseline'], { cwd: dir }).code === 0, 'an update over zcl_a alone');
    assert(entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|')).length === bEntries.length,
      'keeps zcl_b\'s entries - that run did not look at it');
    assert(run(['src', ...base, '--update-baseline'], { cwd: dir }).code === 0, 'an update over src');
    assert(!entries().some((k) => k.startsWith('src/zcl_b.clas.abap|')),
      `drops them (${entries().filter((k) => k.startsWith('src/zcl_b.clas.abap|')).length} left)`);
    assert(entries().some((k) => k.startsWith('src/zcl_a.clas.abap|')), 'and keeps zcl_a\'s');
    assert(run(['src', ...base], { cwd: dir }).code === 0, 'the directory is green against the updated baseline');
  });

  /* ── 2. malformed-xml: a CDATA section is text all the way through ──── */

  /* The tag reader skipped comments but not CDATA sections, so a `<!--`
   * inside one - a string in script text, `s.indexOf("<!--")` - opened a
   * "comment" that swallowed the real tags behind the section up to the next
   * `-->`. A view xmllint accepts came out with three unclosed-tag ERRORS,
   * and the lenient tree lost the elements after the section, so nothing in
   * them was judged either. */
  section('round 2026-09-29b: malformed-xml - a CDATA section never hides the tags after it', () => {
    const head = '<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns="sap.m" xmlns:html="http://www.w3.org/1999/xhtml">';
    const script = '<html:script><![CDATA[ if (s.indexOf("<!--") >= 0) { x(); } ]]></html:script>';
    const ok = checkXmlSource(`${head}<Page><content>${script}<Text text="after"/></content></Page><!-- end --></mvc:View>`, { file: 'cdata.view.xml' });
    const malformed = ok.findings.filter((x) => x.type === 'malformed-xml');
    assert(!malformed.length, `a well-formed view is not malformed-xml (${malformed.map((x) => x.message.slice(0, 60)).join(' | ')})`);
    const later = checkXmlSource(`${head}<Page><content>${script}<Txt text="after"/></content></Page><!-- end --></mvc:View>`, { file: 'cdata.view.xml' });
    assert(later.findings.some((x) => x.type === 'unknown-control' && /Txt/.test(x.control ?? '')),
      `the element behind the section is in the tree and judged (${later.findings.map((x) => `${x.type}:${x.control}`).join(', ')})`);
    const inside = checkXmlSource(`${head}<Page><content><Text><![CDATA[ a <Txt> b ]]></Text></content></Page></mvc:View>`, { file: 'cdata.view.xml' });
    assert(!inside.findings.some((x) => /Txt/.test(x.control ?? '')),
      `a tag INSIDE the section is text, not a control (${inside.findings.map((x) => `${x.type}:${x.control}`).join(', ')})`);
    const broken = checkXmlSource(`${head}<Page><content><![CDATA[x]]></contnt></Page></mvc:View>`, { file: 'cdata.view.xml' });
    assert(broken.findings.filter((x) => x.type === 'malformed-xml').length === 1,
      `a misspelt close next to a CDATA section is still reported, once (${broken.findings.filter((x) => x.type === 'malformed-xml').length})`);
  });
}
