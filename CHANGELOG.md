# Changelog

## Unreleased

- **Seven more rules carry a `--fix`** — 25 of the rule set now do, up from 18.
  Each one is a correction with nothing to decide: `redundant-init-display`
  drops the `check_on_init( )` call from the OR, or the whole init arm of the
  fork; `binding-to-reference` inserts the `->*` (for `TYPE REF TO data` only,
  because `->*` on an object reference does not compile); `unescaped-brace-in-style`
  escapes every brace of the stylesheet where all of them sit in backtick
  literals; `collapsed-brace-in-style` doubles the backslash inside the
  template, across every segment of the sheet in one pass; `class-constructor-visibility`
  moves the declaration line under `PUBLIC SECTION.` of the same class;
  `escape-sequence-in-backtick` splits the literal into the `\`left\` && |\\n| &&
  \`right\`` chain its own message recommends; `json-bind-on-scalar-property`
  deletes the `json = abap_true` argument. Every one declines the shape where
  a fix would be a guess — a comment inside the span, a chained `CLASS-METHODS:`,
  a brace inside a template — and says so on the rules page (`fixNote`).
  Findings and severities are unchanged; `--fix` simply settles more of them.
  Considered and left without one: `boolc-instead-of-xsdbool` (the two are not
  aliases — a blank false against an initial one), `separate-lifecycle-ifs`
  (`IF init … ENDIF. IF navigated …` may rely on BOTH running on the first
  start, so an ELSEIF would blank the app), `empty-catch-block` (the pragma
  asserts an intent the linter cannot know) and `commercial-ui5-host` (a
  `/resources/` path may not exist on the open host).

- **`frozen-view-builder` says it in a friendlier, shorter way.** The message
  led with `DEPRECATED` and `NOTHING about the view was checked`, and read like
  a class on `z2ui5_cl_xml_view` was a defect on the way to breaking. It is
  not: that builder keeps working, and the plan is for it to move into a
  separate addon rather than to disappear, so staying on it is a legitimate
  choice. What the finding is actually about is what such a class does not get
  — no control, property, binding or render check can read the old API — so
  the text now names that, names the one thing to switch to, and recommends it
  instead of demanding it. Roughly a third shorter. Severity is unchanged
  (**warning**), and so is everything else about the rule: same id, same
  position on the factory call, same `"rules": { "frozen-view-builder":
  "hint" }` (or `false`) for a repo that stays on the old builder on purpose.
  `RULE_DOCS` and the rules page carry the same rewrite.

- **Every rule documents a before/after pair, and every report links at it.**
  `RULE_DOCS` gains `remedy` — the same source as `example`, fixed — for all
  120 rules, gated like `example` is (missing one fails `npm test`, and so
  does one identical to its example). It is a split as much as an addition:
  around a third of the examples used to carry the fix as a trailing line of
  their own snippet, so `example` was not "the source that triggers it" and a
  reader could not tell which of the two lines was the reported one. The rules
  page renders the pair as two labelled blocks under its own `#<rule>-example`
  anchor, and each card now says which module in `lib/` decides the finding,
  linked at the line (scanned at generation time, so the existing staleness
  gate keeps it honest). Reports carry the addresses instead of only the id:
  the stylish output ends in a reference block listing each rule it reported,
  the markdown job summary links the rule cell and adds a **Rules reported**
  table with a link to the card and one to the pair, and a GitHub annotation
  ends in the rule id and its deep link — the annotation renders no rule id of
  its own, so a reader had the message and no way on from it. New exports:
  `ruleUrl( )`, `ruleExampleUrl( )`, `RULES_PAGE` (`./rule-docs`) and
  `rulesReported( )` (`./report`); the SARIF `helpUri` now comes from the same
  helper it used to restate.

- **Three structural rules from abap-check: `empty-catch-block`,
  `boolc-instead-of-xsdbool`, `delete-index-in-loop`.** An empty CATCH wants
  `##NO_HANDLER` (a **hint**, like `redundant-conv-i` - the code is correct,
  the extended check on a real system is what speaks; a comment does not fill
  the block). `boolc( )` where the ecosystem's downport writes `xsdbool( )`
  for you (a **warning** - and no fix, because boolc's FALSE is a blank while
  xsdbool's is initial, which is behaviour, not spelling). And `DELETE itab
  INDEX sy-tabix` inside a `LOOP AT` over the same table (an **error**),
  reported only where sy-tabix is provably not the loop's own cursor any
  more: a READ TABLE, a completed inner LOOP or a DO between the loop header
  and the DELETE (the TABLE_INVALID_INDEX shape a live app 500ed with), or a
  DELETE naming an ENCLOSING loop's table while an inner one is open (the
  index is then another table's row number). The plain current-row delete is
  legal ABAP - the kernel adjusts the loop cursor for a delete on the loop
  table, and so does @abaplint/runtime (`deleteIndex` decrements every
  registered loop controller) - and the rule's first cut reporting it named a
  reviewed, working samples-controls port (558), which is the corpus doctrine
  firing: measured over the 637-file samples-controls corpus the narrowed
  rule reports 0, while every incident shape from abap-check §5 (app 352's
  DO, filter_itab's inner loop, the clobbering READ TABLE) stays covered by
  fixtures.

- **Four abapGit round-trip rules: `byte-order-mark`, `crlf-line-ending`,
  `trailing-whitespace`, `missing-final-newline`.** The `source-line-too-long`
  precedent again - a consumer whose only gate is `npx abap2ui5lint` must see
  the round-trip family too. abapGit writes every file one specific way (LF
  only, no BOM on `.abap`, no trailing blanks, exactly one terminating
  newline); a file written otherwise comes back DIFFERENT from what the system
  serializes, on every pull, for everyone. All four are **warnings** - per
  abap-check §1 only the 255-character line actually kills the import, the
  rest never stop diffing - and all four carry a mechanical `--fix` (delete
  the BOM, delete every CR, strip the blanks, append the newline). CRLF is
  one finding per file with a fix span per CR; trailing whitespace is one per
  line, like its `source-line-too-long` neighbour. Measured over abap2UI5's
  own `src` (200 .abap files, which gate these themselves): 0 findings.

- **`stats.ruleHits`: per-rule fired counts, before suppression.** The `--json`
  stats gain a `ruleHits` map (rule id -> findings the gate produced), counted
  BEFORE the `rules` block, source directives and any baseline had their say -
  so a fully baselined corpus still shows which rules fired on it, instead of
  that number being an anecdote. Additive key; every count comes from the walk
  the gate already did.

- **Config `extends` and `maxWarnings` (+ `--max-warnings`).** A config can
  name another abap2ui5lint.jsonc/.json as its base: the extending file wins
  per key, the two `rules` blocks merge per rule id, relative paths resolve
  against the file that wrote them, chains follow and a cycle is refused
  loudly. `maxWarnings` (ui5lint's flag as a config key, plus `--max-warnings`)
  fails the run when the warning count exceeds it, whatever `failOn` says -
  the way to fail on errors only while still capping the warning debt.

- **`--format checkstyle` and `--format junit`.** The two XML shapes most CI
  systems ingest natively (Jenkins, GitLab, Azure DevOps test tabs) - thin
  renderers over the same problem walk every other formatter reads, properly
  XML-escaped. checkstyle maps our `hint` to its `info`; junit renders a
  clean file as one passing testcase, so a test tab shows the file was seen.

- **`--stdin`: lint piped source.** The property gate over standard input -
  the editor and pre-commit case - reported under `--stdin-filename <name>`
  (default `<stdin>`), which also decides the handling: a `.view.xml` /
  `.fragment.xml` name (or content starting with `<`) goes down the raw-view
  path, anything else is read as an ABAP class. Exit codes and every
  `--format` behave exactly as for a file. The render gate stays off for a
  pipe, and `--fix`, `--render` and `--screenshot` are refused rather than
  silently ignored.

- **Four existing rules gained a `--fix`.** `escaped-brace-in-backtick`
  deletes the backslashes (a backtick literal has no escape processing, so
  they say nothing); `redundant-conv-i` unwraps the CONV (the rule already
  guarantees it is the entire right-hand side of an assignment into a
  `TYPE i` target declared in this file); `lifecycle-is-initial` rewrites
  `IS NOT INITIAL` on a lifecycle call to the predicative form and
  `IS INITIAL` to `= abap_false` — on a plain `abap_bool` variable only the
  `IS INITIAL` half is rewritten, because `= abap_true` vs `<> abap_false`
  for the NOT form is a choice, not a mechanical rewrite, and that one stays
  a finding; `trailing-empty-event-arg` deletes the trailing empty
  `` ( `` ) `` row (it never arrives, so nothing observable changes), whole
  line included when the row has it to itself, comments never.

- **`--cache`: an opt-in cross-run result cache, eslint-style.** Each file's
  full result (the findings, not just pass/fail - a baselined corpus needs
  the findings again on replay) is stored keyed by its content hash, under one
  context hash over the linter version, the metadata snapshot's ui5Version and
  every resolved setting that changes a verdict (floor, distribution, allow,
  gates, rules block). A hit skips both gates for that file; any relevant
  change is a miss. `--cache-location <file>` names the store (default
  `.abap2ui5lintcache`), `"cache": true` in the config turns it on for a repo,
  and a corrupt or foreign cache file reads as empty rather than as an error.
  `--fix` needs no special handling: it rewrites the file, so the stale entry
  never matches again.

- **`checkFiles` and `screenshotFiles` accept a caller-owned `renderer`.** An
  already-open session from `openRenderer( )` (the `./render` export) is used
  as-is and never closed - the caller owns its lifecycle - so a long-lived
  consumer (mcp-server's `validate_view`) can keep one warm Chromium across
  many calls instead of paying a browser start per call. Absent the option,
  behaviour is exactly the old open/close. A passed renderer's pool size and
  theme were decided at `openRenderer` time.

- **The render gate's page pool is a dial now.** `--render-pages <n>` on the
  CLI, `"render": { "pages": n }` in the config (which also ASKS for the gate,
  the way `"render": true` does), `renderPages` on `checkFiles`. The default
  stays 4, precedence stays CLI flag > config > default, and an unknown key or
  a non-positive count inside the render object fails loudly like every other
  config mistake.

- **`checkNodes` stops rebuilding its constants per document.** The
  known-library set (a key walk over ~1000 snapshot controls) is cached per
  snapshot object, and the built-in-roots set, the framework-attribute set and
  the relative-asset regex moved to module scope. `statementAt` in the
  reconstructor binary-searches the offset-sorted statement list instead of
  scanning it backwards. No verdict changes.

- **`scrub( )` and `blankLiterals( )` share a small bounded memo.** The
  comment scrub used to be recomputed about six times over the same source per
  file (reconstructor, ABAP rules, chain layout, source readers, directives),
  and `blankLiterals`' single-entry memo thrashed whenever two source views
  interleaved - while pinning two whole source copies for the life of the
  process. Both now keep their last four inputs in a recency-refreshing Map,
  so the `ifBranchEnd`/`ifBlockEnd` loops hit deterministically. Signatures
  and outputs are unchanged.

- **`applyRules` compiles a rule's config once per run, not once per finding.**
  Every finding used to recompile its rule's `exclude` regexes and re-spread
  the path-form set; the compiled config is now memoized per (rules object,
  rule id) and the form list is built once per file. No verdict changes - the
  exclude-semantics tests now also pin that one rules object walked over many
  files still decides per file.

## 0.6.1 - 2026-08-30

- **A bound control in a FOREIGN namespace makes its children rows again.**
  The property walk declines to look into a non-`sap.` namespace - abap2UI5's
  own `z2ui5.cc` controls, raw XHTML, any in-house library - because the UI5
  metadata can say nothing about it. It handed the children `null` for both
  owner and context, and "no aggregation here" quietly became "no ROW here":

      <z2ui5:CameraSelector items="{path:'/DEVICES'}">
        <core:Item key="{KEY}" text="{TEXT}"/>

  is the ordinary bound-template form, and `relative-binding-without-context`
  reported both attributes as resolving against nothing (abap2UI5/samples app
  306). Every one of these controls extends a real one - `CameraSelector`
  extends `sap.m.ComboBox` and inherits its `items` - so this fires on any
  bound custom control, as an **error**.

  The owner handed across stays opaque in every other respect (`control:
  null`, empty `aggRows`), so nothing guesses at an aggregation, which is what
  the foreign-namespace rule is actually protecting. Any binding on the tag
  counts, not only one that looks like an aggregation: on a control the
  metadata does not carry the two are indistinguishable, and being wrong is
  asymmetric - reading a property binding as a context only makes the two
  "is there a context here" rules go quiet on that subtree, while reading a
  real aggregation binding as none invents a defect.

  A foreign tag with no binding still opens no context, and its children are
  judged exactly as before; the regression test asserts both directions.
  Measured: no change over abap2UI5/samples-controls (752 findings before and
  after), which is the corpus with no custom controls in it.

## 0.6.0 - 2026-08-30

- **`WITH DEFAULT KEY` parses, and the rules that resolve against a row see
  something again.** A table declaration is anchored on its terminating dot,
  and only `WITH EMPTY KEY` was allowed in front of it — so `DATA t TYPE
  STANDARD TABLE OF ty WITH DEFAULT KEY`, the commonest spelling in ABAP, fell
  through to the scalar branch: the model carried `''` where a row array
  belongs, and every rule resolving against a ROW went quiet on it. `SORTED`
  and `HASHED` tables were not recognized as tables at all. This outranks any
  single rule below, because it decides whether those rules see anything.

- **17 new rules, mined from what was already written down.** The frontend's
  own declarations are read in full now rather than in projections:
  `control-call-arg-count` and `control-call-arg-kind` (arity *and* argument
  kinds, from the whole method map), `frontend-action-too-new` — a global
  target resolved through a lazy require is silent below its release, and
  `member-too-new` judged what the view writes while nothing judged what the
  class sends — and `invalid-aggregation-item`, where an
  `<id>/<aggregation>/<index>` reference was judged on its head segment only.
  From `z2ui5_if_client`'s own ABAP Doc and the app guide:
  `obsolete-bind-argument` (fixable), `lifecycle-is-initial`,
  `redundant-init-display`, `private-app-attribute`,
  `escape-sequence-in-backtick`, `abap-date-formatter-mismatch`. The
  activation traps `abap-check` had filed as open follow the
  `source-line-too-long` precedent: `value-header-default-reassigned`,
  `into-corresponding-inline-decl`, `class-constructor-visibility`,
  `redundant-conv-i`. A metadata harvest (`defaultValue`, `setterMin`,
  `widensAggregation`) unblocks `validating-setter-out-of-range` and
  `absent-boolean-overrides-default` — the bound is harvested rather than the
  bare fact that a setter throws, because 23 properties throw somewhere and
  for most of them the initial 0 is legal. Measured: **11 new findings over
  637 ports, all real**. `statement-too-long` was written, measured and
  deleted: a builder chain is one statement by construction, and the corpus
  median over-limit statement was 23,000 characters across 156 ports that all
  import fine — length is not the discriminator.

- **`properties: false` no longer takes the ABAP rules with it, and
  `commercial-ui5-host` judges a runtime load.** Two consumer-facing defects
  that a configuration reported rather than a finding: switching the property
  gate off silently removed the chain family and every ABAP-side rule as well,
  and the host rule counted a demo-kit hyperlink and a `/test-resources/`
  image as commercial dependencies.

- **A chained `DATA:` declaration is read past its first name.**
  `unused-public-attribute` and `private-app-attribute` collect the names of
  one SECTION, and their block regex ended on `…|$)` under `/m` — where `$`
  matches at the end of every LINE, so the lazy body always stopped at the
  first newline. Given

      PRIVATE SECTION.
        DATA: mv_alpha TYPE string,
              mv_beta  TYPE abap_bool,
              mv_gamma TYPE i.

  only `mv_alpha` was ever collected. Both rules were silent about the rest,
  and `private-app-attribute` is the one whose entire value is that the missed
  attribute otherwise answers `ASSERTION_FAILED` with nothing naming it. The
  same chain written as three separate `DATA` statements was reported
  correctly, which is why it read as covered.

  `instanceAttributes` — the third collector, which reads the whole class
  definition — has no `$` alternative and was never affected; that asymmetry is
  what isolated it. The two section-scoped collectors now share one helper that
  terminates on end of INPUT, stops the comma split at the statement's `.`, and
  walks each name's offset instead of searching for it (`indexOf(name, …)`
  resolved a later `mv_a` to an earlier `mv_alpha`, so a finding could point at
  the wrong line).

- **The CELL binding reconstructs.** `client->_bind( val = mt_emp[ 1 ]-picture
  tab = mt_emp tab_index = 1 )` binds one ROW of an internal table
  (`{/MT_EMP/0/PICTURE}`, ABAP counting rows from 1 and the client path from
  0). `bindingOf` refused every call carrying `tab`/`tab_index` and the whole
  expression came back unresolved — which takes the **attribute** out of the
  reconstructed view, so the property gate, the render gate and every
  consumer's structural diff stopped seeing that property at all. Exactly the
  blindness the `omit_initial_paths`/`json` gap caused, on the one `_bind`
  parameter pair whose path *is* computable.

  Both spellings resolve: the table expression `tab[ n ]-comp` and the
  ASSIGNED row `<emp>-comp`, which is what a class writes when it is
  downported (abaplint lowers the component-level table expression to a
  work-area copy, and the framework's reference match then refuses the cell).
  In both, the table and the row come from `tab`/`tab_index` — the arguments
  the framework resolves the row from — and `val` contributes the component.

  The table-expression form is reconstructed only when the three parts agree — `val` reads the table `tab`
  names, and the row number is a literal equal to `tab_index`. They cannot
  disagree in a call that works (the framework matches the cell by data
  reference and refuses a `val` outside the addressed row), so a disagreement
  means the call is broken and a path derived from it would be a guess
  reported as fact. A variable row number, a re-rooted model
  (`switch_default_model`) and a custom mapper stay unresolved as before.
- **`event-arg-out-of-range` and `event-arg-unresolved` read abap2UI5's `arg`
  shorthand.** `client->_event( arg = x )` is the one-value spelling of
  `t_arg` — the framework folds it into the same `string_table`, appending it
  behind any `t_arg` rows — but both rules built their argument list from the
  `t_arg = VALUE #( )` region alone. So every wire written that way looked
  like it sent nothing: `get_event_arg( 1 )` in its handler was reported as a
  read past the end, and a bare `{COL}` carried by `arg` was not checked at
  all. Measured on abap2UI5/samples-controls the day the corpus adopted the
  shorthand: **187 errors in 125 of 637 files, every one a false positive** —
  on the rule whose entire value is that a report means the read really does
  come back empty. Both spellings now count, including a non-literal
  `arg = lv_key`, which is one argument of a value the pass cannot know.

  Reading past what an event actually sends is still reported, and an event
  that genuinely sends nothing is unaffected — asserted both ways.

- **`rules[id].exclude` works on Windows.** The pattern is a path regex and
  both spellings the README gives are written with `/`, but the file was also
  matched in the forms `path.resolve` and `path.relative` return — which on
  Windows carry `\`. So `"^src/00/98/"` matched none of the three forms and the
  config silently waived **nothing**: the run that looked stricter was the
  broken one, the same failure mode as [#35], now on the other axis. Every form
  is matched with forward slashes as well.

  Found by the `windows-latest` leg added in [#67], and asserted on every
  platform: the suite now spells a `\`-separated path by hand, so the
  regression is reproducible on Linux rather than visible on one leg only.

- **`data/properties.json` no longer depends on readdir order.** The walk that
  builds the snapshot took `readdirSync` order as given, and that is a property
  of the *filesystem*: ext4 hands back `Dialog.js` before `delegate/`, NTFS
  sorts case-insensitively and hands back `delegate/` first. So Windows
  generated the same 973 controls with the same values in another sequence and
  the drift gate called the snapshot stale — on a tree byte-identical to the
  green ubuntu one. The walk sorts now, in the code-unit order the committed
  file already has, so no regeneration and no 473 KB of churn.

- **The drift gate says what drifted.** "Stale" is enough when you just edited
  the generator and useless on a machine you cannot reach — it is what left the
  cause above unknown for seven red runs. It now names the controls or enums
  added, lost or changed, and, when both sides carry the same keys with the same
  values, says that only their *order* differs. That is what identified the
  walk-order cause on the first Windows run after it shipped.

- **Three rules read the configuration instead of answering the same way
  everywhere.** `sapui5-only-control` fired only under `--distribution
  openui5`, so a default run said nothing at all about a SmartTable — and the
  repository that never thought about the distribution is exactly the one the
  surprise is waiting for. `distribution` is unset by default now and the rule
  has three answers: `openui5` is the error it always was, `sapui5` reports
  nothing, and unset is a hint naming the key to write (advisory under the
  default `failOn: warning`, so nobody's build turns red for it). The context
  line says `distribution unset` rather than claiming one nobody configured.
  `frozen-view-builder` drops from error to **warning** and leads with
  DEPRECATED: nothing about such a view gets checked, but that is a fact about
  the gate rather than about the app, which compiles and renders today — what
  is actually wrong is that `z2ui5_cl_xml_view` is retired into the frozen
  `src/99`. And one new rule, `literal-view-slot` (hint, fixable): a slot
  written as a literal travels to the browser as an object key, so a typo or a
  rename dispatches to no view, silently, while the `cs_view-` constant cannot
  fail that way because the compiler resolves the name. `--fix` substitutes
  the constant.

- **Three escapes that stopped one character short.** The markdown cell
  escaped `|` but not the backslash in front of it, so a message containing an
  escaped pipe opened a column of its own in a PR comment; a control name went
  into a `RegExp` with only its dots escaped; and the compiled-theme cache was
  `/tmp/abap2ui5-theme-css`, one path shared by every account on the machine —
  per user and `0700` now. Found with CodeQL's `security-extended`, which the
  pack `ci.yml` runs by default does not include.

- **`elementBoundSlots` can be imported from a browser build.** It decides
  `boundElement`, which suppresses the "this path has no context" findings for
  a `cs_event-bind_element` wire — but it was exported only from
  `lib/index.mjs`, and that module loads the renderer (`http`, `os`, `module`)
  at import time, which esbuild cannot resolve for `platform: browser`. A
  consumer assembling the pipeline itself was therefore *stricter* than the
  CLI, reporting `relative-binding-without-context` on a path the linter
  accepts — measured on a fixture, not assumed. It lives in
  `lib/abap-source.mjs` now and is re-exported from `./abap-rules`; a test
  asserts that neither path reaches the renderer.

- **`./icons` is a subpath export, and the typings say what the runtime
  takes.** `checkIcons` sat in a module the exports map does not name, and
  `exports` blocks a deep import — so a consumer that cannot hand over a
  snapshot path (a browser host has no filesystem) had icon rules on its ABAP
  path and none on its XML path: the same file judged differently by the
  editor and by CI, which is the divergence that gate exists to close. The
  typings had drifted the same way, in the direction that hurts — an option
  the runtime reads and `types.d.ts` omits cannot be passed from TypeScript
  without a cast, so a consumer silently does not pass it and the rules behind
  it never fire. They are declared now, measured against the runtime rather
  than guessed.

[#35]: https://github.com/abap2UI5/linter/issues/35
[#67]: https://github.com/abap2UI5/linter/pull/67

## 0.5.1 - 2026-08-27

- **`backToPage` joins the id-argument mirror.** abap2UI5 gave it the `pageId`
  kind ([#2670]) after measuring that an unprefixed page id is a **silent
  no-op**, so `check-upstream` re-derived the list and `CONTROL_METHOD_ID_ARG`
  was one entry short — turning a consumer's `check:mirrors` red on correct
  new code, which is the failure mode that gate exists to make loud.

  Worth keeping apart from `to`, and the comment now says so: `backToPage`
  **does** normalise a Control (`NavContainer.js:1065`, the same guard `to`
  has), so the kind is not there to rescue a Control. It is there because the
  id is matched against `_pageStack`, whose every entry was pushed as
  `page.getId()`, so `_findClosestPreviousPageInfo` compares with `===`
  (`NavContainer.js:1203`) and an unprefixed literal matches nothing, logs,
  and returns without navigating.

  Patch rather than minor: measured on samples-controls before shipping —
  **0** findings added, 60 advisory unchanged, so no consumer's verdict moves.

## 0.5.0 - 2026-08-27

- **The `pageId` argument kind, so the mirror stops calling `to` stale.**
  abap2UI5 moved `CONTROL_METHODS.to` from the `controlId` kind to a new
  `pageId` kind, because `sap.f.FlexibleColumnLayout.to` and
  `sap.m.SplitContainer.to` probe their columns with
  `aPages[i].getId() == pageId` — a comparison a Control can never win, so
  every probe missed and the trailing `else` navigated the last column.

  `check-upstream` derived the id-argument list from the `controlId` /
  `anchor` / `controlIdOrNull` kinds only, so the new kind read as *`to` is
  gone upstream* and failed the consumer's `check:mirrors`. But `pageId`
  still resolves a control id — `resolveControl( )` first, `.getId( )` after
  — so what an app writes on the ABAP side is unchanged and still has to
  exist in the view. The kind records a fact about the **container**, not
  about the argument this list checks, so `to` belongs in
  `CONTROL_METHOD_ID_ARG` exactly as before and the derivation now admits
  `pageId`. Without this, abap2UI5 cannot merge the fix that introduced the
  kind: its mirror gate is red until a linter that knows about it ships.

- **`date-type-without-source` reads the QUOTED key spelling.** A binding-info
  may be written `{ 'type': 'sap.ui.model.type.Date' }` as legitimately as with
  bare keys, and samples-controls apps 017/018 write all eight of their date
  bindings that way. The matcher required a bare `type:`, so it stopped at the
  first test and never judged them — blind, not wrong.

  The fix has to move **both** halves together, which is the whole point: the
  source test required a bare `source:` too, so teaching the rule the quoted
  `'type'` alone would have turned those eight correct bindings into findings,
  because their `'source'` is quoted as well. Value quotes may now be single or
  double for the same reason. Corpus after the change: 0 findings, total
  unchanged at 747 — the eight are now read and correctly cleared by their own
  source pattern, rather than skipped because the rule could not see them.

- **`control-state-lost-on-rebuild` (hint) — the inverse of
  `settable-property-via-action`, and exactly its blind spot.** That rule
  fires when a `CONTROL_BY_ID` `set…( )` names a **bindable property** and
  says *bind it instead*; it is deliberately silent for the three shapes where
  that answer does not exist — an **association** (`setNextStep`,
  `setSelectedSection`, `setActivePage`, `setCurrentStep`), a
  **function-typed property** (`sap.m.MessagePopover.asyncURLHandler`), and a
  method that is **no member at all** (`setBadgeMinValue`: `sap.m.Button`
  declares `badgeStyle` as its only badge property and keeps the bounds in the
  private fields `Button.init` resets to 1/9999).

  Those three are live control state, and abap2UI5 does not patch a view.
  `view_display( )` hands new XML to the VIEW_SLOTS action, whose `displayMain`
  destroys the MAIN slot — POPUP and POPOVER with it — and builds a fresh tree
  with `XMLView.create`; every control in it is a NEW object carrying what the
  XML declares and nothing else. A bound property survives that because the
  binding re-applies. This state does not. So a class that sets it from an
  event handler and never re-issues it from the display path loses it on the
  next rebuild — a restored draft, a called app handing control back, any later
  `view_display( )` — while the ABAP field describing it survives as class
  state, and the app then claims a state it does not show.

  Statement order in ABAP is irrelevant to this, which is why the rule reads
  METHODS rather than lines: `View1._processAfterRendering` awaits the whole
  T_SYSTEM phase (the displays) before it runs T_CUSTOM (`follow_up_action`),
  so a follow-up always lands *after* the rebuild of its own roundtrip — and is
  gone at the next one.

  Three conditions keep it quiet, each measured on the 637-file corpus before
  it shipped:

  - **The value has to be non-literal.** A constant carries no class state, so
    there is nothing for the rebuilt view to contradict — app 101's
    `setCurrentStep( 'ProductInfoStep' )` is a one-shot corrective jump and
    app 263's `setSelectedSection( '' )` a reset to null, and re-issuing
    either on every rebuild would BE the defect. Without this the rule reported
    both.
  - **Being on the display path is transitive.** App 534 ends `view_display( )`
    on `path_apply( )` and keeps the setters there, so the enclosing method is
    followed a few levels up; the same walk `missing-view-display-on-navigated`
    already uses. A wire is silent too when any method on that path issues the
    same **id + setter** — app 249's remedy, where `view_display( )` re-sends
    both badge bounds from the accepted values it kept.
  - **A control the snapshot cannot resolve falls back to a GLOBAL answer**
    ("is this a bindable property on *any* control?"), never to a guess — so a
    runtime id (`( step )` inside app 534's loop) is still judged, and a
    companion or custom-namespace control is not.

  Measured, pre-fix (`samples-controls` at `823e6dc`): **10 findings**, and it
  names every one of the four defects that repo fixed by hand this week, each
  at its own line — 249 `setBadgeMinValue`/`setBadgeMaxValue`, 534
  `setNextStep` in `path_apply( )`, 535 and 560 `setNextStep` on both wizard
  branch points. On the branch tip the 249 and 534 sites are silent and
  **7 remain**, all real residuals of the same class: 012's two Carousels
  (`first_item` survives, the rebuilt Carousels are back at page 0), 535/560's
  four `setNextStep` wires (the fix moved the branch *earlier*, it did not make
  it survive — `billing_validated` is bound and survives, so the rebuilt
  BillingStep shows a Next button with no branch at all) and 588's
  `setSelectedSection`. A **hint** for the same reason its sibling is one: the
  wire is not broken, it is incomplete, and only the app knows whether the
  state still matters once the screen has been rebuilt.

  Out of scope on purpose: `binding_call` filters and sorters and the
  `NavContainer.to( )` / `goToStep( )` family lose their state to the same
  rebuild, but they are not `set…( )` calls and their transient half
  (`focus`, `open`, `close`) has nothing to restore — reporting them would put
  the rule's precision where its evidence is not.

### Added

- **`picker-value-without-format`** — a date/time picker (`sap.m.DatePicker`,
  `DateTimePicker`, `TimePicker`, `DateRangeSelection`, `TimePickerSliders`, …)
  that binds `value` with neither a binding **type** nor a `valueFormat`. The
  control then formats the string it writes BACK through the two-way binding
  from the browser LOCALE, and `client->_bind( )`'s write-back is a bare ABAP
  assignment, so that string lands in the field. Measured on OpenUI5 (en-US,
  seed `"2018-07-09T09:00:00"`): a `DateTimePicker` still READS the ISO string
  but writes back `"Jul 12, 2018, 2:30:00 PM"`; a `DatePicker` does not read it
  at all and writes back `"7/12/18"`. In de-DE the field returns as
  `"04.03.2025, 10:15:00"`, which `new Date( )` parses month-first — an
  appointment picked for 4 March is drawn on 3 April, silently.

  The picker family is derived from the metadata (a control declaring both
  `value` and `valueFormat`), so a subclass is covered without a name list. A
  **warning**, and deliberately narrow: a typed binding is exempt (the type
  owns the pattern), a declared `valueFormat` is exempt, and the class must
  itself be an AUTHOR of the field — a field only the picker ever writes is
  self-consistent whatever the locale does, and one the class writes as
  digit-free text (`N/A`) is not a date. That last gate needs a new view of
  the class: `prepareAbap` now also returns `rootWrites`, what the ABAP writes
  into each root attribute, which the seeded `model` cannot stand in for.

  On the samples-controls corpus it reports 16 bindings across ports 547, 548,
  549, 555 and 609 at the pre-fix revision and **zero** once those declare an
  ISO `valueFormat`; the four untyped, format-less pickers that remain (ports
  101, 533, 535, 560, bound to `N/A`/never-written fields) are silent, as are
  all 20 typed bindings and the 18 pickers that bind no `value` at all.

- **`relative-binding-without-context` reads every shape a property binding
  takes, and `cs_event-bind_element` is scoped to the ONE slot it names.**
  `samples-controls` app 592 shipped **42 dead address bindings across 21
  sections** past a green gate. The shape was `text="{STREET} {HOUSENUMBER}"`
  — a COMPOSITE binding at the view root, no element binding anywhere, over
  root fields the class declares correctly — and the rule was silent, because
  `relativePath( )` is anchored `^{NAME}$`. So were the complex form
  (`{ path: 'PRICE', type: … }`, which only the AGGREGATION branch had ever
  matched) and the expression form (`{= ${STATUS} ? … }`). All four resolve a
  slashless path against a context that does not exist and render blank.

  A fourth hole sat between two rules: a relative name the model root does not
  have was "left to `unknown-binding-path`", whose relative arm needs a `ctx`
  that cannot exist here by construction. It is reported now, under a stricter
  gate — the verdict never depended on the NAME (a slashless path with no
  context resolves against nothing whatever it says), only the confidence that
  there is no context does.

  Widening the rule meant teaching it the contexts it could not see first, and
  the 637-file corpus named two — untaught, the widened rule reported **70**
  relative bindings across 11 correct ports:

  - **`binding="{/SUPPLIERS/0}"` IS a context.** Not a control property but a
    ManagedObject special setting handed to `bindObject( )` — the DECLARATIVE
    form of the `cs_event-bind_element` wire, and the form the corpus writes
    far more often. The context it opens is deliberately opaque: a row is set
    here, and the gate does not claim to know its fields.
  - **A per-row template aggregation is not only `template`.**
    `rowActionTemplate` and `rowSettingsTemplate` (and `creationTemplate`) are
    cloned per row by the same mechanism and take their context from the
    parent's own rows binding in a sibling aggregation this walk never
    descends into.

  And `cs_event-bind_element` was computed **per CLASS** from the source text,
  so one popup wire disarmed `relative-aggregation-without-context` for every
  document of that class — the main slot included, which was never
  element-bound. The wire's `view` parameter names the slot it binds (default
  `cs_view-main`; the constant NAMES are not their values — `cs_view-nested`
  is `NEST`), and a document knows the slot it lands in from its own display
  call. A wire whose slot is not a literal still suppresses everywhere: a
  wrong second guess is worse than silence.

  **0 findings added and 0 removed** across the 637-file `samples-controls`
  corpus, `view-gates` still 622 ports / 0 failing — and proven to see what it
  is for: the pre-fix app 592 reports its four distinct dead bindings, where
  v0.4.1 reports none of them.

- **`enum-field-unset-on-insert` reads the two construction sites it was blind
  to, and the aggregation it could not resolve.** A corpus sweep over
  `abap2UI5/samples-controls` found **ten** rows of this exact class by hand,
  across seven ports, that the rule reported none of. Four things were wrong,
  and each one alone was enough to hide a defect:

  - Only `INSERT`/`APPEND` of an inline `VALUE #( … )` was judged. The
    **dominant** seeding form in the corpus is `t = VALUE #( ( … ) ( … ) )` in
    `model_init` — including a table nested inside a row (`groups = VALUE #(
    ( elements = VALUE #( … ) ) )`) — and it was never scanned. A row assembled
    in a **work area** (`DATA(x) = VALUE ty_s( … ). … INSERT x INTO TABLE t.`)
    was out of scope by construction; two ports use exactly that.
  - A table only entered the field map when its aggregation binding was an
    **absolute** `/PATH`. Every nested aggregation (`{path: 'T_APPOINTMENTS'}`,
    `{path: 'GROUPS'}`) was dropped, so `INSERT … INTO TABLE
    <row>-t_appointments` resolved to a key that did not exist.
  - The fields under one bound aggregation were **pooled**, not keyed per
    aggregation. A PlanningCalendar binds `rows`, `specialDates` and a nested
    `appointments` at once, and pooling handed `specialDates` an `ariaHasPopup`
    from two levels down — a false positive the moment the seeds were read.
  - `sap.ui.core.aria.HasPopup` was **missing from the snapshot entirely**, and
    with it fifteen more enums, so `ariaHasPopup` had no type any rule could
    judge. That gap alone hid six of the ten findings.

  With the four fixed the rule reports all ten (and every one of the eleven
  seed sites individually, checked by removing each repair on its own), and
  still reports **zero** on the corpus with them fixed.

- **The metadata generator reads DOTTED enum names.** `parseLibraryEnums`
  matched `thisLib.<Name> = {` only, while a library groups part of its enums
  under a sub-namespace (`thisLib.aria.HasPopup = { … }`,
  `thisLib.dnd.DropPosition`, `thisLib.cards.SemanticRole`). UI5 registers those
  through `DataType.registerEnum` exactly like the flat ones and
  `validateProperty` is every bit as strict about them. The snapshot goes from
  **219 to 235 enums**; nothing was removed and no control entry changed.

- **Four false-positive guards, each a real port that reported clean before.**
  A component set once *before* the rows of a `VALUE` table is ABAP's per-table
  default and every row carries it (app 407). A comprehension row
  (`FOR row IN t_all … ( row )`) copies a whole structure and has no field list
  to read (app 505). A field the class fills **afterwards** — `LOOP … r->state
  = …`, or `t[ i ]-type = …` — is not missing, which is how a dozen ports move
  an original's frontend formatter server-side. And a **mixed-case** binding
  path is not an ABAP component name at all: `type="{Text}"` is the demo kit's
  own quirk, ported verbatim, and it resolves to nothing so UI5 keeps the
  default.


## 0.4.1 - 2026-08-25

- **`relative-aggregation-without-context` no longer fires on an element-bound
  slot.** A class that issues `cs_event-bind_element` sets a binding **context
  on a whole view slot at runtime**, so every relative path under it resolves
  against a row the document never names — which is the entire point of that
  idiom and invisible to a static walk over the document. `abap2UI5/samples`
  app 470 is the sample that *teaches* it: a popup element-bound to the pressed
  product row, whose component list binds `{T_ITEM}` relatively and correctly.
  0.4.0 called it broken. Which slot was bound is a second question, and a
  wrong second guess is worse than silence, so any `cs_event-bind_element` in
  the class silences the rule.

  Found the way it should be: the corpus bump workflow ran the new linter over
  `samples` before opening its PR, so the false positive failed the bump
  instead of landing on main.

## 0.4.0 - 2026-08-25

- **Four rules from re-reading a whole corpus against its originals.** Every
  one is a defect `abap2UI5/samples-controls` was carrying where no gate could
  see it, found by reading the 173 machine-generated ports against the archived
  demo-kit samples they came from.

  - `filter-groups-not-arrays` — a compound `binding_call` `filter` payload
    written as an array of **objects**. `buildFilterGroups` keeps only
    `Array.isArray(g) && g.length`, so the whole list empties and the binding is
    **cleared**, not filtered. Nothing logs it.
  - `event-arg-js-callback` — a JS callback in a `t_arg`. UI5's
    `ExpressionParser` has no `function` keyword and reads `{` as an object
    literal, so the **entire** handler fails to parse: not one bad argument, but
    every argument of that event, and the event never reaches the backend.
  - `enum-field-unset-on-insert` — a row built by `INSERT`/`APPEND VALUE #( … )`
    without a field the view binds to an **enum** property. A JS original omits
    the key and UI5 falls back to the default; ABAP has no absent field, so it
    ships as `""`, `validateProperty` throws inside a binding update, and
    `ManagedObjectBindingSupport` re-throws — the view dies. It fired once on
    637 files and that one hit was real, in a port eleven readers had passed.
  - `relative-aggregation-without-context` — a **root-level** aggregation bound
    with a relative path. `Model.resolve` returns `undefined`, `bindList` never
    resolves, and the aggregation renders empty with no error. It fell between
    `hardcoded-binding-path` (only matches paths starting with `/`) and
    `relative-binding-without-context` (deliberately skips aggregations).

- **Two version checks were looking at the wrong thing.** `member-too-new` now
  falls back to the **declaring class's** `@since` when a member carries none of
  its own — a member cannot predate the class that declares it, and
  `cards.BaseHeader` is @1.86 while its `press` has no own tag, so `press` was
  silently treated as ancient on a 1.71 floor. And an attribute whose value is a
  `COND #( )` / `SWITCH #( )` is recorded in `node.unresolvedAttrs` rather than
  invented, which made it invisible to every version rule; those attributes are
  now version-judged by name, which is all a `@since` check needs.

- **One rule was built and dropped rather than shipped.** A
  `bound-aggregation-over-size-limit` (a bound aggregation seeded past the
  JSONModel's 100-entry cap) worked exactly as specified and produced **101
  findings on 637 files, about one of them worth having** — almost all the
  123-row shared product mock, in ports whose *original* also caps at 100 and
  which are therefore faithful. Separating those needs knowledge of the
  original's own limit, which nothing in the source, the view or the sidecar
  records. The reasoning is written up in abap2UI5's backlog rather than lost.

- **`relative-asset-url`** — a document-relative asset URL in a view, which an
  abap2UI5 app has no root to resolve against. Merged after 0.3.0 was cut and
  therefore unpublished until now.

## 0.3.0 - 2026-08-23

- **The companion-control mirrors are a knowledge file now, and gated.** The
  render harness has to KNOW a control class before it can create a view that
  names one, so it booted metadata-only mirrors of the two bundled abap2UI5
  companion controls a view can name declaratively — written inline in
  `lib/render.mjs`, and the one mirror `check-upstream` did not compare. It
  rotted exactly the way the others did before they were gated: abap2UI5 added
  `TokenKeyCell` / `TokenTextCells` to `MultiInputExt` (the suggestion-row half
  of `MultiInput.addValidator`) and every view using them failed view
  **CREATION** here — which is worse than a property finding, because a
  downstream deviation can carry a property finding and cannot carry a dead
  document. The mirrors move to `lib/cc-controls.mjs`, the harness script is
  **generated** from that one source, and `check-upstream` compares each
  control's property names against `app/webapp/cc/<Name>.js` — in both
  directions, plus the case where the control is gone upstream and the mirror
  has no source any more.

- **`lib/released-api.mjs` follows upstream's interface move.** abap2UI5 put
  every type on the object that USES it — `ty_s_get`, `ty_s_event_control` and
  `cs_device` onto `z2ui5_if_client`, the three HTTP-config types onto
  `z2ui5_if_ui5_exit` — and retired the shared `z2ui5_if_types` into `src/99`
  together with `z2ui5_if_exit`, the exit interface's superseded name. The
  mirror still said the old thing, in both damaging directions at once:
  `z2ui5_if_ui5_exit` was reported as not released (correct code, flagged), and
  the two retired interfaces passed as released (an app naming them told
  nothing). They ship, so naming one compiles — which is exactly why it has to
  be reported, with the object the types moved to. Measured on
  `abap2UI5/samples-controls` app 252, which named `z2ui5_if_types=>cs_device`:
  the transpiled backend answered HTTP 500 because the retired interface's
  constants are not materialised there, and the corpus found it in an e2e
  sweep. The rule reports it statically now. The corpus is otherwise unchanged
  by the fix: 622 ports, 0 failing, before and after.

- **`scripts/check-upstream.mjs` is published.** The three hand-maintained
  mirrors in `lib/` — `formatters.mjs`, `frontend-actions.mjs`,
  `released-api.mjs` — are compared against abap2UI5 weekly *here*, which is the
  wrong end of that contract: the pull request that renames a formatter or
  splits an action module is in the other repository, green, and nothing tells
  it. Nothing was broken by that yet only because the drift always surfaced
  within the week; the mirror check had already been broken once by an upstream
  refactor it could not see coming. Shipping the script lets abap2UI5 run the
  same comparison against its own working tree, on the change that moves the
  source — `--local`, the mode it already had. No second implementation, and
  nothing about the script's behaviour changes for this repository.

  Consumers can call it as
  `node node_modules/@abap2ui5/linter/scripts/check-upstream.mjs --local <dir>`;
  it exits 0 in sync, 1 on drift and 2 when the sources cannot be read, so a
  caller can treat unreachable sources as a skip rather than a failure.

## 0.2.2 - 2026-08-18

- **The render-runtime peer range forbade the pairing both READMEs prescribe.**
  `peerDependencies` still said `^0.1.0` while the workspace had been released
  as 0.2.1 three times — and an out-of-range **optional** peer is not a quiet
  `npm ls` note, it is an `ERESOLVE` refusal, so
  `npm i @abap2ui5/linter@0.2.1 @abap2ui5/render-runtime@0.2.1` failed outright
  and the stale 0.1 line was the only one npm would accept. It now reads
  `^0.1.0 || ^0.2.0`: both published lines carry the same `@openui5` pins
  (1.151.0, the version `data/properties.json` was generated from), so both
  genuinely run the render gate, and every consumer keeps installing — narrowing
  to the newest line alone would have broken the three repos sitting on 0.1.1
  for no compatibility reason. `npm test` now gates the range against the
  workspace's own version, since `npm version --workspaces` moves versions and
  no dependency range, which is exactly how this rotted unnoticed.

- **`./rule-docs` is a public export.** The paragraph behind a rule id — what
  the defect is and what the fix looks like, the text the
  [rules page](https://abap2ui5.github.io/linter/) is generated from — was
  reachable only by a reader with a browser. A consumer that hands findings to
  someone who has none (mcp-server's `validate_view`, talking to an agent) can now
  read `RULE_DOCS` through the exports map instead of citing a URL.

- **Preview data, so a list stops photographing empty.** The model behind a
  screenshot is derived from what the class seeds *literally* — that is all a
  static reconstruction can know — so a table filled by a `SELECT` renders as
  *No data*, which is most real apps. A `<class>.mock.json` next to the source
  is now used as preview data, by convention and without a flag, and
  `--screenshot-model <file.json>` says it explicitly. It is **merged over**
  the derived model rather than replacing it: the derived one knows every field
  of every declared structure, which is what makes the remaining bindings
  resolve, so a two-line mock file can fill one table without restating the
  class's whole model. A mock file that does not parse is reported next to the
  picture it did not fill — silently going back to an empty table is the one
  failure nobody would investigate.

- **`--screenshot-size` takes a list.** `--screenshot-size 390x844,1280x900`
  renders both in ONE browser session and writes them side by side, viewport in
  the file name. The launch and the UI5 boot cost more than every render put
  together, so a device matrix is barely more expensive than a single picture —
  and responsive layout is precisely what nobody has in their head.

- **The Action can photograph what it checked.** `screenshots: build/screenshots`
  (with `screenshot-size` and `screenshot-theme` beside it) renders every
  checked view into a directory for the workflow to upload as an artifact or
  post on the pull request — the review artefact CI could not produce before,
  because seeing an abap2UI5 view needed a system. It runs whether the check
  passed or failed, since the run that failed is the one where a reviewer most
  wants to look at the view, and a view that cannot be photographed is a
  warning rather than a second reason to fail the job.

- **`--screenshot`: see the view, without a system.** An abap2UI5 view exists
  at runtime and nowhere else, so looking at one has meant activating the class
  on a system and launching the app. The render gate has been loading these
  views in a real browser all along — it just threw each one away the moment it
  knew the view survived creation. Now it can keep it:

      abap2ui5lint zcl_my_app.clas.abap --screenshot app.png

  The view is reconstructed from the builder calls, seeded with the model
  derived from the class's own `TYPES`/`DATA`, rendered against the local
  OpenUI5 runtime and written as a PNG — the same reconstruction the gate
  clears, in the theme (`--screenshot-theme`) and viewport (`--screenshot-size`,
  e.g. `390x844`) you name. It is a mode: nothing else runs, and stdout carries
  the written paths and nothing else, so an editor or a workflow can read them
  straight. Render errors do not suppress the picture — a view with one broken
  binding still comes up, and the half that rendered is the part worth seeing.

  Two things had to be true for a picture to be worth taking. The themes ship
  as `.less` in the `@openui5` sources and never as the `library.css` a browser
  asks for, so unstyled UI5 was all the gate had ever rendered; a screenshot
  session compiles the theme the way the UI5 build does (`less-openui5`, now in
  the render runtime), on demand and cached per runtime version and theme. And
  a `sap.m.Page` lays its content out absolutely against the height of its
  container, so in the gate's container — which never needed one — the picture
  came back as a header over an empty area, with the whole view present in the
  DOM and every check passing. Both are fixed where they belong, in the
  harness, which now also mirrors the body abap2UI5 itself serves
  (`sapUiBody sapUiSizeCompact`) so the content density in the picture is the
  content density on the system.

  The gate is untouched by all of it: it asks for no stylesheet, compiles
  nothing, and `less-openui5` is deliberately outside `RENDER_DEPS` so a
  missing theme compiler can never stop a check from running. `screenshotFiles`
  is the library form, returning buffers rather than writing files.

## 0.2.1 - 2026-08-16

The theme of this release is **the lifecycle rules seeing the code that is
there**. 0.2.0 was about findings that were not true; these three are about
code the rules could not read at all — a handle with another name, a branch
that does not exist, and an expression mistaken for a statement.

- **`COND`'s `ELSE` is not the `IF`'s `ELSE`.** `ifBranchEnd` scanned for the
  WORD `ELSE` to find where a lifecycle branch stops, and

      status = COND #( WHEN i MOD 2 = 0 THEN `open` ELSE `closed` ).

  puts one at IF-depth 0, so the branch ended there — four statements before
  the `view_display( )` it actually contains, which was then reported as a
  branch that never re-displays. Found on a real documentation page, not by
  reading. A false positive on idiomatic modern ABAP is the worst kind: it
  costs more than a suppression, it pushes people away from `COND` to satisfy
  a rule about something else. The scanner tracks parenthesis depth now, so
  inside an unclosed `(` nothing is a statement keyword. Two tests, both
  directions — the second (a `COND` must not HIDE a branch that genuinely
  never displays) is the one that matters, because a fix that blinds the
  scanner passes the first alone.

- **The lifecycle rules find a client handle that is not called `client`.**
  `missing-on-navigated-branch`, `missing-view-display-on-navigated` and
  `separate-lifecycle-ifs` all matched the receiver literally as `client->`.
  A class that names the handle differently was not judged leniently, it was
  **invisible**: `abap2UI5/samples-stack`'s app 319 calls it `m_client`, has no
  `check_on_navigated( )` branch, and no rule said a word. `mo_client` and
  `me->client` are in the corpora too. The handle is matched by shape now, and
  three assertions pin it.

- **New rule `missing-on-navigated-branch` (`warning`).** The complement of
  `missing-view-display-on-navigated`, which has always judged a
  `check_on_navigated( )` branch that never re-displays. The far more common
  shape in the wild has **no branch at all**, and nothing could see it.

  `check_on_init( )` means "this app INSTANCE never ran", not "the app starts"
  — abap2UI5 flips `mv_check_initialized` in `db_save( )` after the very first
  roundtrip. It is therefore false on three roundtrips that put the app back on
  screen: a called app leaving through `nav_app_leave( )`, one of the built-in
  `z2ui5_cl_pop_*` value helps returning (those run over `nav_app_call` too),
  and a bookmarked draft being restored. All three raise `check_on_navigated( )`
  alone; with no branch for it `main( )` does nothing, the response carries no
  display, and the model is pushed into a MAIN slot still holding the other
  app's view. The screen stays wrong with **no error anywhere** — which is why
  an app written this way works perfectly until the day something navigates
  into it, and why the defect is usually reported as "it broke when I put it
  behind a navigation" long after the app was written.

  Judged on the dispatcher, never on the absence of the word. Every lifecycle
  `IF … ENDIF` construct is cut out of `main( )` and what remains has to reach
  no display: an ungated `view_display( )` after the chain covers every
  roundtrip and is not reported (`samples`'s `z2ui5_cl_smp_app_025` is exactly
  that shape, and a text search called it broken), and so does the
  `client->nav_app_leave( )` a popup helper ends on (abap2UI5's own
  `z2ui5_cl_pop_data`). A class that displays nothing at all is a helper and
  belongs to `view-never-displayed`.

  **This rule adds findings to every corpus** — the first rule here that does
  on this scale, and deliberately: `samples` 85, `samples-controls` 425,
  `samples-stack` 27, `app-template` 0, one per class and none of them a
  duplicate. The 36 classes that a plain text search for `check_on_navigated`
  would have added on top are exactly the exemptions above. It ships as a
  `warning` rather than an error because the defect is **latent**: the app is
  not broken today, it breaks on the first hop into it, and for an app that is
  never navigated into that day may never come. Consumers absorb it at their
  pin bump — `npx abap2ui5lint --update-baseline` for the two baselined
  corpora, `ADVISORY_BUDGET` in samples-controls' `view-gates.mjs` — or fix the
  corpus, which is a two-line change per class. The downstream job is red until
  one of the two happens, which is what that job is for.

  The linter's own canonical fixtures (`good.clas.abap`, `viewbuilder.clas.abap`)
  did not have the branch either, and now do.

## 0.2.0 - 2026-08-16

The theme of this release is **findings that were not true**. Six defects, all
of the same shape: a rule reading the ABSENCE of something it could not see as
evidence that the code is wrong. Together they account for **31 of the 32
findings `abap2UI5/samples` had to keep in a baseline** — after the bump that
file is down to one deliberate row — and eight more in `samples-controls` and
`samples-stack`, where whole rules and whole folders had been switched off to
silence them. No finding anywhere in any corpus is added by them.

One rule is added, and it is the mirror image of the theme — a file the linter
was not judging at all, and did not say so.

### New: `frozen-view-builder`

An app written on `z2ui5_cl_xml_view` was not merely unchecked, it was
**invisible**. Files are collected by the builder factory they call, the frozen
builder is not one, and so a complete app on the retired API ended a run with:

    abap2ui5lint: no checkable app classes under src

and exit 0. Which reads like approval, and was the strongest possible false
green: not one control, property, binding or render had been looked at.

The old builder still compiles and still renders — it moved into the frozen
`src/99` rather than being deleted — so nothing else raises an eyebrow either.
And it is what nearly every blog post, forum answer and tutorial about
abap2UI5 shows, which makes it what a language model reproduces when asked to
write an abap2UI5 app. The most likely wrong answer was the one nothing here
could see.

Such a class is now collected and reported, at the factory call, as an `error`
— the severity is about what was *not* judged, and an unjudged view is worse
than any single finding. And **only** that one finding: the other ABAP rules
model the current dialect, and running them over `page( )`/`button( )` would
trade a silent miss for confident noise.

Measured before shipping, as every rule here is: `abap2UI5/samples` 0,
`samples-controls` 0, `samples-stack` 0, `app-template` 0. The only corpus it
lights up is the framework itself — 17 popup classes in `src/99/02`, which is
correct, since that package IS the frozen legacy and will never be migrated.

> **If you check a repository that keeps a legacy app on purpose**, say so once
> instead of arguing with it:
> `"rules": { "frozen-view-builder": { "exclude": ["src/99/"] } }`
> — or `"warning"` to keep it visible without failing.
> The abap2UI5 framework repository needs exactly this when it bumps to 0.2.0.

- **Four more ways an ABAP structure declaration hid its shape.** Every one of
  them ended in the same place — a correct binding reported as a path the model
  does not have, with nothing to do about it but a disable directive. Together
  they account for **16 findings across `abap2UI5/samples`, all of them false;
  nothing else in any corpus changes.**

  - *The same name nested at several levels.* `END OF ms_data` is a PREFIX of
    `END OF ms_data2`, so the outer structure ended at the inner one's close
    and kept only the fields written after it. Sample 138 nests seven deep on
    purpose; the depth limit on the mock model (5) cut it short as well.
  - *`INCLUDE TYPE`.* The period-terminated `DATA BEGIN OF x. INCLUDE TYPE y.
    DATA END OF x.` form was not read at all — a different statement, not a
    spelling variant, and the only one that can carry an include. The included
    fields land flat, as components of the including structure.
  - *A type owned by another class.* `DATA s TYPE zcl_other=>ty_s_result.` was
    not merely typed as unknown, it was dropped: the type matcher accepted no
    `=>`, so the declaration did not match and the variable never existed. Now
    it is registered and takes the "shape not knowable here" branch, where
    paths below it are accepted rather than guessed at.
  - *A model declared by the view.* `<template:repeat var="L0">` creates the
    model `L0>` for its subtree. Enumerating models from the ABAP source cannot
    see it, so every templated view reported its own aliases as models nothing
    has.

  A structure whose shape IS known still catches a typo through it — the
  fixture asserts both halves.

- **A `rules.*.exclude` meant different things depending on how the run was
  started** ([#35](https://github.com/abap2UI5/linter/issues/35)). The pattern
  was tested against whatever string the file was collected under, and that is
  absolute or relative depending on the invocation — a discovered config joins
  `paths` onto its absolute dirname, while `abap2ui5lint src` and
  `--config abap2ui5lint.jsonc` both leave it relative.

  So the same config on the same tree waived different things, and it was the
  run that *looked* stricter that was broken: in `abap2UI5/samples-stack`,
  whose config excludes the Smart Controls package with abaplint's leading
  slash (`["/src/02/"]`), `abap2ui5lint` reported nothing while
  `abap2ui5lint src` reported 25 findings the repository had waived on purpose
  — with nothing in the output connecting them to the exclusion that should
  have caught them. The mirror case is equally silent: `["^src/00/98/"]`,
  written the way the report prints the path, matched only the relative form.

  Both spellings now work from any invocation. The test asserts each pattern
  against an absolute, a relative and a dot-prefixed path — and that neither
  stops excluding only what it names.

- **An ABAP keyword inside a string literal counted as structure.** A
  MessageStrip whose text reads *"…share the state with someone else. Enter a
  quantity…"* ended its enclosing `IF` branch at that `else`, four statements
  before the real `ENDIF` — so the `view_display( )` after it stopped counting
  and a correct view was reported as never displayed. `scrub( )` keeps literal
  contents on purpose (the value resolver reads them); the rules that look for
  STRUCTURE now read a view with literal contents blanked and offsets
  preserved. Any English sentence long enough contains one of these words, so
  this was a coin flip on the wording of a message.

- **Three rules judged code they could not see.** Each read the ABSENCE of
  something as a defect, where the truth was that this pass cannot resolve it.
  Eight more false findings across `abap2UI5/samples`, and no finding anywhere
  else changes.

  - `missing-view-display-on-navigated` read only the branch text, so the
    normal shape - `ELSEIF client->check_on_navigated( ). on_navigation( ).` -
    was reported as never handing a view back, and the fix it proposed would
    have displayed the view twice. A call to a method of the same class is now
    followed a few levels deep. It still reports a branch that displays
    nowhere; the test asserts both halves, with the helper named `paint( )` so
    the method NAME cannot be what satisfies it.
  - `missing-accessibility` read a button whose caption is
    `COND #( … )` / `SWITCH #( … )` / `|{ count }|` as having no text at all.
    An unresolvable value is dropped rather than invented (a made-up value
    would be judged as if it had been written), but the fact that the
    attribute WAS written is real, and the reconstruction now records it for
    the rules that ask only that.

- **A structure declared inside another one was dropped, and every path
  through it reported.** ABAP nests `BEGIN OF` freely:

  ```abap
  BEGIN OF ty_s_row,
    id TYPE string,
    BEGIN OF s_details,
      create_date TYPE d,
    END OF s_details,
  END OF ty_s_row.
  ```

  `s_details` names no `TYPE`, so the field matcher could not see it and the
  whole subtree vanished from the derived model — `{S_DETAILS/CREATE_DATE}`
  then read as *"the rows have no such field"* on correct code, with no way to
  act on it beyond a disable directive. Nested blocks are now lifted into
  structures of their own, at any depth, filed under a name qualified with
  their parent so two structures can each carry an `s_details`. Two false
  findings disappear from `abap2UI5/samples`; **nothing else in any corpus
  changes.**

- **A namespace prefix with a dot in it read as undeclared.** `xmlns:viz.data`
  and `xmlns:viz.feeds` are what the `sap.viz` controls are written with, and
  an XML prefix is an NCName, where a dot is perfectly legal. The declaration
  matcher used `\w`, so it saw no declaration and then reported every use as
  `undeclared-namespace` — four errors on one correct class.

- **An aggregation under a control the snapshot does not have was blamed on
  the nearest one it does.** The metadata covers OpenUI5; a SAPUI5-only
  control (`sap.ui.vbm`, `sap.ui.comp`, `sap.suite.*`) is outside it, and its
  children kept the last known ancestor as their owner. So `vos` inside
  `vbm:AnalyticMap` came out as *"sap.m.Page has no aggregation vos"* — a
  finding pointing at a control that is not the one in question, which nobody
  can act on. `abap2UI5/samples-stack` had excluded a whole package to silence
  the shape. Eighteen such findings across the sample corpora; **no finding
  anywhere else changes.**

  The mirror image was the worse half and invisible: an aggregation whose name
  happened to exist on that distant ancestor was silently *excused*. Both are
  guesses, and this rule's promise is that a chain leaving the snapshot is not
  guessed about — now the owner goes opaque and nothing below it is judged.

- **The rule reference showed code the builder cannot run.** Eleven of the 49
  examples on the rules page and in the README called `view->leaf( … )`,
  `)->open( … )` or `->_generic( name = … )` — the role names
  `lib/builders.mjs` uses internally, which were the verbs of a builder that is
  gone. The current one has `ele`, `tag`, `a`, `end`. Every example is now
  written in it, and a gate derives the allowed spellings from the builder
  definition itself, so a future rename takes the documentation with it rather
  than leaving it behind.

- **Every rule now has to fire in the test suite.** 83 of the 84 did;
  `escaped-brace-in-backtick` had no test of any kind, and nothing in the
  repository was in a position to say so — a rule that stops firing keeps a
  green suite, ships, and reports nothing until somebody notices by hand. The
  suite records the rule ids the checks actually produce and asserts the
  registry against them, so a new rule cannot land without a source that
  triggers it. `escaped-brace-in-backtick` got the four cases it was missing,
  including both correct spellings it must stay silent on.

- **`event-without-handler` reads `WHEN OTHERS`.** A dispatcher that ends in

  ```abap
  WHEN OTHERS.
    client->message_box_display( type = client->get_event( ) ... )
  ```

  handles every event there is, including the ones no `WHEN` names — and the
  rule read only the literals, so all five message types raised in
  `abap2UI5/samples` app 382 were reported dead. That is the expensive kind of
  finding: the reader has to prove the tool wrong before ignoring it, and the
  next real one is read the same way.

  Conservative on purpose in one direction: the CASE body is matched to the
  first `ENDCASE`, so a nested CASE hides the catch-all and the events keep
  being reported. Missing a catch-all costs a hint; inventing one would hide a
  genuinely dead event.

- **`abap2ui5lint --init`** writes a commented `abap2ui5lint.jsonc` to start
  from. The documented route was three steps — read the README, copy the
  block, fix the `$schema` path — and one of them was silently wrong: the
  README's `$schema` pointed at `main`, so an editor validated the file
  against rules the pinned CLI does not have, accepting what the run then
  refused. `--init` resolves it against the installed copy, and refuses to
  overwrite a file that is already there.

- **The README opens with the thing you came for.** `## Install` used to sit
  on line 165, behind ninety lines of rule catalogue; the run that needs no
  install at all now comes first, with the sample output it produces. The
  catalogue is unchanged, just no longer in front of the door. It also names
  [app-template](https://github.com/abap2UI5/app-template) — the repository
  that already has all of this wired up, and the answer for anyone starting a
  new project, which this README did not mention at all.

## 0.1.1 - 2026-08-15

- **The advertised `npx @abap2ui5/linter src` lints again.** The render gate
  is on by default and its ~118 MB runtime is deliberately *not* installed by
  default, so the first command the README gives a new user did nothing at
  all: exit 2, no findings, a refusal naming the package to install. That was
  the state of 0.1.0 on npm.

  A render gate that nobody **asked** for now steps aside for the property
  gate and says so on stderr (`--json` on stdout stays parseable). Asking for
  it keeps the hard refusal, because a gate that silently does not run is how
  a green CI stops meaning anything — and asking is now writable from both
  sides: the new `--render` flag, or `"render": true` in `abap2ui5lint.jsonc`.
  `--no-render` is unchanged and silent.

- **`event-without-handler` reads two more handler shapes.** It knew
  ``check_on_event( `X` )``, ``get_event( ) = `X` `` and ``WHEN `X`.``, and
  called everything else no handler at all — so two shapes that are all over
  the corpora reported an event that IS handled:

  - ``WHEN `A` OR `B`.`` — only the first literal of the alternatives list
    was read, so the second name was reported dead (samples-stack app 319);
  - ``IF client->get( )-event = `X`.`` — the spelled-out form of
    ``get_event( ) = `X` `` matched nothing (samples-stack app 487).

  A false hint is the expensive kind: the reader has to prove the tool wrong
  before ignoring it, and the next real finding is read the same way.

## 0.1.0 - 2026-08-15

First public release — of both packages, from one tag:

| Package | What it is |
| --- | --- |
| `@abap2ui5/linter` | the CLI, the library and the GitHub Action (~240 kB, no dependencies) |
| `@abap2ui5/render-runtime` | the UI5 runtime the render gate serves (`@openui5/*` + playwright) |

Everything below is what changed while preparing that release. Nothing was
published before it, so none of it can break an installed consumer — which is
exactly why these were worth doing now rather than later.

- **New rule `chain-house-layout`, and the first opt-in rule.** It judges a
  builder chain against one canonical form — one call per line *including
  attributes*, four spaces per level of the tree, the closing call in the
  column of the element it closes — and carries fixes, so `--fix` reformats.

  Its two neighbours judge a chain against itself and deliberately do not name
  a step, because demanding one lit up the corpus. That is still the right
  doctrine; what changed is the corpus. abap2UI5, abap2UI5/samples and
  abap2UI5/samples-controls were unified onto this layout, where the rule now
  reports nothing across all 575 builder classes — and on their previous state
  it reports 149 of 150 samples classes and 77 of 417 ports. Those 77 are what
  motivated it: their whole chain sat one level too deep, which
  `chain-indentation` cannot see, because a uniformly wrong rhythm is a rhythm.

  **It is off unless asked for** — `"rules": { "chain-house-layout": "warning" }`.
  A house style shipped as everyone's default is what `lib/chain-layout.mjs`
  argues against, and a whole-chain fix would defer any other rule's fix
  inside the same chain to a second `--fix` pass. The mechanism is general:
  `OPT_IN` in `lib/findings.mjs`, honoured before the rule is even emitted.

- **`./fix` is an export**, so a generator can format what it emits with the
  same code `--fix` runs rather than reimplementing the layout downstream.

- **The UI5 runtime moved into its own package.** It used to be declared as
  `optionalDependencies` of the linter, which does not mean what the name
  suggests: **npm installs optional dependencies by default**. So the
  advertised `npx @abap2ui5/linter src` — *"no install, one run"* — pulled 15
  packages and ~123 MB before it linted anything, and `--omit=optional`, the
  documented way out, is not a flag `npx` accepts. The runtime is now
  `@abap2ui5/render-runtime`, declared as an **optional peer**, which is the
  one kind npm leaves alone. A default install is 1 package.

  Adding the render gate is one command: `npm i -D @abap2ui5/render-runtime`.
  Without it every property-gate rule still runs, and asking for a render
  names that one package instead of listing twelve.

- **The render gate resolves through the runtime package.** `@openui5/*` and
  `playwright` used to be looked up relative to the linter itself, which finds
  them only because a flat npm tree hoists them to the top. Under pnpm and
  other nested layouts it would have called a complete install missing. Both
  lookups now go through `@abap2ui5/render-runtime` first and fall back to the
  hoisted tree.

- **One binary: `abap2ui5lint`.** `abap2ui5-linter` is gone as a command name.
  Two names for one tool means two things to document and two to keep forever;
  the surviving spelling is the one that matches the config file
  (`abap2ui5lint.jsonc`). Adding an alias later breaks nobody — removing one
  would have. The tool still calls itself `abap2ui5-linter` in reports and in
  the SARIF `tool.driver.name`: that is the product's name, not the command's.

- **The Action can skip the render gate.** `render: false` skips the runtime
  and the Chromium download and passes `--no-render`, which turns a
  property-only job from a ~123 MB install into a small one. It stays **on** by
  default, because switching a gate off silently would make findings disappear
  from a pipeline that still reports green.

- **`keywords` added** so the package is findable on npm at all.
