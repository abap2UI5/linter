/*
 * test/sections/render - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, checkFiles, f, FIX, assert, section, tempDir, by, good, broken, has, rules, xml } = H;


// ------------------------------------------- rules['render-error'] ----
// the render gate's pseudo-rule: waive or downgrade render failures per file
// instead of switching the gate off wholesale
section.browser('render-error', async () => {
    const waived = (await checkFiles([f('broken.clas.abap')], { rules: { 'render-error': { exclude: ['broken'] } } }))[0];
    assert(waived.renderErrors.length === 0 && waived.notes.some((n) => /waived by rules\['render-error'\]/.test(n)),
      'render-error: an exclude waives the render failures of a matching file, saying so in a note');

    const downgraded = (await checkFiles([f('broken.clas.abap')], { rules: { 'render-error': 'warning' } }))[0];
    assert(downgraded.renderErrors.length > 0 && downgraded.renderSeverity === 'warning',
      'render-error: a severity override keeps the errors and re-weighs them');
    const { problemsOf } = await import('../../lib/report.mjs');
    assert(problemsOf(downgraded).filter((p) => p.rule === 'render-error').every((p) => p.severity === 'warning'),
      'render-error: the report carries the overridden severity');

    const stale = (await checkFiles([f('good.clas.abap')], { rules: { 'render-error': { exclude: ['good'] } } }))[0];
    assert(stale.notes.some((n) => /stale render-error waiver/.test(n)),
      'render-error: a waived file that renders clean is called out as a stale waiver');

    const os = await import('node:os');
    const { loadConfig } = await import('../../lib/config.mjs');
    const dir = tempDir('a2ui5render-');
    const cfg = path.join(dir, 'abap2ui5lint.jsonc');
    fs.writeFileSync(cfg, '{"rules": {"render-error": {"exclude": ["legacy/"]}}}');
    assert(loadConfig(cfg).rules['render-error'].exclude[0] === 'legacy/',
      'render-error: the config accepts the pseudo-rule in its rules block');
    fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------- optional render deps ----
// playwright + @openui5/* ship in @abap2ui5/linter-render, declared as an
// OPTIONAL PEER: absent, the property gate still works and a requested render
// fails with one actionable message
section('render deps', async () => {
    const { RENDER_DEPS, SCREENSHOT_DEPS, RENDER_RUNTIME, missingRenderDeps, renderDepsError, renderFallback } = await import('../../lib/render.mjs');
    const root = path.join(FIX, '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const runtime = JSON.parse(fs.readFileSync(path.join(root, 'linter-render', 'package.json'), 'utf8'));

    // The whole point of the split: a default `npm i @abap2ui5/linter` (and so
    // `npx`, which has no --omit=optional) must not drag ~123 MB of UI5 in. npm
    // installs optionalDependencies BY DEFAULT, so their absence here is the
    // guard - an optional PEER is the one kind npm leaves alone.
    assert(!pkg.dependencies && !pkg.optionalDependencies,
      'render deps: the linter declares no runtime dependencies of its own');
    assert(pkg.peerDependencies?.[RENDER_RUNTIME]
      && pkg.peerDependenciesMeta?.[RENDER_RUNTIME]?.optional === true,
      `render deps: ${RENDER_RUNTIME} is declared as an OPTIONAL peer`);
    assert(pkg.bin?.abap2ui5lint === 'cli.mjs' && pkg.bin?.['abap2ui5-lint'] === 'cli.mjs',
      'render deps: the CLI answers to abap2ui5lint and to the hyphenated abap2ui5-lint');
    /* Nothing ships in the runtime unaccounted for, and nothing the GATE needs
     * is missing from it - but the two lists are no longer the same list. The
     * theme compiler is in the runtime because `--screenshot` needs it and one
     * install should get everything; it is out of RENDER_DEPS because the gate
     * must still run where it is absent. */
    assert(runtime.name === RENDER_RUNTIME
      && [...RENDER_DEPS, ...SCREENSHOT_DEPS].sort().join() === Object.keys(runtime.dependencies).sort().join(),
      'render deps: the runtime ships exactly RENDER_DEPS plus the screenshot-only ones');
    assert(!RENDER_DEPS.some((d) => SCREENSHOT_DEPS.includes(d)),
      'render deps: a screenshot-only package is never required by the gate');

    assert(missingRenderDeps().length === 0,
      'render deps: everything is installed in this environment');
    // intercept resolution to simulate an install without the runtime package
    const missing = missingRenderDeps(() => { throw new Error('MODULE_NOT_FOUND'); });
    assert(missing.length === RENDER_DEPS.length,
      'render deps: an unresolvable install reports every render dep as missing');
    const err = renderDepsError(missing);
    assert(err.code === 'ERR_RENDER_DEPS_MISSING',
      'render deps: the refusal carries a stable code the CLI can catch');
    assert(/playwright/.test(err.message) && /@openui5\/sap\.ui\.core/.test(err.message),
      'render deps: the message names the missing packages');
    assert(err.message.includes(RENDER_RUNTIME) && /--no-render/.test(err.message) && /render: false/.test(err.message),
      'render deps: the message names the one package to install and how to run without it');
    const partial = renderDepsError(missingRenderDeps((id) => {
      if (id.startsWith('playwright')) throw new Error('MODULE_NOT_FOUND');
      return id;
    }));
    assert(/missing: playwright\./.test(partial.message) && !/@openui5/.test(partial.message.split('They ship in')[0]),
      'render deps: only what is actually missing is named');

    /* The refusal is for a run that ASKED for the gate. A default-on gate with
     * no runtime steps aside instead - otherwise the advertised
     * `npx @abap2ui5/linter src` exits 2 without linting anything, which is the
     * first command the README gives a new user. */
    const allMissing = [...RENDER_DEPS];
    const fallback = renderFallback({ render: true, asked: false, missing: allMissing });
    assert(typeof fallback === 'string' && /render gate is OFF/.test(fallback),
      'render fallback: a default-on gate without its runtime falls back instead of refusing');
    assert(fallback.includes(RENDER_RUNTIME) && /--render/.test(fallback) && /--no-render/.test(fallback),
      'render fallback: the warning names the package to install, how to demand the gate, and how to go quiet');
    assert(renderFallback({ render: true, asked: true, missing: allMissing }) === null,
      'render fallback: a gate that was ASKED for keeps the hard refusal - a promised gate never silently skips');
    assert(renderFallback({ render: true, asked: false, missing: [] }) === null,
      'render fallback: nothing to say when the runtime is installed');
    assert(renderFallback({ render: false, asked: false, missing: allMissing }) === null,
      'render fallback: --no-render asked for no gate at all, so there is nothing to warn about');
});

// ------------------------------------------------------ shared renderer ----
// checkFiles/screenshotFiles accept an ALREADY-OPEN renderer and then never
// close it - the contract a long-lived consumer (mcp-server) keeps one warm
// Chromium on, instead of paying a cold start per validate_view call
section.browser('shared renderer', async () => {
    const { openRenderer } = await import('../../lib/render.mjs');
    const files = [f('good.clas.abap'), f('broken.clas.abap')];
    const independent = await checkFiles(files, {});
    const renderer = await openRenderer({ pages: 2 });
    try {
      const first = await checkFiles([files[0]], { renderer });
      // a second call on the SAME renderer is the proof the first did not close it
      const second = await checkFiles([files[1]], { renderer });
      // the runtime numbers views per session (__xmlview0, __xmlview1, ...),
      // so the generated id is the one part of an error text that may differ
      const shape = (r) => JSON.stringify({
        findings: r.findings.map((x) => [x.type, x.line, x.column]),
        renderErrors: r.renderErrors.map((e) => e.replace(/__xmlview\d+/g, '__xmlview')),
      });
      assert(shape(first[0]) === shape(independent[0]),
        'shared renderer: the clean file gets the same verdict as an independent run');
      assert(shape(second[0]) === shape(independent[1]) && second[0].renderErrors.length > 0,
        'shared renderer: the broken file still fails the render gate through the shared session');
      // and it is still usable directly afterwards - checkFiles left it open
      const direct = await renderer.render({ xml: independent[0].docs[0], model: independent[0].model });
      assert(Array.isArray(direct) && direct.length === 0,
        'shared renderer: the renderer stays open and renders after both calls');
    } finally {
      await renderer.close();
    }
});

// ------------------------------------------------- curated formatter mirror ----
// the render harness provides the same formatter surface the rule judges by —
// the demo-kit pack was removed upstream, and a harness still mirroring it
// would render views green that break live
section('formatters', async () => {
    const { CURATED_FORMATTERS } = await import('../../lib/formatters.mjs');
    const renderSrc = fs.readFileSync(path.join(FIX, '..', '..', 'lib', 'render.mjs'), 'utf8');
    // each mirror is its own object literal; the method list is read per block
    const block = (name) => {
      const from = renderSrc.indexOf(`window.z2ui5.${name} = {`);
      return from === -1 ? '' : renderSrc.slice(from, renderSrc.indexOf('\n    };', from));
    };
    const methods = (src) => [...src.matchAll(/^ {6}(\w+): function/gm)].map((m) => m[1]);
    const mirrored = methods(block('Formatter'));
    assert(mirrored.sort().join() === [...CURATED_FORMATTERS].sort().join(),
      `formatters: the render harness mirrors exactly the curated set (harness: ${mirrored.join(', ') || 'none'})`);
    const { CLIPBOARD_CALLBACKS, CLIPBOARD_MODULE } = await import('../../lib/formatters.mjs');
    const clipboard = methods(block('Clipboard'));
    assert(clipboard.sort().join() === [...CLIPBOARD_CALLBACKS].sort().join(),
      `formatters: the render harness mirrors exactly the clipboard callbacks (harness: ${clipboard.join(', ') || 'none'})`);
    assert(renderSrc.includes(`sap.ui.define('${CLIPBOARD_MODULE}'`),
      'formatters: the render harness registers the clipboard module for core:require');
});
}
