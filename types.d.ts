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
    /** Which distribution the target serves. Unset (the default) is its own
     *  answer, not a synonym for "sapui5": a SAPUI5-only control is then a
     *  hint rather than an error ("openui5") or nothing at all ("sapui5"). */
    distribution?: "sapui5" | "openui5" | null;
    /** control[.member] names allowed despite the version floor. */
    allow?: string[];
    /** Run the render gate (default true — needs the optional deps). */
    render?: boolean;
    /** Page-pool size for the render gate (default 4). Config form:
     *  `"render": { "pages": N }`; CLI form: `--render-pages`. */
    renderPages?: number;
    /** Run the property gate (default true). */
    properties?: boolean;
    /** Per-rule off / severity / exclude — the config's `rules` block. */
    rules?: Record<string, unknown>;
    /** The path the source came from — `rules.*.exclude` matches on it. */
    file?: string;
    /** Path override for data/properties.json. */
    snapshot?: string;
    /** An ALREADY-OPEN renderer from openRenderer() (`@abap2ui5/linter/render`).
     *  When given, checkFiles uses it and does NOT close it — the caller owns
     *  its lifecycle and can keep one warm browser across many calls. Its pool
     *  size was decided at openRenderer time. */
    renderer?: import("@abap2ui5/linter/render").Renderer;
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
    /** Rule id -> findings produced for this source BEFORE the rules block,
     *  directives or a baseline suppressed anything. */
    ruleHits?: Record<string, number>;
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
    /** An ALREADY-OPEN renderer from openRenderer() — reused, never closed
     *  here. The theme was then decided at openRenderer time (pass `theme`
     *  and `css: true` there), so this option's `theme` does not apply. */
    renderer?: import("@abap2ui5/linter/render").Renderer;
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

  /** Which view SLOTS the class element-binds at runtime
   *  (`cs_event-bind_element`). Every relative path in a bound slot's document
   *  resolves against a row the document never names, so the rules that ask
   *  "is there a context here" have to be told. `all` is the honest half: a
   *  wire whose slot is not a literal could bind any of them, and a wrong
   *  second guess is worse than silence — it suppresses everywhere. */
  export function elementBoundSlots(source: string): {
    slots: Set<string>;
    all: boolean;
  };
  /** Recursively collect checkable files (builder classes + view/fragment XML).
   *
   *  A directory WALK skips `node_modules` and every dot-entry (`.git`,
   *  `.github`, and a dot-named ABAP file too) - deliberately, but silently:
   *  a class parked under a dot-directory is not checked and nothing says so.
   *  `opts.ignore` are regex patterns matched against each walked path; a path
   *  named explicitly still gets checked, because ignoring an argument is the
   *  same silence. Symlink cycles terminate (the walk keys directories by
   *  realpath). */
  export function collectFiles(
    paths: string[],
    opts?: { ignore?: (string | RegExp)[] }
  ): string[];
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
    /** Which view SLOT this document is displayed into, when its statement
     *  named a consumer (`view_display`, `popup_display`, …). Absent when no
     *  consumer was in the same statement - a caller comparing it against
     *  `elementBoundSlots` treats that as "any slot". Set on the ROOT node. */
    displaySlot?: string;
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
    /** What the CLASS ITSELF writes into those fields - the second author of
     *  every two-way-bound string, which the model cannot stand in for. */
    rootWrites: Map<string, { any: boolean; allPlainText: boolean }>;
    /** The full paths bound with `json = abap_true`, for
     *  json-bind-on-scalar-property. */
    jsonPaths: Set<string>;
    /** Index-aligned with `docs`: how each document is LOADED, taken from the
     *  consuming call rather than sniffed from its root tag. `undefined` where
     *  no consumer was in the same statement - the renderer sniffs then. */
    docKinds: Array<"view" | "fragment" | undefined>;
    notes: string[];
    helperTokens: number;
    /** Structural defects of the builder chain itself (excess-shut,
     *  duplicate-property, …) — consumed as findings by checkAbapSource. */
    structure: PropertyFinding[];
  }

  export function prepareAbap(source: string): PreparedAbap;

  /** Serialize a reconstructed node tree back to XML ('' for an empty tree). */
  export function toXml(node: ViewNode): string;

  /** What a resolver returns for an expression it could not compute
   *  statically. Distinct from `null` and from '': a piece that contributed
   *  the empty string would make `|{ col }_{ i }|` collapse to "_" for every
   *  row, so rules that judge the VALUE must not fire on it. */
  export const SKIP: unique symbol;

  /** The client-side binding a `client->_bind( … )` / `_bind_edit( … )` call
   *  produces, or null when the expression is not a lone bind call (or passes
   *  a shape-CHANGING named argument, which stays unresolved on purpose). */
  export function bindingOf(expr: string): {
    root: string;
    /** The client path, e.g. `/MS_VIEW/TITLE`. */
    path: string;
    /** `path = abap_true` asked for the bare path, not a `{binding}`. */
    bare: boolean;
    /** `json = abap_true` splices a JSON node (outbound only). */
    json: boolean;
    omit: { initial: boolean; paths: Set<string> };
  } | null;

  /** Build the expression resolver the extractors run every builder argument
   *  through: literals, `&&` chains, `|…{ }…|` templates, bind calls and event
   *  stubs come back as strings, anything not statically computable as SKIP. */
  export function makeResolver(
    content: string,
    boundVars: Set<string>,
    notes: string[],
    bindMeta?: unknown
  ): (expr: string) => string | typeof SKIP;

  /** The `client->*_display( … )` call a document is handed to (the method
   *  name, e.g. "popup_display"), or null. The consumer has to sit in the SAME
   *  statement as the `stringify( )`. */
  export function consumerIn(statement: string): string | null;

  /** Walk the builder calls of a source and return the reconstructed roots.
   *  `structure` collects the chain's own structural defects as it goes. */
  export function extractDocs(
    content: string,
    resolveExpr: (expr: string) => string | typeof SKIP,
    notes: string[],
    structure: PropertyFinding[],
    dialect?: unknown
  ): { docs: ViewNode[]; helperTokens: number };

  /** extractDocs plus the handle-taking helper methods replayed into the
   *  chain that calls them. `helperTokens > 0` means the reconstruction is
   *  incomplete and the render gate must skip the file. */
  export function extractDocsWithHelpers(
    content: string,
    resolveExpr: (expr: string) => string | typeof SKIP,
    notes: string[],
    structure: PropertyFinding[],
    dialect?: unknown
  ): { docs: ViewNode[]; helperTokens: number };

  /** The two pictures of the class's data, from one parse: what a literal
   *  seed actually sets (`model`, what the renderer gets) and every declared
   *  field of every declared structure (`modelShape`, what the property gate
   *  judges binding paths against). */
  export function deriveModel(
    content: string,
    boundVars: Set<string>,
    notes: string[]
  ): { model: Record<string, unknown>; modelShape: Record<string, unknown> };
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
    /** sapui5-only-control: the configured distribution, absent when none was */
    distribution?: string;
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

  /** Per bound TABLE path, the fields a view binds to an enum-typed property.
   *  What `enum-field-unset-on-insert` needs: a row appended without setting
   *  one of them reaches UI5 as '' and fails strict validation. */
  export function collectEnumBoundFields(
    root: ViewNode,
    data: unknown,
    select?: (decl: unknown, enums: Record<string, string[]>) => boolean
  ): Map<string, Set<string>>;

  /** The default predicate: a property whose type is one of the snapshot's
   *  enums. An unseeded ABAP field ships `""`, which is a member of none. */
  export const ENUM_TYPED: (decl: unknown, enums: Record<string, string[]>) => boolean;

  /** The boolean counterpart: a property whose own default is `true`, where an
   *  unseeded field's real `false` silently overrides it. */
  export const DEFAULT_TRUE_BOOLEAN: (decl: unknown) => boolean;

  /** Is `since` within the configured floor? The ABAP-side rules carry a
   *  `minUi5` STRING rather than the parsed floor the tree walk uses, and two
   *  implementations of this question are how two gates come to disagree. */
  export function withinUi5Floor(since: string | null | undefined, minUi5?: string): boolean;

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
      /** What the class writes into its own fields (prepareAbap) — without it
       *  picker-value-without-format cannot run. */
      rootWrites?: Map<string, { any: boolean; allPlainText: boolean }> | null;
      /** The `name>` prefixes the class registers (namedModels) — null when
       *  the class widens its models non-literally, silencing unknown-model. */
      models?: Set<string> | null;
      /** The paths bound as JSON (prepareAbap) — without it
       *  json-bind-on-scalar-property never fires. */
      jsonPaths?: Set<string> | null;
      /** The source was ABAP, not raw XML. Both halves of
       *  raw-javascript-to-frontend judge a value as authored only when this
       *  says so. */
      fromAbap?: boolean;
      /** The class element-binds the slot this document is displayed into, so
       *  a relative binding path HAS a context at runtime that no static walk
       *  can see. */
      boundElement?: boolean;
    }
  ): PropertyFinding[];
}

declare module "@abap2ui5/linter/render" {
  /** Everything the render gate needs beyond the property gate — the
   *  package's optionalDependencies (playwright + @openui5/*). */
  export const RENDER_DEPS: readonly string[];

  /** The package name every render dep ships in: an OPTIONAL PEER, so npm
   *  never installs its ~118 MB on its own. */
  export const RENDER_RUNTIME: string;

  /** What only the PICTURE needs on top of the gate's runtime (the theme
   *  compiler). Deliberately not part of RENDER_DEPS — a missing compiler
   *  must never be a reason for the GATE to refuse to run. */
  export const SCREENSHOT_DEPS: readonly string[];

  /** The theme the gate loads: the cheapest one that still resolves every
   *  library's theme parameters. */
  export const GATE_THEME: string;

  /** Whether a default-on render gate should step aside for the property gate,
   *  and the sentence to say when it does — null when the gate runs. An
   *  ASKED-for gate (`--render`, `"render": true`) keeps the hard refusal:
   *  quietly not running a configured gate is how a green CI stops meaning
   *  anything. Needs no I/O, so it is testable without uninstalling anything. */
  export function renderFallback(input: {
    render: boolean;
    asked: boolean;
    missing: string[];
  }): string | null;

  /** The render deps this install is missing ([] = render gate available).
   *  `resolve` is injectable for testing the not-installed path. */
  export function missingRenderDeps(resolve?: (id: string) => unknown): string[];

  /** The actionable refusal openRenderer throws: names the missing packages,
   *  how to install them, and the --no-render / render: false way out. */
  export function renderDepsError(missing: string[]): Error & { code: "ERR_RENDER_DEPS_MISSING" };

  export interface Renderer {
    /** Render one document; resolves to the filtered error list ([] = clean). */
    render(input: { xml: string; model?: Record<string, unknown>; kind?: "view" | "fragment" }): Promise<string[]>;
    /** Photograph one document instead of judging it — the PNG a Buffer, the
     *  errors alongside it (a view with one broken binding still renders). */
    screenshot(input: {
      xml: string;
      model?: Record<string, unknown>;
      kind?: "view" | "fragment";
      width?: number;
      height?: number;
      fullPage?: boolean;
    }): Promise<{ png: Uint8Array; errors: string[] }>;
    close(): Promise<void>;
  }

  /** Start a browser session over multiple render calls. `pages` opens a
   *  pool of harness pages so concurrent callers run in parallel; `theme` is
   *  what the pages boot with (the gate's default is the cheapest theme);
   *  `css` compiles the theme LESS, which only a screenshot needs. Throws
   *  ERR_RENDER_DEPS_MISSING when the optional deps are not installed.
   *  The result can be passed as `renderer` to checkFiles/screenshotFiles to
   *  reuse one warm browser across many calls — the caller closes it. */
  export function openRenderer(opts?: { pages?: number; theme?: string; css?: boolean }): Promise<Renderer>;
}

declare module "@abap2ui5/linter/abap-rules" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** The `name>` model prefixes the class itself registers (SET_ODATA_MODEL).
   *  Returns null when a registration is non-literal — then nothing may be
   *  judged about model names at all. */
  export function namedModels(source: string): Set<string> | null;

  /**
   * Which view SLOTS the class element-binds at runtime
   * (`cs_event-bind_element`), so a relative path in a document displayed
   * into one of them HAS a context no static walk can see.
   *
   * `all` is the honest half: a wire whose slot is not a literal could bind
   * any of them, and a wrong second guess is worse than silence.
   *
   * Re-exported here as well as from the package entry point: this is the
   * subpath a consumer assembling the pipeline can import without pulling the
   * renderer - and `http`/`os`/`module` with it - into a browser bundle.
   */
  export function elementBoundSlots(source: string): {
    slots: Set<string>;
    all: boolean;
  };

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
      /** Enum-typed fields the view exposes through a bound aggregation, by
       *  table (collectEnumBoundFields) — without it the enum-row rule never
       *  fires. */
      enumFields?: Map<string, Set<string>> | null;
      /** The same map for fields bound to a BOOLEAN property whose own default
       *  is `true` — without it absent-boolean-overrides-default never fires. */
      boolFields?: Map<string, Set<string>> | null;
      /** The target release. The ABAP-side icon scan judges against it;
       *  without it every repository is judged against the 1.71 default,
       *  whatever floor it configured. */
      minUi5?: string;
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
  ): {
    output: string;
    applied: number;
    /** Overlapping spans, left for the next `--fix` pass. */
    deferred: number;
    /** Spans that do not address this source at all - a rule computing offsets
     *  against different text. A DEFECT in the linter, surfaced rather than
     *  swallowed; `ABAP2UI5LINT_STRICT_FIXES=true` makes it throw. */
    dropped: number;
  };
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

  /** The severity a rule carries before any `rules` override. An id nothing
   *  classified answers "error" — a new rule is loud until it is deliberately
   *  quietened, never silently ignored. */
  export function defaultSeverityOf(type: string): Severity;

  /** The rule ids that are NOT emitted unless a `rules` entry asks for them.
   *  A house style handed to every consumer as a default is precisely what
   *  such a rule's own documentation argues against, and its fixes span a
   *  whole chain, so it would defer every other rule's fix inside one. */
  export const OPT_IN: ReadonlySet<string>;

  /** Whether a `rules` block switches an opt-in rule on. */
  export function isOptInEnabled(
    rules: Record<string, unknown> | null | undefined,
    type: string
  ): boolean;

  /** The parsed `rules` entry for the render gate's pseudo-rule, or null.
   *  Render errors are strings rather than findings, so applyRules never sees
   *  them and the caller applies this to a result's `renderErrors` instead. */
  export function renderRuleConfig(rules: Record<string, unknown> | null | undefined): {
    off?: boolean;
    severity?: string;
    exclude?: RegExp[];
  } | null;

  /** 1-based line/column of a character offset, or null when the offset is
   *  not a position in the source. */
  export function positionAt(
    source: string,
    offset: number
  ): { line: number; column: number } | null;

  /** ABAP's hard limit on a source line, and therefore abapGit's. Not a style
   *  setting and not configurable: over it the object does not import. */
  export const LINE_LIMIT: number;

  /** The conventional namespace-prefix -> library pairs an
   *  undeclared-namespace fix may assume. Closed by convention: anything else
   *  could mean any library, and a fix that has to guess is worse than the
   *  finding. */
  export const KNOWN_NS: Readonly<Record<string, string>>;

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

  /** Attaches the json-bind-on-scalar-property fix - the `json = abap_true`
   *  argument deleted from the reported attribute's `_bind( )`. Judged on the
   *  reconstructed view, so the source span is found here. */
  export function attachJsonBindFixes<T extends PropertyFinding>(
    findings: T[],
    source: string
  ): T[];

  /** Attaches the did-you-mean fix a finding carries as `written`/
   *  `suggestion` but no span for (the view-side rules): the written name is
   *  found from the finding's offset on and rewritten. `xml: true` searches
   *  the raw text instead of the comment-scrubbed ABAP. */
  export function attachSuggestionFixes<T extends PropertyFinding>(
    findings: T[],
    source: string,
    options?: { xml?: boolean }
  ): T[];

  /** Every fix the pipeline attaches after the rules ran, in one call - what
   *  a gate replicating the pipeline should call. */
  export function attachSourceFixes<T extends PropertyFinding>(
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
    /** Optional: the same source, fixed - the other half of `example`. */
    remedy?: string;
    /** Optional: what `--fix` does to it, for a rule listed in FIXABLE. */
    fixNote?: string;
  }

  /** Keyed by rule id - every id in the `RULES` registry has an entry, plus
   *  the render gate's pseudo-rule. */
  export const RULE_DOCS: Record<string, RuleDoc>;

  export const CATEGORIES: { id: string; title: string; blurb: string }[];

  /** The published rule reference the two helpers below address. */
  export const RULES_PAGE: string;

  /** The card for one rule: what it means, how severe it is, how to waive it. */
  export function ruleUrl(id: string): string;

  /** The before/after pair inside that card - what a report deep-links at. */
  export function ruleExampleUrl(id: string): string;
}

declare module "@abap2ui5/linter/config" {
  /** File names discovered, in order - jsonc first. */
  export const CONFIG_NAMES: string[];
  export const CONFIG_NAME: string;

  /** Every key the config file recognizes. A key outside this set fails
   *  loudly — a typo that silently changes nothing is worse than an error. */
  export const KNOWN: ReadonlySet<string>;

  /** JSONC -> JSON: strips comments and trailing commas, string-safe. */
  export function stripJsonc(text: string): string;

  /** Walks from `dir` upward, returns the first config file or null. */
  export function findConfigFrom(dir: string): string | null;

  /** Discovery for a CLI run: from cwd and from each given path. */
  export function findConfig(cwd: string, paths?: string[]): string | null;

  export interface LintConfig {
    paths?: string[];
    /** Repo-level regex patterns: a path a directory walk reaches and one of
     *  these matches is not collected. The counterpart of `rules[id].exclude`,
     *  which is per rule. */
    ignore?: string[];
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

  /** The same parse and the same validation, from TEXT rather than from a
   *  file - for a consumer that fetched `abap2ui5lint.jsonc` over an API and
   *  still has to reach the verdict the CLI would. `name` only appears in the
   *  error messages. */
  export function parseConfig(name: string, text: string): LintConfig;

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

  /** The distinct rules a run reported, in the order a reader first meets
   *  them - what every format's reference block is built from. */
  export function rulesReported(
    results: CheckResult[],
    quiet?: boolean,
  ): { rule: string; severity: Severity }[];

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
  /** checkstyle XML — one <file> per result, one <error> per problem. */
  export function formatCheckstyle(results: CheckResult[]): string;
  /** JUnit XML — one <testsuite> per file, one failing <testcase> per problem. */
  export function formatJunit(results: CheckResult[]): string;

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
    /** Rule id -> findings the gate PRODUCED, counted before the rules
     *  block, directives and baseline suppressed anything — a fully
     *  baselined corpus still says which rules fired on it. */
    ruleHits: Map<string, number>;
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

declare module "@abap2ui5/linter/icons" {
  import type { PropertyFinding } from "@abap2ui5/linter/properties";

  /** The icon registry as `loadIcons` returns it: the release each name
   *  arrived in, the ones that left again, and the oldest release the data
   *  covers. */
  export interface IconData {
    /** Oldest release the registry was built from - nothing before it can be
     *  judged. */
    floor: string;
    /** The UI5 version the data was generated from. */
    ui5Version: string;
    /** lower-cased icon name -> the release it appeared in. */
    since: Map<string, string>;
    /** lower-cased icon name -> the release it was removed in. */
    removed: Map<string, string>;
  }

  /** The registry, parsed once per path. A file that cannot be read yields an
   *  EMPTY registry rather than throwing: the icon rules are one gate among
   *  many and a partial install must not take the property gate down with it.
   *  An empty registry reports nothing, which is the same "no guessing" the
   *  rest of the linter follows - so a caller that needs to KNOW the data
   *  arrived checks `since.size` itself. */
  export function loadIcons(file?: string): IconData;

  /**
   * Every `sap-icon://` in a piece of source - ABAP with comments already
   * scrubbed, or raw view XML - judged against the target release.
   *
   * A text scan rather than a view-tree walk, on purpose: an icon name
   * travels as data (a bound column, a constant, a status-to-icon mapping) at
   * least as often as it travels as an attribute, and those never reach the
   * tree the property gate walks.
   *
   * Both entry points call it - `checkAbapRules` for classes, `checkXmlSource`
   * for raw XML - and it is exported for the callers that assemble the
   * pipeline themselves rather than through `checkAbapSource`, which is what
   * a consumer feeding the metadata snapshot in by hand has to do (the VS Code
   * extension's in-process gate: its host may have no filesystem, so it cannot
   * hand the linter a path).
   *
   * `iconData` overrides the registry, for a caller that loaded it from
   * somewhere other than a file.
   */
  export function checkIcons(
    text: string,
    opts?: { minUi5?: string; iconData?: IconData }
  ): PropertyFinding[];
}
