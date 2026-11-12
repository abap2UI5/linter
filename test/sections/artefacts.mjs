/*
 * test/sections/artefacts - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, path, pathToFileURL, test, after, checkAbapSource, prepareAbap, elementBoundSlots, f, FIX, assert, section, by, good, broken, has, rules, rows, opaque, view, xml } = H;


// --------------------------------------------------------------- typings ----
// types.d.ts is the typed contract of the exports map: hand-written (the
// implementation has no TypeScript build step by design), gated here so it
// can neither go stale against the exports map nor stop parsing
section('typings', async () => {
    const cp = await import('node:child_process');
    const ROOT = path.join(FIX, '..', '..');
    const dts = fs.readFileSync(path.join(ROOT, 'types.d.ts'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    // EVERY exports subpath has its declare-module block - the code ones and
    // the JSON ones alike (a string-valued export is a data file; `./schema`
    // shipped untyped for a year because this filter only asked the objects),
    // and every code subpath's "types" condition points at this file
    const subpaths = Object.entries(pkg.exports).filter(([, v]) => typeof v === 'object');
    const moduleOf = (k) => (k === '.' ? '@abap2ui5/linter' : `@abap2ui5/linter/${k.slice(2)}`);
    const undeclared = Object.keys(pkg.exports)
      .map(moduleOf)
      .filter((m) => !dts.includes(`declare module "${m}"`));
    assert(subpaths.length && Object.keys(pkg.exports).length > subpaths.length && !undeclared.length,
      `typings: every subpath of the exports map is declared, JSON ones included (missing: ${undeclared.join(', ') || 'none'})`);
    assert(subpaths.every(([, v]) => v.types === './types.d.ts') && pkg.types === './types.d.ts'
      && pkg.files.includes('types.d.ts'),
      'typings: the types conditions, the top-level types field and files[] all carry types.d.ts');

    /* Every RUNTIME export of every subpath has a declaration.
     *
     * The structural check above only asks whether the module block exists, so
     * fifteen public symbols - `elementBoundSlots`, the whole opt-in mechanism,
     * the four render constants cli.mjs itself uses - sat behind a declared
     * module and were still untypable by a consumer. The vscode-extension job
     * typechecks against exactly this file, so what is missing here is missing
     * there. Read the blocks out of the file rather than from tsc: the
     * declarations are ambient, and nothing else in the repo imports them. */
    const bodies = {};
    {
      const heads = [...dts.matchAll(/declare module "([^"]+)"\s*\{/g)]
        .map((m) => [m[1], m.index + m[0].length]);
      heads.forEach(([name, from], i) => {
        bodies[name] = dts.slice(from, i + 1 < heads.length ? heads[i + 1][1] : dts.length);
      });
    }
    const undeclaredNames = [];
    for (const [sub, cond] of subpaths) {
      const mod = sub === '.' ? '@abap2ui5/linter' : `@abap2ui5/linter/${sub.slice(2)}`;
      /* pathToFileURL, not the path: the ESM loader takes file:// URLs, and on
       * Windows an absolute path starts with a drive letter it reads as a
       * protocol - ERR_UNSUPPORTED_ESM_URL_SCHEME, "Received protocol 'd:'"
       * (one of the windows-latest failures in linter#67). */
      const runtime = Object.keys(await import(pathToFileURL(path.join(ROOT, cond.default)).href));
      const declared = new Set(
        [...(bodies[mod] ?? '').matchAll(/export (?:declare )?(?:function|const|class|interface|type|enum)\s+(\w+)/g)]
          .map((m) => m[1]),
      );
      for (const name of runtime) if (!declared.has(name)) undeclaredNames.push(`${mod}#${name}`);
    }
    assert(!undeclaredNames.length,
      `typings: every runtime export of every subpath is declared (missing: ${undeclaredNames.join(', ') || 'none'})`);

    /*
     * Every OPTION a function reads, and every KEY a result carries.
     *
     * The check above asks whether each exported NAME is declared; a function
     * can be declared and still lie about what it takes. An option the runtime
     * reads and types.d.ts omits cannot be passed from TypeScript without a
     * cast, so a consumer silently does not pass it and the rules behind it
     * never fire for that consumer while CI reports them - `checkNodes` alone
     * had four such options, and the VS Code extension's in-process gate ran
     * five rules fewer than the CLI because of them.
     *
     * The names are read out of the signatures and the result keys out of a
     * real call, so neither side can be guessed at.
     */
    const optionsOf = (file, fn) => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const sig = new RegExp(`export function ${fn}\\([^)]*?\\{([^}]*)\\}`).exec(src);
      if (!sig) return [];
      // the NAME of each destructured entry, never the default value after `=`
      return sig[1].split(',').map((part) => /^\s*(\w+)/.exec(part)?.[1]).filter(Boolean);
    };
    for (const [file, fn, mod] of [
      ['lib/properties.mjs', 'checkNodes', '@abap2ui5/linter/properties'],
      ['lib/abap-rules.mjs', 'checkAbapRules', '@abap2ui5/linter/abap-rules'],
    ]) {
      const declared = bodies[mod] ?? '';
      const opts = optionsOf(file, fn);
      const missing = opts.filter((name) => !new RegExp(`\\b${name}\\??:`).test(declared));
      assert(opts.length > 3 && !missing.length,
        `typings: ${fn} declares every option it reads (missing: ${missing.join(', ') || 'none'})`);
    }
    {
      const { prepareAbap } = await import('../../lib/reconstruct.mjs');
      const prepared = prepareAbap(fs.readFileSync(path.join(FIX, 'good.clas.abap'), 'utf8'));
      const declared = bodies['@abap2ui5/linter/reconstruct'] ?? '';
      const missing = Object.keys(prepared)
        .filter((key) => !new RegExp(`\\b${key}\\??:`).test(declared));
      assert(Object.keys(prepared).length > 5 && !missing.length,
        `typings: PreparedAbap declares every key prepareAbap returns (missing: ${missing.join(', ') || 'none'})`);
    }

    // tsc --noEmit keeps the file syntactically and internally valid. typescript
    // is a devDependency used ONLY for this check - there is still no build step
    const { createRequire } = await import('node:module');
    let tsc = null;
    /* Through the package's own `bin` field, NOT by resolving a subpath.
     * typescript 7 has an `exports` map that does not expose ./bin/tsc, so
     * `resolve('typescript/bin/tsc')` throws on the version this repo pins -
     * and the catch below read that as "typescript not installed" and skipped
     * the gate. A check that reports itself skipped is at least honest; one
     * that reports itself skipped for the wrong reason is how it stays skipped. */
    try {
      const req = createRequire(import.meta.url);
      const manifest = req.resolve('typescript/package.json');
      tsc = path.join(path.dirname(manifest), req('typescript/package.json').bin.tsc);
      if (!fs.existsSync(tsc)) tsc = null;
    } catch { /* not installed */ }
    if (tsc) {
      let ok = true;
      let msg = '';
      try {
        // --types node: ScreenshotResult.png is a Buffer, which is a Node global
        // and not an ambient one. Without it the gate fails on the typings a
        // consumer (who has @types/node) reads perfectly well.
        cp.execFileSync('node', [tsc, '--noEmit', '--strict', '--target', 'es2022', '--types', 'node', 'types.d.ts'],
          { cwd: ROOT, encoding: 'utf8' });
      } catch (e) { ok = false; msg = (e.stdout || e.stderr || '').trim().slice(0, 400); }
      assert(ok, `typings: types.d.ts type-checks clean (${msg || 'tsc --noEmit'})`);
    } else {
      assert(true, 'typings: typescript not installed - tsc check skipped (structural gate above still ran)');
    }
});

// ---------------------------------------------------------------- schema ----
section('schema', async () => {
    const { render, SCHEMA_FILE } = await import('../../scripts/generate-schema.mjs');
    const committed = fs.readFileSync(SCHEMA_FILE, 'utf8');
    assert(committed === render(), 'schema: data/abap2ui5lint.schema.json is in sync (npm run generate-schema)');
    const schema = JSON.parse(committed);
    const { RULES, RENDER_RULE } = await import('../../lib/findings.mjs');
    // + 1: the render gate's pseudo-rule is offered in the rules block too
    assert(Object.keys(schema.properties.rules.properties).length === RULES.length + 1
      && RULES.includes('duplicate-id') && schema.properties.rules.properties[RENDER_RULE],
      'schema: every rule id plus the render pseudo-rule is offered to the editor');

    /* The loader's KNOWN set and the schema's properties are the same list seen
     * from two sides: a key only the loader knows is a red squiggle over a
     * working config, a key only the schema knows is completion for something
     * that then fails loudly. */
    /* A `$id` on `main` is the very skew --init exists to solve: an editor
     * validating a pinned CLI's config against whatever rules main holds, so a
     * rule id the installed version does not have completes cleanly and then
     * fails loudly on the command line. */
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8')).version;
    assert(schema.$id === `https://raw.githubusercontent.com/abap2UI5/linter/v${pkgVersion}/data/abap2ui5lint.schema.json`,
      `schema: the $id names a version, not a branch (${schema.$id})`);

    const { KNOWN } = await import('../../lib/config.mjs');
    const offered = new Set(Object.keys(schema.properties));
    const missing = [...KNOWN].filter((k) => !offered.has(k));
    const extra = [...offered].filter((k) => !KNOWN.has(k));
    assert(!missing.length && !extra.length,
      `schema: the offered keys are exactly the ones the loader accepts (loader-only: ${missing.join(', ') || 'none'}; schema-only: ${extra.join(', ') || 'none'})`);
});

// ---------------------------------------------------------------- compat ----
/* data/compat.json says which abap2UI5 framework releases this linter line
 * understands - the one thing the three independent pins in the ecosystem
 * (app-template's framework release, its linter version, this snapshot's
 * ui5Version) had nothing to be checked against. Generated like the schema,
 * gated like the schema: `linter` follows package.json, `ui5.snapshot` follows
 * the metadata, and the two decided numbers have to be releases. */
section('compat', async () => {
    const cp = await import('node:child_process');
    const ROOT = path.join(FIX, '..', '..');
    const { render, COMPAT_FILE, FRAMEWORK_MINIMUM, UI5_FLOOR, SEMVER, buildCompat } = await import('../../scripts/generate-compat.mjs');
    const committed = fs.readFileSync(COMPAT_FILE, 'utf8');
    assert(committed === render(), 'compat: data/compat.json is in sync (npm run generate-compat)');
    let checked = true;
    try { cp.execFileSync('node', [path.join(ROOT, 'scripts', 'generate-compat.mjs'), '--check'], { encoding: 'utf8', stdio: 'pipe' }); }
    catch { checked = false; }
    assert(checked, 'compat: generate-compat --check agrees, from the command line');

    const compat = JSON.parse(committed);
    assert(JSON.stringify(Object.keys(compat)) === JSON.stringify(['note', 'linter', 'framework', 'ui5'])
      && JSON.stringify(Object.keys(compat.framework)) === JSON.stringify(['minimum', 'mirrored'])
      && JSON.stringify(Object.keys(compat.ui5)) === JSON.stringify(['floor', 'snapshot']),
      `compat: exactly the documented keys, in order (${Object.keys(compat).join(', ')})`);
    assert(typeof compat.note === 'string' && compat.note.length > 200 && /check-pin/.test(compat.note) && /generate-compat/.test(compat.note),
      'compat: the note says what the file is, who reads it and how it is regenerated');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert(compat.linter === pkg.version, `compat: linter is the package version (${compat.linter} vs ${pkg.version})`);
    const props = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8'));
    assert(compat.ui5.snapshot === props.ui5Version, `compat: ui5.snapshot is the snapshot's ui5Version (${compat.ui5.snapshot} vs ${props.ui5Version})`);
    for (const [name, value] of [['linter', compat.linter], ['framework.minimum', compat.framework.minimum],
      ['framework.mirrored', compat.framework.mirrored], ['ui5.snapshot', compat.ui5.snapshot]]) {
      assert(SEMVER.test(value), `compat: ${name} is a release number (${value})`);
    }
    assert(/^\d+\.\d+$/.test(compat.ui5.floor) && compat.ui5.floor === UI5_FLOOR,
      `compat: ui5.floor is a UI5 minor (${compat.ui5.floor})`);
    // the floor the generator states is the one the library defaults to
    const defaults = fs.readFileSync(path.join(ROOT, 'lib', 'defaults.mjs'), 'utf8').match(/minUi5: '([\d.]+)'/);
    assert(defaults && defaults[1] === compat.ui5.floor,
      `compat: ui5.floor is the library's default minUi5 (${compat.ui5.floor} vs ${defaults?.[1]})`);
    const num = (v) => v.split('.').map(Number);
    const le = (a, b) => { const [x, y] = [num(a), num(b)]; for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return true; };
    assert(compat.framework.minimum === FRAMEWORK_MINIMUM && le(compat.framework.minimum, compat.framework.mirrored),
      `compat: the mirrors are synced at or above the minimum (${compat.framework.minimum} <= ${compat.framework.mirrored})`);
    assert(le(compat.ui5.floor + '.0', compat.ui5.snapshot),
      `compat: the snapshot is at or above the floor (${compat.ui5.floor} <= ${compat.ui5.snapshot})`);

    // an offline regeneration keeps the mirrored release; --local reads it
    assert(buildCompat().framework.mirrored === compat.framework.mirrored,
      'compat: regenerating without --local keeps the committed framework.mirrored');
    assert(buildCompat({ mirrored: '9.9.9' }).framework.mirrored === '9.9.9',
      'compat: a checkout handed in through --local sets framework.mirrored');

    // published: the exports map names it, files[] ships data/
    assert(pkg.exports['./compat'] === './data/compat.json' && pkg.files.includes('data/'),
      'compat: exported as ./compat and shipped with data/');
    const dts = fs.readFileSync(path.join(ROOT, 'types.d.ts'), 'utf8');
    assert(dts.includes('declare module "@abap2ui5/linter/compat"')
      && ['note', 'linter', 'minimum', 'mirrored', 'floor', 'snapshot'].every((k) => new RegExp(`\\b${k}: string`).test(dts.slice(dts.indexOf('declare module "@abap2ui5/linter/compat"')))),
      'compat: types.d.ts declares the ./compat subpath with every key');
});

// ----------------------------------------------------------- rules page ----
section('rules page', async () => {
    const { RULES, RENDER_RULE } = await import('../../lib/findings.mjs');
    const { RULE_DOCS, CATEGORIES } = await import('../../lib/rule-docs.mjs');
    const { FIXABLE } = await import('../../lib/fix.mjs');
    const { buildPage, PAGE_FILE } = await import('../../scripts/generate-rules-page.mjs');

    // The registry plus the render gate's pseudo-rule: `render-error` is emitted
    // by no check and so is deliberately absent from RULES, but it reaches
    // reports and SARIF like any other id and the SARIF helpUri deep-links here.
    const pageRules = [...RULES, RENDER_RULE].sort();
    const documented = Object.keys(RULE_DOCS).sort();
    assert(documented.join() === pageRules.join(),
      `rules page: every rule is documented and every documented rule exists (${
        pageRules.filter((r) => !RULE_DOCS[r]).concat(documented.filter((d) => !pageRules.includes(d))).join(', ') || 'in sync'})`);

    const known = new Set(CATEGORIES.map((c) => c.id));
    assert(Object.values(RULE_DOCS).every((d) => known.has(d.category) && d.summary && d.detail),
      'rules page: every entry has a known category, a summary and a detail');

    /* …and an EXAMPLE. The suite already gated example correctness (the builder
     * verbs below); presence went ungated, and 36 of 94 rules had none - among
     * them the highest-traffic errors there are. The README delegates all rule
     * documentation to this page, so a rule without an example is a rule whose
     * documentation says a shape is wrong without ever showing the shape. */
    const exampleless = Object.entries(RULE_DOCS).filter(([, d]) => !d.example).map(([id]) => id);
    assert(!exampleless.length,
      `rules page: every rule shows the source that triggers it (no example: ${exampleless.join(', ') || 'none'})`);

    /* …and the SAME source fixed. Showing only the defect leaves the reader to
     * invent the fix, and several examples used to smuggle one in as a trailing
     * line of the same snippet - which cost `example` its meaning, because
     * nothing said which of the two lines was the reported one. The pair is
     * also what the reports deep-link at, so a rule without a remedy is a
     * report link that lands on half an answer. */
    const remedyless = Object.entries(RULE_DOCS).filter(([, d]) => !d.remedy).map(([id]) => id);
    assert(!remedyless.length,
      `rules page: every rule shows the same source fixed (no remedy: ${remedyless.join(', ') || 'none'})`);

    /* A remedy identical to the example documents nothing, and is what a
     * copy-paste while adding a rule produces. */
    const unchanged = Object.entries(RULE_DOCS).filter(([, d]) => d.example === d.remedy).map(([id]) => id);
    assert(!unchanged.length,
      `rules page: the remedy differs from the example (identical: ${unchanged.join(', ') || 'none'})`);

    // no category may become the page's dumping ground again: the abap2UI5 half
    // was one flat group of 54, which on a searchable page is no grouping at all
    const perCategory = CATEGORIES.map((c) => [c.id, Object.values(RULE_DOCS).filter((d) => d.category === c.id).length]);
    const empty = perCategory.filter(([, n]) => n === 0).map(([id]) => id);
    assert(!empty.length, `rules page: every category has rules in it (empty: ${empty.join(', ') || 'none'})`);
    const biggest = perCategory.reduce((a, b) => (b[1] > a[1] ? b : a));
    assert(biggest[1] <= pageRules.length / 3,
      `rules page: no single category holds a third of the rule set (${biggest[0]} has ${biggest[1]} of ${pageRules.length})`);

    assert(FIXABLE.every((id) => RULES.includes(id) && RULE_DOCS[id].fixNote),
      'rules page: an autofixable rule says on the page what --fix does to it');

    /* And the fix it advertises has to WORK on the example the card shows.
     * `class-constructor-visibility` shipped a card promising a fix over an
     * example the fix declines: the correction moves the declaration into the
     * PUBLIC SECTION, and the example had none to move it into - so a reader
     * pressing Autofix on exactly what the page showed them got nothing, with
     * the badge still saying fixable. Run to a fixpoint, because `--fix` is
     * documented as "run until it reports nothing". */
    {
      const { applyFixes } = await import('../../lib/fix.mjs');
      const { checkAbapRules } = await import('../observe.mjs');
      const stubborn = [];
      for (const id of FIXABLE) {
        let src = RULE_DOCS[id].example.replace(/\n?$/, '\n');
        let rounds = 0;
        for (;;) {
          const fixable = checkAbapRules(src).filter((f) => f.fixes?.length);
          if (!fixable.length) break;
          const { output } = applyFixes(src, fixable);
          if (output === src || ++rounds > 12) break;
          src = output;
        }
        if (checkAbapRules(src).some((f) => f.type === id)) stubborn.push(`${id} (${rounds} round(s))`);
      }
      assert(stubborn.length === 0,
        `rules page: --fix silences every rule on its own example (${stubborn.join(', ') || 'none'})`);
    }

    /* And a card must not teach a chain THIS PROJECT would reject. The layout
     * rules are the house style every sample corpus is held to, and the half
     * of a card labelled "the same code, fixed" is the last place a reader
     * should meet a chain that fails them. `popup-without-close-wire` did
     * exactly that: its remedy squeezed a Dialog, a Text and a buttons
     * aggregation onto two lines, and `chain-element-per-line` said so. */
    {
      const { checkAbapSource } = await import('../../lib/index.mjs');
      const badLayout = [];
      for (const id of Object.keys(RULE_DOCS)) {
        for (const half of ['example', 'remedy']) {
          let found;
          try { found = checkAbapSource(RULE_DOCS[id][half], { properties: true, minUi5: '1.71' }).findings; }
          catch { continue; }   // a snippet the parser cannot take alone is not this gate's business
          const layout = [...new Set(found.map((f) => f.type))]
            .filter((t) => t.startsWith('chain-') && t !== id);
          if (layout.length) badLayout.push(`${id}.${half} -> ${layout.join(', ')}`);
        }
      }
      assert(badLayout.length === 0,
        `rules page: no card shows a chain the layout rules reject (${badLayout.join(' | ') || 'none'})`);
    }

    const page = fs.readFileSync(PAGE_FILE, 'utf8');
    assert(page === buildPage(), 'rules page: site/index.html is in sync (npm run generate-rules-page)');

    /* The page is one document with no layout to speak of, so the only thing
     * that can push it wider than the reader's screen is a word with no break
     * opportunity in it - and the prose is full of them, because the rules are
     * about UI5: mEventRegistry, addCustomCurrencies,
     * sap.ui.unified.RecurringCalendarAppointment. Without the break the whole
     * document scrolled sideways on a phone (measured: 185px past a 320px
     * viewport, 115px past 390px), which drags every line of prose out of view,
     * not just the identifier. Inside a `pre` the opposite holds - the block
     * scrolls on its own and an ABAP line broken mid-identifier stops being
     * code you can copy - so the reset has to survive too. */
    assert(/\bcode \{[^}]*overflow-wrap: anywhere/.test(page),
      'rules page: an identifier in inline code can break rather than widen the page');
    assert(/\bpre code \{[^}]*overflow-wrap: normal/.test(page),
      'rules page: code inside a pre stays unbroken and scrolls with its block');

    /* The head the other three deployments carry, and the two things a
     * keyboard and a screen reader need. None of this was here: shared to
     * Slack the page was a bare link, its tab wore the browser's default icon,
     * the content sat in no landmark, and the FILTER - the one control the
     * page has - had a placeholder and no label, which a screen reader reads
     * as an unnamed search box. 372 things on this page take focus, so the
     * skip link is not a nicety either: without it, reaching the rules from
     * the keyboard meant tabbing past every rule id and every playground link
     * on the way. */
    for (const [what, present] of [
      ['a canonical url', /<link rel="canonical" href="https:\/\/abap2ui5\.github\.io\/linter\/">/],
      ['an og:title', /<meta property="og:title"/],
      ['an og:image', /<meta property="og:image" content="[^"]+og-image\.png">/],
      ['a twitter card', /<meta name="twitter:card"/],
      ['a favicon', /<link rel="icon"/],
      ['a theme colour for both schemes', /prefers-color-scheme: dark\)">/],
      ['ld\+json saying what it is', /"@type":"TechArticle"/],
      ['a main landmark', /<main id="rules">/],
      ['a skip link, first in the body', /<body>\s*(?:<!--[\s\S]*?-->\s*)?<a class="skip" href="#rules">/],
      ['a label on the filter', /<label class="sr-only" for="filter">/],
    ]) {
      assert(present.test(page), `rules page: the page has ${what}`);
    }

    /* …and the label is a REAL one, not a duplicate of the placeholder that
     * disappears with it. The placeholder counts the rules; the label says
     * what the field does. */
    assert(/<label class="sr-only" for="filter">Filter the rules by/.test(page)
      && /<input id="filter" type="search" placeholder="Filter \d+ rules/.test(page),
      'rules page: the filter has both a label and its placeholder, saying different things');

    /* The jump into the playground: the reported snippet wrapped into a class,
     * in the playground's own share-link format, and only on a card whose rule
     * the linter itself reports on that class - a link that opens on a clean
     * verdict would teach the reader the rule is broken. */
    const { playgroundLinks, playgroundSource, PLAYGROUND } = await import('../../scripts/generate-rules-page.mjs');
    const { OPT_IN } = await import('../../lib/findings.mjs');
    const zlib = await import('zlib');
    const links = playgroundLinks();

    /* Every card is verified, BOTH halves: the wrapped example fires the rule
     * the card is about, and the wrapped remedy does not. The page used to
     * link the playground for "at least 100" cards and say nothing about the
     * rest — 22 examples were silent once wrapped and nobody learned which,
     * and one remedy (undeclared-namespace) fired the very rule it fixed.
     * UNWRAPPABLE names the cards the frame cannot carry, each with the
     * reason; a card that becomes wrappable has to leave the list. */
    const UNWRAPPABLE = new Map([
      ['byte-order-mark', 'the frame joins lines into a class of its own: the BOM at offset 0 is gone'],
      ['crlf-line-ending', 'the frame splits on \\n and joins with \\n: a CR does not survive'],
      ['trailing-whitespace', 'the blanks the rule is about end a line the frame rewrites (the dot goes there)'],
      ['missing-final-newline', 'the frame always ends its class with a newline'],
      ['source-line-too-long', 'the shortest triggering source is a 256-column line, which the card does not print'],
      ['malformed-xml', 'the builder serializes a tree, so no class can write a document that is not well-formed - the card is raw XML'],
      ['deprecated-after-target', 'it fires only under a deprecation horizon (deprecatedAt), which the frame\'s default config never sets - test/review/deprecation-horizon.mjs judges it'],
      ['abap2ui5-api-too-new', 'it fires only when the abap2UI5 release is configured (abap2ui5), which the frame\'s default config never sets - test/review/abap2ui5-release.mjs judges it'],
      ['escape-handler-as-string', 'a view the builder produces has no controller, so the rule judges raw views and fragments only - the card is raw XML; test/review/escape-handler.mjs judges it'],
      ['nav-target-never-displays', 'it reads a SECOND class through the class index, and the frame wraps one - test/review/cross-class.mjs judges it'],
      ['xml-indentation', 'it judges the layout of a raw view file, which the builder frame does not write - test/review/raw-views.mjs judges it'],
      ['native-html-in-view', 'native markup is deprecated since 1.120, past the default 1.71 floor the frame judges against - test/review/deprecation-horizon.mjs judges it on a 1.120 target'],
    ]);
    const wrappedFires = (id, half) => {
      const file = playgroundSource(id, half);
      const rules = OPT_IN.has(id) ? { [id]: 'warning' } : {};
      return checkAbapSource(file.source, { render: false, file: file.name, rules }).findings.some((f) => f.type === id);
    };
    {
      const silent = [];
      const loud = [];
      for (const id of RULES) {
        if (UNWRAPPABLE.has(id)) continue;
        if (!wrappedFires(id, 'example')) silent.push(id);
        if (wrappedFires(id, 'remedy')) loud.push(id);
      }
      assert(silent.length === 0,
        `rules page: every example fires its own rule once wrapped into a class (silent: ${silent.join(', ') || 'none'})`);
      assert(loud.length === 0,
        `rules page: no remedy fires the rule it fixes (loud: ${loud.join(', ') || 'none'})`);
      for (const [id] of UNWRAPPABLE) {
        assert(RULES.includes(id), `rules page: UNWRAPPABLE names a rule that exists (${id})`);
        assert(!wrappedFires(id, 'example'), `rules page: ${id} wraps fine now - take it out of UNWRAPPABLE`);
      }
    }
    // the page links exactly the verified cards: every rule the frame carries,
    // minus the opt-in ones, which the playground's default config would open
    // on a clean verdict
    const linkable = RULES.filter((id) => !UNWRAPPABLE.has(id) && !OPT_IN.has(id));
    assert(links.size === linkable.length && linkable.every((id) => links.has(id)),
      `rules page: the reported code of every wrappable rule opens in the playground (${links.size} of ${linkable.length})`);
    for (const [id, url] of links) {
      assert(url.startsWith(`${PLAYGROUND}#2`), `rules page: ${id} links the playground with a version-2 share fragment`);
      const files = JSON.parse(zlib.inflateRawSync(Buffer.from(url.slice(PLAYGROUND.length + 2), 'base64url')).toString('utf8'));
      const wrapped = playgroundSource(id);
      assert(files.length === 1 && files[0].name === wrapped.name && files[0].source === wrapped.source,
        `rules page: the ${id} fragment decodes to the wrapped example`);
      assert(page.includes(`href="${url}"`), `rules page: the ${id} card carries its playground link`);
    }
    const linked = (page.match(/class="try"/g) || []).length;
    assert(linked === links.size, `rules page: exactly the verified cards link the playground (${linked} vs ${links.size})`);
    const control = JSON.parse(zlib.inflateRawSync(Buffer.from(links.get('unknown-control').slice(PLAYGROUND.length + 2), 'base64url')).toString('utf8'))[0].source;
    assert(/CLASS zcl_rule DEFINITION/.test(control) && /view->tag\( `Objectstatus` \)\./.test(control) && /view_display/.test(control),
      'rules page: a chain fragment is wrapped into a displayed view class');
    assert(pageRules.every((id) => page.includes(`<article class="rule" id="${id}"`)),
      'rules page: every rule has an anchor to link to');
    /* Self-contained: nothing the browser has to FETCH. Asked of the attributes
     * that fetch (src/href) rather than of the raw text, because a rule about a
     * commercial UI5 host has to be able to print that host in its example -
     * a URL inside a <code> block is documentation, not a request. */
    const fetched = [...page.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((m) => m[1])
      .filter((u) => /^https?:/.test(u) && !/^https:\/\/(github\.com|abap2ui5\.github\.io)\//.test(u));
    assert(!/<script\s+src|<link\b[^>]*stylesheet/.test(page) && !fetched.length,
      `rules page: self-contained - no external stylesheet, script or font (fetches: ${fetched.join(', ') || 'none'})`);
    // and the offsite links that ARE there are links, not loads
    assert(/\bhref="https:\/\/github\.com\/abap2UI5\/linter["/#]/.test(page),
      'rules page: …while still linking back to the repository');

    /* The page is served from main and every consumer pins, so without a stamp a
     * reader cannot tell which release it describes - a card for a rule their CLI
     * does not have reads exactly like a card for one it does. */
    const pkgVersion = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'package.json'), 'utf8')).version;
    assert(page.includes(`<strong>v${pkgVersion}</strong>`),
      `rules page: the page stamps the version it was generated from (v${pkgVersion})`);
    const snapshotVer = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8')).ui5Version;
    assert(page.includes(`OpenUI5 ${snapshotVer} metadata`),
      `rules page: …and the metadata snapshot it was generated against (${snapshotVer})`);

    /* Two numbers for one tool: the page counted RULES + render-error while
     * --badge counts RULES, so the same run advertised 94 and 93. The page names
     * both now, and says why they differ. */
    assert(page.includes(`Filter ${RULES.length} rules + ${RENDER_RULE}`),
      `rules page: the filter counts the configurable rules and names the pseudo-rule separately (${RULES.length})`);
    assert(page.includes(`“${RULES.length} rules passed”`) && page.includes(`${pageRules.length} cards`),
      'rules page: the footer reconciles its card count with what --badge says');

    // the footer used to send the reader to the README for "metadata snapshot
    // and gate details", which the README stopped carrying
    assert(!/README<\/a>\.\s*<\/footer>/.test(page) && page.includes('abap2ui5.github.io/docs/advanced/linter.html'),
      'rules page: the footer points at documentation that still exists');

    // There was a fifth gate here, over the README's hand-written finding
    // tables. It is gone with the tables: the rule reference is RULE_DOCS and
    // the page generated from it, and the README now links that page instead of
    // keeping a second copy of the rule list by hand. What that gate protected -
    // a rule nobody can look up - is the `every rule is documented` assertion
    // above, which reads the registry rather than a prose table.
});


// ------------------------------------------------------------- AGENTS.md ----
/* AGENTS.md was the only ungated document in the repository.
 *
 * `npm test` gates the README's dependents block, site/index.html, the JSON
 * schema, the RULE_DOCS prose and even the builder verbs inside a rule's
 * example - and nothing looked at the file that calls itself the single source
 * of truth. It had drifted in every direction a document can: nine rules
 * missing from the emit-site table, the @openui5 pins located in the wrong
 * manifest, three counts wrong, and the second published package absent
 * entirely. The counts are read off the artefacts here rather than trusted.
 */
section('AGENTS.md', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const core = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
    const { RULES } = await import('../../lib/findings.mjs');

    /* AGENTS.md is read at the start of every session, so its size is paid on
     * every task. It was 156 kB - a 43 kB table of rule ids per module, cells
     * of several thousand characters, and 62 kB of rule history - and a file
     * that size is read badly or not at all. The parts are in docs/agents/
     * now, read when the task comes up, and this is what keeps the core from
     * growing back: new knowledge goes into the file the table names. */
    const AGENTS_BUDGET = 20_000;
    assert(Buffer.byteLength(core) <= AGENTS_BUDGET,
      `AGENTS: the core file stays within its budget (${Buffer.byteLength(core)} of ${AGENTS_BUDGET} bytes) - put detail into docs/agents/, a pointer here`);
    const longest = Math.max(...core.split('\n').map((l) => l.length));
    assert(longest <= 400, `AGENTS: no line is a paragraph in a table cell (longest: ${longest} characters)`);

    /* Every part is reachable from the core, and every pointer leads somewhere. */
    const dir = path.join(ROOT, 'docs', 'agents');
    const parts = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
    const named = [...new Set([...core.matchAll(/`docs\/agents\/([\w-]+\.md)`/g)].map((m) => m[1]))].sort();
    assert(parts.every((n) => named.includes(n)),
      `AGENTS: every file in docs/agents/ is named in the core's table (unnamed: ${parts.filter((n) => !named.includes(n)).join(', ') || 'none'})`);
    assert(named.every((n) => parts.includes(n)),
      `AGENTS: every docs/agents/ file the core names exists (missing: ${named.filter((n) => !parts.includes(n)).join(', ') || 'none'})`);
    // the content gates below read the core and its parts as one document
    const agents = [core, ...parts.map((n) => fs.readFileSync(path.join(dir, n), 'utf8'))].join('\n');

    /* Which rule is defined where used to be a hand-written table here, with
     * three assertions to keep it true: every id listed, in the row of the
     * file that emits it, and no id that is not a rule. It is GENERATED now
     * (scripts/generate-rule-map.mjs, from the registry and the emit sites),
     * so the one assertion is that the committed map is the generated one. */
    const { buildRuleMap, RULE_MAP_FILE } = await import('../../scripts/generate-rule-map.mjs');
    const map = buildRuleMap();
    assert(fs.readFileSync(RULE_MAP_FILE, 'utf8') === map,
      'AGENTS: docs/agents/rule-map.md is in sync (npm run generate-rule-map)');
    const rows = map.split('\n').filter((l) => /^\| `[a-z]/.test(l));
    assert(rows.length === RULES.length && RULES.every((id) => rows.some((l) => l.startsWith(`| \`${id}\` |`))),
      `AGENTS: the map has one row per rule (${rows.length} rows, ${RULES.length} rules)`);
    assert(rows.every((l) => fs.existsSync(path.join(ROOT, l.match(/`(lib\/[\w/.-]+)` \|$/)?.[1] ?? 'nope'))),
      'AGENTS: every row names a file that exists');

    /* The quoted snapshot numbers, read off the snapshot. They were 988 controls
     * and 219 enums against an artefact holding 973 and 235 - retyped once and
     * never again. */
    const props = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8'));
    const controls = Object.keys(props.controls).length;
    const enums = Object.keys(props.enums).length;
    const kB = Math.round(fs.statSync(path.join(ROOT, 'data', 'properties.json')).size / 1024);
    const quoted = agents.match(/The (\d+) KB one-line snapshot \(`ui5Version` ([\d.]+), (\d+) controls, (\d+)\s*\n?enums\)/);
    assert(quoted, 'AGENTS: the snapshot header sentence is where the gate expects it');
    assert(quoted && Number(quoted[3]) === controls && Number(quoted[4]) === enums,
      `AGENTS: the quoted control/enum counts match the snapshot (says ${quoted?.[3]}/${quoted?.[4]}, is ${controls}/${enums})`);
    assert(quoted && quoted[2] === props.ui5Version,
      `AGENTS: …and the quoted ui5Version (says ${quoted?.[2]}, is ${props.ui5Version})`);
    assert(quoted && Math.abs(Number(quoted[1]) - kB) <= 5,
      `AGENTS: …and the file size, to within a rounding (says ${quoted?.[1]} KB, is ${kB} KB)`);

    /* The assertion count, as a FLOOR. An exact number would have to be edited by
     * every PR that adds one; a floor only fails when assertions are removed,
     * which is the direction worth catching. */
    const floorQuoted = agents.match(/over (\d+) assertions/);
    assert(floorQuoted, 'AGENTS: the build section quotes an assertion floor');
    // counted from the source rather than at runtime, so the comparison does not
    // depend on where in the file this assertion happens to sit
    const suiteFiles = [path.join(ROOT, 'test', 'run.mjs'), ...fs.readdirSync(path.join(ROOT, 'test', 'sections'))
      .filter((n) => n.endsWith('.mjs')).map((n) => path.join(ROOT, 'test', 'sections', n))];
    const assertSites = suiteFiles.reduce((n, file) => n + (fs.readFileSync(file, 'utf8').match(/assert\(/g) ?? []).length, 0);
    assert(floorQuoted && Number(floorQuoted[1]) <= assertSites,
      `AGENTS: the quoted assertion floor is one this suite still clears (says over ${floorQuoted?.[1]}, has ${assertSites} call sites)`);

    // the second published package, absent from this file entirely until 2026-08
    assert(/^## `@abap2ui5\/linter-render`/m.test(agents)
      && agents.includes('linter-render/package.json')
      && agents.includes('optional peer'),
    'AGENTS: the render runtime - the second package, the peer split, the workspace - has a section');
    assert(!/pins in `package\.json`/.test(agents),
      'AGENTS: the @openui5 pins are located in the workspace manifest, where they actually are');
});

// ------------------------------------------------- line endings ----
/* The suite reads repository files at 93 call sites and cuts fixtures apart
 * with \n-anchored patterns. On a Windows clone with the default
 * core.autocrlf=true those patterns match nothing, and a pattern that stops
 * matching does not fail - it passes by checking less. Six suites went red on
 * the windows-latest job for exactly that reason, while the LINTER itself was
 * measured to report identically on CRLF input.
 *
 * `.gitattributes` pins every checkout to LF. This is the gate that says so,
 * because the alternative is trusting a setting nobody re-reads. */
section('line endings', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const attrs = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
    assert(/^\*\s+text=auto\s+eol=lf$/m.test(attrs),
      'line endings: .gitattributes pins the whole tree to LF');

    const crlf = [];
    const skip = new Set(['node_modules', '.git', '.playwright']);
    const walk = (dir, rel = '') => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const at = path.join(dir, e.name);
        const key = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { walk(at, key); continue; }
        if (!/\.(abap|mjs|json|jsonc|md|yml|xml|html|ts|sh)$/.test(e.name)) continue;
        if (fs.readFileSync(at).includes('\r\n')) crlf.push(key);
      }
    };
    walk(ROOT);
    assert(!crlf.length,
      `line endings: no tracked text file carries CRLF (${crlf.slice(0, 5).join(', ') || 'none'})`);
});

// ------------------------------------- workflows and the composite action ----
/* The Action is the surface every EXTERNAL consumer runs, and until it got a
 * CI job of its own nothing in this repository executed it: a broken `run:`
 * block shipped green. That job cannot run here, so what the suite pins is the
 * half that is checkable from the file - the pins, and the promise that every
 * input the shell reads is an input the action declares.
 */
section('workflows', async () => {
    const ROOT = path.join(FIX, '..', '..');
    const WF = path.join(ROOT, '.github', 'workflows');
    const workflows = fs.readdirSync(WF).filter((n) => n.endsWith('.yml'));
    const action = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');

    /* Every third-party action is pinned by SHA. It was true of the workflows
     * and NOT of action.yml, which floated on actions/setup-node@v7 - the one
     * file that runs inside other people's CI. */
    const floating = [];
    for (const [name, text] of [['action.yml', action],
      ...workflows.map((n) => [n, fs.readFileSync(path.join(WF, n), 'utf8')])]) {
      for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm)) {
        const ref = m[1];
        if (ref.startsWith('./')) continue;            // this repository's own action
        if (!/@[0-9a-f]{40}$/.test(ref)) floating.push(`${name}: ${ref}`);
      }
    }
    assert(!floating.length,
      `workflows: every third-party action is pinned by SHA (floating: ${floating.join(', ') || 'none'})`);

    // …and a pinned SHA without the version comment is a pin nobody can read
    const unlabelled = [];
    for (const [name, text] of [['action.yml', action],
      ...workflows.map((n) => [n, fs.readFileSync(path.join(WF, n), 'utf8')])]) {
      for (const m of text.matchAll(/^\s*(?:-\s+)?uses:\s*[^\s#]+@[0-9a-f]{40}(.*)$/gm)) {
        if (!/#\s*v?\d/.test(m[1])) unlabelled.push(name);
      }
    }
    assert(!unlabelled.length,
      `workflows: every SHA pin carries the version it stands for (bare: ${[...new Set(unlabelled)].join(', ') || 'none'})`);

    /* `npm install -g npm@latest` inside the PUBLISHING job hands whatever npm
     * shipped this morning the run that holds the OIDC identity. */
    const release = fs.readFileSync(path.join(WF, 'release.yml'), 'utf8');
    assert(!/npm@latest/.test(release) && /npm install -g npm@\d+\.\d+\.\d+/.test(release),
      'workflows: the publishing job installs a PINNED npm, not @latest');

    // a superseded push should stop costing runners
    for (const name of ['ci.yml', 'downstream.yml']) {
      assert(/^concurrency:/m.test(fs.readFileSync(path.join(WF, name), 'utf8')),
        `workflows: ${name} has a concurrency group`);
    }

    /* The action reads its inputs through env only (a `${{ }}` interpolated into
     * `run:` is a shell injection), and every env binding has to name an input
     * that exists - a typo there is silently the empty string. */
    const declared = new Set([...action.matchAll(/^ {2}([a-z][a-z0-9-]*):\n {4}description:/gm)].map((m) => m[1]));
    const referenced = [...action.matchAll(/\$\{\{\s*inputs(?:\.([a-z0-9-]+)|\['([^']+)'\])\s*\}\}/g)]
      .map((m) => m[1] ?? m[2]);
    const undeclaredInputs = [...new Set(referenced)].filter((i) => !declared.has(i));
    assert(declared.size > 5 && !undeclaredInputs.length,
      `action: every referenced input is declared (undeclared: ${undeclaredInputs.join(', ') || 'none'})`);
    /* The shell bodies themselves, extracted by indentation: a `${{ }}` inside
     * one is a command injection waiting for a crafted input, which is why every
     * value travels through `env:` instead. `if:` conditions are expressions,
     * not shell, and are correctly left out. */
    const shellBodies = [];
    {
      const lines = action.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const open = lines[i].match(/^(\s*)run:\s*(.*)$/);
        if (!open) continue;
        const indent = open[1].length;
        // a one-line `run: cmd` is its own body; `run: |` collects what follows
        if (!/^[|>]/.test(open[2])) { shellBodies.push(open[2]); continue; }
        const body = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && (lines[j].match(/^\s*/)[0].length <= indent)) break;
          body.push(lines[j]);
        }
        shellBodies.push(body.join('\n'));
      }
    }
    assert(shellBodies.length >= 3 && !shellBodies.some((b) => b.includes('${{')),
      `action: inputs reach the shell through env, never interpolated into a run: block (${shellBodies.length} shell bodies checked)`);

    // the outputs a consumer workflow can gate on
    const outputs = action.slice(action.indexOf('\noutputs:'), action.indexOf('\nruns:'));
    for (const name of ['problems', 'errors', 'warnings', 'hints', 'files', 'exit-code']) {
      assert(new RegExp(`^  ${name}:$`, 'm').test(outputs), `action: declares the '${name}' output`);
    }

    /* One Node version, said in four places: package.json engines, .nvmrc,
     * .node-version, and every workflow's `node-version:`. The version managers
     * read the dotfiles and nothing read them back, so they could say anything. */
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const floor = pkg.engines.node.replace(/^>=\s*/, '').split('.')[0];
    for (const name of ['.nvmrc', '.node-version']) {
      const at = path.join(ROOT, name);
      assert(fs.existsSync(at) && fs.readFileSync(at, 'utf8').trim().split('.')[0] === floor,
        `workflows: ${name} names the engines floor (${floor})`);
    }
    const wrongNode = [];
    for (const name of workflows) {
      const text = fs.readFileSync(path.join(WF, name), 'utf8');
      for (const m of text.matchAll(/node-version:\s*(\S+)/g)) {
        if (m[1].startsWith('${{')) continue;          // a matrix entry, checked by its own list
        if (String(m[1]).split('.')[0] !== floor) wrongNode.push(`${name}: ${m[1]}`);
      }
    }
    assert(!wrongNode.length,
      `workflows: every hardcoded node-version is the engines floor (off: ${wrongNode.join(', ') || 'none'})`);

    // the hygiene files a package published with provenance and consumed by nine
    // repositories owes a reader looking for where to report something
    for (const name of ['SECURITY.md', 'CONTRIBUTING.md']) {
      assert(fs.existsSync(path.join(ROOT, name)), `repo: ${name} exists`);
    }
    assert(fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8').includes('security/advisories/new'),
      'repo: SECURITY.md names the private reporting path, not a public issue');
    for (const name of ['CODEOWNERS', 'pull_request_template.md', 'ISSUE_TEMPLATE/config.yml']) {
      assert(fs.existsSync(path.join(ROOT, '.github', name)), `repo: .github/${name} exists`);
    }

    /* The badge wording drifts with the rule count and it is user-visible - the
     * action's input description said 83 while the registry had 93. Everywhere
     * that quotes the number rather than counting it is checked here; the badge
     * ITSELF counts (lib/report.mjs), which is why that file quotes nothing. */
    const { RULES } = await import('../../lib/findings.mjs');
    const stale = [];
    for (const name of ['action.yml', 'cli.mjs', 'scripts/generate-schema.mjs', 'data/abap2ui5lint.schema.json']) {
      const text = fs.readFileSync(path.join(ROOT, name), 'utf8');
      for (const m of text.matchAll(/(\d+) rules passed/g)) {
        if (Number(m[1]) !== RULES.length) stale.push(`${name}: ${m[1]}`);
      }
    }
    assert(!stale.length,
      `action: every quoted rule count is today's (registry has ${RULES.length}; stale: ${stale.join(', ') || 'none'})`);
    assert(!/\d+ rules passed/.test(fs.readFileSync(path.join(ROOT, 'lib', 'report.mjs'), 'utf8')),
      'report: the badge writer quotes no count of its own - it counts the registry at run time');
});

// ------------------------------------------------------- used-by block ----
/* The README's "Used by" list is scraped off GitHub's dependents page, which
 * is markup nobody here owns and no API replaces. The suite cannot regenerate
 * it (that needs network), so what it pins instead is the parser against a
 * saved copy of that page, and the shape of the committed block — the two
 * halves that would fail silently: a layout change that parses to nothing,
 * and a block that quietly stopped naming anyone.
 */
section('used-by', async () => {
    const dep = await import('../../scripts/generate-dependents.mjs');
    const page = fs.readFileSync(f('dependents-page.html'), 'utf8');
    const rows = dep.parseDependents(page);

    assert(rows.length === 3 && rows.every((r) => r.owner && r.repo),
      `used-by: every Box-row on the saved page yields one owner/repo (${rows.length} of 3)`);
    assert(rows.some((r) => r.owner === 'abap2UI5-addons' && r.repo === 'se16n')
      && !rows.some((r) => r.repo === 'abap2UI5-addons'),
      'used-by: the repository anchor is read, not the owner anchor beside it');
    assert(dep.parseDependents(page + page).length === 3,
      'used-by: a repository listed twice across pages is counted once');

    // the pager carries an opaque cursor, and "Previous" carries one too
    assert(/dependents_after=Y3Vyc29yOjMw$/.test(dep.nextPage(page) ?? ''),
      `used-by: the Next cursor is followed, the Previous one is not (${dep.nextPage(page)})`);
    assert(dep.nextPage(page.replace(/>\s*Next/, '>Done')) === null,
      'used-by: the last page ends the walk');

    const block = dep.renderBlock(rows);
    assert(block.startsWith(dep.START) && block.endsWith(dep.END)
      && block.includes('**3 public repositories**')
      && block.includes('- [abap2UI5/samples](https://github.com/abap2UI5/samples)'),
      'used-by: the block counts what it lists and links every entry');
    assert(dep.renderBlock([{ owner: 'a', repo: 'b' }]).includes('**1 public repository**'),
      'used-by: one dependent is not "1 repositories"');

    /* Walking the pager is the other half nothing else covers: the cursor cuts
     * a list that keeps moving, so a repository can appear on two pages and
     * would be listed twice. Stubbed fetch — the point is the walk, not GitHub.
     */
    {
      const realFetch = globalThis.fetch;
      const asked = [];
      const secondPage = page.replace(/>\s*Next/, '>Done');
      globalThis.fetch = async (url) => {
        asked.push(url);
        return { ok: true, status: 200, text: async () => (asked.length === 1 ? page : secondPage) };
      };
      const walked = await dep.collect();
      globalThis.fetch = realFetch;
      assert(asked.length === 2 && walked.length === 3,
        `used-by: the walk follows the cursor and counts each repository once (${asked.length} pages, ${walked.length} rows)`);
    }

    const readme = fs.readFileSync(dep.README_FILE, 'utf8');
    assert(dep.applyToReadme(readme, block) !== readme
      && dep.applyToReadme(dep.applyToReadme(readme, block), block) === dep.applyToReadme(readme, block),
      'used-by: rewriting the block replaces it rather than stacking copies');

    const committed = readme.slice(readme.indexOf(dep.START), readme.indexOf(dep.END));
    assert(committed.includes('do not edit by hand')
      && (committed.match(/^- \[[^\]]+\]\(https:\/\/github\.com\//gm) ?? []).length >= 1,
      'used-by: the committed block is generated and still names dependents');
});


// --------------------------------------------------- github-app spike ----
/* experimental/github-app/ imports six symbols out of lib/ and nothing here
 * used to import IT, so a rename in findings.mjs or report.mjs broke the spike
 * silently - "documentation that happens to execute" only holds while it still
 * executes. These assertions are deliberately about the SEAM (the imports
 * resolve, the payload has the shape GitHub's API requires, the config is read
 * through the CLI's own loader) and not about the rules, which the rest of the
 * suite already covers.
 */
section('github-app', async () => {
    const { CHECKABLE, lintSource, toAnnotations, summarize: appSummarize } =
      await import('../../experimental/github-app/review.mjs');
    const src = fs.readFileSync(f('viewrules.clas.abap'), 'utf8');

    assert(CHECKABLE.test('src/zcl_app.clas.abap') && CHECKABLE.test('src/a.view.xml')
      && CHECKABLE.test('src/a.fragment.xml') && !CHECKABLE.test('src/a.testclasses.abap'),
    'github-app: the checkable-file pattern is the abapGit convention the CLI scans by');

    const found = lintSource('src/zcl_app.clas.abap', src);
    assert(found.length > 0 && found.every((x) => x.type),
      `github-app: lintSource lints in memory, no checkout (${found.length} findings)`);
    assert(!lintSource('src/zcl_app.clas.abap', src, { rules: { 'missing-accessibility': false } })
      .some((x) => x.type === 'missing-accessibility'),
    'github-app: the repo\'s rules block reaches the in-memory gate');

    const ann = toAnnotations('src/zcl_app.clas.abap', found);
    assert(ann.length === found.length && ann.every((a) => a.path === 'src/zcl_app.clas.abap'
      && Number.isInteger(a.start_line) && a.start_line >= 1 && a.start_line === a.end_line
      && ['failure', 'warning', 'notice'].includes(a.annotation_level)
      && a.message && a.title.length <= 255),
    'github-app: every annotation carries the fields the check-runs API requires');
    // the order is problemsOf's order, which is the order the CLI prints in
    const lines = ann.map((a) => a.start_line);
    assert(lines.every((l, i) => i === 0 || lines[i - 1] <= l),
      'github-app: annotations come out in source order, like the CLI report');

    const clean = appSummarize([], []);
    assert(clean.conclusion === 'neutral' && /nothing to check/.test(clean.title),
      'github-app: a pull request touching no view is neutral, not green');
    assert(appSummarize(['a.clas.abap'], []).conclusion === 'success',
      'github-app: no findings is a pass');
    const failed = appSummarize(['a.clas.abap'], found, 'warning');
    assert(failed.conclusion === 'failure' && /which is what fails this check/.test(failed.summary),
      `github-app: findings at or above failOn fail the check (${failed.conclusion})`);
    assert(appSummarize(['a.clas.abap'], found, 'never').conclusion === 'success',
      'github-app: failOn decides the conclusion, the same knob the CLI has');

    /* configAt used to run JSON.parse(stripJsonc(raw)) itself, so a key that
     * stops the CLI dead was silently ignored by the App - which contradicts its
     * one promise. It goes through the CLI's own validator now. */
    const { parseConfig } = await import('../../lib/config.mjs');
    let cfgThrew = '';
    try { parseConfig('abap2ui5lint.jsonc', '{"tpyo": 1}'); } catch (e) { cfgThrew = e.message; }
    assert(/unknown key 'tpyo'/.test(cfgThrew),
      'github-app: the config text the App fetches is validated exactly as the CLI validates the file');
    let ruleThrew = '';
    try { parseConfig('abap2ui5lint.jsonc', '{"rules": {"no-such-rule": false}}'); } catch (e) { ruleThrew = e.message; }
    assert(/unknown rule 'no-such-rule'/.test(ruleThrew),
      'github-app: and an unknown rule id fails there too');
    assert(parseConfig('c', '{"ui5": "1.96", // a comment\n}').minUi5 === '1.96',
      'github-app: parseConfig still reads jsonc - comments and trailing commas');

    // the dry run is the only end-to-end path testable without registering an
    // App, and ci.yml runs it too
    {
      const cp = await import('node:child_process');
      const out = cp.execFileSync('node',
        [path.join(FIX, '..', '..', 'experimental', 'github-app', 'dryrun.mjs'), FIX, '--json'],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const payload = JSON.parse(out);
      assert(payload.name === 'abap2UI5-linter (property gate)' && payload.status === 'completed'
        && payload.output.annotations.length > 0 && payload.output.annotations.length <= 50,
      `github-app: dryrun prints a postable check-run payload, first batch capped at 50 (${payload.output.annotations.length})`);
    }
});
}
