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
 *
 * The first two live in check.mjs (the `./check` export) with everything they
 * decide with, so a browser bundle can have them without this module's
 * renderer and worker pool; they are re-exported here unchanged.
 */
import fs from 'fs';
import path from 'path';
import { Worker } from 'node:worker_threads';
import { prepareAbap } from './reconstruct.mjs';
import { renderRuleConfig, pathMatches } from './findings.mjs';
import { openRenderer } from './render.mjs';
import { usesBuilderFactory, frozenBuilderOf } from './builders.mjs';
import { classIndexOf } from './guide-rules.mjs';
import {
  checkAbapSource, checkXmlSource, declaresApp, isXmlSource, isAbapGitXml, xmlFileKind,
} from './check.mjs';
import { DEFAULTS } from './defaults.mjs';
/* Moved to abap-source.mjs so a consumer can reach it without this entry
 * point, which pulls the renderer (and with it http/os/module) in.
 * Re-exported: it has been part of this module's surface. */
export { elementBoundSlots } from './abap-source.mjs';
export { checkAbapSource, checkXmlSource, declaresApp, isXmlSource, isAbapGitXml };

/* The property gate's thread pool (`jobs`). Each file is judged on its own -
 * the one cross-file input, the class index, is built before and handed to
 * every thread - so the files can be spread over worker threads and the
 * results put back in FILE order: a pooled run returns exactly what the
 * sequential loop returns, it only returns it sooner. A thread costs a module
 * load and a metadata parse, so the pool is sized to the work (one thread per
 * POOL_FILES_PER_JOB files, at most `jobs`) and a run that would get one
 * thread runs in this one. null = run sequentially: one job, or options that
 * cannot cross a thread boundary (a caller-supplied function anywhere but the
 * two callbacks, which never reach a check). */
const POOL_FILES_PER_JOB = 64;
async function checkInWorkers(files, sources, o, progress) {
  const jobs = Math.min(Number.isInteger(o.jobs) && o.jobs > 1 ? o.jobs : 1, Math.floor(files.length / POOL_FILES_PER_JOB));
  if (jobs <= 1) return null;
  /* a snapshot handed over as data carries its side tables as non-enumerable
   * properties (snapshotFromJson), which a structured clone drops: the
   * threads would judge without the enums. Such a run stays in this thread. */
  if (o.data) return null;
  const { onProgress, renderer, ...shared } = o;
  try { structuredClone(shared); } catch { return null; }
  const results = new Array(files.length);
  const threads = [];
  try {
    let cursor = 0;
    let done = 0;
    await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./check-worker.mjs', import.meta.url), { workerData: shared });
      threads.push(worker);
      const next = () => {
        if (cursor >= files.length) { resolve(); return; }
        const i = cursor++;
        worker.postMessage({ i, file: files[i], src: sources[i], xml: isXmlSource(files[i], sources[i]) });
      };
      worker.on('message', ({ i, result, error }) => {
        if (error) {
          const e = new Error(error.message);
          e.stack = error.stack;
          reject(e);
          return;
        }
        results[i] = result;
        progress({ phase: 'properties', done: ++done, total: files.length, file: files[i] });
        next();
      });
      worker.on('error', reject);
      worker.on('exit', (code) => { if (code !== 0) reject(new Error(`check worker exited with code ${code}`)); });
      next();
    })));
  } finally {
    await Promise.all(threads.map((t) => t.terminate()));
  }
  return results;
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
  // `prep` is ONE source's reconstruction - never every file's
  const o = { ...DEFAULTS, ...opts, prep: undefined };
  /* A long corpus run is otherwise silent until the last file: the render gate
   * alone is minutes of wall clock. The callback is the only thing this
   * library says about a run in progress — WHAT is printed, and whether
   * anything is, stays the caller's decision (see report.mjs createProgress). */
  const progress = typeof o.onProgress === 'function' ? o.onProgress : () => {};
  const results = [];
  progress({ phase: 'properties', done: 0, total: files.length });
  const sources = files.map((file) => fs.readFileSync(file, 'utf8'));
  /* One class is judged at a time, and some of what it means is written in
   * another: a `cs_event` it inherits is its superclass's. */
  o.classIndex ??= classIndexOf(sources.filter((src, i) => !isXmlSource(files[i], src)));
  const pooled = await checkInWorkers(files, sources, o, progress);
  if (pooled) results.push(...pooled);
  else {
    for (const [i, file] of files.entries()) {
      const src = sources[i];
      // the file travels with the options so `rules.*.exclude` can match on it
      const r = isXmlSource(file, src) ? checkXmlSource(src, { ...o, file }) : checkAbapSource(src, { ...o, file });
      r.file = file;
      results.push(r);
      progress({ phase: 'properties', done: results.length, total: files.length, file });
    }
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
                xml: r.docs[i], model: r.docModels?.[i] ?? r.model, ...(kind ? { kind } : {}),
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
        // every spelling of the path, like any other rule's `exclude`
        const excluded = rc.off || pathMatches(rc.exclude, r.file || '');
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
    // a byte-order mark (Notepad, PowerShell's Out-File) is not JSON
    return JSON.parse(fs.readFileSync(candidate, 'utf8').replace(/^\uFEFF/, ''));
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
    if (isXmlSource(file, src)) {
      jobs.push({ file, index: 0, xml: src, model: mock ?? {}, kind: xmlFileKind(file), mockError });
      continue;
    }
    const prep = prepareAbap(src);
    if (!prep.usesBuilder || (!prep.docs.length && !prep.helperTokens)) {
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
  /* With `onIgnored`, the trees `ignore` keeps out are still walked, once,
   * to name the checkable files in them: the CLI says how many the config's
   * `ignore` kept out, and asking a second, unignored walk re-read every
   * class of the run. Nothing walked that way is ever returned. */
  const countIgnored = ignore.length && typeof opts.onIgnored === 'function';
  const kept = new Map(); // resolved -> path, the checkable files under an ignored path
  const seenDirs = new Map(); // realpath -> walked as ignored (true) or not (false)
  const visit = (p, named, ignored = false) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      let real;
      try { real = fs.realpathSync(p); } catch { real = path.resolve(p); }
      // a tree walked as ignored is walked again when it is reached unignored
      if (seenDirs.has(real) && (seenDirs.get(real) === false || ignored)) return;
      seenDirs.set(real, ignored);
      for (const e of fs.readdirSync(p)) {
        // node_modules and every dot-entry are skipped - see the header
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const child = path.join(p, e);
        /* tried in every spelling a rule `exclude` is (pathMatches in
         * findings.mjs): with forward slashes - `path.join` hands back `\` on
         * Windows, so `/generated/`, the spelling the README gives, ignored
         * nothing there - and absolute as well as relative, or `"/src/99/"`
         * ignores a tree under the config's own `paths` (joined onto its
         * absolute directory) and not under `abap2ui5lint src` */
        const skip = ignored || (ignore.length && pathMatches(ignore, child));
        if (skip && !countIgnored) continue;
        visit(child, false, Boolean(skip));
      }
      return;
    }
    const into = ignored ? kept : out;
    if (/\.(view|fragment)\.xml$/.test(p)) { into.set(path.resolve(p), p); return; }
    if (p.endsWith('.testclasses.abap')) return;
    if (p.endsWith('.clas.abap') || (named && /\.(abap|xml)$/.test(p))) {
      if (ignored && (out.has(path.resolve(p)) || kept.has(path.resolve(p)))) return;
      const src = fs.readFileSync(p, 'utf8');
      /* The FROZEN builder counts as a checkable class too. It reconstructs no
       * view, so all it can ever produce is the one finding saying so - but
       * that is the point: dropping it here is what made a whole app on the
       * retired API come back as "no checkable app classes" and exit 0. */
      /* An app class that builds no view (`INTERFACES z2ui5_if_app`, no
       * factory) is kept for the same reason: its view comes from another
       * class, and dropping it made `node cli.mjs zcl_app.clas.abap` answer
       * "no checkable app classes" to a file it was handed by name. */
      if (usesBuilderFactory(src)
          || frozenBuilderOf(src)
          || declaresApp(src)
          || (opts.allClasses && p.endsWith('.clas.abap'))
          || (named && /^\s*</.test(src) && !isAbapGitXml(src))) into.set(path.resolve(p), p);
    }
  };
  for (const p of paths) visit(p, true);
  if (countIgnored) for (const [resolved, p] of kept) if (!out.has(resolved)) opts.onIgnored(p);
  return [...out.values()];
}
