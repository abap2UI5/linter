/*
 * index — the public library API of @abap2ui5/linter.
 *
 *   checkAbapSource(source, opts)  ABAP class using a view builder -> result
 *   checkXmlSource(xml, opts)      raw .view.xml / .fragment.xml -> result
 *   checkFiles(paths, opts)        CLI backbone: mixed file list -> results
 *
 * A result: { file?, kind, findings: [...], renderErrors: [...], notes,
 * docs, skippedRender, stats }. Findings come from the property gate (see
 * properties.mjs types); renderErrors from the headless XMLView.create gate;
 * `stats` is the structural profile of what was looked at, which is what lets
 * a clean run still report what it judged.
 */
import fs from 'fs';
import path from 'path';
import { prepareAbap } from './reconstruct.mjs';
import { checkAbapRules, namedModels, checkSourceRules } from './abap-rules.mjs';
import {
  loadSnapshot, checkNodes, parseXml, collectControlIds, collectEnumBoundFields,
  DEFAULT_TRUE_BOOLEAN, profileTree,
} from './properties.mjs';
import { checkIcons } from './icons.mjs';
import { annotate, applyRules, applyDirectives, renderRuleConfig, attachSourceFixes, attachSuggestionFixes } from './findings.mjs';
import { openRenderer } from './render.mjs';
import { usesBuilderFactory, frozenBuilderOf } from './builders.mjs';
import { scrub, splitStatements } from './abap.mjs';
/* Moved to abap-source.mjs so a consumer can reach it without this entry
 * point, which pulls the renderer (and with it http/os/module) in. Imported
 * for use below AND re-exported: it has been part of this module's surface. */
import { elementBoundSlots } from './abap-source.mjs';
export { elementBoundSlots };


const DEFAULTS = {
  minUi5: '1.71',
  /* null = nobody said. NOT the same as 'sapui5': saying "sapui5" is a
   * decision (this system ships sap.ui.comp, stop telling me about it), while
   * saying nothing is the absence of one — so a SAPUI5-only control is a hint
   * here and an error under 'openui5'. See the emit site in properties.mjs. */
  distribution: null,
  allow: [],
  render: true,
  renderPages: 4,      // page-pool size for the render gate (see checkFiles)
  properties: true,
  /* collect EVERY .clas.abap, and judge a class that builds no view by the
   * source-side rules alone (checkSourceRules in abap-rules.mjs): a class that
   * cannot be imported is the most severe thing this tool can find, and until
   * this option it could find it only in an app class */
  allClasses: false,
  rules: {},           // per-rule off/severity/exclude, see findings.mjs
  file: '',            // the path the source came from - `rules.*.exclude` matches it
  snapshot: undefined, // path override for data/properties.json
  onProgress: undefined, // ({ phase, done, total, file }) while checkFiles runs
  /* An ALREADY-OPEN renderer from openRenderer( ) (the ./render export). When
   * given, checkFiles/screenshotFiles use it and do NOT close it - the caller
   * owns its lifecycle, which is what lets a long-lived consumer (mcp-server's
   * validate_view) keep one warm Chromium across many calls instead of paying
   * a cold start per call. Absent, each call opens and closes its own. */
  renderer: undefined,
};

/** Everything a repo can say about a finding after the gate produced it:
 *  the `rules` block first (off / another severity / excluded file), then
 *  the source directives. Both need the annotation to have run. */
const settle = (findings, source, o) =>
  applyDirectives(applyRules(findings, o.rules, o.file), source);

/** Rule id -> how often it FIRED, counted before the `rules` block, the
 *  directives and any baseline have their say — the instrumentation that
 *  tells a fully suppressed corpus apart from a corpus nothing fired on.
 *  Additive on the result (and in `--json` stats as `ruleHits`). */
const hitCount = (findings) => {
  const hits = {};
  for (const f of findings) hits[f.type] = (hits[f.type] || 0) + 1;
  return hits;
};

/** What one result contributed to the corpus — the numbers behind the run
 *  summary. Zeroes for a file that reconstructed no view at all, which is
 *  itself the interesting case: a gate that judged nothing says so. */
function profileOf(nodeRoots) {
  const out = { documents: nodeRoots.length, controls: 0, aggregations: 0, attributes: 0, bindings: 0, icons: 0, depth: 0, rendered: 0, types: {} };
  for (const root of nodeRoots) {
    const p = profileTree(root);
    out.controls += p.controls;
    out.aggregations += p.aggregations;
    out.attributes += p.attributes;
    out.bindings += p.bindings;
    out.icons += p.icons;
    out.depth = Math.max(out.depth, p.depth);
    for (const [name, n] of Object.entries(p.types)) out.types[name] = (out.types[name] || 0) + n;
  }
  return out;
}

export function checkAbapSource(source, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const prep = prepareAbap(source);
  const result = {
    kind: 'abap',
    usesBuilder: prep.usesBuilder,
    docs: prep.docs,
    docKinds: prep.docKinds,
    model: prep.model,
    notes: prep.notes,
    helperTokens: prep.helperTokens,
    findings: [],
    renderErrors: [],
    skippedRender: false,
    stats: profileOf(prep.usesBuilder ? prep.nodes : []),
  };
  /* A class on the FROZEN builder reconstructs no view, and used to leave with
   * that silence as its whole verdict. It gets one finding instead - see
   * builders.mjs for why this is the case worth being loud about - and nothing
   * else: the other ABAP rules are written for the current dialect, and running
   * them over an API they do not model would trade a silent miss for confident
   * noise. */
  const frozen = prep.usesBuilder ? null : frozenBuilderOf(source);
  if (frozen) {
    const at = source.search(new RegExp(`\\b${frozen}\\s*=>\\s*factory`, 'i'));
    result.frozenBuilder = frozen;
    result.ruleHits = { 'frozen-view-builder': 1 };
    result.findings = settle(
      annotate([{ type: 'frozen-view-builder', value: frozen, offset: at < 0 ? 0 : at }], source) ?? [],
      source,
      o,
    );
    return result;
  }
  result.ruleHits = {};
  if (!prep.usesBuilder) {
    /* A class that builds no view. Under `allClasses` it is judged by the
     * source-side rules alone; otherwise it is not judged at all - and not
     * collected either, so this is the library caller's case. */
    if (o.allClasses) {
      result.findings.push(...checkSourceRules(source));
      attachSourceFixes(result.findings, source);
      annotate(result.findings, source);
      result.ruleHits = hitCount(result.findings);
      result.findings = settle(result.findings, source, o);
    }
    return result;
  }
  /* `properties: false` means "do not run the PROPERTY GATE" — the walk over
   * the view tree that resolves every control and member against the metadata
   * snapshot. It used to mean rather more than that, because the ABAP-side
   * rules were emitted from inside the same block: switching the property gate
   * off silently took the chain-layout family, the frontend wires and the
   * lifecycle rules with it, so a layout-only configuration passed EVERYTHING
   * and looked green doing it. That was measured, and it is the reason a repo
   * wanting only the chain rules had to enumerate and disable fifteen others
   * by hand — a list that grows on every release here.
   *
   * The two are separated now: the snapshot-backed walk stays behind the flag,
   * `checkAbapRules` runs either way. With no snapshot it is handed `data:
   * null` and degrades exactly as it already does for a consumer that has
   * none — the rules that need metadata stay silent, the rest report. */
  const data = o.properties ? loadSnapshot(o.snapshot) : null;
  if (o.properties) {
    // which `name>` prefixes a binding may use - the class itself is the only
    // place that can widen the framework's three (SET_ODATA_MODEL)
    const models = namedModels(source);
    /* cs_event-bind_element sets a binding context on a whole view slot at
     * runtime, so relative paths under it resolve against a row the document
     * never names. A static walk cannot see that; the rules that ask "is there
     * a context here" have to be told. */
    const bound = elementBoundSlots(source);
    for (const nodeRoot of prep.nodes) {
      /* per DOCUMENT, because the wire binds one slot and a document knows the
       * slot it is displayed into. A document with no consumer in its own
       * statement has no slot to compare, so it keeps the old class-wide
       * answer rather than being judged on a guess. */
      const boundElement = bound.all || (bound.slots.size > 0
        && (!nodeRoot.displaySlot || bound.slots.has(nodeRoot.displaySlot)));
      result.findings.push(...checkNodes(nodeRoot, {
        data,
        minUi5: o.minUi5,
        allow: o.allow,
        distribution: o.distribution,
        model: prep.model,
        shape: prep.modelShape,
        rootFields: prep.rootFields,
        rootWrites: prep.rootWrites,
        jsonPaths: prep.jsonPaths,
        models,
        boundElement,
        fromAbap: true,
      }));
    }
  }

  // structural defects of the builder chain itself (an excess shut( )
  // asserts at runtime) - independent of the UI5 metadata, so outside the flag
  result.findings.push(...(prep.structure ?? []));

  {
    // rules that need the class itself, not just the view tree. The id->control
    // map comes from its own views, so an ABAP-side rule can judge what may be
    // done to the control a wire names.
    const controlIds = {};
    const enumFields = new Map();
    /* The same collection, one predicate over: fields bound to a boolean
     * property whose own default is `true`. Two maps rather than one, because
     * the two defects are judged differently — an unseeded ENUM field is
     * wrong on its own, an unseeded BOOLEAN one only where the seed is
     * inconsistent (see absent-boolean-overrides-default). */
    const boolFields = new Map();
    const merge = (into, from) => {
      for (const [table, fields] of from) {
        const prev = into.get(table) ?? new Set();
        for (const f of fields) prev.add(f);
        into.set(table, prev);
      }
    };
    for (const nodeRoot of prep.nodes) {
      Object.assign(controlIds, collectControlIds(nodeRoot));
      /* Both collections resolve a property's TYPE, so they say nothing
       * without the snapshot — with `properties: false` the two row rules stay
       * silent rather than guessing, which is the same degradation
       * checkAbapRules already applies to every metadata-backed rule. */
      if (data) {
        merge(enumFields, collectEnumBoundFields(nodeRoot, data));
        merge(boolFields, collectEnumBoundFields(nodeRoot, data, DEFAULT_TRUE_BOOLEAN));
      }
    }
    result.findings.push(...checkAbapRules(source, {
      data, controlIds, enumFields, boolFields, minUi5: o.minUi5, rules: o.rules,
    }));
    attachSourceFixes(result.findings, source);
    // severity, wording and the line/column each offset points at
    annotate(result.findings, source);
    result.ruleHits = hitCount(result.findings);
    result.findings = settle(result.findings, source, o);
  }
  return result;
}

export function checkXmlSource(xml, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const root = parseXml(xml);
  const result = { kind: 'xml', docs: [xml], model: {}, notes: [], helperTokens: 0, findings: [], renderErrors: [], skippedRender: false, stats: profileOf([root]), ruleHits: {} };
  if (o.properties) {
    const data = loadSnapshot(o.snapshot);
    result.findings.push(...checkNodes(root, { data, minUi5: o.minUi5, allow: o.allow, distribution: o.distribution }));
    // over the text, as on the ABAP side: an icon name is not always an
    // attribute value (a JSONModel seed in a fragment carries them too) -
    // minus the XML comments, which the ABAP side never had either
    result.findings.push(...checkIcons(xml, { minUi5: o.minUi5, xml: true }));
    attachSuggestionFixes(result.findings, xml, { xml: true });
    annotate(result.findings, xml);
    result.ruleHits = hitCount(result.findings);
    result.findings = settle(result.findings, xml, o);
  }
  return result;
}

/*
 * Check a mixed list of files (.clas.abap with builder views, .view.xml,
 * .fragment.xml). Runs the property gate per file, then — unless render is
 * disabled — renders every reconstructable doc in ONE browser session.
 *
 * The render gate's packages (playwright + @openui5/*) are OPTIONAL
 * dependencies: with any of them absent and render requested, this throws
 * openRenderer's ERR_RENDER_DEPS_MISSING error, which names the missing
 * packages and how to get them. Pass { render: false } to run the property
 * gate without them.
 */
export async function checkFiles(files, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  /* A long corpus run is otherwise silent until the last file: the render gate
   * alone is minutes of wall clock. The callback is the only thing this
   * library says about a run in progress — WHAT is printed, and whether
   * anything is, stays the caller's decision (see report.mjs createProgress). */
  const progress = typeof o.onProgress === 'function' ? o.onProgress : () => {};
  const results = [];
  progress({ phase: 'properties', done: 0, total: files.length });
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const isXml = /\.(view|fragment)\.xml$/.test(file) || /^\s*</.test(src);
    // the file travels with the options so `rules.*.exclude` can match on it
    const r = isXml ? checkXmlSource(src, { ...o, file }) : checkAbapSource(src, { ...o, file });
    r.file = file;
    results.push(r);
    progress({ phase: 'properties', done: results.length, total: files.length, file });
  }
  if (o.render) {
    const renderable = results.filter((r) => r.docs.length && (r.kind === 'xml' || r.usesBuilder));
    if (renderable.length) {
      /* A page POOL, workers pulling results off a shared cursor: on a corpus
       * the render gate is the wall clock, and one page rendering hundreds of
       * views serially was almost all of it. Documents of ONE result still
       * render in order on whatever page the worker holds, so a result's
       * renderErrors keep their document order. */
      // the pool size is a dial (--render-pages / "render": { "pages": N });
      // anything that is not a positive integer falls back to the default 4
      const poolSize = Number.isInteger(o.renderPages) && o.renderPages > 0 ? o.renderPages : 4;
      const workers = Math.min(poolSize, renderable.length);
      progress({ phase: 'render', done: 0, total: renderable.length, pages: workers });
      /* A caller-supplied renderer is used as-is and never closed here - its
       * pool size was decided at openRenderer time, and render( ) queues on
       * the pool anyway, so a smaller pool only serializes, never breaks. */
      const ownRenderer = !o.renderer;
      const renderer = o.renderer ?? await openRenderer({ pages: workers });
      try {
        let cursor = 0;
        let done = 0;
        await Promise.all(Array.from({ length: workers }, async () => {
          for (;;) {
            const r = renderable[cursor++];
            if (!r) return;
            if (r.kind === 'abap' && r.helperTokens > 0) {
              // view parts built in non-handle helper methods are not statically
              // attributable — an incomplete reconstruction would render a WRONG
              // view, so skip and say so instead of failing on an artifact
              r.skippedRender = true;
              progress({ phase: 'render', done: ++done, total: renderable.length, file: r.file, skipped: true });
              continue;
            }
            for (let i = 0; i < r.docs.length; i++) {
              // the consuming call decides view vs fragment; only fall back to
              // the renderer's root-tag sniffing where it is unknown
              const kind = r.docKinds?.[i];
              r.renderErrors.push(...(await renderer.render({
                xml: r.docs[i], model: r.model, ...(kind ? { kind } : {}),
              })));
              if (r.stats) r.stats.rendered++;
            }
            progress({ phase: 'render', done: ++done, total: renderable.length, file: r.file });
          }
        }));
      } finally {
        if (ownRenderer) await renderer.close();
      }
    }
    for (const r of results) {
      if (r.kind === 'abap' && r.usesBuilder && !r.docs.length && !r.helperTokens) {
        r.renderErrors.push('no view reconstructed from builder calls');
      }
      if (r.kind === 'abap' && r.helperTokens > 0 && !r.skippedRender) r.skippedRender = true;
    }
    /* The `rules` block can address the render gate too — as `render-error`,
     * the pseudo-rule its failures are reported under. `false`/`exclude`
     * waive the errors (the render still RAN, so an excluded file that comes
     * back clean is called out as a stale waiver instead of silently
     * passing), a severity decides what a render error counts as. */
    const rc = renderRuleConfig(o.rules);
    if (rc) {
      for (const r of results) {
        const excluded = rc.off || rc.exclude?.some((re) => re.test(r.file || ''));
        if (excluded) {
          if (r.renderErrors.length) {
            r.notes.push(`${r.renderErrors.length} render error(s) waived by rules['render-error']`);
            r.renderErrors = [];
          } else if (!rc.off && !r.skippedRender && r.docs.length) {
            r.notes.push(`stale render-error waiver: the view renders clean — remove this file from rules['render-error'].exclude`);
          }
        } else if (rc.severity) {
          r.renderSeverity = rc.severity;
        }
      }
    }
  }
  return results;
}

/*
 * Photograph every view a file builds — the render gate used as a preview
 * rather than as a gate.
 *
 * Returns one entry per document: { file, index, kind, png, errors }, the PNG
 * a Buffer the caller writes or displays. Nothing is written here: a library
 * that renders is useful to an editor holding an unsaved buffer, a library
 * that writes files is only useful to the CLI.
 *
 * The point of it is what it does NOT need. The view a class builds exists at
 * runtime and nowhere else, so seeing it has meant activating the class on a
 * system and launching the app; here it is reconstructed statically, seeded
 * with the model derived from the class's own TYPES, and rendered against the
 * local OpenUI5 runtime. No system, no transport, no activation.
 *
 * A class whose view is partly built in non-handle helper methods is skipped
 * for the same reason the gate skips it: the reconstruction is incomplete, and
 * a picture of a WRONG view is worse than no picture. It comes back as an
 * entry with no png and that reason in `errors`.
 */
export const MOCK_SUFFIX = '.mock.json';

/** The preview data belonging to a source file, by convention: `zcl_app.mock.json`
 *  next to `zcl_app.clas.abap`. Returns null when there is none, and throws
 *  when there is one that does not parse - a mock file nobody notices is
 *  broken would silently take the pictures back to empty tables. */
export function mockModelFor(file) {
  const stem = file.replace(/\.(clas\.abap|abap|view\.xml|fragment\.xml|xml)$/i, '');
  const candidate = `${stem}${MOCK_SUFFIX}`;
  if (!fs.existsSync(candidate)) return null;
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  } catch (e) {
    throw new Error(`${candidate}: not valid JSON - ${e.message}`);
  }
}

/*
 * The model a document is rendered with: what the class seeds, then what the
 * caller supplies, key by key.
 *
 * A MERGE and not a replacement, because the two know different things. The
 * derived model has every field of every declared structure - that is what
 * makes a binding resolve rather than render empty - while a mock file knows
 * the one table the author cares about seeing filled. Overriding at the top
 * level lets a two-line mock file fill a list without having to restate the
 * class's whole model.
 */
function modelFor(derived, supplied) {
  return supplied ? { ...derived, ...supplied } : derived;
}

export async function screenshotFiles(files, opts = {}) {
  const { theme = 'sap_horizon', fullPage = true } = opts;
  /* One session, several viewports: a browser launch and a UI5 boot cost more
   * than every render in this loop put together, so asking for phone, tablet
   * and desktop is barely more expensive than asking for one. */
  const sizes = opts.sizes?.length
    ? opts.sizes
    : [{ width: opts.width ?? 1280, height: opts.height ?? 900 }];
  const progress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const jobs = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    /* An explicit model applies to everything; the convention is per file, so
     * a corpus run gives each app its own data without naming any of them. */
    let mock = opts.model ?? null;
    let mockError;
    if (!mock) {
      try {
        mock = mockModelFor(file);
      } catch (e) {
        mockError = e.message;
      }
    }
    const isXml = /\.(view|fragment)\.xml$/.test(file) || /^\s*</.test(src);
    if (isXml) {
      jobs.push({ file, index: 0, xml: src, model: mock ?? {}, kind: undefined, mockError });
      continue;
    }
    const prep = prepareAbap(src);
    if (!prep.usesBuilder || !prep.docs.length) {
      jobs.push({ file, index: 0, errors: ['no view reconstructed from builder calls'] });
      continue;
    }
    if (prep.helperTokens > 0) {
      jobs.push({ file, index: 0, errors: ['view parts are built in helper methods — the reconstruction is incomplete, so no picture is taken'] });
      continue;
    }
    prep.docs.forEach((xml, index) => {
      jobs.push({
        file, index, xml, kind: prep.docKinds?.[index], mockError,
        model: modelFor(prep.model, mock),
      });
    });
  }
  const shootable = jobs.filter((j) => j.xml);
  const out = [];
  for (const job of jobs) {
    if (!job.xml) {
      out.push({ file: job.file, index: job.index, kind: job.kind, png: undefined, errors: job.errors ?? [] });
    }
  }
  if (!shootable.length) return out;
  const total = shootable.length * sizes.length;
  progress({ phase: 'screenshot', done: 0, total });
  /* Same contract as checkFiles: a caller-supplied renderer is reused and
   * stays open - note the theme was then decided at openRenderer time, so a
   * caller wanting a specific theme passes it THERE. */
  const ownRenderer = !opts.renderer;
  const renderer = opts.renderer ?? await openRenderer({ theme, css: true });
  try {
    let done = 0;
    for (const job of shootable) {
      for (const size of sizes) {
        const shot = await renderer.screenshot({
          xml: job.xml,
          model: job.model,
          ...(job.kind ? { kind: job.kind } : {}),
          width: size.width,
          height: size.height,
          fullPage,
        });
        out.push({
          file: job.file,
          index: job.index,
          kind: job.kind,
          size: { width: size.width, height: size.height },
          png: shot.png,
          // a broken mock file is said out loud next to the picture it did
          // not fill, rather than leaving the author wondering why the table
          // is still empty
          errors: job.mockError ? [job.mockError, ...shot.errors] : shot.errors,
        });
        progress({ phase: 'screenshot', done: ++done, total, file: job.file });
      }
    }
  } finally {
    if (ownRenderer) await renderer.close();
  }
  return out;
}

/*
 * Recursively collect checkable files under the given paths: ABAP classes
 * that call one of the view builders (lib/builders.mjs), plus raw
 * view/fragment XML files.
 *
 * A path the caller NAMED is treated as meant: any `.abap` file carrying a
 * builder chain is checked, not only abapGit's `.clas.abap` spelling — a file
 * named on the command line and then silently dropped is the worst answer a
 * linter can give (`node cli.mjs my_app.abap` used to print "no checkable app
 * classes"). A directory WALK stays conservative: there the naming convention
 * is what tells an app class from an include, a local-types file or a
 * generated artefact, and a repo scan must not start guessing.
 *
 * Test includes are excluded either way — a `*.testclasses.abap` builds views
 * to assert on them, and reporting the assertions' fixtures is noise.
 *
 * A directory walk SKIPS `node_modules` and every entry whose name starts with
 * a dot — `.git`, `.github`, and also a dot-named ABAP file, should one exist.
 * That is deliberate (a repo scan has no business reading VCS internals) but it
 * is silent, so it is written down here, in types.d.ts and in the README: a
 * class parked under a dot-directory is not checked and nothing says so.
 *
 * `ignore` is the repo-level escape hatch for everything else — regex patterns
 * matched against the path as it is walked (config key `ignore`, see
 * config.mjs). A path the caller NAMED is still checked: `ignore` filters a
 * repo scan, it does not overrule an explicit argument.
 */
export function collectFiles(paths, opts = {}) {
  /* Keyed by the RESOLVED path, because the same file can be reached twice —
   * `cli.mjs src src`, or a directory named next to one of its own files —
   * and checking it twice reports and COUNTS every finding in it twice. The
   * value is the path as it was reached, which is what the caller gets back:
   * `result.file` travels into the `--json` output and into the baseline
   * keys, so the shape of that string is a contract, not an implementation
   * detail. Only the duplicate goes; nothing is rewritten. */
  const out = new Map();
  const ignore = (opts.ignore ?? []).map((p) => (p instanceof RegExp ? p : new RegExp(p)));
  /* Directories already walked, by REAL path. `statSync` follows symlinks, so
   * `src/link -> ..` is an infinite descent that never repeats a resolved
   * path — the walk runs until the path length kills it, and the run never
   * reports anything at all. A cycle is the one collection failure that looks
   * like nothing rather than like a false green, and this is the guard.
   * Keyed on the realpath so two links to the SAME directory also collapse. */
  const seenDirs = new Set();
  const visit = (p, named) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      let real;
      try { real = fs.realpathSync(p); } catch { real = path.resolve(p); }
      if (seenDirs.has(real)) return;
      seenDirs.add(real);
      for (const e of fs.readdirSync(p)) {
        // node_modules and every dot-entry are skipped - see the header
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const child = path.join(p, e);
        if (ignore.some((re) => re.test(child))) continue;
        visit(child, false);
      }
      return;
    }
    if (/\.(view|fragment)\.xml$/.test(p)) { out.set(path.resolve(p), p); return; }
    if (p.endsWith('.testclasses.abap')) return;
    if (p.endsWith('.clas.abap') || (named && /\.(abap|xml)$/.test(p))) {
      const src = fs.readFileSync(p, 'utf8');
      /* The FROZEN builder counts as a checkable class too. It reconstructs no
       * view, so all it can ever produce is the one finding saying so - but
       * that is the point: dropping it here is what made a whole app on the
       * retired API come back as "no checkable app classes" and exit 0. */
      if (usesBuilderFactory(src)
          || frozenBuilderOf(src)
          || (opts.allClasses && p.endsWith('.clas.abap'))
          || (named && /^\s*</.test(src))) out.set(path.resolve(p), p);
    }
  };
  for (const p of paths) visit(p, true);
  return [...out.values()];
}
