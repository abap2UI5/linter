/*
 * test/sections/config - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, test, after, checkAbapSource, checkFiles, severityOf, f, FIX, assert, section, tempDir, by, good, post, broken, has, rules, nested, view, bad, xml } = H;



// a view that is built and never handed to the client
section('abap rules (6)', async () => {
    const nd = (await checkFiles([f('nodisplay.clas.abap')], { render: false }))[0];
    assert(nd.findings.some((x) => x.type === 'view-never-displayed'),
      'abap rules: a view built but never displayed - an empty page, no error');
    const shown = (await checkFiles([f('good.clas.abap')], { render: false }))[0];
    assert(!shown.findings.some((x) => x.type === 'view-never-displayed'),
      'abap rules: a displayed view is not reported');
    // popover_display and the nest*_view_display family are display calls too -
    // a popover-only helper class is legitimate (caught by the VS Code
    // extension's snippet gate as a false positive of the narrower list)
    const popoverOnly = `CLASS zcl_pop DEFINITION PUBLIC.
    PUBLIC SECTION.
      INTERFACES z2ui5_if_app.
  ENDCLASS.
  CLASS zcl_pop IMPLEMENTATION.
    METHOD z2ui5_if_app~main.
      DATA(popover) = z2ui5_cl_ui5_view_builder=>factory( ).
      popover->ele( n = \`Popover\` )->a( n = \`xmlns\` v = \`sap.m\` ).
      client->popover_display( xml = popover->stringify( ) by_id = \`opener\` ).
    ENDMETHOD.
  ENDCLASS.`;
    assert(!checkAbapSource(popoverOnly).findings.some((x) => x.type === 'view-never-displayed'),
      'abap rules: a popover-only class displays its view too');
});

// ---------------------------------------------------------------- config ----
section('config', async () => {
    const os = await import('node:os');
    const cp = await import('node:child_process');
    const { stripJsonc, loadConfig, applyConfig, findConfig, CONFIG_NAME } = await import('../../lib/config.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');

    const dir = tempDir('a2ui5lint-');
    const sub = path.join(dir, 'nested', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    const cfgFile = path.join(dir, CONFIG_NAME);
    fs.writeFileSync(cfgFile, `{
    // comment survives
    "ui5": "1.96",
    "failOn": "hint",
    "render": false,
    "allow": ["sap.m.Avatar"], // trailing comma next
  }`);

    assert(JSON.parse(stripJsonc('{"a":1,/*x*/"b":"//not a comment",}')).b === '//not a comment',
      'config: stripJsonc keeps // inside strings');

    /* Trailing-comma removal must tell punctuation from text. It used to be a
     * regex over the finished output, which also rewrote string CONTENT: an
     * exclude pattern `app[,]x` came out as `app[]x` - a character class that
     * matches nothing, so the suppression silently stopped suppressing. */
    assert(JSON.parse(stripJsonc('{"exclude":["src/app[,]x"],}')).exclude[0] === 'src/app[,]x',
      'config: stripJsonc keeps a comma before ] inside a string');
    assert(JSON.parse(stripJsonc('{"a":"foo, } bar"}')).a === 'foo, } bar',
      'config: stripJsonc keeps a comma before } inside a string');
    assert(JSON.stringify(JSON.parse(stripJsonc('{"a":[1, 2, ], "b":{"c":1, }, }'))) === '{"a":[1,2],"b":{"c":1}}',
      'config: stripJsonc still drops the structural trailing commas');

    /* A comma offset is a UTF-16 CODE UNIT index. Rebuilding the string by code
     * POINT (`[...out]`) shifts every index past the first astral character, so
     * one config with an emoji anywhere in it lost an unrelated character and
     * kept the comma it was supposed to lose. Three consumers read this loader
     * (CLI, VS Code extension, the App prototype), and all three saw a
     * SyntaxError instead of a config. */
    const astral = '{ "paths": ["src/\u{1F3AF}app"], "ui5": "1.71", }';
    assert(stripJsonc(astral) === '{ "paths": ["src/\u{1F3AF}app"], "ui5": "1.71" }',
      `config: stripJsonc drops the right comma past a non-BMP character (got ${stripJsonc(astral)})`);
    assert(JSON.parse(stripJsonc(astral)).paths[0] === 'src/\u{1F3AF}app',
      'config: a config carrying an emoji still parses, path intact');
    // two of them, so the drift is measured beyond a single 2-unit shift
    const astral2 = '{ "a": ["\u{1F3AF}", "\u{1F600}"], "b": [1, ], }';
    assert(JSON.stringify(JSON.parse(stripJsonc(astral2))) === '{"a":["\u{1F3AF}","\u{1F600}"],"b":[1]}',
      'config: several non-BMP characters do not shift the comma offsets');

    const cfg = loadConfig(cfgFile);
    assert(cfg.minUi5 === '1.96' && cfg.failOn === 'hint' && cfg.render === false,
      'config: jsonc parsed with comments and trailing commas');

    assert(findConfig(sub) === cfgFile, 'config: discovered walking upward from a nested dir');

    const opt = { minUi5: '1.71', failOn: 'warning', render: true, allow: ['sap.m.Page.x'] };
    applyConfig(opt, new Set(['failOn']), cfg);
    assert(opt.minUi5 === '1.96', 'config: fills an option the CLI did not set');
    assert(opt.failOn === 'warning', 'config: an explicit CLI flag beats the config');
    assert(opt.allow.includes('sap.m.Avatar') && opt.allow.includes('sap.m.Page.x'),
      'config: allow lists merge');

    // ignore: repo-level, and validated the same way an exclude pattern is
    fs.writeFileSync(path.join(dir, 'ign.jsonc'), '{"ignore": ["/generated/"]}');
    assert(loadConfig(path.join(dir, 'ign.jsonc')).ignore[0] === '/generated/',
      'config: ignore survives loading as a pattern list');
    fs.writeFileSync(path.join(dir, 'ignbad.jsonc'), '{"ignore": ["[unclosed"]}');
    let ignThrew = '';
    try { loadConfig(path.join(dir, 'ignbad.jsonc')); } catch (e) { ignThrew = e.message; }
    assert(/ignore pattern '\[unclosed' is not a valid regex/.test(ignThrew),
      'config: an uncompilable ignore pattern fails loudly instead of suppressing nothing');
    fs.writeFileSync(path.join(dir, 'ignstr.jsonc'), '{"ignore": "generated"}');
    let ignType = '';
    try { loadConfig(path.join(dir, 'ignstr.jsonc')); } catch (e) { ignType = e.message; }
    assert(/'ignore' must be an array/.test(ignType), 'config: ignore must be a list, not a single string');

    let threw = '';
    fs.writeFileSync(path.join(dir, 'bad.jsonc'), '{"tpyo": 1}');
    try { loadConfig(path.join(dir, 'bad.jsonc')); }
    catch (e) { threw = e.message; }
    assert(/unknown key 'tpyo'/.test(threw), 'config: an unknown key fails loudly');

    fs.writeFileSync(path.join(dir, 'cachebad.jsonc'), '{"cache": "yes"}');
    let cacheType = '';
    try { loadConfig(path.join(dir, 'cachebad.jsonc')); } catch (e) { cacheType = e.message; }
    assert(/'cache' must be true or false/.test(cacheType), 'config: cache must be a boolean');
    fs.writeFileSync(path.join(dir, 'cacheok.jsonc'), '{"cache": true}');
    assert(loadConfig(path.join(dir, 'cacheok.jsonc')).cache === true, 'config: cache: true survives loading');

    /* render grew an object form: { "pages": N } asks for the gate AND sizes
     * its page pool. It normalizes to render:true + renderPages, so every
     * consumer keeps reading a boolean `render`. */
    fs.writeFileSync(path.join(dir, 'rp.jsonc'), '{"render": {"pages": 2}}');
    const rp = loadConfig(path.join(dir, 'rp.jsonc'));
    assert(rp.render === true && rp.renderPages === 2,
      'config: render {pages} normalizes to render:true plus renderPages');
    for (const [text, re, what] of [
      ['{"render": {"pagez": 2}}', /render has unknown key 'pagez'/, 'an unknown key inside render fails loudly'],
      ['{"render": {"pages": 0}}', /render 'pages' must be a positive integer/, 'pages 0 is refused'],
      ['{"render": {"pages": 2.5}}', /render 'pages' must be a positive integer/, 'a fractional pages is refused'],
      ['{"render": "yes"}', /'render' must be true, false, or/, 'a string render is refused'],
      ['{"render": [4]}', /'render' must be true, false, or/, 'an array render is refused'],
    ]) {
      fs.writeFileSync(path.join(dir, 'rpbad.jsonc'), text);
      let msg = '';
      try { loadConfig(path.join(dir, 'rpbad.jsonc')); } catch (e) { msg = e.message; }
      assert(re.test(msg), `config: ${what} (got '${msg}')`);
    }

    // end-to-end: the CLI picks the config up from the checked path's directory
    // (cwd is this repo, which has no config - discovery must come from the path)
    // the successor-builder fixture, because this run must exit 0: the old
    // builder is frozen upstream and reports non-released-api on every file
    fs.copyFileSync(f('viewbuilder.clas.abap'), path.join(sub, 'good.clas.abap'));
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' }; // never inherit the runner's
    const out = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap')], { encoding: 'utf8', env });
    /* The context line names the DISTRIBUTION the run assumed, and the config
     * above sets none - "SAPUI5" would be a claim nobody made, and it is the
     * line a reader checks after a sapui5-only-control hint. */
    assert(/target UI5 1\.96 \(distribution unset\)/.test(out) && /failing on hint/.test(out),
      `config: cli applies ui5/failOn from the discovered abap2ui5lint.jsonc (got ${out.split('\n').find((l) => l.includes('target')) || out})`);
    const off = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap'), '--no-config'], { encoding: 'utf8', env });
    assert(/target UI5 1\.71 \(distribution unset\)/.test(off), 'config: --no-config restores the defaults');
    const dist = cp.execFileSync('node', [CLI, path.join(sub, 'good.clas.abap'), '--no-config', '--distribution', 'sapui5'], { encoding: 'utf8', env });
    assert(/target SAPUI5 1\.71/.test(dist), 'config: a configured distribution is named as itself');

    // the .json spelling is discovered too (abaplint.json / abaplint.jsonc)
    const plain = path.join(dir, 'plain');
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(path.join(plain, 'abap2ui5lint.json'), '{"ui5": "1.120"}');
    assert(findConfig(plain) === path.join(plain, 'abap2ui5lint.json'),
      'config: abap2ui5lint.json is discovered as well as .jsonc');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------ config (2) ----
// `extends` (a base config another one builds on) and `maxWarnings`
// (ui5lint's warning cap)
section('config (2)', async () => {
    const cp = await import('node:child_process');
    const { loadConfig } = await import('../../lib/config.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const dir = tempDir('a2ui5-ext-');

    // --- extends: base + child, child wins per key, rules merge per id -------
    fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'shared', 'base.jsonc'), JSON.stringify({
      ui5: '1.96', failOn: 'hint', paths: ['src'], baseline: 'base-baseline.json',
      rules: { 'missing-accessibility': false, 'member-deprecated': 'hint' },
    }));
    fs.writeFileSync(path.join(dir, 'child.jsonc'), JSON.stringify({
      extends: './shared/base.jsonc', failOn: 'error',
      rules: { 'member-deprecated': 'warning' },
    }));
    const merged = loadConfig(path.join(dir, 'child.jsonc'));
    assert(merged.minUi5 === '1.96', 'extends: a key only the base sets survives');
    assert(merged.failOn === 'error', 'extends: the extending file wins per key');
    assert(merged.rules['missing-accessibility'] === false && merged.rules['member-deprecated'] === 'warning',
      'extends: the rules blocks merge per rule id, the child entry winning');
    assert(merged.extends === undefined, 'extends: the pointer itself does not survive the merge');
    // the base's path-carrying keys stay anchored at the BASE file
    assert(merged.paths[0] === path.join(dir, 'shared', 'src'),
      `extends: the base's relative paths resolve against the base file (got ${merged.paths[0]})`);
    assert(merged.baseline === path.join(dir, 'shared', 'base-baseline.json'),
      'extends: the base\'s baseline resolves against the base file too');

    // a chain follows; a cycle refuses instead of recursing forever
    fs.writeFileSync(path.join(dir, 'grand.jsonc'), JSON.stringify({ extends: './child.jsonc', ui5: '1.120' }));
    assert(loadConfig(path.join(dir, 'grand.jsonc')).minUi5 === '1.120'
      && loadConfig(path.join(dir, 'grand.jsonc')).failOn === 'error',
    'extends: a chain of three merges near-to-far');
    fs.writeFileSync(path.join(dir, 'a.jsonc'), '{"extends": "./b.jsonc"}');
    fs.writeFileSync(path.join(dir, 'b.jsonc'), '{"extends": "./a.jsonc"}');
    let cycle = '';
    try { loadConfig(path.join(dir, 'a.jsonc')); } catch (e) { cycle = e.message; }
    assert(/'extends' cycle/.test(cycle), `extends: a cycle is refused loudly (${cycle})`);
    fs.writeFileSync(path.join(dir, 'selfie.jsonc'), '{"extends": "./selfie.jsonc"}');
    try { loadConfig(path.join(dir, 'selfie.jsonc')); cycle = ''; } catch (e) { cycle = e.message; }
    assert(/'extends' cycle/.test(cycle), 'extends: a self-extend is the shortest cycle');
    fs.writeFileSync(path.join(dir, 'dangling.jsonc'), '{"extends": "./nowhere.jsonc"}');
    let missing = '';
    try { loadConfig(path.join(dir, 'dangling.jsonc')); } catch (e) { missing = e.message; }
    assert(/'extends' names \.\/nowhere\.jsonc, which does not exist/.test(missing) && !/--config/.test(missing),
      `extends: a missing base fails naming the extends value, not --config (${missing})`);
    fs.writeFileSync(path.join(dir, 'extbad.jsonc'), '{"extends": 42}');
    let bad = '';
    try { loadConfig(path.join(dir, 'extbad.jsonc')); } catch (e) { bad = e.message; }
    assert(/'extends' must be a path/.test(bad), 'extends: a non-string is refused');

    // --- maxWarnings ----------------------------------------------------------
    fs.writeFileSync(path.join(dir, 'mw.jsonc'), '{"maxWarnings": 3}');
    assert(loadConfig(path.join(dir, 'mw.jsonc')).maxWarnings === 3, 'maxWarnings: survives loading');
    for (const bad2 of ['{"maxWarnings": -1}', '{"maxWarnings": 1.5}', '{"maxWarnings": "3"}']) {
      fs.writeFileSync(path.join(dir, 'mwbad.jsonc'), bad2);
      let msg = '';
      try { loadConfig(path.join(dir, 'mwbad.jsonc')); } catch (e) { msg = e.message; }
      assert(/'maxWarnings' must be a non-negative integer/.test(msg),
        `maxWarnings: ${bad2} is refused`);
    }

    // the flag: post171 yields 2 warnings and 0 errors, so --fail-on error
    // passes until the cap says otherwise
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
    const run = (args) => {
      try { cp.execFileSync('node', [CLI, ...args], { encoding: 'utf8', stdio: 'pipe', env }); return 0; }
      catch (e) { return e.status; }
    };
    const P = [f('post171.clas.abap'), '--no-render', '--no-config', '--fail-on', 'error'];
    assert(run(P) === 0, 'maxWarnings: without the cap, warnings do not fail a --fail-on error run');
    assert(run([...P, '--max-warnings', '2']) === 0, 'maxWarnings: at the cap the run still passes');
    assert(run([...P, '--max-warnings', '1']) === 1, 'maxWarnings: one over the cap fails the run');
    assert(run([...P, '--max-warnings', 'lots']) === 2, 'maxWarnings: a non-integer value is bad usage');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------------------- cache ----
// the opt-in cross-run result cache (--cache): a hit skips both gates and
// replays the stored findings; anything relevant moving is a miss
section('cache', async () => {
    const cp = await import('node:child_process');
    const { CACHE_VERSION, DEFAULT_CACHE_FILE, cacheContext, loadCache, saveCache, hashOf } = await import('../../lib/cache.mjs');
    const CLI = path.join(FIX, '..', '..', 'cli.mjs');
    const dir = tempDir('a2ui5-cache-');
    const app = path.join(dir, 'app.clas.abap');
    fs.copyFileSync(f('broken.clas.abap'), app);
    const cacheFile = path.join(dir, DEFAULT_CACHE_FILE);
    const env = { ...process.env, NO_COLOR: '1', GITHUB_ACTIONS: '' };
    const run = (args) => {
      try {
        return { out: cp.execFileSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8', env }), code: 0 };
      } catch (e) { return { out: e.stdout ?? '', code: e.status }; }
    };
    const BASE = ['app.clas.abap', '--no-render', '--no-config', '--cache', '--json'];

    const first = run(BASE);
    assert(fs.existsSync(cacheFile), 'cache: --cache writes the cache file');
    const firstDoc = JSON.parse(first.out);
    assert(firstDoc.problems > 0 && first.code === 1, 'cache: the first (cold) run still reports and fails normally');

    /* The HIT is proven by tampering: rewrite the stored findings and see the
     * next run replay them - a run that recomputed would report the defects
     * the file still carries. */
    const store = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const key = Object.keys(store.files)[0];
    assert(store.version === CACHE_VERSION && store.files[key].hash === hashOf(fs.readFileSync(app, 'utf8')),
      'cache: an entry is keyed by the file content hash');
    store.files[key].result.findings = [];
    fs.writeFileSync(cacheFile, JSON.stringify(store));
    const replayed = run(BASE);
    assert(JSON.parse(replayed.out).problems === 0 && replayed.code === 0,
      'cache: a hit replays the stored findings instead of re-running the gates');

    // miss on CONTENT change: the same tampered entry no longer matches
    fs.appendFileSync(app, '\n* changed\n');
    const contentMiss = run(BASE);
    assert(JSON.parse(contentMiss.out).problems === firstDoc.problems && contentMiss.code === 1,
      'cache: a changed file misses and is recomputed');

    // miss on CONFIG change: same content, but a setting that changes verdicts
    const store2 = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    store2.files[Object.keys(store2.files)[0]].result.findings = [];
    fs.writeFileSync(cacheFile, JSON.stringify(store2));
    const configMiss = run([...BASE, '--ui5', '1.120']);
    assert(JSON.parse(configMiss.out).problems > 0,
      'cache: a changed setting drops the whole cache and recomputes');
    assert(cacheContext({ version: '1', snapshot: '1.151.0', options: { minUi5: '1.71' } })
      !== cacheContext({ version: '1', snapshot: '1.151.0', options: { minUi5: '1.120' } }),
      'cache: the context hash moves with the settings');
    assert(cacheContext({ version: '1', snapshot: '1.151.0', options: { rules: { 'unknown-control': false } } })
      !== cacheContext({ version: '1', snapshot: '1.151.0', options: {} }),
      'cache: the rules block is part of the context');

    // a corrupt cache file is an empty cache, never an error
    fs.writeFileSync(cacheFile, 'not json {');
    const corrupt = run(BASE);
    assert(JSON.parse(corrupt.out).problems === firstDoc.problems && corrupt.code === 1,
      'cache: a corrupt cache file is tolerated and the run recomputes');
    const rewritten = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert(rewritten.version === CACHE_VERSION, 'cache: the corrupt file is replaced by a valid one');
    assert(Object.keys(loadCache(cacheFile, 'wrong-context')).length === 0,
      'cache: another context reads as empty');
    saveCache(cacheFile, 'ctx', { a: { hash: 'h', result: {} } });
    assert(loadCache(cacheFile, 'ctx').a.hash === 'h', 'cache: save/load round-trips');
    // the cache sits in the working directory - the repository - and a link
    // the repository ships there is never written through
    const victim = path.join(tempDir('a2ui5cache-away-'), 'victim');
    fs.writeFileSync(victim, 'keep me\n');
    const linkedCache = path.join(path.dirname(cacheFile), 'linked-cache');
    fs.symlinkSync(victim, linkedCache);
    let refused = '';
    try { saveCache(linkedCache, 'ctx', { a: { hash: 'h', result: {} } }); } catch (e) { refused = e.message; }
    assert(/symbolic link/.test(refused) && fs.readFileSync(victim, 'utf8') === 'keep me\n',
      `cache: a cache file that is a symbolic link is not written through (${refused || 'written'})`);
    fs.rmSync(linkedCache);
    fs.rmSync(path.dirname(victim), { recursive: true, force: true });

    /* An entry that parses but carries no usable result (result: null - a
     * truncated write, a hand-edit) is a MISS, never a crash: the cache is
     * expendable by contract, so nothing read from it has a trusted shape. */
    fs.rmSync(cacheFile, { force: true });
    run(BASE);
    const mangled = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const k of Object.keys(mangled.files)) mangled.files[k].result = null;
    fs.writeFileSync(cacheFile, JSON.stringify(mangled));
    const nulled = run(BASE);
    assert(JSON.parse(nulled.out).problems === firstDoc.problems && nulled.code === 1,
      'cache: a null result entry is a miss and the run recomputes');
    const healed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert(Object.values(healed.files).every((e) => e.result && Array.isArray(e.result.findings)),
      'cache: the recompute replaces the unusable entry');

    /* --fix rewrites the file, so its stale entry can never match again: the
     * fixed run reports the post-fix state, not a replay of the pre-fix one. */
    const fixable = path.join(dir, 'fixable.clas.abap');
    fs.copyFileSync(f('abaprules.clas.abap'), fixable);
    fs.rmSync(cacheFile, { force: true });
    const preFix = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--json']);
    assert(/obsolete-binder/.test(preFix.out), 'cache: the fixable finding is cached first');
    const postFix = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--fix', '--json']);
    assert(!/"type":"obsolete-binder"/.test(postFix.out),
      'cache: a --fix run does not replay the pre-fix findings of the file it modified');
    const after = run(['fixable.clas.abap', '--no-render', '--no-config', '--cache', '--json']);
    assert(!/"type":"obsolete-binder"/.test(after.out),
      'cache: the run after the fix caches the post-fix state');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ----------------------------------------------------------------- rules ----
// per-rule off / severity / exclude, the abaplint-shaped `rules` block
section('rules block', async () => {
    const { loadConfig } = await import('../../lib/config.mjs');
    const os = await import('node:os');
    const src = fs.readFileSync(f('viewrules.clas.abap'), 'utf8');

    const plain = checkAbapSource(src);
    const has = (r, type) => r.findings.some((x) => x.type === type);
    assert(has(plain, 'missing-accessibility') && has(plain, 'member-deprecated'),
      'rules: the fixture reports the rules the overrides act on');

    const off = checkAbapSource(src, { rules: { 'missing-accessibility': false } });
    assert(!has(off, 'missing-accessibility') && has(off, 'member-deprecated'),
      'rules: false switches a single rule off and leaves the rest alone');

    const lowered = checkAbapSource(src, { rules: { 'member-deprecated': 'hint' } });
    const dep = lowered.findings.find((x) => x.type === 'member-deprecated');
    assert(dep.severity === 'hint' && severityOf(dep) === 'hint',
      'rules: a severity string overrides the default, and severityOf reads it back');

    const excluded = checkAbapSource(src, { rules: { 'duplicate-id': { exclude: ['viewrules'] } }, file: 'src/viewrules.clas.abap' });
    assert(!has(excluded, 'duplicate-id'), 'rules: exclude drops the rule for a file the pattern matches');
    const kept = checkAbapSource(src, { rules: { 'duplicate-id': { exclude: ['nothing'] } }, file: 'src/viewrules.clas.abap' });
    assert(has(kept, 'duplicate-id'), 'rules: a non-matching exclude leaves the rule in place');

    const dir = tempDir('a2ui5rules-');
    const write = (body) => { const p = path.join(dir, 'abap2ui5lint.jsonc'); fs.writeFileSync(p, body); return p; };
    const throws = (body) => { try { loadConfig(write(body)); return ''; } catch (e) { return e.message; } };
    assert(/unknown rule 'no-such-rule'/.test(throws('{"rules": {"no-such-rule": false}}')),
      'rules: an unknown rule id in the config fails loudly');
    assert(/must be a severity/.test(throws('{"rules": {"duplicate-id": "fatal"}}')),
      'rules: an unknown severity fails loudly');
    assert(/unknown key 'sevrity'/.test(throws('{"rules": {"duplicate-id": {"sevrity": "hint"}}}')),
      'rules: a typo inside a rule object fails loudly');
    assert(loadConfig(write('{"$schema": "x", "rules": {"duplicate-id": {"severity": "hint", "exclude": ["/test/"]}}}')).rules['duplicate-id'].severity === 'hint',
      'rules: $schema is accepted and a full rule object survives loading');

    /* A config that is not there was named by hand: `findConfig` only returns a
     * file it has already seen, so `loadConfig` is only ever handed a missing
     * path by `--config`. It used to rethrow node's own text — an errno and a
     * syscall at somebody who mistyped a path. */
    const failed = (p) => { try { loadConfig(p); return ''; } catch (e) { return e.message; } };
    const gone = failed(path.join(dir, 'nope.jsonc'));
    assert(/no such file/.test(gone) && /--config/.test(gone),
      `config: a missing --config path says so and names the flag (got ${JSON.stringify(gone)})`);
    assert(!/ENOENT|syscall/.test(gone),
      `config: and does not hand node's errno to the reader (got ${JSON.stringify(gone)})`);
    const isDir = failed(dir);
    assert(/is a directory/.test(isDir) && !/EISDIR/.test(isDir),
      `config: --config pointed at a directory says that, not EISDIR (got ${JSON.stringify(isDir)})`);

    fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------------ directives ----
// " abap2ui5lint-disable-next-line <rule>, -disable-line, -disable/-enable
section('directives', async () => {
    const src = fs.readFileSync(f('directives.clas.abap'), 'utf8');
    const r = checkAbapSource(src);
    const props = r.findings.filter((x) => x.type === 'unknown-property').map((x) => x.member);
    assert(props.join(',') === 'typo2,typo5',
      `directives: only the unwaived typos survive (got ${props.join(',') || 'none'})`);

    const { parseDirectives, applyDirectives } = await import('../../lib/findings.mjs');
    assert(parseDirectives('nothing to see here') === null,
      'directives: a source without a directive costs nothing');
    const d = parseDirectives('" abap2ui5lint-disable-next-line duplicate-id\nx\ny');
    assert(d.suppresses(2, 'duplicate-id') && !d.suppresses(2, 'unknown-control') && !d.suppresses(3, 'duplicate-id'),
      'directives: -disable-next-line is scoped to the next line and to the named rule');
    const all = parseDirectives('<!-- abap2ui5lint-disable-next-line -->\nx');
    assert(all.suppresses(2, 'anything'), 'directives: an XML comment without a rule id waives every rule');
    const reason = parseDirectives('" abap2ui5lint-disable-line duplicate-id -- known, tracked in #42');
    assert(reason.suppresses(1, 'duplicate-id') && !reason.suppresses(1, 'known'),
      'directives: the reason after -- is not read as a rule id');
    // (the bare block suppressed nothing, so it comes back as unused-directive too -
    // test/review/ux.mjs asserts that half; here only the placed finding matters)
    assert(applyDirectives([{ type: 'duplicate-id' }], '" abap2ui5lint-disable\n').filter((x) => x.type === 'duplicate-id').length === 1,
      'directives: a finding the gate could not place is never suppressed');
});
}
