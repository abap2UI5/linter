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
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

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

const HARNESS = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>view-check</title>
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
  data-sap-ui-theme="sap_hcb"
  data-sap-ui-async="true"
  data-sap-ui-compatversion="edge"></script>
<script>
  window.uiReady = new Promise(function (resolve) {
    function boot() {
      sap.ui.define('z2ui5/model/formatter', [], function () { return window.z2ui5.Formatter; });
      // Metadata-only mirrors of the bundled abap2UI5 custom controls used
      // declaratively in views - the harness only validates view creation.
      sap.ui.define('z2ui5/cc/MultiInputExt', ['sap/ui/core/Control'], function (Control) {
        return Control.extend('z2ui5.cc.MultiInputExt', {
          metadata: {
            properties: {
              MultiInputId: { type: 'string' },
              MultiInputName: { type: 'string' },
              addedTokens: { type: 'object' },
              checkInit: { type: 'boolean', defaultValue: false },
              removedTokens: { type: 'object' },
            },
            events: { change: { allowPreventDefault: true, parameters: {} } },
          },
          renderer: { apiVersion: 2, render: function () {} },
        });
      });
      sap.ui.define('z2ui5/cc/MessageManager', ['sap/ui/core/Control'], function (Control) {
        return Control.extend('z2ui5.cc.MessageManager', {
          metadata: {
            properties: {
              items: { type: 'object' },
              checkInit: { type: 'boolean', defaultValue: false },
            },
            events: { change: { allowPreventDefault: true, parameters: {} } },
          },
          renderer: { apiVersion: 2, render: function () {} },
        });
      });
      sap.ui.require(['sap/ui/core/Core', 'sap/base/Log'], function (Core, Log) {
        Log.addLogListener({ onLogEntry: function (e) {
          if (e.level <= Log.Level.ERROR) window.uiErrors.push('LOG: ' + e.message);
        } });
        Core.ready(resolve);
      });
    }
    if (window.sap && sap.ui) boot(); else window.addEventListener('load', boot);
  });
  window.renderDoc = async function (input) {
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
          (Array.isArray(res) ? res : [res]).forEach(function (c) {
            if (c.setModel) { c.setModel(model); c.setModel(device, 'device'); }
            c.destroy();
          });
        } else {
          var view = await XMLView.create({ definition: input.xml, controller: new window._smokeCtl() });
          view.setModel(model); view.setModel(device, 'device');
          view.setModel(new JSONModel([]), 'message');
          view.placeAt('content');
          await new Promise(function (r) { setTimeout(r, 120); });
          view.destroy();
        }
      } finally {
        future.active = prevFuture;
      }
    } catch (e) {
      errs.push('CREATE: ' + (e && e.message ? e.message : String(e)));
    }
    return errs.concat(window.uiErrors.slice(from));
  };
</script>
</head><body><div id="content"></div></body></html>`;

function startServer(roots) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/harness.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(HARNESS);
      return;
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
 */
export async function openRenderer({ pages = 1 } = {}) {
  const missing = missingRenderDeps();
  if (missing.length) throw renderDepsError(missing);
  const roots = libRoots();
  if (!roots.length) {
    throw new Error('no @openui5/* source packages found — install the package dependencies (npm ci) to enable the render gate');
  }
  const server = await startServer(roots);
  const browser = await launchBrowser();
  const pool = await Promise.all(Array.from({ length: Math.max(1, pages) }, async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/harness.html`);
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
    async close() {
      await browser.close();
      server.close();
    },
  };
}
