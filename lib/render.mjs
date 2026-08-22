/*
 * render — headless render gate: load a view with a real XMLView.create in
 * Chromium against the OpenUI5 runtime served locally from the @openui5/*
 * npm source packages. No network needed at run time.
 *
 * Extracted from abap2UI5/samples-controls scripts/render-smoke.mjs. What it
 * catches: invalid XML, unknown controls/aggregations/properties, strict
 * property-type violations, broken expression-binding syntax, renderer
 * crashes — with UI5 'future' mode active around view creation so silent
 * "unknown setting" warnings become reported errors. What it cannot catch:
 * event round-trips, visual/UX fidelity.
 *
 * The harness provides what the abap2UI5 runtime provides on every view slot:
 * a stub controller with the eB/eF event entry points, the device> model, an
 * empty message> model, the z2ui5/model/formatter module (mirror of the
 * framework's curated formatter contract) and metadata-only mirrors of the
 * bundled custom controls used declaratively in views.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { ccMirrorScript } from './cc-controls.mjs';

const require = createRequire(import.meta.url);

/*
 * The runtime package that carries everything below. It is an OPTIONAL PEER
 * dependency, not an optionalDependency: npm installs optional dependencies
 * by DEFAULT, so shipping the ~118 MB of @openui5 that way turned the
 * advertised `npx @abap2ui5/linter src` into a ~123 MB download before it
 * linted anything - and `--omit=optional`, the documented way out, is not a
 * flag npx accepts. An optional peer is the one kind npm does not install on
 * its own.
 */
export const RENDER_RUNTIME = '@abap2ui5/render-runtime';

/*
 * Resolution goes THROUGH the runtime package when it is installed, rather
 * than trusting npm to hoist @openui5 next to this one. A flat npm tree does
 * hoist them, which is why the bare lookup below still works as a fallback;
 * pnpm and other nested layouts do not, and there the render gate would call
 * a complete install missing.
 */
function runtimeRequire() {
  try {
    return createRequire(require.resolve(`${RENDER_RUNTIME}/package.json`));
  } catch {
    return require;
  }
}

/*
 * Everything the render gate needs beyond the property gate. All of it ships
 * in RENDER_RUNTIME; a property-only consumer (--no-render, or a library user
 * who never calls openRenderer) installs none of it.
 */
export const RENDER_DEPS = Object.freeze([
  'playwright',
  '@openui5/sap.f',
  '@openui5/sap.m',
  '@openui5/sap.tnt',
  '@openui5/sap.ui.codeeditor',
  '@openui5/sap.ui.core',
  '@openui5/sap.ui.integration',
  '@openui5/sap.ui.layout',
  '@openui5/sap.ui.table',
  '@openui5/sap.ui.unified',
  '@openui5/sap.uxap',
  '@openui5/themelib_sap_horizon',
]);

/*
 * What only the PICTURE needs, on top of the gate's runtime: the theme
 * compiler. It ships in the same runtime package (so one install still gets
 * everything) but is deliberately NOT part of RENDER_DEPS - the gate decides
 * whether a view survives creation, which no stylesheet takes part in, and a
 * missing compiler must never be a reason for the gate to refuse to run.
 */
export const SCREENSHOT_DEPS = Object.freeze(['less-openui5']);

/** The render deps this install is missing ([] = render gate available).
 *  `resolve` is injectable so the not-installed path stays testable on a
 *  machine that has everything. */
export function missingRenderDeps(resolve = runtimeRequire().resolve) {
  const missing = [];
  for (const dep of RENDER_DEPS) {
    try {
      // the @openui5 source packages have no main, so resolve the package
      // manifest first; fall back to the bare id for packages whose exports
      // map hides ./package.json
      resolve(`${dep}/package.json`);
    } catch {
      try {
        resolve(dep);
      } catch {
        missing.push(dep);
      }
    }
  }
  return missing;
}

/** The actionable refusal openRenderer throws — names what is missing and
 *  both ways out (install the optional deps, or skip the render gate). */
export function renderDepsError(missing) {
  const e = new Error(
    'the render gate needs the UI5 runtime, and this install is missing: '
    + `${missing.join(', ')}. They ship in ${RENDER_RUNTIME}, an optional peer `
    + `of @abap2ui5/linter that npm does not install on its own — add it: `
    + `npm install -D ${RENDER_RUNTIME} && npx playwright install chromium. `
    + 'Property-gate-only runs need none of this: pass --no-render (CLI/Action) '
    + 'or render: false (library).',
  );
  e.code = 'ERR_RENDER_DEPS_MISSING';
  return e;
}

/*
 * The refusal above is right for a run that ASKED for the render gate, and
 * wrong for one that merely did not switch it off. The gate is on by default
 * and its runtime is deliberately not installed by default, so the advertised
 * `npx @abap2ui5/linter src` - "no install, one run" - refused to lint
 * anything at all on a fresh install: exit 2, not one finding, for the first
 * command the README gives a new user.
 *
 * So a DEFAULT-on render gate without its runtime falls back to the property
 * gate and says so on stderr. An ASKED-for one - `--render`, or `render: true`
 * in abap2ui5lint.jsonc - still gets the hard refusal: quietly not running a
 * gate that someone configured is how a green CI stops meaning anything, and
 * naming the gate in the config is the way to promise it ran.
 *
 * The decision needs no I/O, so it is testable without uninstalling anything.
 */
export function renderFallback({ render, asked, missing }) {
  if (!render || asked || !missing.length) return null;
  return `the render gate is OFF for this run - its UI5 runtime is not installed `
    + `(${missing.length} of ${RENDER_DEPS.length} packages missing, e.g. ${missing.slice(0, 2).join(', ')}). `
    + `Every property-gate rule ran in full. To run the render gate too: `
    + `npm install -D ${RENDER_RUNTIME} && npx playwright install chromium. `
    + `To say you meant property-only and silence this: --no-render, or "render": false `
    + `in abap2ui5lint.jsonc. To make a missing runtime an ERROR instead: --render.`;
}

// UI5 log messages that are environment noise, not view defects
const BENIGN = [
  /library-preload/i,
  /messagebundle/i,
  /themes?\/|library(\.css|-parameters)/i,
  /theming\.Parameters/i,
  /failed to load JavaScript resource/i,
  /Core\.applyTheme|sap\.ui\.getCore/i,
  /clone operation.*template|templateShareable/i,
];

/*
 * ---------------------------------------------------------------------------
 * Theme CSS
 * ---------------------------------------------------------------------------
 *
 * The @openui5 SOURCE packages carry themes as `.less`, never as the
 * `library.css` a browser asks for - compiling them is a build step of the
 * UI5 toolchain, and the distribution that ships the result is not what an
 * npm install of the sources gives you.
 *
 * For the GATE that is a non-issue and stays one: it asks whether a view
 * survives creation, which is decided long before a stylesheet arrives, and
 * every request for one 404s today (the BENIGN list above waives exactly
 * those). A PICTURE is the other case entirely - unstyled UI5 is a stack of
 * browser-default form controls, a likeness of nothing.
 *
 * So a screenshot session compiles the LESS the way the UI5 build does, with
 * `less-openui5`, on demand and cached on disk: only the libraries a view
 * actually loads are ever built, the first `sap.m` build costs a few seconds,
 * and every run afterwards reads the cache. The cache key carries the runtime
 * version and the theme, so an upgraded runtime does not serve last version's
 * stylesheet.
 *
 * `less-openui5` is a dependency of the render runtime like playwright is.
 * Without it a screenshot still comes out - unstyled, with one note saying
 * why - because a structural picture beats no picture, and refusing here
 * would make the preview depend on a package the gate never needed.
 */
const THEME_CACHE = path.join(os.tmpdir(), 'abap2ui5-theme-css');

/** The resource path of a library theme's stylesheet: `sap/m` + `sap_horizon`
 *  -> the request the bootstrap makes for it. */
const LIBRARY_CSS_RE = /^(.+)\/themes\/([^/]+)\/library(?:-RTL)?\.css$/;
const LIBRARY_PARAMS_RE = /^(.+)\/themes\/([^/]+)\/library-parameters\.json$/;

/** The runtime's version, so a cache entry belongs to one runtime only. */
function runtimeVersion() {
  try {
    const pkg = runtimeRequire().resolve('@openui5/sap.ui.core/package.json');
    return JSON.parse(fs.readFileSync(pkg, 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Compile (or read back) one library's theme. Returns `{ css, parameters }`,
 * or null when `less-openui5` is not installed or the theme does not exist
 * for this library - both of which leave the request to 404 exactly as it
 * does today.
 */
async function themeArtefacts(libPath, theme, roots) {
  const source = `${libPath}/themes/${theme}/library.source.less`;
  if (!roots.some((r) => fs.existsSync(path.join(r, source)))) return null;
  const dir = path.join(THEME_CACHE, `${runtimeVersion()}-${theme}`);
  const stem = path.join(dir, libPath.replace(/\//g, '.'));
  try {
    return {
      css: fs.readFileSync(`${stem}.css`),
      parameters: fs.readFileSync(`${stem}.json`, 'utf8'),
    };
  } catch { /* not built yet */ }
  let Builder;
  try {
    ({ Builder } = await import(pathToFileURL(runtimeRequire().resolve(SCREENSHOT_DEPS[0])).href));
  } catch {
    return null;
  }
  const built = await new Builder().build({
    lessInputPath: source,
    rootPaths: roots,
    library: { name: libPath.replace(/\//g, '.') },
  });
  const out = {
    css: Buffer.from(built.css, 'utf8'),
    parameters: JSON.stringify(built.variables ?? {}),
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${stem}.css`, out.css);
    fs.writeFileSync(`${stem}.json`, out.parameters);
  } catch { /* a read-only tmp costs speed, not correctness */ }
  return out;
}

// all installed @openui5 source packages (resolved through the render runtime,
// falling back to a hoisted tree — discovery instead of a hand-kept list)
function libRoots() {
  const bases = new Set();
  try {
    const core = path.dirname(runtimeRequire().resolve('@openui5/sap.ui.core/package.json'));
    bases.add(path.dirname(core));
  } catch {
    /* not installed — render gate unavailable */
  }
  const roots = [];
  for (const base of bases) {
    for (const p of fs.readdirSync(base)) {
      const src = path.join(base, p, 'src');
      if (fs.existsSync(src)) roots.push(src);
    }
  }
  return roots;
}

const MIME = {
  '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.xml': 'application/xml', '.properties': 'text/plain', '.html': 'text/html',
  '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

/*
 * The theme the harness boots with. `sap_hcb` for the gate: it is the one
 * theme every supported release ships, and the gate photographs nothing - it
 * only needs the CSS to exist. A screenshot session asks for a real one
 * (see openRenderer's `theme`), which is why this is a parameter at all.
 */
export const GATE_THEME = 'sap_hcb';

/** Themes are file-system paths inside the resource server and go into an
 *  HTML attribute - so a name is a plain identifier or it is not a name. */
const THEME_RE = /^[a-z][a-z0-9_]*$/i;

const HARNESS = (theme = GATE_THEME) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>view-check</title>
<style>
  /* A sap.m.Page positions its content ABSOLUTELY between header and footer,
   * so in a container of no height it renders its header and nothing else -
   * the view is there, correct, and invisible. Costs the gate nothing and is
   * the difference between a picture and an empty one. */
  html, body, #content { height: 100%; margin: 0; padding: 0; }
</style>
<script>
  window.uiErrors = [];
  window.addEventListener('error', function (e) { window.uiErrors.push('PAGEERROR: ' + e.message); });
  // Mirror of the abap2UI5 curated formatter module (model/formatter.js) - a
  // fixed public contract, provided like the device model. Registered as the
  // named module z2ui5/model/formatter in boot() (for core:require) and
  // published as the z2ui5.Formatter global. The export surface mirrors
  // lib/formatters.mjs (a test keeps the two in step); the demo-kit pack
  // (round2DP, stockStatus*, dimensions, deliveryStatusState) was REMOVED
  // upstream, so mirroring it here would render views green that break live.
  window.z2ui5 = window.z2ui5 || {};
  (function () {
    function parseYmd(d) {
      return [Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8))];
    }
    // the initial DATS value "00000000" (or any non-8-digit input) carries no
    // date - upstream yields null there, and an Invalid Date must never leak
    // (it is truthy and blows up much later inside a calendar control)
    function isNoAbapDate(d) {
      var s = String(d);
      if (!/^[0-9]{8}$/.test(s)) return true;
      return Number(s.slice(0, 4)) === 0 || Number(s.slice(4, 6)) === 0 || Number(s.slice(6, 8)) === 0;
    }
    window.z2ui5.Formatter = {
      DateCreateObject: function (s) {
        if (!s) return null;
        return new Date(s);
      },
      DateAbapDateToDateObject: function (d) {
        if (isNoAbapDate(d)) return null;
        var p = parseYmd(d); return new Date(p[0], p[1], p[2]);
      },
      DateAbapDateTimeToDateObject: function (d, t) {
        t = t || '000000';
        if (isNoAbapDate(d)) return null;
        var p = parseYmd(d);
        return new Date(p[0], p[1], p[2], Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)));
      },
      expandInlineIcons: function (text) {
        if (!text) return '';
        var IconPool = sap.ui.require('sap/ui/core/IconPool');
        var re = new RegExp('%%icon:(sap-icon://[^%]+)%%', 'g');
        return String(text).replace(re, function (m, uri) {
          var info = IconPool && IconPool.getIconInfo(uri);
          if (!info) return '';
          return '<span class="sapMMsgStripInlineIcon" style="font-family:' + info.fontFamily + '">' + info.content + '</span>';
        });
      },
    };
  })();
</script>
<script id="sap-ui-bootstrap" src="/resources/sap-ui-core.js"
  data-sap-ui-libs="sap.m,sap.ui.layout,sap.f,sap.ui.table,sap.uxap,sap.tnt"
  data-sap-ui-theme="${theme}"
  data-sap-ui-async="true"
  data-sap-ui-compatversion="edge"></script>
<script>
  window.uiReady = new Promise(function (resolve) {
    function boot() {
      sap.ui.define('z2ui5/model/formatter', [], function () { return window.z2ui5.Formatter; });
      // Metadata-only mirrors of the bundled abap2UI5 custom controls used
      // declaratively in views - the harness only validates view creation.
      // Generated from lib/cc-controls.mjs, which check-upstream compares
      // against app/webapp/cc/*.js so the mirror cannot rot unnoticed.
${ccMirrorScript()}
      // Animations make a picture a matter of timing: a Dialog photographed
      // 400ms in is caught mid-fade, half transparent and slightly too small.
      // The gate never cared either way, so switching them off costs it
      // nothing and makes every screenshot deterministic.
      sap.ui.require(['sap/ui/core/ControlBehavior'], function (ControlBehavior) {
        if (ControlBehavior && ControlBehavior.setAnimationMode) ControlBehavior.setAnimationMode('none');
      }, function () { /* older runtime without the module - animations stay on */ });
      sap.ui.require(['sap/ui/core/Core', 'sap/base/Log'], function (Core, Log) {
        Log.addLogListener({ onLogEntry: function (e) {
          if (e.level <= Log.Level.ERROR) window.uiErrors.push('LOG: ' + e.message);
        } });
        Core.ready(resolve);
      });
    }
    if (window.sap && sap.ui) boot(); else window.addEventListener('load', boot);
  });
  // Everything on the page that showDoc put there, so clearDoc can take it
  // off again: a screenshot page is REUSED, and a leftover view would end up
  // in the next photograph.
  window._shown = [];
  /*
   * The document creation the gate and the preview share. "keep" is the whole
   * difference: the gate destroys what it created (it only wants the errors),
   * the preview leaves it standing to be photographed. A fragment whose root
   * can open itself - a Dialog, a Popover - is OPENED rather than placed,
   * because that is the only state in which it renders at all.
   */
  window._createDoc = async function (input, keep) {
    await window.uiReady;
    var from = window.uiErrors.length;
    var errs = [];
    try {
      var mods = await new Promise(function (res, rej) {
        sap.ui.require(['sap/ui/core/mvc/XMLView', 'sap/ui/core/Fragment',
          'sap/ui/model/json/JSONModel', 'sap/ui/Device',
          'sap/ui/core/mvc/Controller', 'sap/base/future'], function () { res(arguments); }, rej);
      });
      var XMLView = mods[0], Fragment = mods[1], JSONModel = mods[2], Device = mods[3];
      var Controller = mods[4], future = mods[5];
      // stub controller with the abap2UI5 event entry points, so declarative
      // handlers resolve and UI5 'future' mode can be active around creation
      window._smokeCtl = window._smokeCtl ||
        Controller.extend('z2ui5.smoke.StubController', {
          eB: function () {}, eF: function () {},
          // eBP is the veto form of eB (s_ctrl-check_prevent_default /
          // prevent_default_expr); it must resolve or the whole handler
          // expression fails to parse at view creation
          eBP: function () {},
        });
      var model = new JSONModel(input.model);
      var device = new JSONModel(Device); device.setDefaultBindingMode('OneWay');
      // the framework publishes the current media range onto the model
      // (Device.media has no bindable property), so {device>/media/range}
      // must exist here too or a live breakpoint binding renders empty
      try {
        Device.media.initRangeSet('Std');
        var r = Device.media.getCurrentRange('Std');
        device.setProperty('/media/range', r ? r.name : '');
      } catch (e) { device.setProperty('/media/range', ''); }
      var prevFuture = future.active;
      future.active = true;
      try {
        if (input.kind === 'fragment') {
          var res = await Fragment.load({ definition: input.xml, controller: new window._smokeCtl() });
          var controls = Array.isArray(res) ? res : [res];
          controls.forEach(function (c) {
            if (c.setModel) {
              c.setModel(model); c.setModel(device, 'device');
              c.setModel(new JSONModel([]), 'message');
            }
            if (!keep) { c.destroy(); return; }
            if (typeof c.open === 'function') c.open(); else if (c.placeAt) c.placeAt('content');
            window._shown.push(c);
          });
        } else {
          var view = await XMLView.create({ definition: input.xml, controller: new window._smokeCtl() });
          view.setModel(model); view.setModel(device, 'device');
          view.setModel(new JSONModel([]), 'message');
          // A view has no height of its own, and a sap.m.Page inside one lays
          // its content out ABSOLUTELY against that height: left at "auto" the
          // page is 0 high, the content section is clipped to nothing, and the
          // picture comes back as a header over an empty area - with the whole
          // view present in the DOM and every check passing. The runtime this
          // stands in for gives the view a full-height container; so does this.
          if (keep && view.setHeight) view.setHeight('100%');
          view.placeAt('content');
          // the gate needs the render to have HAPPENED; the preview needs it
          // to have settled - late-loading fonts and icons, a table's first
          // row batch, the theme's transitions
          await new Promise(function (r) { setTimeout(r, keep ? 400 : 120); });
          if (keep) window._shown.push(view); else view.destroy();
        }
      } finally {
        future.active = prevFuture;
      }
    } catch (e) {
      errs.push('CREATE: ' + (e && e.message ? e.message : String(e)));
    }
    return errs.concat(window.uiErrors.slice(from));
  };
  window.renderDoc = function (input) { return window._createDoc(input, false); };
  window.showDoc = function (input) { return window._createDoc(input, true); };
  window.clearDoc = function () {
    window._shown.forEach(function (c) {
      try { if (typeof c.close === 'function') c.close(); } catch (e) { /* never opened */ }
      c.destroy();
    });
    window._shown = [];
    // a Dialog leaves its block layer behind when it is destroyed mid-animation
    var content = document.getElementById('content');
    if (content) content.innerHTML = '';
  };
</script>
<!-- the body abap2UI5 itself serves: z2ui5_cl_ui5_http_handler writes
     class="sapUiBody sapUiSizeCompact", and content density is not a detail -
     it decides the height of every row, field and button in the picture -->
</head><body class="sapUiBody sapUiSizeCompact"><div id="content"></div></body></html>`;

function startServer(roots, { css = false } = {}) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/harness.html') {
      const theme = u.searchParams.get('theme');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(HARNESS(theme && THEME_RE.test(theme) ? theme : GATE_THEME));
      return;
    }
    /* Compiled on the way out, and only where a caller asked for pictures -
     * the gate serves no stylesheet and pays nothing for this branch. */
    if (css && u.pathname.startsWith('/resources/')) {
      const rel = u.pathname.slice('/resources/'.length);
      const hit = LIBRARY_CSS_RE.exec(rel) ?? LIBRARY_PARAMS_RE.exec(rel);
      if (hit && THEME_RE.test(hit[2])) {
        let built = null;
        try {
          built = await themeArtefacts(hit[1], hit[2], roots);
        } catch { /* a theme that will not compile is a 404, not a crash */ }
        if (built) {
          const json = LIBRARY_PARAMS_RE.test(rel);
          res.writeHead(200, { 'content-type': json ? 'application/json' : 'text/css' });
          res.end(json ? built.parameters : built.css);
          return;
        }
      }
    }
    if (u.pathname.startsWith('/resources/')) {
      const rel = u.pathname.slice('/resources/'.length);
      for (const root of roots) {
        const full = path.join(root, rel);
        if (full.startsWith(root) && fs.existsSync(full) && fs.statSync(full).isFile()) {
          res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
          res.end(fs.readFileSync(full));
          return;
        }
      }
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launchBrowser() {
  // resolved through the render runtime, then imported by URL: a bare
  // `import('playwright')` resolves relative to THIS file, which finds a
  // hoisted install but not a pnpm-style one where playwright sits only
  // under @abap2ui5/render-runtime
  // importing a FILE bypasses the package's exports map, and Node's named-export
  // detection for CommonJS does not see playwright's re-exports through it - so
  // take the namespace and fall back to the default (the module.exports object)
  const pw = await import(pathToFileURL(runtimeRequire().resolve('playwright')).href);
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) throw renderDepsError(['playwright']);
  try {
    return await chromium.launch();
  } catch (e) {
    for (const exe of [process.env.CHROMIUM_BIN, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
      if (exe && fs.existsSync(exe)) return chromium.launch({ executablePath: exe });
    }
    throw e;
  }
}

/*
 * Session over multiple render calls: start once, render many docs, close.
 *   const r = await openRenderer();          // { pages: N } for a page pool
 *   const errs = await r.render({ xml, model });   // filtered, [] = clean
 *   await r.close();
 * Throws when the @openui5 packages are not installed.
 *
 * `pages` opens a POOL of harness pages in one browser: render() borrows a
 * free page and concurrent callers run truly in parallel — on a corpus of
 * hundreds of views the render gate's wall clock divides by roughly the pool
 * size. One page (the default) behaves exactly as before; each page carries
 * its own UI5 boot, so a pool only pays off across many documents.
 *
 * `theme` is what the pages boot with. The gate keeps `sap_hcb`; a caller
 * after a PICTURE — `screenshot( )`, the systemless preview — passes the
 * theme the system it is written for actually serves, because that is the
 * whole difference between a rendering and a likeness.
 */
export async function openRenderer({ pages = 1, theme = GATE_THEME, css = false } = {}) {
  const missing = missingRenderDeps();
  if (missing.length) throw renderDepsError(missing);
  const roots = libRoots();
  if (!roots.length) {
    throw new Error('no @openui5/* source packages found — install the package dependencies (npm ci) to enable the render gate');
  }
  const server = await startServer(roots, { css });
  const browser = await launchBrowser();
  const pool = await Promise.all(Array.from({ length: Math.max(1, pages) }, async () => {
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${server.address().port}/harness.html`;
    await page.goto(theme === GATE_THEME ? url : `${url}?theme=${encodeURIComponent(theme)}`);
    return page;
  }));
  const idle = [...pool];
  const waiters = [];
  const acquire = () => (idle.length
    ? Promise.resolve(idle.pop())
    : new Promise((resolve) => waiters.push(resolve)));
  const release = (page) => {
    const next = waiters.shift();
    if (next) next(page); else idle.push(page);
  };
  return {
    /* `kind` says how the document is loaded: 'view' through XMLView.create,
     * 'fragment' through Fragment.load. The CALLER knows it - the consuming
     * call decides (view_display and the nested variants are views,
     * popup_display / popover_display are fragments) - and reconstruct
     * already works that out for display-root-mismatch. Sniffing the root tag
     * is only the fallback for a caller that has no consumer to hand, and it
     * is wrong for the case the rule itself calls legitimate: a fragment whose
     * root is a bare control rather than core:FragmentDefinition. Loaded as a
     * view, that document fails with "XMLView's root node must be 'View'" -
     * a render error reported against correct code. */
    async render({ xml, model = {}, kind = /^<core:FragmentDefinition/.test(xml) ? 'fragment' : 'view' }) {
      const page = await acquire();
      let raw;
      try {
        raw = await page.evaluate((input) => window.renderDoc(input), { xml, model, kind });
      } catch (e) {
        raw = [`HARNESS: ${e.message}`];
      } finally {
        release(page);
      }
      return raw.filter((e) => !BENIGN.some((re) => re.test(e)));
    },
    /*
     * The same document, photographed instead of judged: `{ png, errors }`,
     * the PNG a Buffer ready to be written or shown.
     *
     * This is the render gate answering a different question. The gate asks
     * whether a view SURVIVES creation, and destroys it the moment it knows;
     * here it stays on the page long enough to be seen, in a theme a system
     * actually serves, at a viewport a person actually has. Everything that
     * makes the gate trustworthy still holds - the local OpenUI5 runtime, the
     * derived model, the stub controller - so the picture is of the same view
     * the gate cleared, which is what makes it worth looking at.
     *
     * Errors come back ALONGSIDE the picture rather than instead of it: a
     * view with one broken binding still renders, and the half of it that
     * came up is exactly what the author needs to see.
     */
    async screenshot({ xml, model = {}, kind = /^<core:FragmentDefinition/.test(xml) ? 'fragment' : 'view',
      width = 1280, height = 900, fullPage = true } = {}) {
      const page = await acquire();
      let errors = [];
      let png;
      try {
        await page.setViewportSize({ width, height });
        try {
          errors = await page.evaluate((input) => window.showDoc(input), { xml, model, kind });
        } catch (e) {
          errors = [`HARNESS: ${e.message}`];
        }
        // web fonts carry the icon glyphs: photographed too early, every icon
        // in the view is a box
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        png = await page.screenshot({ fullPage });
      } finally {
        await page.evaluate(() => window.clearDoc()).catch(() => {});
        release(page);
      }
      return { png, errors: errors.filter((e) => !BENIGN.some((re) => re.test(e))) };
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}
