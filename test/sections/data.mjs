/*
 * test/sections/data - loaded by test/run.mjs, in order. Moved out of
 * test/run.mjs as it stood; see test/sections/README.md.
 */
export default async function (H) {
  const { fs, os, path, pathToFileURL, test, checkXmlSource, f, FIX, assert, section, by, broken, has, rules, view, xml } = H;


// --------------------------------------------------------- upstream mirror ----
section('upstream', async () => {
    /* The parsers that found these sets in abap2UI5's sources moved to
     * abap2UI5 with the manifest (its generate-linter-manifest.mjs, tested
     * there); what is left here is the mirror's own half. */
    const { CC_CONTROLS, ccMirrorScript } = await import('../../lib/cc-controls.mjs');
    const script = ccMirrorScript();
    assert(Object.keys(CC_CONTROLS).every((n) => script.includes(`'z2ui5/cc/${n}'`)),
      'cc-controls: the harness script is generated from CC_CONTROLS, one define per mirrored control');
    assert(script.includes('TokenKeyCell') && script.includes('TokenTextCells'),
      'cc-controls: the suggestion-row validator properties reach the harness');
});

// ------------------------------------------------ relative asset URLs ----
/* A demo-kit sample is served from the SDK page and resolves `./test-resources/…`
 * there; an abap2UI5 app is served from the ICF node and has no document root,
 * so the asset 404s and the control shows its placeholder - a failure with no
 * error anywhere. The fixture carries the three broken shapes and six that must
 * stay silent, because the scope is what decides whether this is a rule or a
 * nuisance. Found in abap2UI5/samples-controls apps 401/402/412/587, ten paths. */
section('relative-asset-url', async () => {
    const found = checkXmlSource(fs.readFileSync(f('relativeasset.view.xml'), 'utf8'), { minUi5: '1.71' })
      .findings.filter((x) => x.type === 'relative-asset-url');
    assert(found.length === 3,
      `relative-asset-url: the three document-relative UI5 paths are reported (${found.length})`);
    assert(found.some((x) => x.value.startsWith('./test-resources/'))
        && found.some((x) => x.value.startsWith('test-resources/'))
        && found.some((x) => x.value.startsWith('../resources/sap/')),
      'relative-asset-url: ./, bare and ../ forms are all caught');
    const quiet = ['https://', 'sap-icon://', 'data:', '//example.org', '{/', './img/'];
    assert(quiet.every((q) => !found.some((x) => x.value.startsWith(q))),
      'relative-asset-url: absolute, icon, data, protocol-relative, bound and non-UI5-tree paths stay silent');
});

// ------------------------------------------------- metadata drift gate ----
// generate-metadata --check took ~3 minutes before the extend-scan fix and
// lived in its own CI step; at ~2 seconds it belongs in the suite
section('metadata drift gate', async () => {
    const cp = await import('node:child_process');
    let ok = true;
    let msg = '';
    try {
      cp.execFileSync('node', [path.join(FIX, '..', '..', 'scripts', 'generate-metadata.mjs'), '--check'], { encoding: 'utf8' });
    } catch (e) { ok = false; msg = (e.stderr || e.stdout || '').trim(); }
    assert(ok, `metadata: data/properties.json is in sync — npm run generate-metadata (${msg})`);

    /* And in sync from a filesystem that hands the walk back in another order.
     *
     * `readdirSync` order is a property of the FILESYSTEM: ext4 hands back
     * `Dialog.js` before `delegate/`, NTFS sorts case-insensitively and hands
     * back `delegate/` first. That order decided the key order of the snapshot,
     * so windows-latest generated the same 973 controls with the same values in
     * another sequence and this gate called it stale - on a tree byte-identical
     * to the green ubuntu one (linter#67).
     *
     * The walk sorts now, and this is what says so on every platform: run the
     * generator with readdir wrapped to return NTFS order and require the same
     * bytes. Without the sort in collect() this run differs; asserting it here
     * is what keeps the regression off one leg of the matrix. */
    const ntfs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'a2u5-ntfs-')), 'run.mjs');
    const out = `${ntfs}.json`;
    fs.writeFileSync(ntfs, `import fs from 'fs';
const real = fs.readdirSync;
fs.readdirSync = (dir, opts) => {
  const r = real(dir, opts);
  if (!Array.isArray(r)) return r;
  return [...r].sort((a, b) => {
    const x = (a.name ?? a).toLowerCase(); const y = (b.name ?? b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
};
await import(${JSON.stringify(pathToFileURL(path.join(FIX, '..', '..', 'scripts', 'generate-metadata.mjs')).href)});
`);
    let reordered = true;
    let why = '';
    try {
      cp.execFileSync('node', [ntfs, '--out', out], { encoding: 'utf8' });
      const a = fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8');
      reordered = fs.readFileSync(out, 'utf8') === a;
    } catch (e) { reordered = false; why = (e.stderr || e.message || '').trim(); }
    finally { fs.rmSync(path.dirname(ntfs), { recursive: true, force: true }); }
    assert(reordered,
      `metadata: the snapshot does not depend on readdir order — a case-insensitive (NTFS) walk produces the same bytes ${why}`);
});

/* `@ui5-experimental-since` is a version tag like any other and the snapshot has
 * to carry it. It used to be read at CLASS level only, so a MEMBER carrying it
 * landed with no version at all and was treated as base version - i.e. silently
 * passed at any floor. 55 members were in that state; these three pin the two
 * halves of the fix (the version, and the flag that says which tag it came
 * from) against a member whose own JSDoc carries the tag today. */
section('metadata', async () => {
    const props = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'properties.json'), 'utf8'));
    const tok = props.controls['sap.m.Tokenizer']?.properties ?? {};
    assert(tok.multiLine?.since === '1.142',
      `metadata: an @ui5-experimental-since member carries its version (Tokenizer.multiLine ${tok.multiLine?.since})`);
    assert(tok.multiLine?.experimental === true,
      'metadata: an @ui5-experimental-since member is flagged experimental, so a consumer can tell it from a plain @since');
    assert(tok.width?.since === undefined && tok.width?.experimental === undefined,
      'metadata: a member with neither tag stays version-less — absent still means base version');
});

// --------------------------------------------------- icon data integrity ----
/* The icon snapshot cannot have a drift gate like properties.json: it is built
 * by packing 79 OpenUI5 releases from the registry, so --check would need
 * network on every test run. The committed file IS the contract, and what is
 * checkable offline is that it says what the rules assume it says. */
section('icons', async () => {
    const icons = JSON.parse(fs.readFileSync(path.join(FIX, '..', '..', 'data', 'icons.json'), 'utf8'));
    const names = Object.keys(icons.icons);
    assert(icons.floor === '1.71',
      `icons: the data's floor is the release the rules treat as "at or before" (got ${icons.floor})`);
    assert(names.length > 650, `icons: the registry is populated (${names.length} names)`);
    assert(names.every((n) => n === n.toLowerCase()),
      'icons: every name is stored lower-cased — IconPool reads the name as a URI hostname, so comparisons are case-insensitive');
    const floorCount = names.filter((n) => icons.icons[n] === '1.71').length;
    assert(floorCount > 600, `icons: most glyphs predate the floor (${floorCount} at 1.71)`);
    assert(names.some((n) => icons.icons[n] !== '1.71'),
      'icons: the scan covers releases ABOVE the floor — otherwise icon-too-new can never fire');
    /* The three glyphs the rules' documentation names by hand. If a regeneration
     * moves one of these, the README, the rules page and the ui5-check entry all
     * became wrong in the same moment. */
    assert(icons.icons.information === '1.80' && icons.icons['clear-all'] === '1.86',
      `icons: the documented arrivals hold (information ${icons.icons.information}, clear-all ${icons.icons['clear-all']})`);
    assert(icons.icons['message-information'] === '1.71' && icons.icons.eraser === '1.71',
      'icons: ...and so do the 1.71 replacements the messages point at');
    assert(!('textformatting' in icons.icons),
      'icons: a camelCase name resolves to no glyph in any release — the unknown-icon case');
    assert(Object.keys(icons.removed).every((n) => n in icons.icons),
      'icons: a removed glyph is still a name that once existed, so it carries a since as well');
});

// ------------------------------------------------ the snapshot pairing ----
/* Two npm packages come out of one tag, and the split is only safe while they
 * describe the SAME OpenUI5 release: data/properties.json and data/icons.json
 * answer `@since` from the version they were generated at, while the render
 * gate loads whatever @openui5 the linter-render workspace pins. Let those
 * drift and the two gates disagree about the same control - the property gate
 * calling a member too new for a runtime that already ships it, or worse, the
 * silent direction: staying quiet about a member the loaded runtime does not
 * have. Nothing else enforces the pairing; RELEASING.md only says it must
 * hold, and a hand-written release step is exactly what forgets it. */
section('snapshots', async () => {
    const dir = path.join(FIX, '..', '..');
    const props = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'properties.json'), 'utf8'));
    const iconData = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'icons.json'), 'utf8'));
    const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'linter-render', 'package.json'), 'utf8'));
    const pinned = Object.entries(runtime.dependencies || {})
      .filter(([n]) => n.startsWith('@openui5/'))
      .map(([n, v]) => [n, String(v).replace(/^[\^~]/, '')]);

    assert(props.ui5Version === iconData.ui5Version,
      `snapshots: the property and icon data are generated at one release (properties ${props.ui5Version}, icons ${iconData.ui5Version})`);

    const off = pinned.filter(([, v]) => v !== props.ui5Version);
    assert(pinned.length > 0 && off.length === 0,
      `snapshots: linter-render loads the release the data describes - ${props.ui5Version} (${
        off.length ? off.map(([n, v]) => `${n}@${v}`).join(', ') : `${pinned.length} @openui5 pins agree`})`);
});


}
