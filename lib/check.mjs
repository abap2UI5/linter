/*
 * check — the property gate over ONE source, and nothing that needs a
 * browser, a thread or a socket:
 *
 *   checkAbapSource(source, opts)  ABAP class using a view builder -> result
 *   checkXmlSource(xml, opts)      raw .view.xml / .fragment.xml -> result
 *
 * plus the decisions they are made of, each exported so a consumer that
 * assembles the pipeline itself decides them the way CI does (declaresApp,
 * VIEWLESS_APP_RULE, sizeLimitRaised, standDownUnusedNamespaces,
 * frozenBuilderOf).
 *
 * Split out of index.mjs, which re-exports all of it: the entry point also
 * carries checkFiles( ) and with it the renderer (`http`, `os`, `module`) and
 * the worker pool (`worker_threads`), none of which a browser bundle can
 * resolve. Everything here imports only leaf modules - `fs` is read through
 * properties.mjs and the vendored portable profile, both of which a host
 * without a file system bypasses (`data`, `portableProfile`). npm test holds
 * the line: importing `./check` must not load render.mjs or index.mjs.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prepareAbap } from './reconstruct.mjs';
import { checkAbapRules, namedModels, checkSourceRules, obsoleteCcHelperFindings, publicReadFromOutside, SOURCE_RULES } from './abap-rules.mjs';
import {
  loadSnapshot, checkNodes, parseXml, collectControlIds, collectContainerPages, collectEnumBoundFields,
  DEFAULT_TRUE_BOOLEAN, profileTree, WALK_ONLY_RULES,
} from './properties.mjs';
import { checkIcons } from './icons.mjs';
import { annotate, applyRules, applyDirectives, attachSourceFixes, attachSuggestionFixes, isOptInEnabled, RULES } from './findings.mjs';
import { matchLineEndings } from './fix.mjs';
import { frozenBuilderOf, FROZEN_BUILDERS } from './builders.mjs';
import { scrub, blankLiterals } from './abap.mjs';
import { elementBoundSlots } from './abap-source.mjs';
import { checkPortable, PORTABLE_PROFILE_URL, PORTABLE_RULE } from './portable.mjs';
import { nodesOf } from './tree.mjs';
import { DEFAULTS } from './defaults.mjs';
/* Re-exported: what decides which builder a class is on belongs with the
 * rest of the decisions a consumer has to make the same way. */
export { frozenBuilderOf, FROZEN_BUILDERS };

/* The vendored portable profile, read on first use: a run that does not ask
 * for portable-app never opens the file. */
let vendoredPortable = null;
const portableProfileOf = (o) => o.portableProfile
  ?? (vendoredPortable ??= JSON.parse(fs.readFileSync(fileURLToPath(PORTABLE_PROFILE_URL), 'utf8')));

/* The opt-in `portable-app` findings for one source, or none when the
 * `rules` block does not ask for them (lib/portable.mjs). */
const portableFindings = (o, args) => (isOptInEnabled(o.rules, PORTABLE_RULE)
  ? checkPortable({ ...args, profile: portableProfileOf(o) }) : []);

/** Everything a repo can say about a finding after the gate produced it:
 *  the `rules` block first (off / another severity / excluded file), then
 *  the source directives. Both need the annotation to have run. Last, the
 *  fixes of what survived are made to write the source's line ending
 *  (matchLineEndings - which needs to know whether crlf-line-ending did). */
const settle = (findings, source, o, stoodDown = []) => matchLineEndings(
  applyDirectives(applyRules(findings, o.rules, o.file), source, {
    rules: o.rules,
    file: o.file,
    // with the property gate off, a directive for one of its rules is unjudged
    ran: (id) => o.properties !== false || !WALK_ONLY_RULES.has(id),
    // ...and so is one for a rule that stood down on this source
    stoodDown,
  }), source);

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

/** An app class: an `INTERFACES` statement naming `z2ui5_if_app`, chained or
 *  not. Read with comments and literal content blanked - the framework's own
 *  utility class explains in a comment what "z2ui5_if_app passes" means, and
 *  a regex over the raw text reached that from an `INTERFACES` above it. */
export const declaresApp = (source) => /^[^\S\r\n]*INTERFACES\b[^.]*\bz2ui5_if_app\b/im.test(blankLiterals(scrub(String(source))));

/* The rule ids an app class WITHOUT a view is judged by, on top of
 * checkSourceRules( ): the ones that read the class and never the view - a
 * bind on a local, a non-public, a static or a reference; the obsolete
 * calls; the event wires and their handlers; the lifecycle dispatcher and
 * the flow rules over it; the private attribute that fails every roundtrip.
 * Exported: a consumer judging a view-less app class itself filters
 * checkAbapRules( ) with exactly this. */
export const VIEWLESS_APP_RULE = /^(?:binding-to-\w+|obsolete-[\w-]+|event-[\w-]+|handler-without-event|private-app-attribute|loop-work-area-bound|missing-view-display-on-navigated|missing-on-navigated-branch|separate-lifecycle-ifs|manual-init-flag|redundant-init-display|lifecycle-is-initial|unconditional-popup-display|display-after-nav-app-call|double-display-in-branch|duplicate-for-iterator)$/;

/* The rule ids a class judged by only SOME rules never ran - a view-less
 * class, one on the frozen builder. A directive there naming one of them had
 * nothing it could suppress, and that is not "unused": the same waiver is
 * needed the day the view moves back in (settle's `stoodDown`). The two
 * directive rules are always judged. */
const notRunBut = (judged) => RULES.filter((id) => !judged(id) && id !== 'unused-directive' && id !== 'unknown-directive-rule');

/**
 * An unused-namespace-declaration is a claim about the WHOLE view, and it is
 * only as good as the reconstruction behind it. Where part of the view is
 * built in a way the reconstructor does not follow, the prefix may well be
 * used by exactly that part - abap2UI5's own z2ui5_cl_ui5_app_start declares
 * `xmlns:form` for the SimpleForm its create_layout_form( ) helper adds - and
 * the finding came with a deleting --fix that broke the view. So the rule
 * stands down for a class whose reconstruction is known to be incomplete (a
 * builder call it could not place - `unplacedTokens`, which is helperTokens
 * without a mere second stringify( )), and for a prefix the class writes in
 * MORE builder literals (`ns = \`form\``, `\`form:SimpleForm\``,
 * `n = \`core:require\``) than its reconstructed documents carry: one of
 * those uses is in a part of the view nobody here saw. A class whose every
 * use was reconstructed keeps the per-document verdict.
 *
 * Returns the findings that survive and the rules that stood down: a class
 * the rule stood down for was not judged by it, so a waiver of it is
 * unjudged too (settle's `stoodDown`) - not "unused", which told app_start
 * to delete the waiver for the very false positive the stand-down exists
 * for. `findings` is not mutated.
 */
export function standDownUnusedNamespaces(findings, source, prep) {
  const RULE = 'unused-namespace-declaration';
  const incomplete = prep?.unplacedTokens > 0;
  const stoodDown = incomplete ? [RULE] : [];
  if (!findings.some((f) => f.type === RULE)) return { findings, stoodDown };
  const code = scrub(String(source));
  /* per PREFIX, not per finding: every document of the class reports its
   * own unused declarations, and a scan of the whole source per finding
   * made a class of many views quadratic */
  const counted = new Map();
  const inSource = (prefix) => {
    if (counted.has(prefix)) return counted.get(prefix);
    const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const n = (code.match(new RegExp(`\\bns\\s*=\\s*[\`']${p}[\`']`, 'gi')) ?? []).length
      + (code.match(new RegExp(`[(=]\\s*[\`']${p}:[A-Za-z]`, 'gi')) ?? []).length;
    counted.set(prefix, n);
    return n;
  };
  const inDocs = new Map();
  const count = (p) => inDocs.set(p, (inDocs.get(p) ?? 0) + 1);
  for (const nodeRoot of prep?.nodes ?? []) {
    for (const node of nodesOf(nodeRoot)) {
      if (!node.name) continue;
      if (node.ns) count(node.ns);
      else if (String(node.name).includes(':')) count(String(node.name).split(':')[0]);
      for (const [n] of node.attrs ?? []) {
        const at = String(n).indexOf(':');
        if (at > 0 && !String(n).startsWith('xmlns')) count(String(n).slice(0, at));
      }
    }
  }
  const kept = findings.filter((f) => f.type !== RULE
    || (!incomplete && inSource(f.member ?? '') <= (inDocs.get(f.member) ?? 0)));
  if (kept.length < findings.length && !stoodDown.length) stoodDown.push(RULE);
  return { findings: kept, stoodDown };
}

/** Whether the class raises a model's size limit anywhere: the constant
 *  outside a literal, or the action name as one. Prose that MENTIONS the
 *  constant (a catalog row quoting a port's notes) is a literal and does not
 *  count. checkAbapSource hands the answer to checkNodes as
 *  `sizeLimitRaised` - rows-hidden-by-visible judges only a class that never
 *  raises the limit. */
export const sizeLimitRaised = (source) => /\bcs_event\s*-\s*set_size_limit\b/i.test(blankLiterals(scrub(String(source))))
  || /[`']SET_SIZE_LIMIT[`']/i.test(String(source));

export function checkAbapSource(source, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // a caller that already reconstructed this very source hands it over
  const prep = o.prep ?? prepareAbap(source);
  const result = {
    kind: 'abap',
    usesBuilder: prep.usesBuilder,
    docs: prep.docs,
    docKinds: prep.docKinds,
    model: prep.model,
    // per document: the start-path model for one the first display shows
    docModels: prep.docs.map((_, i) => (prep.docOnInit?.[i] && prep.initModel) || prep.model),
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
   * noise.
   *
   * ONE exception, `obsolete-custom-control`: the old builder's
   * `_z2ui5( )->timer( )` & co. are eight method NAMES on one receiver, read
   * as names rather than as a view (abap-rules.mjs, obsoleteCcHelpers),
   * and a Timer does not stop being obsolete because the class around it is on
   * the frozen builder. Migrating the chain would carry it straight across. */
  const frozen = prep.usesBuilder ? null : frozenBuilderOf(source);
  if (frozen) {
    const at = source.search(new RegExp(`\\b${frozen}\\s*=>\\s*factory`, 'i'));
    result.frozenBuilder = frozen;
    const found = [{ type: 'frozen-view-builder', value: frozen, offset: at < 0 ? 0 : at }, ...obsoleteCcHelperFindings(source)];
    result.ruleHits = hitCount(found);
    result.findings = settle(annotate(found, source) ?? [], source, o,
      notRunBut((id) => id === 'frozen-view-builder' || id === 'obsolete-custom-control'));
    return result;
  }
  result.ruleHits = {};
  if (!prep.usesBuilder) {
    /* A class that builds no view. Under `allClasses` it is judged by the
     * source-side rules alone; otherwise it is not judged at all - and not
     * collected either, so this is the library caller's case.
     *
     * Unless it is an APP CLASS. `INTERFACES z2ui5_if_app` with no factory
     * call is the app whose view is built elsewhere - a views class, a
     * generator, a shared renderer - and it used to be invisible: dropped by
     * collectFiles, "no checkable app classes", exit 0, even when the file
     * was named on the command line. It is kept now and judged by what needs
     * no view: the source-side rules, and the ABAP-side rules that read the
     * class itself - a `_bind( )` on the wrong kind of attribute, an
     * obsolete call, an event wire, the lifecycle dispatcher. What it is NOT
     * judged by is anything about the view it does not have: the binding
     * surface (`unbound-public-attribute` would report every attribute the
     * other class binds), the wires against ids, the chain layout. The
     * result says so (`appWithoutView`), and the run summary counts it. */
    const app = declaresApp(source);
    if (o.allClasses || app) {
      result.findings.push(...checkSourceRules(source));
      if (app) {
        result.appWithoutView = true;
        const seen = new Set(result.findings.map((f) => `${f.type}@${f.offset}`));
        for (const f of checkAbapRules(source, { data: null, minUi5: o.minUi5, rules: o.rules, classIndex: o.classIndex })) {
          if (VIEWLESS_APP_RULE.test(f.type) && !seen.has(`${f.type}@${f.offset}`)) result.findings.push(f);
        }
        // the class half of the portable profile: actions, nested slots, wires
        result.findings.push(...portableFindings(o, { nodes: [], source, abap: true }));
      }
      attachSourceFixes(result.findings, source);
      annotate(result.findings, source);
      result.ruleHits = hitCount(result.findings);
      result.findings = settle(result.findings, source, o, notRunBut((id) => SOURCE_RULES.has(id)
        || (app && ((VIEWLESS_APP_RULE.test(id) && !WALK_ONLY_RULES.has(id)) || id === PORTABLE_RULE))));
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
  const data = o.properties ? (o.data ?? loadSnapshot(o.snapshot)) : null;
  if (o.properties) {
    // which `name>` prefixes a binding may use - the class itself is the only
    // place that can widen the framework's three (SET_ODATA_MODEL)
    const models = namedModels(source);
    /* cs_event-bind_element sets a binding context on a whole view slot at
     * runtime, so relative paths under it resolve against a row the document
     * never names. A static walk cannot see that; the rules that ask "is there
     * a context here" have to be told. */
    const bound = elementBoundSlots(source);
    const raised = sizeLimitRaised(source);
    for (const [nodeIndex, nodeRoot] of prep.nodes.entries()) {
      /* A document the FIRST display shows is judged against the start-path
       * model (initModel in reconstruct.mjs): what an event handler assigns
       * has not run yet, and borrowing its value hid an enum bound to an
       * attribute that ships as "" on every start. */
      const onInit = Boolean(prep.nodeOnInit?.[nodeIndex] && prep.initModel);
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
        model: onInit ? prep.initModel : prep.model,
        shape: onInit ? prep.initModelShape : prep.modelShape,
        initialFields: onInit ? prep.initialFields : null,
        sizeLimitRaised: raised,
        rootFields: prep.rootFields,
        rootWrites: prep.rootWrites,
        jsonPaths: prep.jsonPaths,
        models,
        boundElement,
        fromAbap: true,
      }));
    }
  }

  /* the stand-down of unused-namespace-declaration where the reconstruction
   * is incomplete - see standDownUnusedNamespaces */
  const namespaces = standDownUnusedNamespaces(result.findings, source, prep);
  result.findings = namespaces.findings;
  const stoodDown = [...namespaces.stoodDown];

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
    const containerPages = {};
    for (const nodeRoot of prep.nodes) {
      Object.assign(controlIds, collectControlIds(nodeRoot));
      Object.assign(containerPages, collectContainerPages(nodeRoot));
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
      data, controlIds, containerPages, enumFields, boolFields, minUi5: o.minUi5, rules: o.rules, classIndex: o.classIndex,
    }));
    // a stand-down that depends on the other classes of the run leaves a
    // waiver of the two attribute rules unjudged (publicReadFromOutside)
    if (publicReadFromOutside(source, o.classIndex)) stoodDown.push('unused-public-attribute', 'unbound-public-attribute');
    result.findings.push(...portableFindings(o, { nodes: prep.nodes, source, abap: true, data }));
    attachSourceFixes(result.findings, source);
    // severity, wording and the line/column each offset points at
    annotate(result.findings, source);
    result.ruleHits = hitCount(result.findings);
    result.findings = settle(result.findings, source, o, stoodDown);
  }
  return result;
}

/* abapGit's own serialization - the `<abapGit …>` document it writes beside
 * every object (`zcl_app.clas.xml`, `package.devc.xml`), after an optional
 * BOM and XML declaration. It is XML and it is never a view: named on the
 * command line in bulk (`abap2ui5lint src/*`, a pre-commit hook handing over
 * `git diff --name-only`) it used to be read as one whose root control is
 * `abapGit`, an aggregation-in-aggregation error per sidecar. */
/* Whether checkFiles( ) reads a source as a raw XML view rather than as an
 * ABAP class: a `.view.xml` / `.fragment.xml` name, or text that opens
 * with `<`. One predicate for the library and the CLI (the --fix passes,
 * the cache's class index), so the two cannot disagree on a file. */
export const isXmlSource = (file, src) => /\.(view|fragment)\.xml$/.test(String(file ?? '')) || /^\s*</.test(String(src ?? ''));

const ABAPGIT_XML = /^\s*(?:<\?xml[^>]*\?>\s*)?<abapGit\b/;
export const isAbapGitXml = (src) => ABAPGIT_XML.test(String(src));

/* How a raw XML document is loaded, which its FILE says: a `.fragment.xml`
 * goes through Fragment.load, a `.view.xml` through XMLView.create. Left to
 * the renderer's root-tag sniffing, a fragment file that opened with an XML
 * declaration or a comment, declared its FragmentDefinition in the default
 * namespace, or had a bare control as its root was loaded as a VIEW and
 * failed the render gate with "XMLView's root node must be 'View'". */
export const xmlFileKind = (file) => (/\.fragment\.xml$/i.test(String(file ?? '')) ? 'fragment'
  : /\.view\.xml$/i.test(String(file ?? '')) ? 'view' : undefined);

export function checkXmlSource(xml, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (isAbapGitXml(xml)) {
    return {
      kind: 'xml', docs: [], model: {}, notes: ['abapGit metadata, not a view - nothing to check'], helperTokens: 0,
      findings: [], renderErrors: [], skippedRender: false, stats: profileOf([]), ruleHits: {},
    };
  }
  const root = parseXml(xml);
  const result = { kind: 'xml', docs: [xml], docKinds: [xmlFileKind(o.file)], model: {}, notes: [], helperTokens: 0, findings: [], renderErrors: [], skippedRender: false, stats: profileOf([root]), ruleHits: {} };
  if (o.properties) {
    const data = o.data ?? loadSnapshot(o.snapshot);
    result.findings.push(...checkNodes(root, { data, minUi5: o.minUi5, allow: o.allow, distribution: o.distribution }));
    // over the text, as on the ABAP side: an icon name is not always an
    // attribute value (a JSONModel seed in a fragment carries them too) -
    // minus the XML comments, which the ABAP side never had either
    result.findings.push(...checkIcons(xml, { minUi5: o.minUi5, xml: true }));
    result.findings.push(...portableFindings(o, { nodes: [root], source: xml, data }));
    attachSuggestionFixes(result.findings, xml, { xml: true });
    annotate(result.findings, xml);
    result.ruleHits = hitCount(result.findings);
    result.findings = settle(result.findings, xml, o);
  }
  return result;
}

