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
import { loadSnapshot, checkNodes, parseXml, collectControlIds, profileTree } from './properties.mjs';
import { checkIcons } from './icons.mjs';
import { annotate, applyRules, applyDirectives, renderRuleConfig, attachNamespaceFixes } from './findings.mjs';
import { openRenderer } from './render.mjs';
import { BUILDERS } from './builders.mjs';

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
  if (!prep.usesBuilder) return result;
  if (o.properties) {
    const data = loadSnapshot(o.snapshot);
    // which `name>` prefixes a binding may use - the class itself is the only
    // place that can widen the framework's three (SET_ODATA_MODEL)
    const models = namedModels(source);
    for (const nodeRoot of prep.nodes) {
      result.findings.push(...checkNodes(nodeRoot, {
        data,
        minUi5: o.minUi5,
        allow: o.allow,
        distribution: o.distribution,
        model: prep.model,
        shape: prep.modelShape,
        rootFields: prep.rootFields,
        jsonPaths: prep.jsonPaths,
        models,
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
    for (const nodeRoot of prep.nodes) Object.assign(controlIds, collectControlIds(nodeRoot));
    result.findings.push(...checkAbapRules(source, { data, controlIds, minUi5: o.minUi5, rules: o.rules }));
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
      if (BUILDERS.some((b) => src.includes(`${b.class}=>factory`))
          || (named && /^\s*</.test(src))) out.set(path.resolve(p), p);
    }
  };
  for (const p of paths) visit(p, true);
  return [...out.values()];
}
