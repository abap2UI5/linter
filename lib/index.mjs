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
import { checkAbapRules, namedModels } from './abap-rules.mjs';
import { loadSnapshot, checkNodes, parseXml, collectControlIds, collectEnumBoundFields, profileTree } from './properties.mjs';
import { checkIcons } from './icons.mjs';
import { annotate, applyRules, applyDirectives, renderRuleConfig, attachNamespaceFixes } from './findings.mjs';
import { openRenderer } from './render.mjs';
import { BUILDERS, frozenBuilderOf } from './builders.mjs';
import { scrub, splitStatements } from './abap.mjs';

// z2ui5_if_client=>cs_view - the constant NAME is not its value (nested -> NEST)
const CS_VIEW_VALUES = {
  main: 'MAIN', nested: 'NEST', nested2: 'NEST2', popup: 'POPUP', popover: 'POPOVER',
};
const VIEW_SLOT_NAMES = new Set(Object.values(CS_VIEW_VALUES));

/* Which view SLOTS the class element-binds at runtime.
 *
 * `cs_event-bind_element` makes the frontend call `view.bindElement( path )`
 * on ONE slot - `evBindElement` reads it out of the wire's `view` parameter
 * and defaults to MAIN - so every relative path in THAT document resolves
 * against a row the document never names, and every relative path in every
 * OTHER document is as contextless as it looks. Asking the question of the
 * whole CLASS is what let one popup wire disarm the check for the main slot
 * too: a single `cs_event-bind_element` anywhere turned the aggregation rule
 * off for every document of the class, main slot included.
 *
 * Returns `{ slots, all }`. `all` is the honest half: a wire whose slot is
 * not a literal (a variable, a computed name) could bind any of them, and a
 * wrong second guess is worse than silence - so it suppresses everywhere,
 * exactly as the class-wide flag did. */
export function elementBoundSlots(source) {
  const slots = new Set();
  let all = false;
  const src = scrub(String(source));
  if (!/cs_event-bind_element/i.test(src)) return { slots, all };
  for (const stmt of splitStatements(src)) {
    if (!/cs_event-bind_element/i.test(stmt.text)) continue;
    /* The slot as the wire spells it: the constant (`client->cs_view-popup`,
     * whose VALUE is `POPUP` - and `cs_view-nested` is `NEST`) or a literal
     * already carrying that value. With no `view =` at all the ABAP DEFAULT
     * applies, and it is `cs_view-main`. */
    const c = stmt.text.match(/\bview\s*=\s*(?:\w+\s*->\s*)?cs_view-(\w+)/i);
    if (c) {
      const slot = CS_VIEW_VALUES[c[1].toLowerCase()];
      if (slot) slots.add(slot); else all = true;
      continue;
    }
    const lit = stmt.text.match(/\bview\s*=\s*([`'])([^`']*)\1/);
    if (lit) {
      if (VIEW_SLOT_NAMES.has(lit[2])) slots.add(lit[2]); else all = true;
      continue;
    }
    if (/\bview\s*=/.test(stmt.text)) { all = true; continue; }
    slots.add('MAIN');
  }
  return { slots, all };
}

const DEFAULTS = {
  minUi5: '1.71',
  distribution: 'sapui5',
  allow: [],
  render: true,
  properties: true,
  rules: {},           // per-rule off/severity/exclude, see findings.mjs
  file: '',            // the path the source came from - `rules.*.exclude` matches it
  snapshot: undefined, // path override for data/properties.json
  onProgress: undefined, // ({ phase, done, total, file }) while checkFiles runs
};

/** Everything a repo can say about a finding after the gate produced it:
 *  the `rules` block first (off / another severity / excluded file), then
 *  the source directives. Both need the annotation to have run. */
const settle = (findings, source, o) =>
  applyDirectives(applyRules(findings, o.rules, o.file), source);

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
    result.findings = settle(
      annotate([{ type: 'frozen-view-builder', value: frozen, offset: at < 0 ? 0 : at }], source) ?? [],
      source,
      o,
    );
    return result;
  }
  if (!prep.usesBuilder) return result;
  if (o.properties) {
    const data = loadSnapshot(o.snapshot);
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
    // structural defects of the builder chain itself (an excess shut( )
    // asserts at runtime) - independent of the UI5 metadata
    result.findings.push(...(prep.structure ?? []));
    // rules that need the class itself, not just the view tree. The id->control
    // map comes from its own views, so an ABAP-side rule can judge what may be
    // done to the control a wire names.
    const controlIds = {};
    const enumFields = new Map();
    for (const nodeRoot of prep.nodes) {
      Object.assign(controlIds, collectControlIds(nodeRoot));
      for (const [table, fields] of collectEnumBoundFields(nodeRoot, data)) {
        const prev = enumFields.get(table) ?? new Set();
        for (const f of fields) prev.add(f);
        enumFields.set(table, prev);
      }
    }
    result.findings.push(...checkAbapRules(source, {
      data, controlIds, enumFields, minUi5: o.minUi5, rules: o.rules,
    }));
    attachNamespaceFixes(result.findings, source);
    // severity, wording and the line/column each offset points at
    annotate(result.findings, source);
    result.findings = settle(result.findings, source, o);
  }
  return result;
}

export function checkXmlSource(xml, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const root = parseXml(xml);
  const result = { kind: 'xml', docs: [xml], model: {}, notes: [], helperTokens: 0, findings: [], renderErrors: [], skippedRender: false, stats: profileOf([root]) };
  if (o.properties) {
    const data = loadSnapshot(o.snapshot);
    result.findings.push(...checkNodes(root, { data, minUi5: o.minUi5, allow: o.allow, distribution: o.distribution }));
    // over the raw text, as on the ABAP side: an icon name is not always an
    // attribute value (a JSONModel seed in a fragment carries them too)
    result.findings.push(...checkIcons(xml, { minUi5: o.minUi5 }));
    annotate(result.findings, xml);
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
      const workers = Math.min(4, renderable.length);
      progress({ phase: 'render', done: 0, total: renderable.length, pages: workers });
      const renderer = await openRenderer({ pages: workers });
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
        await renderer.close();
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
  const renderer = await openRenderer({ theme, css: true });
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
    await renderer.close();
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
 */
export function collectFiles(paths) {
  /* Keyed by the RESOLVED path, because the same file can be reached twice —
   * `cli.mjs src src`, or a directory named next to one of its own files —
   * and checking it twice reports and COUNTS every finding in it twice. The
   * value is the path as it was reached, which is what the caller gets back:
   * `result.file` travels into the `--json` output and into the baseline
   * keys, so the shape of that string is a contract, not an implementation
   * detail. Only the duplicate goes; nothing is rewritten. */
  const out = new Map();
  const visit = (p, named) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        visit(path.join(p, e), false);
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
      if (BUILDERS.some((b) => src.includes(`${b.class}=>factory`))
          || frozenBuilderOf(src)
          || (named && /^\s*</.test(src))) out.set(path.resolve(p), p);
    }
  };
  for (const p of paths) visit(p, true);
  return [...out.values()];
}
