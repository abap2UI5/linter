/*
 * Hand-written typings for @abap2ui5/linter — the implementation is plain
 * ESM JavaScript (no TypeScript build step, by design), so this file IS the
 * typed contract of the package exports map. One ambient `declare module`
 * block per exports subpath; package.json points every subpath's "types"
 * condition here.
 *
 * The shapes mirror what the real consumers use — the VS Code extension's
 * src/linter.d.ts grew them first — so a change here that breaks a consumer
 * is a change in the published contract, not a doc fix. npm test type-checks
 * this file (tsc --noEmit) and asserts that every exports subpath has its
 * `declare module` block.
 */

declare module "@abap2ui5/linter" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";
  import type { Severity } from "@abap2ui5/linter/findings";

  export interface CheckOptions {
    /** The UI5 version of the target system (default "1.71"). */
    minUi5?: string;
    /** Which distribution the target serves (default "sapui5"). */
    distribution?: "sapui5" | "openui5";
    /** control[.member] names allowed despite the version floor. */
    allow?: string[];
    /** Run the render gate (default true — needs the optional deps). */
    render?: boolean;
    /** Run the property gate (default true). */
    properties?: boolean;
    /** Per-rule off / severity / exclude — the config's `rules` block. */
    rules?: Record<string, unknown>;
    /** The path the source came from — `rules.*.exclude` matches on it. */
    file?: string;
    /** Path override for data/properties.json. */
    snapshot?: string;
    /** Called while checkFiles runs — the only thing the library says about a
     *  run in progress. `done === 0` opens a phase. */
    onProgress?: (event: {
      phase: "properties" | "render";
      done: number;
      total: number;
      file?: string;
      pages?: number;
      skipped?: boolean;
    }) => void;
  }

  /** What a result contributed to the corpus — the numbers behind the run
   *  summary, counted while the gate walked the tree. */
  export interface ResultStats {
    documents: number;
    controls: number;
    aggregations: number;
    attributes: number;
    bindings: number;
    icons: number;
    /** Deepest nesting of any of this result's documents. */
    depth: number;
    /** Documents the render gate actually loaded. */
    rendered: number;
    /** Control name -> occurrences, e.g. { "sap.m.Button": 4 }. */
    types: Record<string, number>;
  }

  export interface CheckResult {
    file?: string;
    kind: "abap" | "xml";
    /** ABAP results only: the class builds views with one of the view builders. */
    usesBuilder?: boolean;
    /** The reconstructed (or given) XML documents. */
    docs: string[];
    /** The mock model derived from the class's literal seeds. */
    model: Record<string, unknown>;
    notes: string[];
    helperTokens: number;
    findings: PropertyFinding[];
    /** Render-gate failures — real XMLView.create errors. */
    renderErrors: string[];
    skippedRender: boolean;
    /** Set when rules['render-error'] re-weighs render failures. */
    renderSeverity?: Severity;
    /** The structural profile of what was checked here. */
    stats?: ResultStats;
  }

  /** What a screenshot run is steered by — the theme and viewport a picture
   *  is taken in, which is all that separates one likeness from another. */
  export interface ScreenshotOptions {
    /** UI5 theme to render in (default "sap_horizon"). */
    theme?: string;
    /** Viewport width/height in CSS pixels (default 1280x900). */
    width?: number;
    height?: number;
    /** Several viewports, rendered in ONE browser session - one result per
     *  document per size. Overrides width/height when given. */
    sizes?: Array<{ width: number; height: number }>;
    /** Preview data, merged over the model derived from the class. Without
     *  it, a `<class>.mock.json` next to the source is used when present. */
    model?: Record<string, unknown>;
    /** Photograph the whole document rather than the viewport (default true). */
    fullPage?: boolean;
    onProgress?: (event: {
      phase: "screenshot";
      done: number;
      total: number;
      file?: string;
    }) => void;
  }

  /** One document's picture. `png` is absent when nothing could be
   *  photographed — `errors` then says why in plain words. */
  export interface ScreenshotResult {
    file: string;
    /** Index of the document within its file (a class can build several). */
    index: number;
    kind?: "view" | "fragment";
    /** The viewport this picture was taken at. */
    size?: { width: number; height: number };
    png?: Buffer;
    errors: string[];
  }

  export function checkAbapSource(source: string, opts?: CheckOptions): CheckResult;
  export function checkXmlSource(xml: string, opts?: CheckOptions): CheckResult;
  export function checkFiles(files: string[], opts?: CheckOptions): Promise<CheckResult[]>;
  /** Render every view the given files build and return the PNGs — the render
   *  gate as a preview. Needs the render runtime. */
  export function screenshotFiles(files: string[], opts?: ScreenshotOptions): Promise<ScreenshotResult[]>;
  /** The preview data belonging to a source file by convention
   *  (`zcl_app.mock.json` next to `zcl_app.clas.abap`), or null. Throws when
   *  the file is there and does not parse. */
  export function mockModelFor(file: string): Record<string, unknown> | null;
  /** The suffix that convention uses. */
  export const MOCK_SUFFIX: string;
  /** Recursively collect checkable files (builder classes + view/fragment XML). */
  export function collectFiles(paths: string[]): string[];
}

declare module "@abap2ui5/linter/reconstruct" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  export interface ViewNode {
    name: string | null;
    ns: string | null;
    /** The third element is the character offset of the `a( )` call that
     *  wrote the attribute - absent on nodes parseXml( ) produced. */
    attrs: Array<[string, string] | [string, string, number]>;
    children: ViewNode[];
    /** Character offset of the `open( )` / `leaf( )` call - reconstruction
     *  offsets are valid offsets into the original source (scrub( ) is
     *  offset-preserving). Absent on parseXml( ) nodes. */
    offset?: number;
  }

  export interface PreparedAbap {
    usesBuilder: boolean;
    nodes: ViewNode[];
    docs: string[];
    /** What a literal seed actually sets - the model the renderer gets. */
    model: Record<string, unknown>;
    /** Every declared field of every declared structure - what the property
     *  gate judges binding paths against. */
    modelShape: Record<string, unknown>;
    /** Every attribute name the class declares (uppercased) - what the
     *  relative-binding-without-context rule judges against. */
    rootFields: Set<string>;
    notes: string[];
    helperTokens: number;
    /** Structural defects of the builder chain itself (excess-shut,
     *  duplicate-property, …) — consumed as findings by checkAbapSource. */
    structure: PropertyFinding[];
  }

  export function prepareAbap(source: string): PreparedAbap;

  /** Serialize a reconstructed node tree back to XML ('' for an empty tree). */
  export function toXml(node: ViewNode): string;
}

declare module "@abap2ui5/linter/properties" {
  import type { ViewNode } from "@abap2ui5/linter/reconstruct";
  import type { Severity } from "@abap2ui5/linter/findings";

  export interface PropertyFinding {
    type: string;
    control?: string;
    member?: string;
    since?: string;
    minUi5?: string;
    deprecated?: string | boolean | { since?: string | null; text?: string };
    /** invalid-property-value, unknown-binding-path, duplicate-id,
     *  event-without-handler, unconverted-abap-boolean */
    value?: string;
    allowed?: string[];
    memberType?: string;
    /** invalid-aggregation-child */
    parentControl?: string;
    parentAggregation?: string;
    expected?: string;
    /** too-many-children, event-arg-out-of-range */
    count?: number;
    /** sapui5-only-control */
    library?: string;
    /** unknown-binding-path: the aggregation binding the row context came from */
    context?: string;
    /** non-released-api: which package the object lives in, what that package
     *  is, and whether it is the frozen one — `member` carries the path. */
    what?: string;
    frozen?: boolean;
    /** non-released-api: the object (or project) that took its place, if any. */
    replacement?: string;
    /** chain-indentation: which way the layout contradicts the tree
     *  ('siblings' | 'attributes' | 'outdented'). */
    shape?: string;
    /** unconverted-abap-boolean: the correction that belongs to the builder
     *  this call is on — the two have different ones. */
    fixHint?: string;
    /** Character offset into the checked file - set by every gate that can
     *  place its finding; absent for view parts inlined from helper
     *  methods, which map back to no position at all. */
    offset?: number;
    /** Filled in by annotate( ) from the findings subpath. */
    severity?: Severity;
    message?: string;
    line?: number;
    column?: number;
    /** Character spans in the checked source that correct the finding
     *  mechanically. Only the rules whose correction needs no decision carry
     *  them - a fix that has to guess is deliberately absent. */
    fixes?: Array<{ start: number; end: number; text: string }>;
  }

  export function loadSnapshot(file?: string): unknown;

  /** The ui5Version of the committed metadata snapshot ('' if unreadable). */
  export function snapshotVersion(file?: string): string;

  export function parseXml(xml: string): ViewNode;

  /** id -> resolved control name for every literal id of a view tree - the
   *  ABAP-side rules judge CONTROL_BY_ID wires against it. */
  export function collectControlIds(root: ViewNode): Record<string, string>;

  /** A structural profile of one view tree: what the run looked at. No
   *  metadata is consulted, so it costs one walk and cannot fail. */
  export function profileTree(root: ViewNode): {
    controls: number;
    aggregations: number;
    attributes: number;
    bindings: number;
    icons: number;
    depth: number;
    /** Control name -> occurrences. */
    types: Record<string, number>;
  };

  /** The metadata entry of one property of one control (or undefined). */
  export function propertyDecl(data: unknown, control: string, member: string): unknown;

  /** Which metadata section (property/aggregation/event/association) a
   *  member of a control lives in, or null. */
  export function memberSection(data: unknown, control: string, member: string): string | null;

  export function checkNodes(
    root: ViewNode,
    opts: {
      data: unknown;
      minUi5?: string;
      allow?: string[];
      distribution?: string;
      /** Without these two the binding-path rules cannot run at all. */
      model?: Record<string, unknown> | null;
      shape?: Record<string, unknown> | null;
      /** Without this the relative-binding-without-context rule stays silent. */
      rootFields?: Set<string> | null;
      /** The `name>` prefixes the class registers (namedModels) — null when
       *  the class widens its models non-literally, silencing unknown-model. */
      models?: Set<string> | null;
    }
  ): PropertyFinding[];
}

declare module "@abap2ui5/linter/render" {
  /** Everything the render gate needs beyond the property gate — the
   *  package's optionalDependencies (playwright + @openui5/*). */
  export const RENDER_DEPS: readonly string[];

  /** The render deps this install is missing ([] = render gate available).
   *  `resolve` is injectable for testing the not-installed path. */
  export function missingRenderDeps(resolve?: (id: string) => unknown): string[];

  /** The actionable refusal openRenderer throws: names the missing packages,
   *  how to install them, and the --no-render / render: false way out. */
  export function renderDepsError(missing: string[]): Error & { code: "ERR_RENDER_DEPS_MISSING" };

  export interface Renderer {
    /** Render one document; resolves to the filtered error list ([] = clean). */
    render(input: { xml: string; model?: Record<string, unknown> }): Promise<string[]>;
    close(): Promise<void>;
  }

  /** Start a browser session over multiple render calls. `pages` opens a
   *  pool of harness pages so concurrent callers run in parallel. Throws
   *  ERR_RENDER_DEPS_MISSING when the optional deps are not installed. */
  export function openRenderer(opts?: { pages?: number }): Promise<Renderer>;
}

declare module "@abap2ui5/linter/abap-rules" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** The `name>` model prefixes the class itself registers (SET_ODATA_MODEL).
   *  Returns null when a registration is non-literal — then nothing may be
   *  judged about model names at all. */
  export function namedModels(source: string): Set<string> | null;

  export function checkAbapRules(
    source: string,
    opts?: {
      /** The metadata snapshot - without it the rules that need UI5
       *  knowledge stay silent. */
      data?: unknown;
      /** id -> control name from the class's own views (collectControlIds). */
      controlIds?: Record<string, string> | null;
      /** The config's `rules` block. Only opt-in rules read it here (they are
       *  not emitted at all unless it asks); every other rule is filtered
       *  later by applyRules. */
      rules?: Record<string, unknown> | null;
    }
  ): PropertyFinding[];
}

declare module "@abap2ui5/linter/fix" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** Rule ids whose findings can carry `fixes`. */
  export const FIXABLE: readonly string[];

  export function isFixable(finding: PropertyFinding | null | undefined): boolean;

  /** Rewrite `source` with every fix the findings carry. Overlapping spans are
   *  deferred to the next run rather than resolved by guesswork. */
  export function applyFixes(
    source: string,
    findings: PropertyFinding[]
  ): { output: string; applied: number; deferred: number };
}

declare module "@abap2ui5/linter/findings" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** error - the app breaks; warning - it will not survive the target
   *  system; hint - worth knowing, never wrong by itself. */
  export type Severity = "hint" | "warning" | "error";

  export const SEVERITIES: Severity[];

  /** Position on the severity ladder (0 = hint) for threshold comparisons. */
  export function severityRank(severity: string): number;

  /** Every rule id the linter can report - the registry a `rules` block and
   *  the extension's own rule-documentation links are validated against. */
  export const RULES: readonly string[];

  /** The pseudo-rule id render-gate failures are reported under. */
  export const RENDER_RULE: string;

  export function severityOf(finding: { type: string; severity?: Severity }): Severity;

  export function describe(finding: PropertyFinding): string;

  /** Adds severity, message and (where the gate recorded an offset)
   *  line/column, in place. */
  export function annotate<T extends PropertyFinding>(
    findings: T[],
    source: string
  ): T[];

  /** Drops the findings a `rules` entry switched off (or excluded for this
   *  file) and applies its severity overrides. */
  export function applyRules<T extends PropertyFinding>(
    findings: T[],
    rules: Record<string, unknown> | undefined,
    file?: string
  ): T[];

  /** The `abap2ui5lint-disable…` directives of a source, or null when it
   *  holds none. */
  export function parseDirectives(
    source: string
  ): { suppresses(line: number, rule: string): boolean } | null;

  /** Drops the findings an `abap2ui5lint-disable…` directive in the source
   *  suppresses. Returns the input array unchanged when it holds none. */
  export function applyDirectives<T extends PropertyFinding>(
    findings: T[],
    source: string
  ): T[];

  /** Attaches the undeclared-namespace fix for conventional prefixes - the
   *  same fixes the CLI attaches, for gates that replicate the pipeline. */
  export function attachNamespaceFixes<T extends PropertyFinding>(
    findings: T[],
    source: string
  ): T[];
}

declare module "@abap2ui5/linter/rule-docs" {
  /** The prose behind a rule id: what the defect is and what the fix looks
   *  like. The one-line `message` on a finding has to stand on its own in a
   *  terminal; this is the paragraph that does not fit there. */
  export interface RuleDoc {
    /** Which group the rule appears under on the rules page. */
    category: string;
    /** One line - the README table cell. */
    summary: string;
    /** The paragraph: why the defect matters and how to fix it. */
    detail: string;
    /** Optional: the shortest source that triggers the rule. */
    example?: string;
    /** Optional: what `--fix` does to it, for a rule listed in FIXABLE. */
    fixNote?: string;
  }

  /** Keyed by rule id - every id in the `RULES` registry has an entry, plus
   *  the render gate's pseudo-rule. */
  export const RULE_DOCS: Record<string, RuleDoc>;

  export const CATEGORIES: { id: string; title: string; blurb: string }[];
}

declare module "@abap2ui5/linter/config" {
  /** File names discovered, in order - jsonc first. */
  export const CONFIG_NAMES: string[];
  export const CONFIG_NAME: string;

  /** JSONC -> JSON: strips comments and trailing commas, string-safe. */
  export function stripJsonc(text: string): string;

  /** Walks from `dir` upward, returns the first config file or null. */
  export function findConfigFrom(dir: string): string | null;

  /** Discovery for a CLI run: from cwd and from each given path. */
  export function findConfig(cwd: string, paths?: string[]): string | null;

  export interface LintConfig {
    paths?: string[];
    minUi5?: string;
    distribution?: string;
    allow?: string[];
    render?: boolean;
    properties?: boolean;
    failOn?: string;
    rules?: Record<string, unknown>;
    /** Path of the adoption baseline, relative to the config file. */
    baseline?: string;
  }

  /** Parses and validates a config file. Throws with a precise message on
   *  bad input - an unknown key or rule id fails loudly by design. */
  export function loadConfig(file: string): LintConfig;

  /** Fills `opt` from the config, never overriding a key in `seen` (the
   *  options the CLI set explicitly). allow lists merge. */
  export function applyConfig<T extends Record<string, unknown>>(
    opt: T,
    seen: Set<string>,
    cfg: LintConfig
  ): T;
}

declare module "@abap2ui5/linter/baseline" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** The stable identity of a finding - line-free, so moved code stays
   *  matched. `relativeFile` is relative to the baseline file's directory. */
  export function findingKey(relativeFile: string, f: PropertyFinding): string;

  /** The directory keys are computed against: where the baseline file lives. */
  export function baselineBase(file: string): string;

  /** Parses a baseline file into key -> count. Throws on bad input. */
  export function loadBaseline(file: string): Map<string, number>;

  /** Drops the findings the baseline covers (mutates each result's
   *  findings). Stale entries are the caller's to fail on. */
  export function applyBaseline(
    results: Array<{ file?: string; findings: PropertyFinding[] }>,
    baseline: Map<string, number>,
    baseDir?: string
  ): { suppressed: number; stale: Array<{ key: string; count: number }> };

  /** Freeze the current findings as accepted debt (key -> count). */
  export function buildBaseline(
    results: Array<{ file?: string; findings: PropertyFinding[] }>,
    baseDir?: string
  ): Map<string, number>;

  export function writeBaseline(file: string, map: Map<string, number>): void;
}

declare module "@abap2ui5/linter/report" {
  import type { CheckResult } from "@abap2ui5/linter";
  import type { Severity } from "@abap2ui5/linter/findings";

  export const FORMATS: readonly string[];

  /** NO_COLOR / FORCE_COLOR are honoured before the TTY check. */
  export function colorEnabled(stream?: { isTTY?: boolean }): boolean;

  export interface Problem {
    line?: number;
    column?: number;
    severity: Severity;
    message: string;
    rule: string;
  }

  /** One flat, source-ordered list of a result's findings + render errors. */
  export function problemsOf(result: CheckResult): Problem[];

  export interface Summary {
    files: number;
    skipped: number;
    totals: { error: number; warning: number; hint: number };
    problems: number;
    /** Filled in by the caller once the fail threshold is applied. */
    failing?: number;
  }

  export function summarize(results: CheckResult[]): Summary;

  /** `6 problems (3 errors, 2 warnings, 1 hint)` — null when clean. */
  export function countLine(totals: Summary["totals"]): string | null;

  export function contextLine(
    opt: { distribution?: string; minUi5?: string; failOn?: string },
    summary: Summary,
    snapshot?: string
  ): string;

  export interface FormatOptions {
    quiet?: boolean;
    color?: boolean;
    verbose?: boolean;
    context?: string;
    [key: string]: unknown;
  }

  export function formatStylish(results: CheckResult[], summary: Summary, opt?: FormatOptions): string;
  /** The frozen --json contract: may grow keys, never lose or rename them. */
  export function formatJson(results: CheckResult[], summary: Summary, opt?: FormatOptions): string;
  export function formatMarkdown(results: CheckResult[], summary: Summary, opt?: FormatOptions): string;
  /** SARIF 2.1.0. */
  export function formatSarif(results: CheckResult[]): string;

  /** GitHub workflow-command lines that annotate findings onto the diff. */
  export function githubAnnotations(results: CheckResult[], opt?: FormatOptions): string[];

  /** What the run looked at, aggregated from the per-result profiles. */
  export interface RunStats {
    abap: number;
    xml: number;
    /** ABAP files that actually build a view. */
    builder: number;
    /** Builder classes whose reconstruction produced no document at all. */
    emptyViews: number;
    documents: number;
    controls: number;
    aggregations: number;
    attributes: number;
    bindings: number;
    icons: number;
    depth: number;
    rendered: number;
    renderSkipped: number;
    /** Control name -> occurrences. */
    types: Map<string, number>;
    /** Rule id -> reported problems. */
    rules: Map<string, number>;
  }

  export function runStats(results: CheckResult[]): RunStats;

  /** `a 12, b 7, +3 more` — the head of a count map, longest first. */
  export function topOf(map: Map<string, number>, limit?: number): string;

  /** The run summary as [label, value] rows. */
  export function statsRows(stats: RunStats, summary: Summary, opt?: FormatOptions): [string, string][];
  /** The same rows, dim and aligned, for the terminal. */
  export function formatStats(stats: RunStats, summary: Summary, opt?: FormatOptions): string[];

  export interface Progress {
    /** Milliseconds per phase, filled whether or not anything was printed. */
    times: Record<string, number>;
    update(event: { phase: string; done: number; total: number; file?: string; pages?: number; skipped?: boolean }): void;
    finish(): void;
  }

  /** Live gate progress on stderr — a rewriting line, or one collapsed log
   *  group per gate inside GitHub Actions. */
  export function createProgress(opt?: {
    enabled?: boolean;
    stream?: { write(text: string): unknown; isTTY?: boolean };
    github?: boolean;
  }): Progress;

  /** The two badges a run can write: what the corpus IS, and what the gate
   *  said about it. */
  export const BADGE_KINDS: readonly ["corpus", "checks"];

  /** A shields.io endpoint object for the run — nothing but the keys that
   *  schema defines, or shields renders the badge as "invalid". */
  export function badgeEndpoint(
    summary: Summary,
    stats: RunStats,
    opt?: {
      kind?: "corpus" | "checks";
      label?: string;
      logo?: string | null;
      labelColor?: string;
      /** the run's `rules` config — what it switched off is not counted as passed */
      rules?: Record<string, unknown>;
    }
  ): Record<string, unknown>;
}

declare module "@abap2ui5/linter/formatters" {
  /** The named module the curated formatters live in (core:require target). */
  export const FORMATTER_MODULE: string;

  /** The curated formatter export surface — mirrored by the render harness,
   *  judged by the uncurated-formatter rule. */
  export const CURATED_FORMATTERS: readonly string[];
}
