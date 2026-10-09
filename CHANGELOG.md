# Changelog

## Unreleased

### Read before upgrading

- **Baseline keys carry no source position any more - and an older linter
  cannot read the new ones.** Ten rules kept two occurrences in one class
  apart by writing a position into a key field: the source offset into
  `value` (`default-key-table`, `abapdoc-html-tag`,
  `event-arg-default-index`, `display-after-nav-app-call`,
  `double-display-in-branch`, `empty-catch-block`,
  `boolc-instead-of-xsdbool`, `delete-index-in-loop`) or the line number
  into `member` (`source-line-too-long`, `trailing-whitespace`). Both fields
  are part of the baseline key, so a line inserted above a baselined finding
  made it a stale entry AND a new finding. The position now travels as
  `dedupe`, which only the per-class collapse reads and which is dropped
  before a finding leaves the rules (the `line` says where it is). A
  baseline written before keeps working: `loadBaseline( )`,
  `applyBaseline( )` and `updateBaseline( )` read an old key of one of the
  ten with a number in that field as today's key (`migrateKey( )` on
  `./baseline`), so it matches wherever the code moved, and the next
  `--update-baseline` writes the new form. The other direction does not
  hold: 0.8.5 and older compute the old key for those ten rules, so a
  baseline rewritten by this release waives nothing of theirs - the findings
  come back and every such entry is reported stale (measured: a baseline
  written by `--update-baseline` here fails a 0.8.5 run with exit 1). That
  reaches whatever judges the same baseline with an older linter - an Action
  or `npx` pinned to an earlier release, and the VS Code extension until its
  pin moves, whose *Add to Baseline* then writes an old key beside the new
  one, which this release reads as one key counted twice and reports stale.
  Move every tool that reads one baseline to this release together.

- **A numeric `ui5` / `minUi5` in the config is refused** (exit 2) with a
  message that says why: JSON reads `1.120` as the number 1.12, so the floor
  moved eight minors down without a word. Write it quoted, `"1.120"`. A
  config that wrote `"ui5": 1.71` unquoted worked before and has to be
  quoted now; the schema always said string.

### Rules

- **`unbound-public-attribute` and `unused-public-attribute` see a reader in
  the same run.** A popup hands its result back through a PUBLIC attribute
  its caller reads (`CAST zcl_pop( client->get_app( … ) )->ms_result`), and
  a caller sets a value on the app it calls the same way - unbound by
  construction, and both rules said no single source can see that caller.
  The class index (`classIndexOf( )`) now records per class `outsideReads`:
  the names another class of the run reaches as `ref->name` through a
  reference it types as this class (`TYPE REF TO`, an inline declaration
  from `CAST`/`NEW`/a static factory, or that expression itself before the
  arrow); a reference whose class is not written down is nobody's. Both
  rules stand down for those names. Because that stand-down depends on what
  the RUN holds, a waiver of either rule in such a class is unjudged rather
  than `unused-directive` (`publicReadFromOutside( )` on `./abap-rules`,
  fed to the directives as `stoodDown`): the same class linted alone - an
  editor, a pre-commit hook - still needs it, and the unused-directive fix
  would have deleted it. `classIndexDeps( )` carries the set, so `--cache`
  re-judges the popup when a caller starts or stops reading it, and `--fix`
  re-checks it between passes. `ClassIndex` in `types.d.ts` gains the
  optional field. Corpora: nothing is reported differently -
  abap2UI5/samples app 024's and abap2UI5's `node/srv/zcl_tst_stack_a`
  waivers for the attribute their callers set stay (unjudged in a corpus
  run, used when the class is linted alone); the other outside readers in
  the corpora are ABAP Unit test classes, which no run collects, or call the
  popup's `result( )` method.

- **A `COND #( )` or `SWITCH #( )` of literals is judged branch by branch.**
  `COND #( WHEN n = 1 THEN \`Emphasized\` ELSE \`Default\` )` on a Button
  `type` has a closed set of values, and it was reported as
  `unresolved-attribute-value` while a wrong value in a branch went
  unjudged. The reconstructor records the values of a conditional with an
  `ELSE` whose every result resolves (a literal, a `&&` chain, a nested
  conditional of the same shape; a `THROW` branch yields none) as the node's
  `branchValues`, and the property gate judges each like a literal:
  `invalid-property-value` (with its case-only `--fix` landing on the
  branch) and the other value rules, silent when all of them pass. No
  `ELSE`, a `LET`, or a result that does not resolve keeps the hint.
  abap-cloud-gui: its two `unresolved-attribute-value` hints are gone.

- **`uncurated-formatter` reads more of the formatters a view names.** A
  CONTROLLER formatter in a class (`formatter: '.weightState'`, the demo
  kit's own form) names a function on the view's controller, which in
  abap2UI5 is the framework's and defines none: the view fails to load with
  *formatter function .weightState not found*, and only the render gate said
  so. A raw view is left alone (it may be a freestyle app's, with a
  controller of its own). And every alias a `core:require` points at
  `z2ui5/model/formatter` is read (`{ Fmt: 'z2ui5/model/formatter' }` with
  `formatter: 'Fmt.round2DP'`), the did-you-mean keeping the written alias;
  the expression form no longer matches a name that merely ends in
  `Formatter` (`myFormatter.round2DP(`).

- **`int`, `float` and `boolean` values are judged the way DataType parses
  them.** The numeric check was `^[+-]?\d+(\.\d+)?$`: `.5`, `5.` and `1e3` -
  numbers to DataType's `Number( )` - were reported as invalid, while `10.5`
  on an `int` property (which `Number.isInteger` refuses) passed. An empty
  value is valid for all three (`NaN` for a number, `false` for a boolean),
  and a value the reconstruction guessed from a LOOP variable is not judged
  as if the author had written it.

- **An `xmlns` on an inner element is scoped to it.** Every declaration of
  a document went into one map, the last one winning, so `<VBox
  xmlns="sap.ui.layout.form">` inside a sap.m Page turned the Page above it
  into an `unknown-control`, and a prefix declared in one subtree passed as
  declared in another, which the browser's parser refuses. The property
  gate, the control-id map, the enum-bound-field reader and the run
  summary's profile resolve each element against the declarations in scope
  at it (`namespaceScopes( )` in `lib/properties.mjs`), and
  `undeclared-namespace` reports a prefix used outside the element that
  declares it. The top level stays one scope (a second root is judged with
  what the first declares).

- `popup-display-xml`, `popover-display-val` and
  `popover-anchor-unknown-id` read the CLIENT's `popup_display( )` /
  `popover_display( )` call and find the argument among the named ones
  wherever it stands: an app's own `my_popup_display( xml = … )` was
  reported and "fixed" into a parameter the method does not have, and
  `popover_display( by_id = … val = … )` went unseen.

- `view-never-displayed` no longer reports a helper class that hands its
  stringified view to the caller - `result = view->stringify( )` where
  `result` is a RETURNING, EXPORTING or CHANGING parameter of the method
  (abap-cloud-gui's `z2ui5_cl_cgui_list` and `z2ui5_cl_cgui_selscreen`,
  which its config excluded by name).

- `unescaped-text-in-attribute` leaves `id` and `class` alone: the
  XMLTemplateProcessor takes both verbatim and never parses a brace in them
  as a binding, and the fix, `t =`, wrote a backslash into the id or the
  class token.

- `undefined-css-class` leaves a `class` value the reconstruction guessed:
  `|state-{ ls-row-state }|` in a LOOP came out as `state-`, the literal
  part of a class completed at runtime.

- `unknown-icon` reads `` `sap-icon://status-` && lv_code `` as the prefix
  it is - the backtick spelling of `|sap-icon://status-{ lv_code }|`, which
  was already not judged.

- `editable-control-without-binding` says the control "takes user input"
  rather than that it "lets the user type": 152 of samples-controls's 343
  findings are on controls nobody types into (RadioButton, CheckBox, Switch,
  Slider, Select, …).

- `"rules": { "<id>": true }` switches an opt-in rule (`chain-house-layout`,
  `portable-app`) on. It passed the config check and ran nothing; `true` now
  means "on, as it is".

- `unused-directive` leaves a waiver alone where the rule it names never
  ran: in an app class whose view another class builds, a helper class under
  `--all-classes` and a class on the frozen builder, only some rules judge
  the class (`SOURCE_RULES`, new on `./abap-rules`, plus the class-reading
  rules for an app class), so a waiver of `unbound-public-attribute` or a
  property-walk rule there had nothing it could suppress - and its fix
  deleted the waiver the class needs the day its view moves back in. It is
  unjudged now, as under `--no-properties`. No corpus carries one.

### Reconstruction

- **A quote in a comment no longer silences the class.** The comment and
  literal readers (`scrub( )`, `blankLiterals( )`, `splitStatements( )`)
  lost their place in three shapes - a string template whose embedded
  expression runs over two lines, a `|` in a literal inside an embedded
  expression (`` sep = `|` ``), and a UTF-8 BOM in front of a `*` comment
  line. The comment behind it was then kept as code, a `'` in its text
  (`" don't care`) opened a literal that ran to the end of the file, and
  most ABAP-side rules reported nothing for the rest of the class. `scrub( )`
  now carries an open embedded expression over the line break and reads a
  `"` inside one as a comment, a BOM is blanked, and every reader ends a
  quote or backtick literal - and a template's text - at its line, as ABAP
  does, so a reader that is ever wrong again is wrong for one line. The one
  `literalEnd( )` is shared by `parenRegion`, `topSplit`, `namedArgMarks`,
  the reconstructor's paren scan and `chain-house-layout`, whose own scanner
  closed a template at the first `|` and so lost the `)` of a crammed chain
  call behind `|{ concat_lines_of( table = mt sep = `|` ) }|`.

- **A `CONSTANTS` value resolves.** `CONSTANTS c_base_url TYPE string VALUE
  \`https://…\`` and `t = c_base_url && \`sample1.jpg\``, the chained
  `CONSTANTS:` form and one level of `BEGIN OF cs … END OF cs` read as
  `cs-name` were dropped as values the gate cannot follow, so a URL, a
  colour or an enum value kept in a constant was judged by nothing and
  rendered as absent.

- **A name written once with a string template resolves to it.**
  `DATA(expr) = |\{= ${ client->_bind( flag ) } ? 'A' : 'B' \}|.` and then
  `v = expr` on five controls - how a port hands one expression binding
  around - was dropped (samples-controls apps 445 and 452 carried fifteen
  `unresolved-attribute-value` hints for it). So was a name written once with
  `cl_abap_char_utilities=>newline`. A second write of the name anywhere in
  the class, or a second declaration of it - a method parameter of the same
  name, another method's local - keeps it a variable, unresolved as before:
  read class-wide, a helper's `v = type` came out as another method's
  `DATA(type) = |…|`.

- A pragma behind an argument value (`` v = `Bogus` ##NO_TEXT ``) is no part
  of it: the attribute was dropped as unresolved, and every check of its
  value with it.

- **A builder handle kept in an attribute and stringified in another method
  is skipped, not failed.** abap2UI5's `node/srv/zcl_tst_host` builds its
  page in one method, keeps the handle in `mo_main_page`, lets a sub-app
  created by name build into it and stringifies it in another; the replay
  enters only the methods that open a factory, so the render gate failed the
  class with `no view reconstructed from builder calls`. When the replay
  yields no document, the builder calls in the methods it never entered are
  counted as `helperTokens`, so the class is skipped with the usual "built in
  helper methods" note (abap2UI5's `render-error` waiver for it now waives
  nothing; sapgui's `zcl_sapgui_frame` and `zcl_sapgui_se91` are the same
  shape). A class whose replay yields a document is unchanged.

### `--fix`

- **`--fix` runs to a fixed point.** One pass applies every fix whose span
  overlaps none applied before it, and a fix can leave a shape another rule
  fixes (a deleted trailing `t_arg` row leaves the one-row table
  `event-arg-single-row-table` rewrites; `chain-house-layout` re-lays a
  chain another fix sat in) - so a run ended with "N deferred to the next
  run" and the reader ran `--fix` two or three times. The CLI now repeats
  the pass in memory, re-checking the files the previous pass changed (and
  any whose class-index facts - superclass chain, outside reads - moved),
  and writes each file once: the text the old `--fix` reached when it was
  run until it changed nothing. Bounded at `MAX_FIX_PASSES` (10, ESLint's
  bound, exported on `./fix`); a run that stops there says so. The summary
  names the passes (`fixed 6 problem(s) in 1 file(s) in 2 passes`), and
  `--fix-dry-run` lists a later pass's fixes with `(pass N)`.

- **`--fix` keeps a CRLF file CRLF.** The fixes that insert or re-lay lines
  (`chain-house-layout`, `missing-on-navigated-branch`, the inserted
  `class_constructor`, …) wrote LF, so with `crlf-line-ending` switched off a
  fixed file came back with mixed line endings. Every fix now writes the
  source's line ending (`matchLineEndings( )` on `./fix`, applied by the
  entry points to what survives the rules and directives) - LF while
  `crlf-line-ending` is fixing the file to LF in the same pass. And
  `chain-house-layout` compared a CRLF line break as if it were wrong, so it
  reported (and rewrote) every multi-line chain of a CRLF class whatever its
  layout.

### CLI, output and config

- **`--stdin` refuses a path beside it** (exit 2). The path was neither read
  nor linted, and the run reported on the piped source as if the file had
  been checked: `cat a.clas.abap | abap2ui5lint --stdin b.view.xml` was
  green whatever `b.view.xml` held. The message names `--stdin-filename`
  and `--config`.

- **The stylish report no longer prints control characters out of the
  source.** A message quotes the checked file, and an ESC in a literal
  reached the reviewer's terminal raw - an escape sequence that clears,
  retitles or recolours it, or hides the line it sits on. The stylish
  report, the annotations, the `--verbose` notes, the stale-baseline lines
  and the `--fix` listing print every C0/C1 control, DEL and the bidi
  override/isolate characters as a visible `\xNN` / `\uNNNN` (a tab or line
  break as a blank); `terminalSafe( )` on `./report`. JSON and SARIF carry
  the text as written.

- `--format checkstyle` and `--format junit` stay well-formed whatever a
  message quotes: a control character becomes U+FFFD, and a line break or
  tab is written as a character reference, which an attribute keeps. Both,
  and the GitHub annotations, write `/`-separated paths on Windows too, as
  SARIF always did - an annotation with a `\` path never reached its line.

- A run with nothing to check prints the EMPTY document of a machine format
  (`checkstyle`, `junit`, `sarif`, as `json` already did) with the sentence
  on stderr, and still writes `--sarif-out` and `--json-out`: a workflow's
  upload-sarif step behind the Action's `sarif` input failed on a file that
  was never written.

- `--update-baseline` beside a machine format writes its "baseline: wrote"
  line to stderr; stdout is the document a caller parses.

- `--advisory` / `--fail-on never` exit 0 under `--max-warnings` (or a
  config `maxWarnings`) too, as they do for stale baseline entries; the
  excess is still said on stderr.

- `--max-warnings`, `--jobs` and `--render-pages` take digits only. `''`
  and `' '` were read as 0 and `0x2` as 2, so `--max-warnings "$MAX"` with
  the variable unset failed the build on the first warning.

- A baseline file that is valid JSON but no object (`null`, a number, an
  array, a string) is refused with the file's name and the shape it should
  have, instead of `Cannot read properties of null`.

- The config's `ignore` count ("N files ignored by config") is taken in the
  same directory walk; the CLI walked the tree a second time and read every
  class twice. `collectFiles( )` takes an `onIgnored` callback for it.

- A UTF-8 BOM no longer shifts the columns of line 1 by one.

- `isXmlSource( )` on the main export: whether `checkFiles( )` reads a
  source as a raw view or as a class - the one predicate the library, the
  `--fix` passes and the cache's class index share.

### `--cache`

- **`--cache` follows the class index and the linter's own code.** A class
  is judged against what its superclass declares (`cs_event`) and what the
  other classes read of it (`outsideReads`), and a cached run built that
  index out of the cache MISSES only: a subclass re-checked without its
  cached superclass read the inherited constant as unknown, and an edited
  superclass left its subclasses' stale entries in place. The index is built
  over every file of the run, and each entry is also keyed on the index
  facts its check read (`deps`, `classIndexDeps( )`). The context hash takes
  a fingerprint of `cli.mjs`, `lib/*.mjs` and `data/*.json` beside the
  version, so a checkout between releases or a regenerated snapshot does not
  replay the verdicts of the code before it. A run over part of a tree keeps
  the entries of every other file (and drops those whose file is gone), and
  the per-document models (`docModels`) are no longer stored. The cache file
  format moves to version 2; an old file is simply a cold cache.

### Render gate

- **An answer that arrives after a document's render window is charged to
  that document.** A control that sends a request (a Card fetching its
  manifest) reports what comes back whenever it comes back, and the page
  meanwhile rendered the next document, whose window collected the error -
  samples-controls apps 118 and 168 failed app 180, 183, 184 or 185
  depending on the run. The harness counts the fetch/XHR requests a page has
  in flight and lets them settle into the window of the document that sent
  them; a page still waiting after `settleTimeout` (`openRenderer( )`,
  default `RENDER_SETTLE_TIMEOUT_MS`, 2 s) is reloaded before the next
  document, so a late answer can be lost but never misfiled. Not covered: an
  error a control raises from a bare timer long after its view is gone.

- **The browser's own network error is waived.** A Card whose manifest lives
  on sdk.openui5.org fetches it when it renders; where that host does not
  answer (a sandbox, an offline runner) `TypeError: Failed to fetch` is
  environment noise like the other waived messages - whether a remote URL
  answers is not a property of the view. What the control says about the
  missing resource is still reported.

- **A raw `.fragment.xml` renders as a fragment.** The gate decided view or
  fragment by `^<core:FragmentDefinition` on the text, so a fragment file
  that opened with an XML declaration or a comment, wrote
  `FragmentDefinition` in the default namespace, or had a bare control as
  its root failed with "XMLView's root node must be 'View'". The file name
  decides now (`.fragment.xml` / `.view.xml`, on the result's `docKinds` and
  for `--screenshot`), and the renderer's own fallback reads past a BOM, the
  XML declaration, comments and a doctype and accepts any prefix.

### Performance

- **Linear on long input.** Measured quadratic and now linear:
  `default-key-table` (a class of 10,000 `TYPE TABLE OF` lines took a
  minute, also without a terminator behind the declarations), the PUBLIC
  attribute reader and `unbound-public-attribute` (three regex scans of the
  class per attribute), `client-handle-capture` (a scan per captured
  handle), `commercial-ui5-host` (a regex tried after every `-` of one long
  hyphenated token) and ten regexes anchored on `^\s*` under the multiline
  flag (the model's literal seeds and table seeds, the section DATA blocks,
  the event dispatch, `declaresApp( )`, …), which let every blank line -
  and every blanked comment line - start a scan over all the ones behind
  it. That last one is what the VS Code extension met: `prepareAbap( )` runs
  on every edit, and 2,000 commented-out lines took a second in 0.8.5, 8,000
  sixteen. The findings are unchanged on the corpora; `test/timing.mjs`
  judges each case by n against 4n, so a loaded runner cannot fail it.

- The class index (`outsideReads`) finds typed references by their `TYPE
  REF TO` keyword instead of trying a name at every word of every class.

- **Every rule is swept for growth.** `test/review/timing-sweep.mjs` takes
  each rule's card - the example the rules page wraps into a class and
  verifies - and grows it around the reported line in nine shapes (a long
  run of blanks, a long literal, a long comment; a block of comment lines,
  of declarations, the statement repeated, the method copied; nested IFs and
  a nested view), every case judged n against 4n (`screenedLinearly( )` in
  `test/timing.mjs`: one run each, the best of three only where that does
  not pass), plus four raw-view shapes. What it and the shapes behind it
  found, all three linear now: a class of many views with unused namespace
  declarations counted each prefix over the whole source once per finding
  (200 views, 5.7 s); an unclosed call handed the rule reading it the rest of
  the file as its argument list, so 2,000 of them took 11 s (`parenRegion( )`
  ends such a list at the statement's period now, and reads a `"` or `*`
  comment as a comment); and `unescaped-text-in-attribute`'s write reader
  split a long blank run after a statement's first word every possible way
  (`CLASS-METHODS` and 32,000 blanks, a second). No finding changes on the
  seven corpora.

### Action

- **`render: False` means false.** GitHub compares strings in an `if:`
  case-insensitively and the shell does not, so `render: False` skipped the
  runtime install and then ran the gate anyway, and `annotations: False`
  annotated. Both inputs are lower-cased in the shell, in the lint and the
  screenshot step.

- **The Chromium cache works on Windows and macOS runners.** The cache step
  saved `~/.cache/ms-playwright`, Playwright's browser directory on Linux
  only, so elsewhere every job downloaded Chromium again. The install, lint
  and screenshot steps set `PLAYWRIGHT_BROWSERS_PATH` to one directory under
  `runner.temp`, and that is what is cached (a Linux runner misses the cache
  once).

### Metadata

- **The generator gives a class the methods it owns wherever the file
  writes them.** sap/ui/unified/ColorPicker.js defines the private
  `_ColorPickerBox` between the picker's extend call and the picker's own
  methods, and a file was read "from one extend call to the next": the
  picker's `fireChange({ …, colorString })` was harvested for the box, so
  `$parameters>/colorString` on a ColorPicker - what the demo kit sample
  reads - was an `unknown-event-parameter`. `data/properties.json` now
  carries `colorString` and `formatHSL` on the picker's `change` and
  `liveChange`; no other class moved.

### Also in this release

- **The first display is modelled.** The model a view is judged and rendered
  against took its scalar seeds from the whole class, so a value only an
  event handler assigns was rendered as if it were there from the start.
  samples-stack app 013 bound a MessageStrip `type` to an attribute seeded
  `Error` in a `CATCH` block: both gates rendered `Error`, every real start
  shipped `""` and terminated the app. A document built on the start path -
  `main( )` ahead of its dispatch, the `check_on_init( )` arm (or the
  `check_on_navigated( )` arm of a chain without one), the constructor and
  what they call - is now judged and rendered against a model seeded from
  that path only (`initModel`, `initialFields`, `docOnInit` on
  `prepareAbap( )`, `docModels` on the result). A popup built in a handler,
  and every class with no such dispatch, keeps the class-wide model.
  Measured on six corpora (samples-controls, samples-stack, abap2UI5, popups,
  sapgui, abap-cloud-gui): no new finding, no new render error.

- **New rule `enum-bound-to-initial-field`** (error), the root-field twin of
  `enum-field-unset-on-insert`: an enum-typed property bound to an attribute
  the start path gives no value - no literal seed, no declared `VALUE`, no
  other write. The first display ships `""`, `validateProperty` throws and the
  app terminates, hidden control or not. A field the start path writes
  non-literally, one bound under `omit_initial`, and a document the first
  display does not show are not judged.

- **New rule `rows-hidden-by-visible`** (warning). The `items` of a
  non-growing list (`sap.m.ListBase`: List, Table, GridList, Tree) bound
  without a `length` and with a binding-valued `visible` on the row template,
  in a class that raises no size limit: a JSONModel hands such a binding at
  most 100 entries and the hidden rows are among them, so the list stops
  short of its data without a word. samples-controls' overview app listed a
  few dozen of its 622 ports that way. The narrow successor of the
  `bound-aggregation-over-size-limit` rule dropped in 0.3. Where the limit
  does not apply it is silent: a growing list pages with lengths of its own,
  a binding info's `length` is passed through, and a raw view has no class
  to ask. Neither is a MultiInput's `tokens` or a layout container's
  repeated `items` judged - a value set or a repeater, not rows of data; the
  first version reported the hidden tokens of abap2UI5/samples app 078, of
  popups' `z2ui5_cl_popup_get_range_m` and sample 19 and of abap2UI5's
  frozen copy, its only hits on seven corpora.

- **New rule `invalid-css-value`** (error, fixable). A size, colour or
  percentage literal its UI5 type refuses - `width="100"`, `100 px`,
  `calc(100%-2rem)`, `fit-content`, a capitalised colour name. UI5 checks
  `sap.ui.core.CSSSize`, `AbsoluteCSSSize`, `CSSSizeShortHand`, `CSSColor`
  and `Percentage` with one regex each; the XML parser only logs a refused
  value, then the control's setter throws and the whole view fails to load.
  The regexes are harvested into the snapshot (`typePatterns`, every
  string-based DataType whose `isValid( )` is one regex test) and are the
  same from 1.71 to the pinned release. `--fix` repairs only the mechanical
  cases: surrounding blanks, a blank between number and unit, a colour name's
  case. A bare number keeps the finding without a suggestion.

- **New rule `unknown-binding-type`** (error, fixable). A binding info's
  `type:` (by global name) or a core:require module path in
  `sap.ui.model.type` / `sap.ui.model.odata.type` that names no model type.
  By global name the binding runs without its type (the raw value is shown,
  input is never parsed back); through core:require the module 404s and the
  view is never created. `sap.ui.model.type.Decimal` and `.Number` are the
  plausible names that do not exist. The snapshot lists both namespaces
  (`modelTypes`); a type of the app's own, a relative `.MyType` and an alias
  are not judged (the alias at its core:require). A name that matches a type
  up to letter case is rewritten by `--fix`.

- **New rule `binding-type-too-new`** (warning), the version half of the
  same check: a model type newer than the floor
  (`sap.ui.model.odata.type.DateTimeWithTimezone`, @since 1.99), read from the
  class's own JSDoc into `modelTypes`.

- **The metadata snapshot gains two sections**, both additive:
  `typePatterns` and `modelTypes` (`loadSnapshot( )` attaches them as
  `__typePatterns` / `__modelTypes`). A snapshot without them - one a
  consumer generated with an older generator - leaves the three rules above
  silent. A consumer that builds the snapshot object itself rather than
  through `loadSnapshot( )` (the VS Code extension's web host) has to attach
  the two the same way to get them.

- `portable-app`: the vendored profile follows protocol revision 0.3
  (604d267) - the client-API names are read from `actions.api`, the names a
  raw view's `.eF( )` may use from `actions.wire.custom`.
- **New opt-in rule `portable-app`** (warning once asked for). Reports
  everything in an app outside the abap2UI5 protocol's portable profile v1
  (abap2UI5/protocol `profiles/portable.md`) - what keeps the app from
  running unchanged on a non-UI5 frontend such as the UI5 Web Components
  frontend: controls and members the profile does not list, `z2ui5.cc`
  custom controls, named models and other binding forms, expression
  constructs outside its grammar, event wires and arguments (`$event`,
  `prevent_default_expr`), frontend actions (`CONTROL_BY_ID`, …), the nested
  view slots (decision Q1) and `view_display( switch_default_model_path )`.
  One id, a `reason` per finding. Off until `"rules": { "portable-app":
  "error" }`. The profile is vendored verbatim as `data/portable-v1.json`
  (source commit in `data/portable-v1.source.json`, refreshed with
  `npm run sync-portable-profile`, drift reported by upstream-sync), and
  the rule reads both the current and the Q10 shape of its frontend actions.
  New export `./portable` (`checkPortable`), new option `portableProfile`.

- **`z2ui5_if_ui5_monitor` is released API.** abap2UI5 adds a roundtrip
  monitor seam to its released package `src/02` (an addon such as
  abap2UI5-addons/admin-cockpit implements it to log usage, timing and
  errors). Unlisted, `non-released-api` would have reported every
  implementing class, since the name falls under the internal
  `z2ui5_if_ui5_*` prefix. Merge together with the abap2UI5 change, or
  `check-upstream` reports the extra name as drift until it lands.

- **`ExcelBridge` is mirrored.** abap2UI5 ships a new companion control,
  `z2ui5.cc.ExcelBridge` (the workbook bridge of an Excel add-in,
  abap2UI5/office-addin). Unmirrored, a view naming it would fail view
  CREATION in the render gate with a module 404 and the property walk would
  look away from it; `check-upstream` reports the drift until both land.

- **`NativeBridgeScan` is mirrored.** abap2UI5 ships a new companion
  control, `z2ui5.cc.NativeBridgeScan` (the scan button of the native mobile
  shell, abap2UI5/mobile-shell). Unmirrored, a view naming it failed view
  CREATION in the render gate with a module 404 and the property walk looked
  away from it; `check-upstream` reported the drift.

- **The property gate is more than twice as fast on a corpus.** The
  samples-controls corpus (642 classes, `--no-render`) took 15.2 s and takes
  6.6 s, with byte-identical results on it, on abap2UI5/samples and on
  abap2UI5. The source readers no longer rebuild strings one character at a
  time, a call's argument list is parsed once instead of a dozen times, two
  whole-class scans per attribute or per match are gone, and
  `checkFiles( { jobs } )` spreads the files over worker threads (one per 64
  files) and returns the results in file order. The CLI's new `--jobs <n>`
  defaults to the machine's cores, at most 4; `--jobs 1` keeps one thread.
  The library default is 1.

- **New rule `unknown-message-box-type`** (warning, fixable).
  `message_box_display( type = … )` takes the sap.m.MessageBox display
  methods - `information`, `warning`, `error`, `success`, `confirm`, `alert`,
  `show` - and the server silently falls back to a plain `show( )` box for
  anything else: an error written `type = \`E\`` opens with no icon and no
  title. The four message-type letters with a box of their own (E, W, S, I)
  are rewritten by `--fix`. The list is mirrored from `ct_box_type` and
  gated by `check-upstream`.

- **New rule `bind-path-as-value`** (error, fixable). `_bind_path( x )` and
  `_bind( val = x path = abap_true )` return the bare path for a binding the
  app assembles itself; as the whole `v =` of an attribute they make the
  attribute the TEXT `/X`. `--fix` turns the call into `_bind( x )`.

- **New rule `html-content-not-markup`** (error, fixable). A
  `sap.ui.core.HTML` `content` that does not open with a tag is read by
  jQuery as a selector: nothing renders, or rendering throws. `--fix` wraps
  plain text in a `<span>`.

- **New rule `navigation-lost-on-rebuild`** (hint), the navigation twin of
  `control-state-lost-on-rebuild`: a NavContainer, SplitApp or
  FlexibleColumnLayout moved with `to`/`backToPage`/`toDetail`/`toMaster`
  only from a handler, while a bound field keeps the page - after the next
  `view_display( )` the container is back on its initial page and the field
  names another. Silent when a display-path method navigates the same
  container (abap2UI5 backlog item `navcontainer-position-not-reissued`).

- **`raw-javascript-to-frontend` sees two more shapes**: an inline `on…=`
  handler in markup (`core:HTML` content) and a `javascript:` URL in a
  URI-typed property. The default CSP refuses both, so neither ever ran.

- **Three rules gained a `--fix`.** `abapdoc-html-tag` escapes the tag's
  brackets as `&lt;`/`&gt;`; `control-call-arg-kind` rewrites a `bool`
  argument spelled `abap_true`, `x`, `TRUE`, `abap_false` or `FALSE` to the
  spelling the frontend reads; `duplicate-property` deletes a second
  attribute write that repeats the first word for word (two different values
  keep the finding).

- **`frontend-action-as-backend-event` reads an inherited `cs_event` as the
  class's own.** A class declaring its backend events as `CONSTANTS: BEGIN
  OF cs_event` was already exempt, but a SUBCLASS reaching the same
  constant was not: abap2UI5-addons/rap-ext's worklist, `INHERITING FROM
  z2ui5_cl_rap_list_report`, was warned on `client->_event( cs_event-back )`
  and even on `client->_event( z2ui5_cl_rap_list_report=>cs_event-back )`,
  failed the gate, and had to copy the constants into a local variable. A
  class-qualified `<class>=>cs_event-…` is now that class's constant, the
  client's only for `z2ui5_if_client`; and the superclass chain is resolved
  through the other files of the run (`checkFiles` builds the index,
  `classIndexOf( )` from `./abap-rules` for a caller judging one source at a
  time, passed as `classIndex`). A superclass the run does not have might
  declare one, so the bare spelling in such a class is not reported; a
  chain known to the end, or `INHERITING FROM object`, is judged as before.

- **A binding assembled in place is no longer "fixed" into text.**
  `unescaped-text-in-attribute` read a name's origin from its `=`
  assignments only, so a binding info built with
  ``CONCATENATE `{path:'` lv_path `'}` INTO lv_bind`` (around a
  `client->_bind( … path = … )` result) looked like a name nothing writes -
  data by definition - and `--fix` moved `a( v = lv_bind )` onto `t`, whose
  `escape_literal( )` turned the Tree's `items` binding into text: a silent
  runtime break made by the fixer (oblomov-dev/cloudy-sapgui). The rule now
  also reads `CONCATENATE … INTO x`, `x &&= …`, `REPLACE … IN x WITH …` and
  `me->x = …` / `ls_row-f = …` as writes; in a statement that assembles a
  string (those, or an operand of `&&`) a literal holding a brace counts as
  binding vocabulary, and a name the write reads carries its own writes'
  vocabulary along (`lv_bind = lv_path && …`). A brace literal assigned
  whole (``label = `{/X}` ``) is still data.

- **`missing-on-navigated-branch --fix` no longer swallows a popup's
  result.** A called app that leaves with an event (`nav_app_leave( event =
  … )`, how the confirm and select popups hand back their answer) raises
  `check_on_navigated( )` AND that event on the same roundtrip. The fix wrote
  its `ELSEIF client->check_on_navigated( ).` right behind the init branch,
  ahead of the event arms, so the fixed class took the navigated arm and
  never saw `POPUP_TRUE` (found migrating abap2UI5-addons/popups onto 0.8.5).
  In a class that calls other apps the arm is now written LAST in the chain,
  where it only catches roundtrips the chain ignored before; a chain ending
  in `ELSE` there is reported without a fix. A class that calls no app keeps
  the arm right behind init, as before.
- **Neither navigated fix copies a display of a branch-local variable.**
  `client->view_display( view->stringify( ) )` next to `DATA(view) = …` in the
  init branch was copied into the new arm, where it compiles (an inline
  declaration is method-wide) and dereferences an initial reference on the
  first hop back. Such a statement is now reported without a fix, in
  `missing-on-navigated-branch` and `missing-view-display-on-navigated` alike.
- **`missing-view-display-on-navigated` reads a negated guard as a guard.**
  `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.` was judged
  as a navigated branch that never re-displays - its branch is the roundtrip
  that did NOT navigate, and the re-display stood right below it. A negated
  condition whose branch leaves the method is now judged on the rest of the
  method (reported without a fix when nothing there displays); one that does
  not leave is not a navigated branch.

- **`@abap2ui5/linter-render` asks for `playwright ^1.63.0`.** The workspace
  manifest still said `^1.61.1` while `@abap2ui5/mcp-server`, samples-controls
  and the playground had moved to `^1.63.0`, so a project installing the
  render runtime next to one of them resolved TWO Playwright versions - two
  packages in the tree and two Chromium downloads for one browser. The lock
  already resolved 1.63.0; the range now says so, and one install shares the
  one Playwright. The `@openui5` pins are untouched: they are the metadata
  snapshot (RELEASING.md step 1c), not a dependency.

## 0.8.5 - 2026-09-30

- **A view that uses the framework's clipboard module renders.** abap2UI5
  ships a second curated module, `z2ui5/model/clipboard`, whose
  `extractData` is the mandatory callback of `sap.m.plugins.CopyProvider`
  (`core:require="{Clipboard: 'z2ui5/model/clipboard'}"`,
  `extractData="Clipboard.extractData"`). The render harness only knew
  `z2ui5/model/formatter`, so the core:require 404ed and the whole view
  failed to create. The harness now registers a mirror of the module, and
  `CLIPBOARD_MODULE` / `CLIPBOARD_CALLBACKS` join the formatter contract in
  `@abap2ui5/linter/formatters`; `check-upstream` compares them against
  `app/webapp/model/clipboard.js` (an upstream without the file reads as an
  empty export set, i.e. as drift).

## 0.8.4 - 2026-09-30

- **A failing report piped into another program arrives whole.** The CLI
  ended a run with `process.exit( )`, and a write to a pipe is asynchronous
  on POSIX: whatever the pipe had not taken yet was dropped with the
  process. `abap2ui5lint src --json | jq` on a failing corpus handed jq
  exactly 65,536 bytes of a 175 KB document, and in a workflow the GitHub
  annotations, printed last, were the first thing lost - on exactly the runs
  whose report matters. A run now sets `process.exitCode` and ends when its
  output is out; the early exits (`--explain`, `--help`, `--version`,
  `--init`) wait for stdout and stderr to drain first. Exit codes unchanged.

- **abapGit's metadata XML is no longer read as a view.** A file named on
  the command line is collected when it starts with `<`, and every bulk way
  of naming files names abapGit's sidecars too - `abap2ui5lint src/*`, a
  pre-commit hook handing over `git diff --cached --name-only`. Each
  `zcl_app.clas.xml` / `package.devc.xml` was judged as a view whose root
  control is `abapGit`: an `aggregation-in-aggregation` error and exit 1 for
  every class a commit touched. A document whose root element is `abapGit`
  is not collected now, and `checkXmlSource( )` (and so `--stdin`) returns
  it with nothing to check; `isAbapGitXml( )` is exported from `.`.

- **`a( v = … n = … )` reconstructs like `a( n = … v = … )`.** ABAP passes
  named parameters in any order, but the reconstructor read the value of
  `v`, `b` and `t` as everything after its `=` up to the closing paren - so
  with the name written second the value came out as
  `client->_bind_edit( mv_text ) n = \`value\``, was dropped as unresolvable
  with a note, and the attribute (a binding, here) was missing from every
  gate's view of the class. The arguments of an attribute call are read by
  name now, with the paren- and literal-aware splitter the rules use. The
  reconstructed documents of samples-controls, abap2UI5 and the fixtures (856
  classes) are unchanged - none of them writes the other order.

- **`--fix` no longer promises the next run work it will not find.** An
  edit inside text another fix of the same pass deleted was counted as
  "deferred to the next run (overlapping)": a CRLF class with five dead
  `view_model_update( )` lines reported 5 deferred - the `\r` of each
  deleted line - and the next `--fix` had nothing to do. Such an edit is moot
  and no longer counted; one overlapping REPLACED text still is.
- **The `--fix` summary counts problems, not edits.** "fixed N problem(s)"
  added up fix SPANS, and one `crlf-line-ending` finding carries a span per
  line: a CRLF class with nine fixable findings said "would fix 45
  problem(s)" under a dry-run list of nine. Both counts are findings now;
  `applyFixes( )` returns the deferred ones as `deferredFindings`
  (additive).

- **`--watch` no longer loses a save made during its first run.** The
  watchers were set up after the first run, which with the render gate is
  seconds of browser launch and UI5 boot: a file saved in that window, after
  the run had collected its files, was never seen, and the loop kept
  reporting the old state until the next save. The watchers now exist
  before the first run, and a change during it is one more run after it.
  The watch/render test in `test/review/watch.mjs` raced the same window
  and failed on a loaded machine.

- **An output file that cannot be written is exit 2, and the report still
  arrives whole.** `--sarif-out` / `--json-out` into a path that cannot be
  created threw out of the run - a stack trace and exit 1, the findings
  code, on a clean run - and so did `--update-baseline`; a badge that could
  not be written exited through `process.exit(2)` after the report had been
  printed, which cut a piped report off at the pipe buffer again. Each is
  one line on stderr and exit 2 now, and the files written beside the report
  set the exit code instead of exiting.

- **The render gate works under pnpm, and no longer hangs when it cannot.**
  The resource server served "the folder `@openui5/sap.ui.core` is in", which
  in a flat npm tree holds every library and under pnpm holds sap.ui.core
  alone - so the bootstrap waited for `sap.m` forever and the run never
  ended. Every `@openui5` package of the runtime is now resolved on its own,
  and both waits are bounded (`openRenderer({ bootTimeout, renderTimeout })`,
  90 s and 60 s): a UI5 that does not boot is `ERR_RENDER_RUNTIME_BROKEN`
  naming what the page logged, a document that does not finish rendering is
  its own render error and its page is reloaded.
- **The render runtime is also found in the project the run starts in.**
  `npx --yes @abap2ui5/linter src` in a repository with
  `@abap2ui5/linter-render` as a devDependency said "12 of 12 packages
  missing", and a global linter with a local runtime exited 2 under
  `--render`: the runtime was looked for next to the linter only. It is now
  looked for there first and in `process.cwd( )` second.
- **A Chromium that will not start is a missing runtime, not a crash.** With
  `@abap2ui5/linter-render` installed and `npx playwright install chromium`
  skipped, the run ended in Playwright's `browserType.launch: Executable
  doesn't exist` banner, a stack trace and exit 1 - the code for findings.
  Now it is one sentence (`ERR_RENDER_BROWSER_MISSING`, the fix named) and
  exit 2 where the gate was asked for (`--render`, `"render": true`), and the
  property gate alone with a notice where the gate was only left on - what a
  missing runtime package already got. `openRenderer` also closes the HTTP
  server it had started when the launch fails; it used to keep the process
  alive.
- **A render runtime of another UI5 release than the snapshot is named.**
  The property gate judges against the snapshot (1.152), the render gate
  against the runtime; `@abap2ui5/render-runtime` 0.1-0.6 serve 1.151, and a
  1.152 member then failed view creation as "unknown setting" - a render
  error that read like a broken view. The CLI now says so on stderr before
  the run (`runtimeSnapshotMismatch( )` in `./render`).

- **A baseline only speaks for the files a run linted.** Every entry no
  finding matched was STALE, whether or not its file was part of the run:
  after `--update-baseline` over `src` (57 entries), linting one file with
  `--baseline` reported "56 STALE entries" and exited 1 - also under
  `--advisory`, whose help promises exit 0, and under `--stdin`. Now only an
  entry of a file the run looked at can be stale - one it linted, or one
  under a path it walked that it no longer collects (a class that stopped
  building a view cannot have a finding, so its entries are stale like a
  deleted file's) - or of a file that is gone from disk (nothing will ever
  match it again). `--update-baseline` on one file replaced the whole
  baseline with that file's entries; it now replaces the entries of the
  files the run looked at and keeps the others, dropping those of deleted
  files. `--advisory` / `--fail-on never` report stale entries and exit 0.
  `--json` carries an additive `baseline` block (`file`, `suppressed`,
  `byRule`, `stale: [{ key, count }]`), so a document saying `failing: 0`
  next to exit 1 names the reason. `updateBaseline( )` and `keyFile( )` are
  new in `./baseline`; `applyBaseline( )` and `updateBaseline( )` take
  `{ scope }`, the paths the run walked.

- **`--fix` no longer deletes a namespace a helper still uses.**
  `unused-namespace-declaration` judged the reconstructed view as if it were
  the whole view. abap2UI5's own `z2ui5_cl_ui5_app_start` declares
  `xmlns:form` for the SimpleForm its `create_layout_form( )` helper adds - a
  RETURNING helper whose result is assigned, which the reconstructor does not
  follow - and without its waiver comments the finding came with a deleting
  fix that broke the view. The rule now stands down for a class whose
  reconstruction is known incomplete (a builder call it could not place,
  `unplacedTokens` on `prepareAbap( )` - `helperTokens` without a mere second
  `stringify( )` of a finished view), and for a prefix the class writes in
  more builder literals (`ns = \`form\``, `\`form:X\``, `n = \`core:require\``)
  than its documents carry. A prefix written nowhere is still reported. A
  waiver of the rule where it stood down is unjudged, not `unused-directive`
  (`applyDirectives( … { stoodDown })`): the rule did not judge that class,
  and app_start's own waiver would otherwise have been reported as "remove
  the directive" on every run over abap2UI5.

- **New rule `malformed-xml` (error).** A raw `*.view.xml` /
  `*.fragment.xml` with a duplicate attribute, a `</contnt>` for `<content>`
  and no closing root tag passed `--no-render` with "Success!" and exit 0:
  the XML reader behind the property gate is lenient on purpose, and nothing
  asked whether the document was well-formed - which the browser's parser
  decides before UI5 sees a control, refusing the whole view. `parseXml( )`
  now records mismatched, unclosed and stray closing tags and duplicate
  attributes as `root.malformed` (tags inside CDATA and comments are text),
  and `checkNodes( )` reports each once, so the VS Code extension's and
  mcp-server's self-assembled pipelines get it too. The tree the other rules
  judge is built exactly as before.
- **A CDATA section in a raw view is character data, to its `]]>`.** The XML
  reader skipped comments but read a CDATA section as markup: a `<Txt>` in
  one became an element (and an `unknown-control`), and a `<!--` in one -
  script text testing for `"<!--"` - opened a comment that swallowed the
  real tags behind the section up to the next `-->`, so a view xmllint
  accepts was three `malformed-xml` errors and the elements after the
  section were never judged. Unchanged on the 1,390 `*.view.xml` /
  `*.fragment.xml` files of the OpenUI5 samples and the corpora.

- **`unused-directive` no longer names a waiver for a rule that did not
  run.** Under `--no-properties`, or with the rule switched off or excluded
  in the `rules` block, a directive for it suppressed nothing because nothing
  was judged - and the hint told the author to delete the waiver the full
  run needs. Such an id is now unjudged rather than unused. `applyDirectives(
  … { ran })` takes the caller's answer (the entry points pass "not a
  property-walk rule" when the property gate is off - `WALK_ONLY_RULES` in
  `./properties`, gated against the emit sites), and `ruleRuns( )` in
  `./findings` is the `rules` block's.
- **A bare directive is not called unused by a run without the property
  gate either.** Under `--no-properties` a directive with no id (so: every
  rule) over a line whose only finding is a property-walk one still read
  "suppressed nothing … remove the directive". It is unjudged whenever the
  run left a gate out (`parseDirectives( … { gatesRan })`); a rule the
  `rules` block switched off does not make it so, since the config speaks
  for every run of the repository.
- **`ignore` and the render gate's `exclude` mean the same thing however
  the run is started.** abap2UI5/linter#35 made a `rules[id].exclude` pattern
  match every spelling of a path - the absolute one a config's `paths`
  produce and the relative one `abap2ui5lint src` does. `ignore` and
  `rules['render-error'].exclude` kept testing the path only as it was
  reached, so abap2UI5's own `"ignore": ["/src/99/"]` dropped the frozen
  package from `abap2ui5lint` and not from `abap2ui5lint src`, where its 17
  classes came back with 86 findings and exit 1, and a render-error waiver
  written the same way waived nothing. All three go through one matcher now
  (`pathMatches( )` in `./findings`).
- **`--cache` no longer replays a render verdict of another runtime.** The
  cache key held the linter version, the snapshot and the settings, but not
  the UI5 release `@abap2ui5/linter-render` serves - which moves on its own,
  and is exactly what the runtime-mismatch notice above tells a reader to
  upgrade. The run after `npm i -D @abap2ui5/linter-render@latest` replayed
  the old runtime's render errors. A rendering run's cache is now keyed by
  that release too; a property-only run's is not, and survives the upgrade.
- **`--format markdown` keeps the tags its messages quote.** A table cell
  passed a message through as raw HTML, and GitHub's sanitizer drops an
  element it does not know: in a PR comment or a job summary
  `<Page> carries the attribute title twice` read " carries the attribute
  title twice", `close <content> with </content>` read "close  with ", and
  `<mvc:View>` became a link to `mvc:View`. `&`, `<` and `>` are escaped as
  entities now.
- **`--format sarif` writes each location as a URI.** abapGit names a
  namespaced object's file with `#` for its namespace slashes
  (`#abc#cl_app.clas.abap`), and SARIF's `artifactLocation.uri` is a URI
  reference, where `#` starts the fragment: the location named `src/`, and
  code scanning had no file to put the alert on. A blank in a path was no
  URI character either. Every segment is percent-encoded now.
- **A `--no-render` run over a corpus is about a quarter faster.** Every
  reader of DATA/TYPES/CONSTANTS declarations split the whole class into
  statements again - three `parseData( )` and four `staticAttributes( )`
  splits per class, over the same scrubbed source - which was 121 MB of
  splitting for the 12 MB of samples-controls' 642 classes and a quarter of
  the run. `splitStatements( )` is memoized like `scrub( )` (its shared
  result frozen), and the run went from ~13 s to ~10 s with byte-identical
  findings over samples-controls and abap2UI5.
- **A byte-order mark no longer breaks the config or the baseline.** A file
  saved by Notepad or PowerShell's `Out-File` started with U+FEFF and failed
  as "Unexpected token"; it is stripped before parsing - also from the
  preview data `--screenshot-model` names and from the `<class>.mock.json`
  the screenshot reads by convention.
- **`--init` writes a `$schema` the new file can reach.** It was always
  `./node_modules/@abap2ui5/linter/…`, wrong in a monorepo package and
  pointing at nothing under `npx` or a global install. It is now the relative
  path to the nearest `node_modules/@abap2ui5/linter` that is the running
  linter, and otherwise the published schema of exactly this version
  (`https://unpkg.com/@abap2ui5/linter@<version>/…`) - also where npx's own
  copy sits below the new file (`--init` in the home directory, or with
  npm's cache inside the project): a path into a cache is none to commit.
- **`--init` no longer shadows an `abap2ui5lint.json`.** Discovery reads
  `abap2ui5lint.jsonc` before `abap2ui5lint.json`, and `--init` only checked
  for the first: beside an existing `.json` it wrote a fresh `.jsonc`, which
  from then on silently won (a repository with `"failOn": "never"` went from
  exit 0 to exit 1). It refuses beside either spelling now.
- **A missing `extends` target says so.** It was reported as "no such file -
  check the --config path", also when no `--config` was given; the message
  now names the `extends` value and where it was looked for, and a directory
  is named as one.
- **`scripts/generate-metadata.mjs` finds the sources where they are
  installed.** The shipped generator looked in
  `<linter>/node_modules/@openui5` only, which a consumer's tree never has (npm
  hoists above it, pnpm keeps them beside `@abap2ui5/linter-render`). It now
  also resolves each package through `@abap2ui5/linter-render`, through its
  own package and through the current directory.

- **The `@abap2ui5/linter-render` peer range starts at its first
  published line.** `>=0.7.0 <0.9.0` named a 0.7.0 the registry never had -
  the name starts at 0.8.0; 0.7.0 is the last `@abap2ui5/render-runtime`.
  `FLOOR` in `scripts/peer-range.mjs` is 0.8.0 and the range
  `>=0.8.0 <0.9.0`. The legacy `@abap2ui5/render-runtime` range stays
  `>=0.1.0 <0.8.0` on purpose: its 0.1-0.6 lines serve UI5 1.151 against the
  1.152 snapshot, but narrowing an optional peer is an ERESOLVE for every
  project still on them, so the version gap is named on stderr instead (see
  above).

- **The docs no longer send `npx` to an unregistered name.** The issue
  templates asked for `npx abap2ui5lint --version`; `abap2ui5lint` is the
  command the package installs, not a package on npm, so outside a project
  that installed it npx would download whatever someone publishes under that
  name. Where an install is implied (the README's "stay green" block, the
  release smoke test, the rules page, the templates) it is now
  `npx --no-install abap2ui5lint`, and where none is, the scoped
  `npx @abap2ui5/linter`. AGENTS.md now records samples-controls' npm
  dependency as it is (`^0.8.3`, no longer a `^0.5.1` git dependency).

## 0.8.3 - 2026-09-28

- **A variable of a type the class does not declare no longer renders as
  `''`.** A bound variable typed by a DDIC type or by a type another class
  owns (`zcl_x=>ty_t_token`) was mocked as the empty string of a string in
  the render model, whatever it really is - and strict validation rejects
  `''` on every property that is not a string. abap2UI5-addons/popups
  `z2ui5_cl_popup_sample_19` binds `MultiInputExt` `addedTokens` to a
  `z2ui5_cl_popup_context=>ty_t_token` table and failed view creation with
  `"" is of type string, expected object`, excused by file in its
  `render-error` exclude. Without a seed such a variable is now left out of
  the render model and the control keeps its default, the rule unseeded
  fields already follow. A seed still reaches it, built-in and local types
  keep their initial value, and the shape the property gate asks about is
  unchanged: the variable stays marked unknown, so no path below it is
  judged.

  Rollout: measured with this checkout substituted into every consumer
  (render gate on where the consumer has it): no finding and no verdict
  changes on samples, samples-stack, samples-controls (622 ports), popups,
  se16n, layout-management, lock-manager, selection-screen, sql-console,
  table-content-loader, table-maintenance, custom-controls, rap-ext,
  app-template, abap2UI5 and playground. popups sample_19 renders clean, so
  its exclude can go with the next bump.

## 0.8.2 - 2026-09-27

- **New rule `obsolete-custom-control` (error).** abap2UI5 marks eight of
  its companion controls `// OBSOLETE: replaced by …` in
  `app/webapp/cc/*.js`, and they must never be used: `Timer`
  (`client->follow_up_action( val = client->cs_event-start_timer … )`),
  `Focus` (`cs_event-set_focus`), `Scrolling` (`cs_event-scroll_to` /
  `cs_event-scroll_into_view`), `Title` (`cs_event-set_title`), `LPTitle`
  (`cs_event-set_title_launchpad`), `Favicon` (`cs_event-set_favicon`),
  `Info` (`client->get( )-s_device` / `-s_ui5`) and `History`
  (`client->hash_set( )` / `client->app_state_set_active( )`). The finding
  names the replacement. Three spellings are read: the builder tag
  (``tag( n = `Timer` ns = `z2ui5` )``), an XML view or fragment
  (`<z2ui5:Timer/>`) - both judged by the namespace the prefix is bound to,
  so any prefix bound to `z2ui5.cc` is reported and `sap.m.Title` or
  `core:Title` never is - and the frozen builder's helpers
  (`_z2ui5( )->timer( )`, `->focus( )`, `->scrolling( )`, `->title( )`,
  `->lp_title( )`, `->favicon( )`, `->info_frontend( )`, `->history( )`,
  also through a handle assigned from `_z2ui5( )`), which a class on
  `z2ui5_cl_xml_view` now gets beside `frozen-view-builder`. The live
  companion controls (`Storage`, `MessageManager`, `MultiInputExt`, `Dirty`,
  `Geolocation`, `CameraPicture`, …) are not reported. No `--fix`: the
  replacement moves the job from the view into the class. An error by
  project decision - the view still renders. A consumer that assembles the
  frozen-builder branch itself (the VS Code extension's gate) reaches the
  helper half as `obsoleteCcHelperFindings( )` from `./abap-rules`.

  Rollout: measured on origin/main, 0 findings on samples, samples-stack,
  popups, sql-console, table-maintenance, config-management and app-template;
  1 on samples-controls (`src/04/z2ui5_cl_smpc_demo_004`, the carousel Timer
  its open branch replaces with `cs_event-start_timer` - its
  `abap2ui5lint-apps.jsonc` gate turns red on a bump that lands before that
  branch; the view-gates corpus job does not judge `src/04` and stays green);
  on abap2UI5, 1 in `src/99/02/z2ui5_cl_pop_file_dl` without its config and
  0 with it, since its `abap2ui5lint.jsonc` does not collect the frozen
  `src/99` at all.
- **The render gate mirrors the eight obsolete companion controls.** A view
  naming `<z2ui5:Timer>` failed view CREATION with a module 404 - a
  `render-error` that read like a broken view (samples-controls' demo_004
  had it excused by file) for a control every installation still ships.
  The harness boots a mirror of each now, so the rule above is the one
  message. `lib/cc-controls.mjs` carries the list as an `obsolete` block per
  entry, and `scripts/check-upstream.mjs` gates it three ways: the marked set
  against the `// OBSOLETE:` headers of every `app/webapp/cc/*.js`, each
  header's API names against the replacement the finding writes, and each
  helper name against `src/99/z2ui5_cl_xml_view_cc`.
- `data/compat.json`: `framework.mirrored` is 1.145.0, the release every
  mirror was checked against in this change (`check-upstream --local`, all in
  sync).
- **No polynomial backtracking left in the ABAP scanners.** The 27 regexes
  CodeQL still flagged (js/polynomial-redos) - the structure, field,
  METHODS-signature and DATA-block reads and the `client->` and own-method
  call scans among them - are linear scans now; the findings over the
  abap2UI5 corpora are unchanged byte for byte.
- **No polynomial backtracking left outside them either.** The last 11
  js/polynomial-redos alerts on main are linear scans too: the raw XML view
  parser (`parseXml`'s tag and attribute reads - a tag that never closes was
  searched to the end of the view again from every `<` inside it), the
  property walk's binding reads (a simple `{/X}` path, the `path: '/X'` and
  `${/X}` paths of a binding info or an expression, an aggregation binding's
  path, the `core:require` aliases, the run summary's binding count), the
  ABAP Doc tag scan behind `abapdoc-html-tag`, the version parse of the
  property gate and the icon rules, and where a directive's comment ends.
  The output is unchanged byte for byte over the abap2UI5 corpora and over
  1,490 raw XML views, and CodeQL 2.27.1 run locally reports no
  js/polynomial-redos and nothing new.
- **The render gate mirrors InputExt, UploadSetExt and SmartMultiInputExt,
  and the property walk judges every mirrored companion control.** They were
  the three live companion controls with no mirror, so a view naming one
  failed view CREATION with a module 404 (abap2UI5/samples apps 516, 517 and
  530 and samples-stack app 319 excused it by file). InputExt is mirrored as
  what upstream makes it - a `sap.m.Input` with an `inputMode` property,
  rendered by `InputRenderer` - and the other two as the invisible Controls
  they are, which find their UploadSet / SmartMultiInput by id. The property
  walk used to look away from every `z2ui5.cc` tag; a companion control the
  linter mirrors is now judged like any control, its mirror layered over its
  real base class: `<z2ui5:InputExt inputmode="none">` is an
  `unknown-property` with the `inputMode` did-you-mean and fix, and an Input
  member newer than the floor on it is `member-too-new`, as on a
  `sap.m.Input`. A `z2ui5.cc` control nobody mirrors (a customer's own) is
  still not judged. `scripts/check-upstream.mjs` now also compares each
  mirror's events and base class with `app/webapp/cc/*.js`, and fails on a
  control upstream ships that is not mirrored at all - the one drift it could
  not see, and the reason these three stayed out. Measured: the
  property-gate output over eleven corpora is unchanged byte for byte;
  samples 516, 517 and 530 render clean, so their `render-error` exclusion
  now draws the stale-waiver note; samples-stack 319 still fails, now on the
  SAPUI5-only `sap.ui.comp` SmartMultiInput it pairs its companion with,
  which the OpenUI5 harness cannot serve, so its `/src/02/` exclusion stays.

## 0.8.1 - 2026-09-27

- **No polynomial backtracking in the ABAP scanners.** The event-CASE
  header, the METHODS/IMPORTING read, the call scan and the inline-structure
  collapse were regexes that rescan from every keyword or word on input
  without a closing period or match (CodeQL js/polynomial-redos). They are
  linear scans now; the findings over the abap2UI5 corpora are unchanged
  byte for byte.

- **`ignore` works on Windows.** A config's `ignore` patterns were matched
  against the walked path with the platform's separator, so `/generated/` -
  the spelling the README gives - dropped nothing on Windows and the ignored
  tree was checked after all. The path is now tried with forward slashes as
  well, the way a rule's `exclude` already was.

- **`unbound-public-attribute` lands on its declaration after a `TYPES`
  structure.** The PUBLIC SECTION was measured on a copy in which every
  `BEGIN OF … END OF` block had been collapsed to its name, so each
  attribute after such a block was reported a few lines early - in the
  comment above it, where a next-line directive suppresses nothing - and the
  rule's own "`TYPE REF TO` is out of scope" test read the wrong
  declaration: `DATA mo_x TYPE REF TO zcl_y` and `DATA mt_x TYPE REF TO data`
  after the block were reported. The collapse now blanks the block instead
  of cutting it, so the text keeps its offsets. `unused-public-attribute`
  reads the same walk and is corrected with it. abap2UI5's node/srv test
  apps and rap-ext carried the false findings (rap-ext: six of its seven
  baseline entries are `TYPE REF TO data` and are now stale).
- **A literal `b = abap_false` reconstructs as `"false"`.** Every
  `a( n = … b = … )` was rebuilt as `"true"`, so `enabled="false"` and
  `editable="false"` were invisible to the rules and a disabled Input fed by
  a literal was an `editable-control-without-binding` (samples-stack app
  484). The builder writes `false` for anything that is not `abap_true`, so
  `abap_false`, `space` and a blank literal now reconstruct as `"false"`;
  `abap_true` and every expression or variable stay `"true"` as before.
- **`handler-without-event` reads only the WHENs of a CASE over the event.**
  Every `WHEN \`X\`` counted as a handler - an operator switch
  (`CASE to_upper( s-operation ). WHEN \`EQ\`.`), a CASE over escape
  characters, a status switch nested in a handler, a `SWITCH #( … WHEN
  \`Phone\` THEN … )` arm (samples-stack apps 319 and 489, samples 004,
  025, 488 and 504, all 116 hits on samples-controls). A WHEN is a handler
  now only at the own level of a CASE whose subject is the event: the read
  itself, a variable assigned from it
  (`DATA(lv_event) = client->get( )-event.`), or a parameter of a method the
  class hands it to (`on_event_box( event )`).
  The CASE/ENDCASE scan behind it no longer counts the word CASE inside a
  literal, which ran the event CASE on into the next method. And three more
  raises are known: the `onclose` of `message_box_display( )` /
  `message_toast_display( )`, `"onClose":"X"` in their CONTROL_GLOBAL option
  object, and the event of a `cs_event-hash_attach_changed` listener (the
  last one like a timer's: unhandled, it is an `event-without-handler`).
- **`smart-variant-without-init` accepts `filter_bar_variant_init`.** The
  classic FilterBar's action registers the bar with the
  SmartVariantManagement and then calls its `initialise( )`, the same
  handshake - a class wiring it was reported for a handshake it makes
  (samples-stack app 493).
- **`frontend-action-as-backend-event` leaves a class's own `cs_event`
  alone.** An app declaring `CONSTANTS: BEGIN OF cs_event` for its backend
  event names had every `_event( cs_event-search )` reported as the client's
  frontend action, and `--fix` rewrote the wires to `follow_up_action( )`,
  which broke them (samples apps 000 and 496, 29 warnings on rap-ext). With
  an own declaration only a spelling through a client reference
  (`client->cs_event-…`, `z2ui5_if_client=>cs_event-…`) is judged; the bare,
  `me->` and own-class spellings are the app's constant.
- **The `unused-namespace-declaration` fix also removes the last
  declaration of a chain.** `)->a( n = \`xmlns:form\` v = \`…\` ).` carried
  no fix, because deleting its line took the statement's end with it - 54 of
  127 such findings in abap2UI5/samples. It is now cut out from the end of
  the line before, which then closes the chain (`… v = \`sap.ui.core.mvc\`
  ).`); two stale ones in a row at the end take a second `--fix` pass.
- **`missing-on-navigated-branch` no longer fires on a sub-app.** A method
  of the class NAMED `view_display( )` counted as the client's display call,
  so a sub-app that only builds into its parent's view (samples apps 105 and
  112 under 104) was told to add a navigated branch, and the fix added a
  redundant one. Only a display called ON an object (`client->…`,
  `mo_client->…`) counts now; an own method is followed into its body as
  before.

## 0.8.0 - 2026-09-27

- **The render runtime is `@abap2ui5/linter-render` now.** It was published
  as `@abap2ui5/render-runtime` up to 0.7.0, a name that read like the
  framework's runtime - `@abap2ui5/node-runtime`, abap2UI5 transpiled for
  Node, sits in the same scope. Same content, same pins, one tag with the
  linter as before: `npm i -D @abap2ui5/linter-render`. An existing install
  under the old name keeps working - the linter looks it up after the new
  one, and keeps it as an optional peer at the range of the lines it has
  (`>=0.1.0 <0.8.0`), so upgrading the linter is no ERESOLVE. Nothing is
  published under the old name any more.
- **`abap2ui5-lint` is the CLI's second name.** Every other command in the
  ecosystem is hyphenated (`abap2ui5-mcp`, `abap2ui5-unit`); `abap2ui5lint`
  stays, so no script or workflow has to change.

- **`unescaped-text-in-attribute` no longer reports a constant, a
  literal-fed helper parameter, or a property that cannot show text.**
  abap2UI5's own start app carried ten warnings under the rule, nine of them
  false: `a( n = \`size\` v = c_icon_size_header )` where the name is a
  `CONSTANTS … VALUE \`1.125rem\``, and `v = label` in a row helper every
  call of which passes a literal. A `CONSTANTS` (single, chained, or a
  component of a structured one) is a literal with a name, never data. An
  `IMPORTING` parameter of the class's own method is a literal when every
  call site in the class passes it a literal, a constant, an uninterpolated
  template or another such parameter (`render_samples( name = \`x\` )`
  handing `name` on as `text = name`) — judged per method AND parameter,
  because `text` is a parameter of more than one helper and only the method
  the `v = text` sits in says which. And where the snapshot is there, the
  rule stands down on a property no text can be shown in — `int`, `float`,
  `boolean`, `sap.ui.core.CSSSize`/`CSSColor`/`ID`/`URI`, an enum — resolved
  through the element literal nearest before the `a( )` call and the class's
  `xmlns` declarations; a wrong guess there can only make it stand down.
  The tenth warning was real and stays: `render_text( )`'s `v = text` is fed
  an interpolated template and a method result, and it had been hidden
  behind the first `text: text` finding, which the collector collapses
  repeats of.

- **`_bind_path( )` and `_event_nav_app_leave( )`** (abap2UI5's
  `z2ui5_if_client`, 2026-09-13) are known to the reconstructor and the
  rules. `_bind_path( x )` is `_bind( val = x path = abap_true )` and nothing
  else, so it reconstructs as the same bare path and every rule that reads
  a bound name (`binding-to-local`, `-nonpublic`, `-static`, `-reference`,
  `-expression`, `loop-work-area-bound`, `client-handle-capture`) reads it
  too; before, the attribute written from it was dropped from the
  reconstructed view with no finding. `_event_nav_app_leave( )` is a handler
  expression like `_event( )`: it reconstructs as one, closes a Dialog for
  `popup-without-close-wire`, is a handle for `client-handle-capture`, and
  raises no event a `WHEN` has to handle. The remedies of
  `hardcoded-binding-path` and `relative-aggregation-without-context` name
  `_bind_path( )` as the readable spelling of the bare path.

- **An app class whose view is built elsewhere is collected and judged.**
  A class with `INTERFACES z2ui5_if_app` and no factory call — the app whose
  view comes from a views class or a generator — was dropped by
  `collectFiles`, so `node cli.mjs zcl_app.clas.abap` answered `no checkable
  app classes` with exit 0 to a file it was handed by name. It is kept now,
  on a walk and when named, and judged by what needs no view: the
  source-side rules, and the ABAP-side rules that read the class itself —
  the `binding-to-*`, `obsolete-*` and `event-*` families,
  `private-app-attribute`, the lifecycle and flow rules
  (`VIEWLESS_APP_RULE` in `lib/index.mjs`). Nothing about the view it does
  not have is judged. The result carries `appWithoutView`, the run summary
  counts such classes apart (`appsWithoutView` in `stats`, "building none
  here" on the sources row), and a one-file report says so under the
  verdict, so a clean run on one is not read as an approved view.

- **The `separate-lifecycle-ifs` fix no longer folds "seed on init, display
  on navigated".** `IF check_on_init( ). mt_tab = … ENDIF. IF
  check_on_navigated( ). view_display( ). ENDIF.` became `IF … ELSEIF …`,
  after which the first roundtrip — init is true, and init implies
  navigated — displayed nothing. Where the init block displays nothing and
  the navigated block does, the finding stays and carries no fix; the
  guide's shape repeats the display in the init arm, which is a decision.
  The other pairs fold as before.

- **New rule `binding-to-static`** (error): a `_bind( )` / `_bind_path( )` on
  a `CONSTANTS` or a `CLASS-DATA`, in any section, a local `CONSTANTS`
  included. The model carries INSTANCE attributes only — the framework's
  `attri_search` filters on `is_class = abap_false AND is_constant =
  abap_false` — so the bind finds nothing and raises `BINDING_ERROR` on the
  first roundtrip, while the class compiles and the view reconstructs fine.
  `binding-to-nonpublic` stands down for a static root, because moving a
  constant to `PUBLIC` changes nothing.

- **`unconditional-popup-display` and `display-after-nav-app-call` follow
  helper methods.** Both matched only the written-out `client->popup_display(
  )` / `client->view_display( )`, and the corpus idiom is a method of the
  class that builds the view and hands it over. A call to a method of the
  class now counts as the display that method (or one it calls, a few levels
  deep) issues: a `popup_display( )` helper at the top level of `main( )`, and
  a `view_display( )` helper behind `nav_app_call( )` inside a handler, are
  reported at the call. Severities unchanged.

- **New rule `chain-unbalanced-parens`** (warning): a builder chain with one
  `)` too many (`… ) ) ).`) or one `(` never closed. A syntax error the class
  does not activate with — and the one defect that took this gate down
  without a word: the statement reader counts parentheses, a stray `)` left
  it at minus one, the chain's own `.` stopped being a statement end, and
  the class reconstructed no view and reported nothing. The scan behind the
  rule recovers at the stray paren and names its line. With it, a one-file
  run prints "N classes opened a builder and produced no view" whenever the
  count is non-zero — until now that line lived only in the run summary,
  which a single file does not print.
- **Five rules read out of the app guide and `z2ui5_if_client`'s ABAP Doc**
  (`lib/guide-rules.mjs`, a module of its own called from
  `checkAbapRules( )`; every one probed silent on 0.7.0, and every one
  measured at 0 findings on abap2UI5's own app classes before shipping).
  `frontend-action-as-backend-event` (warning, fixable): a `cs_event-`
  constant handed to `client->_event( )` in any spelling — a backend event
  named `POPUP_CLOSE` that reaches `main( )` and closes nothing, and the one
  dead wire `event-without-handler` cannot judge because the name is not a
  literal; `--fix` renames the call to `follow_up_action( val = … )`.
  `popup-display-xml` (error, fixable): the mirror of `popover-display-val`
  — the popup takes `val`, and `xml =` does not compile; `--fix` renames the
  parameter. `queue-last-without-no-busy` (hint, fixable): a `live*` wire
  whose `s_ctrl` sets `check_queue_last` without `check_no_busy`, so every
  keystroke landing on a roundtrip in flight raises the busy overlay over
  the very field being typed into; `--fix` writes the flag into the existing
  `VALUE #( )`. The per-keystroke test is `isLiveEvent( )` in
  `lib/abap-source.mjs` now, the same prefix `live-event-roundtrip` applies.
  `nest-view-without-destroy` (warning): a `nest_view_display( )` /
  `nest2_view_display( )` with no `method_destroy`, where every call adds
  one more fragment; fixable only for the three inserts the ABAP Doc names
  (`addContent`/`addItem`/`addPage` → `removeAllContent`/`removeAllItems`/
  `removeAllPages`), any other insert keeps the finding without a fix.
  `omit-initial-drops-false` (warning, no fix): `_bind( val = t
  omit_initial = abap_true )` on a table whose row declares an `abap_bool`
  that the template binds to a property defaulting to `true` — `abap_false`
  is itself initial, so the blanket flag drops exactly the value that had to
  arrive and the control shows its default; read off the same
  `boolFields` map `absent-boolean-overrides-default` uses (which stands down
  under `omit_initial`, so this is the rule that speaks there).
- **A directive is judged too.** `" abap2ui5lint-disable-next-line
  binding-to-locl` used to waive nothing and say nothing, so the finding it
  was written for stayed reported one line down and read as the linter
  ignoring the comment. Two rules now, both emitted from `applyDirectives`
  in `lib/findings.mjs`: `unknown-directive-rule` (warning) for an id no
  rule has, with the one did-you-mean `lib/suggest.mjs` makes and a `--fix`
  that rewrites the id (`render-error` gets its own sentence - a render
  failure has no source line, waive it per file with `rules['render-error']`),
  and `unused-directive` (hint) for a directive that suppressed nothing -
  ESLint's `--report-unused-disable-directives`, per id for a list, as a
  whole for a bare one, with a `--fix` that deletes a dead `-next-line` /
  `-line` directive (the line when the comment has it to itself, else the
  comment). Both answer to the `rules` block and to a directive like any
  other id; a bare directive cannot excuse its own finding, one that names
  `unused-directive` may. Two fixtures had carried a dead directive for a
  year (`non-released-api` never fired on them) - the new hint found both.
- **`missing-on-navigated-branch` sends the reader to a rename, not to a
  second branch.** "add `ELSEIF client->check_on_navigated( ). view_display( ).`"
  under an init branch that only displays produced the fork
  `redundant-init-display` then reports. The message and the card say what
  the app guide says: dispatch the display on `check_on_navigated( )`
  (`check_on_init( )` implies it, so the first start is covered), keep an
  init branch only for one-time seeding. `unknown-control`'s card shows a
  case typo (`Objectstatus` → `ObjectStatus`) instead of `Buton` → `Button`,
  which the linter never suggests (no edit distance), so the `--fix` badge
  on the card is honest. `excess-shut` says `end( )`, the verb the developer
  wrote, instead of the reconstructor's role name `shut( )`.
- **CLI.** `--fix-dry-run` lists what it would fix, one `path:line:col
  rule-id` per line, before the count (it used to print the count and then
  the findings that REMAIN). A stylish run prints `config: <path>` and, when
  the config's `ignore` dropped checkable files, `N files ignored by config`
  under the count line (never inside `--format json`/`markdown`, quiet
  under `--quiet`). The config error for an unknown rule id points at
  `abap2ui5lint --explain` and the rules page instead of a README table
  that no longer exists, and carries the did-you-mean. `--explain
  unknown-control <path>` says that `--explain` takes rule ids only
  (exit 2) instead of `no rule '<path>'`. The `--all-classes` summary reads
  `106 classes (2 app classes building a view, 104 helpers)` instead of
  calling the helpers app classes. `--help` says that `ignore` and the
  per-rule switches are config-only (`abap2ui5lint.jsonc`, `--init`).
- **Two one-line rule fixes.** `event-arg-single-row-table` cuts a long
  value between tokens with an ellipsis, never inside a backtick literal
  (it used to `slice(0, 40)` mid-literal). `lifecycle-is-initial` reads
  `IF client->check_on_event( \`GO\` ) IS NOT INITIAL.` too - the regex
  required empty parentheses.

## 0.7.0 - 2026-09-24

- **The linter judges against OpenUI5 1.152.0.** The render runtime's
  `@openui5/*` pins, `data/properties.json` and `data/icons.json` move
  together from 1.151.0 (RELEASING.md step 1c). A member released in 1.152 -
  `sap.ui.unified.DateTypeRange.ariaHasPopup`, `sap.f.HeroBanner` - exists
  now, where it was an `unknown-property` / `unknown-control` plus a failed
  render; a consumer that pins its runtime to the linter's metadata version
  (samples-controls' check-pins policy 5) can move to 1.152 with this
  release.

- **Two more false positives the samples-controls corpus turned up.**
  `association-unknown-id` no longer reports an id of the form
  `<known id>-<suffix>`: a control renders its internal parts under its own
  id plus a suffix, and port 565 labels its Popover by `master-title`, the
  title of `sap.m.Page` `master`, exactly as the demo kit original does.
  `column-cell-count-mismatch` no longer counts a row template whose cells
  are filled in exclusive `IF` / `CASE` branches: the reconstructor replays
  every branch, so port 570's edit and display templates (four cells each)
  came out as one template with eight. The replay now marks a held
  container filled inside a branch (`branched`), and the rule stands down on
  it. The other findings on that corpus were real and are fixed in the
  ports (samples-controls: wrong `labelFor` targets copied from the
  originals, template text through `v` instead of `t`), and the Downstream
  job now runs samples-controls' view gates with `VIEW_GATES_LINTER=next`, so
  that repository judges this unreleased linter against a budget recorded for
  it rather than against the one its pinned release keeps.

- **`bound-aggregation-without-template` no longer reports
  `sap.ui.table.Table`'s `rows`.** That aggregation is bound without a
  template by design: the table builds its rows from each column's
  `template`, and UI5 sets `_doesNotRequireFactory` on it so
  `bindAggregation` skips the "Missing template or factory function" check.
  The rule did not know the flag, and reported four samples-controls ports
  (115, 137, 164, 174) that load and render fine — which is what kept the
  Downstream `samples-controls corpus` job red on main. The same exemption
  covers every aggregation UI5 marks that way (`sap.ui.core.util.Export.rows`,
  `sap.gantt.GanttChartBase.rows`/`relationships`,
  `sap.suite.ui.microchart.LineMicroChartLine.points`,
  `sap.viz.ui5.data.FlattenedDataset.data`), and through inheritance
  `TreeTable` and `AnalyticalTable`. The flag is set in code after the class
  is defined, so the metadata snapshot does not carry it; the list sits next
  to the rule in `lib/properties.mjs`.

- **The mirrors follow abap2UI5's 2026-09-22 removals
  (abap2UI5/abap2UI5#2776, #2777).** `check-upstream` was red against
  abap2UI5 main, and with it abap2UI5's own `check_gates`. Every entry here
  was a name that no longer exists upstream, which is the worse direction of
  drift: the linter passed a wire or a call that now does nothing, or does
  not compile.
  - The dispatch table loses `KEYBOARD_SET_MODE` (the `inputmode` action,
    replaced by `z2ui5.cc.InputExt`'s bound property, so `INPUT_MODES` and
    its `invalid-action-payload` / `ACTION_ID_SLOTS` entries go with it),
    `IMAGE_EDITOR_POPUP_CLOSE` and `Z2UI5` (removed with the `z2ui5` global).
    A literal naming one is an `unknown-frontend-action` now.
  - `FRONTEND_EVENT_ALIASES` loses the five `*_NAV_CONTAINER_TO` names: the
    constants are gone from `cs_event`, and so is the server remap into a
    `CONTROL_BY_ID` `to` wire. `POPUP_CLOSE` / `POPOVER_CLOSE` stay.
  - `lib/released-api.mjs` loses the released structure `z2ui5_t_02`
    (nothing in the ecosystem named it; it falls into the `z2ui5_t_` table
    family now) and the frozen `z2ui5_cl_pop_js_loader`.
  - **`obsolete-event-constant` is withdrawn before it was ever released.**
    It judged the run under the `"obsolete` label of `cs_event`, and
    abap2UI5 removed every constant of that run, and the label, three days
    after the rule landed. A class naming one no longer compiles, which
    abaplint reports, and a rule that cannot fire is one this suite rejects
    (every rule has to fire somewhere, every example has to fire its rule).
    No released version carried it, so no configuration can name it.
  - `test/fixtures/cs_event.intf.abap` is re-synced with the interface.

- **The windows-latest leg of CI is green again.** Both `--watch` sections
  failed there from the day the flag landed, on their last assertion each:
  *"Ctrl+C ends the watch with exit 0 (got SIGINT)"*. Not a defect in the loop
  - every other assertion in those sections passes on Windows, so the first
  run, the re-run on a new file, the re-read config, the survived broken
  config and the reused browser are all covered there. It is that a PARENT
  PROCESS cannot ask for a Ctrl+C on Windows: `subprocess.kill()` ends the
  target with TerminateProcess whatever signal name it is given, so the
  child never reaches its handler and the exit event carries
  `{ code: null, signal: 'SIGINT' }`. (A real Ctrl+C in a console does reach
  a Node process there - the runtime synthesizes SIGINT from the console
  control handler - which no test can generate from outside.) The exit code
  is asserted where it can be asked for, and the half that holds everywhere -
  the loop ENDS rather than hanging on the watcher handles it keeps open - on
  every platform. Nothing about the product changed.

- **`redundant-serializable`** (a hint, fixable): a class that declares
  `INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`.
  `z2ui5_if_app` includes it - the framework persists the app instance with
  `CALL TRANSFORMATION id` between roundtrips, so an app that cannot be
  serialized is not an app - and the second declaration compiles and changes
  nothing. What it costs is the reading: an app class is the most copied piece
  of ABAP in this ecosystem, and the extra line says that serialization is
  something an app has to ask for, so the next class carries it too. The names
  are read out of the INTERFACES STATEMENTS rather than with the usual
  `INTERFACES z2ui5_if_app` guard, which does not see the chained
  `INTERFACES: if_serializable_object, z2ui5_if_app.` - the shape that carries
  the redundancy most often. `--fix` deletes the line where it is a statement
  of its own; the chained form is reported without one, since deleting a name
  out of it would leave a dangling comma.

- **Three more rules, and `live-event-roundtrip` learns the framework's own
  remedy.** `second-root` (an error: a second element at the document's top
  level — the split chain after a standalone `factory( ).`, whose variable
  holds the root so the next statement adds a sibling of the `mvc:View`;
  the render gate rejected the document as native HTML, the property gate
  never said why), `message-box-removed-parameter` (an error: the pure UI5
  options abap2UI5#2748 took off `message_box_display( )` and
  `message_toast_display( )` — a call naming one does not compile on a
  current pin; no fix, the value moves into the CONTROL_GLOBAL option
  object), `smart-variant-without-init` (a warning: a SmartVariantManagement
  in the view and no `cs_event-smart_variant_init` wire in the class —
  saving a variant fails inside sap.ui.fl with nothing red). And
  `live-event-roundtrip` judges every `live*` event now, is silent for a
  wire carrying `s_ctrl-check_queue_last`, and carries a `--fix` that
  writes that flag with `check_no_busy` (a positional event name becomes
  `val = …` to make room).

- **Four more abap2UI5-specific rules.** `loop-work-area-bound` (a
  `_bind( )` on the work area of a `LOOP AT` — an attribute work area binds
  ONE path for every row, a local or a field symbol a path the model never
  carries; a warning, with a `--fix` for the ASSIGNING shape into the
  framework's own cell binding `tab = … tab_index = sy-tabix`, and only
  while nothing between the loop header and the call has moved `sy-tabix`),
  `bound-aggregation-without-template` (an error: `bindAggregation` throws
  "Missing template or factory function" and the whole view fails to load),
  `unknown-source-property` (the `$source>/name` twin of
  `unknown-event-parameter` — the reconstructor now records `sourceParams`
  beside `eventParams`; a hint with a did-you-mean), and
  `editable-control-without-binding` (an Input, CheckBox, Switch, Select …
  whose value property is neither bound nor read back by an event — a hint,
  judged per family through `INPUT_FAMILIES` in `properties.mjs`; a control
  disabled or read-only by a literal stays out). Measured on abap2UI5's own
  app classes and on app-template: 0 findings for all four.

- **Six more fixes.** `client-handle-capture` inlines the call where the
  captured name is read exactly once as an attribute value, and deletes the
  capturing statement; `missing-view-display-on-navigated` copies the init
  branch's single display statement into the navigated branch (the same
  scanner `missing-on-navigated-branch` uses, shared now as
  `singleDisplayStatement( )`); `unknown-binding-path` carries a did-you-mean
  and a fix where the missing segment is a field of that level up to letter
  case (`pathProblem( )` names the segment and the keys it was judged
  against; `pathFinding( )` turns that into the pair, and the finding itself
  carries no key list); `excess-shut` deletes the `->end( )` it sits on;
  `insecure-asset-url` rewrites a LOADED uri to `https://` (the `href` hint
  keeps its finding); and `loop-work-area-bound` as above.

- **Four abap2UI5-specific rules, and the split that produced them.** The
  linter keeps the checks about an abap2UI5 app and its view; rules about
  ABAP as a language go to abaplint (abap2UI5's `backlog/ABAPLINT.md` carries
  the stock — nine items filed there in the same round, each measured on
  abaplint 2.120.52 first). What was left for here:
  `handler-without-event` (the inverse of `event-without-handler`: a `WHEN`
  nothing raises — a hint, judged only when every raise and every handler is
  a literal, the class raises at least one event itself and never hands its
  client to another object), `binding-to-expression` (a `_bind( )` on a
  literal, a method call or a constructor expression — the framework derives
  the path from the ATTRIBUTE it is handed, and a temporary is found nowhere;
  an error), `association-unknown-id` (the other half of
  `binding-on-association`: a `labelFor` / `initialFocus` / `ariaLabelledBy`
  naming an id no control of the document declares, judged only when every
  id in it is a literal), `column-cell-count-mismatch` (a `ColumnListItem`
  with a different number of cells than its `sap.m.Table` has columns —
  mapped by index, rendered shifted, nothing logged). Measured on abap2UI5's
  own classes and on app-template before shipping: 0 findings for all four.
  A fifth, `obsolete-event-constant`, was withdrawn before release — see the
  entry on the 2026-09-22 removals above.

- **Six fixes on rules that had none, each mechanical or absent.**
  `missing-on-navigated-branch` writes the `ELSEIF client->check_on_navigated( ).`
  branch with a copy of the init branch's own display statement — only when
  that branch has exactly one statement at its level that displays;
  `separate-lifecycle-ifs` folds ADJACENT blocks into one `ELSEIF` chain (a
  block with an `ELSE`, or statements between two blocks, keeps the finding);
  `binding-to-nonpublic` and `private-app-attribute` MOVE the single-line
  declaration into the section the remedy names (`private-app-attribute`
  renames `PRIVATE SECTION.` outright where the class has no PROTECTED one),
  a chained `DATA:` element keeping the finding; `hardcoded-binding-path`
  rewrites a value that IS the literal `{/NAME}` of a public attribute to
  `client->_bind( name )`; `external-link-without-target` writes the
  `target` call behind the href's own, on a line of its own in the house
  layout. Moving a declaration is the first fix made of two spans (a delete
  and an insert) — `fix.mjs` applies them like any other non-overlapping
  pair.

- **Did-you-mean on the five closed sets that had none.** `unknown-model`
  (`Device>` for `device>`), `uncurated-formatter`, `unknown-view-slot`
  (`main` for `MAIN`), `unknown-frontend-action` (`set_title` for
  `SET_TITLE`) and the filter-row operator of `invalid-frontend-action`
  (`contains` for `Contains` — the set is case-sensitive upstream, and the
  miss leaves the binding unfiltered) now carry `written`/`suggestion` where
  the written name is a member of the set up to letter case, and
  `attachSuggestionFixes` turns that into the fix. No edit distance, as
  before: a case miss is not a guess. `unknown-view-slot` and
  `invalid-frontend-action` carry the fix without joining `FIXABLE`: their
  card examples (`NESTED`, a wrong global target) are the lesson and are not
  case misses, and a card must not promise a fix its own example declines.

- **New rule `event-arg-single-row-table`** — a `client->_event( )` whose
  `t_arg` is a `VALUE #( ( x ) )` with ONE row, where `arg = x` says the same
  thing. The client folds `arg` into the same `string_table`, so the wire and
  the handler's `get_event_arg( )` are byte for byte unchanged; the single
  argument is what most wires carry (a row key, a `${$source>/…}`, one event
  parameter) and there the table constructor is longer than the value inside
  it. A hint with a `--fix`: the `t_arg = VALUE #( ( x ) )` span becomes
  `arg = x` in place, so a two-line call collapses onto its first line and the
  continuation keeps its column. From two rows on `t_arg` is the right
  parameter and the rule is silent, as it is when both spellings are passed
  (the documented composition appends `arg` behind the rows, so the call sends
  one more argument, not the same one) and on a row containing a `#`: `arg` is
  generic (`TYPE clike`), so a `CONV #( )` or nested `VALUE #( )` has no type
  to derive `#` from and the remedy would not compile. Only
  `client->_event( )` is judged — `_event_client( )` and `follow_up_action( )`
  are frontend actions and have no `arg` parameter at all. Measured on the
  corpora: 17 findings in abap2UI5/samples, 9 in samples-stack, 1 in
  samples-controls, all of them hints, so no gate changes colour.

- **`CLIPBOARD_APP_STATE` and `WIZARD_SET_NEXT_STEP` are gone from the
  dispatch table, because they are gone from abap2UI5.** Both constants and
  both frontend handlers were removed upstream
  (abap2UI5/abap2UI5#2752), so a wire naming either reaches
  `handlers[args[0]]`, finds nothing and does nothing — not even a console
  line, which is what makes an unknown action the quietest miss there is. The
  mirror kept accepting them, so the linter was telling app authors that a
  dead wire was fine. `WIZARD_SET_NEXT_STEP`'s three `ACTION_ID_SLOTS` entries
  go with it; the multi-slot path they covered is asserted through
  `SMART_VARIANT_INIT` now, and a literal `WIZARD_SET_NEXT_STEP` is an
  `unknown-frontend-action` like any other retired name. Migration, which the
  framework's own deprecations page carries: the wizard pair is two
  `CONTROL_BY_ID` calls (`discardProgress` then `setNextStep`, and `goToStep`
  is reachable that way too, which the bundled event could not express), and
  the share link is `app_state_get_href( )` + `CLIPBOARD_COPY`, which hands
  the string to ABAP instead of only to the clipboard.
  `test/fixtures/cs_event.intf.abap` is re-synced with the interface, which
  also drops the three obsolete URL-API alias constants; `SERVER_EVENTS` is
  unchanged, since `SET_NAV_ROUTING` / `SET_PUSH_STATE` /
  `SET_APP_STATE_ACTIVE` are still live wire values — the `hash_*` /
  `app_state_*` constants that replaced those names kept them.

- **An XML view writes the enum KEY, and `invalid-property-value` judged the
  VALUE — which is the spelling that breaks.** A UI5 enum is a
  `{ Key: "Value" }` map, and for 227 of the snapshot's 235 the two are the
  same string, which is why this stood for a year. For the eight where they
  differ the spellings are not interchangeable, and which one is right depends
  on how the value reaches the control: `XMLTemplateProcessor` puts an
  attribute through `parseValue( )` (key → value) *before* `isValid( )`, while
  a setter or a binding goes to `validateProperty` and `isValid( )` alone —
  and `isValid( )` is keyed by VALUE (`DataType.createEnumType`:
  `mValues[sValue] = sName`). So the gate had it exactly backwards: it rejected
  `intervalType="OneMonth"`, which the demo kit has shipped for years, and
  accepted `"One Month"`, which parses to `undefined`, logs an error and leaves
  the property at its default. The property gate judges views, so it judges
  keys now; the two ABAP-side checks that read the enum table (an
  `INVISIBLE_MESSAGE.announce` mode, a `setSticky` payload) judge arguments
  that reach a *setter* and stay on the values. Writing the value form is
  reported with its own message — the reason, not just "not a valid value",
  because the API reference is where its author read that string — and with a
  `--fix` that rewrites it into the key. The snapshot gained an additive
  `enumKeys` section for it (`{ "<value>": "<key>" }`, only where they differ);
  a snapshot without it judges every enum as before. The eight:
  `CalendarIntervalType` and `PlanningCalendarBuiltInView` (`OneMonth` =
  "One Month"), `sap.m`/`sap.tnt` `IllustratedMessageType` (`NoData` =
  "sapIllus-NoData"), `FileUploaderHttpRequestMethod` (`Post` = "POST"),
  `LightBoxLoadingStates`, `SharedDomRef`, `BackgroundHelper`. Measured: 0
  findings across the samples-controls (642 files) and samples (159) corpora,
  before and after — this direction only removes false positives, and neither
  corpus writes a value form. Found downstream rebuilding the Team Calendar
  demo app (abap2UI5/samples-controls `z2ui5_cl_smpc_demo_003`), where the
  correct spelling had to be waived with a disable comment.

- **The companion-control mirror carries all eleven controls a view can name,
  not two.** The render harness boots metadata mirrors of abap2UI5's bundled
  `cc/*.js` controls, and it held `MultiInputExt` and `MessageManager` — so a
  view naming any of the other nine failed view CREATION on a control that
  exists in every real installation. Found downstream, on the shape it is
  easiest to find it: abap2UI5/samples-controls' Shopping Cart demo app keeps
  its cart in browser storage the way abap2UI5/samples app 327 documents, with
  `<z2ui5:Storage>` reading the key back, and the render gate answered
  `failed to load 'z2ui5/cc/Storage.js'`. Added: `CameraPicture`,
  `CameraSelector`, `Dirty`, `FileUploader`, `Geolocation`, `Storage`, `Tree`,
  `UITableExt`, `Websocket`. An entry may now carry `base` — the module the
  mirror extends, default `sap/ui/core/Control` — because `CameraSelector`
  extends `sap.m.ComboBox` and the aggregation rules judge it by that type.
  `check-upstream` compares the properties of the names it finds in the file,
  so a control that was never mirrored is the one drift it cannot see; the
  file says so now, next to the list.

- **`a( t = … )` is read, and a value carrying data on `v =` is a finding.**
  abap2UI5's view builder takes text through a third parameter now: `t` applies
  `escape_literal( )` to the whole value, so a brace or backslash in it is
  shown instead of parsed as a binding. The reconstructor read `t` as an
  "unparsed attribute call" and dropped the attribute with nothing but a note;
  it resolves like `v` now and is escaped the way the class escapes it
  (`escapeLiteral( )` from `./reconstruct`), and an id written through `t`
  counts as the class's id for the wire rules. The new rule
  `unescaped-text-in-attribute` (warning, fixable) reports a `v =` whose
  ORIGIN is data — a `|…|` template that interpolates, a name whose
  assignments in the class show no binding vocabulary, `CONV string( )`, a
  `name && \`literal\`` chain — and leaves a literal, a method call, a
  `COND`/`SWITCH`, an ABAP boolean and anything that shows a bind, an event,
  a wire, an escaped brace or an `escape_literal( )` alone: assembling a
  binding in a variable and passing it through `v` is what `v` is for. The
  fix renames the parameter. This is the ui5-check entry that stood "blocked
  on origin"; the origin is read out of the class.

- **ABAP is case-insensitive, and now the linter is too.** Outside its
  literals and comments ABAP does not care about case, and a pretty printer set
  to "uppercase" or "lowercase" produces exactly the source the linter used to
  misread: an all-uppercase class was never collected at all (no checkable app
  classes, exit 0), and a lowercase-keyword corpus lost 166 of its 173 views
  in the reconstructor. Every keyword and identifier regex carries the `i`
  flag now, identifiers are folded where they are compared, and `npm test`
  recases every fixture to upper and to lower case and demands the same
  findings on the same lines and columns and the same reconstructed documents.
  `usesBuilderFactory( )` from `./builders` is the one place that decides
  whether a class calls the builder; it is spelling- and space-tolerant.

- **Chained declarations are read in full.** `TYPES:` and `DATA:` chains,
  `TABLE OF` without a category, `SORTED`/`HASHED` tables, `READ-ONLY`,
  `CLASS-DATA`, `LIKE` and type aliases all reach the model now. A table
  declared in a chain used to become a scalar, which silenced every row rule
  for it; a `|…|` template inside a `VALUE #( )` row used to end the row at
  its brace. `declarationElements( )` from `./reconstruct` is the shared
  reader.

- **`parseNamedArgs( )` no longer reads the `=` of `=>` as an argument
  boundary**, so a static access inside a value (`v = zcl_x=>c_flag`) keeps
  its value. `namedArgMarks( )` exposes the same read with positions, for a
  rule that has to rewrite one argument wherever it stands.

- **Smaller corrections in the same round.** The verdict badge no longer
  counts an opt-in rule nobody switched on. The `--cache` entry stores what a
  replay reads and leaves the documents and the model out (a third of the
  cache on the samples corpus). `abap2ui5lint-disable` counts only in a
  comment, never inside a string literal. The literal map reads assignments
  (`x = \`open\`.`), no longer comparisons (`IF x = \`open\`.`), so a template
  no longer inherits a compared value as its static text. `client->cs_view-…`
  written as `z2ui5_if_client=>cs_view-…` or `me->client->cs_view-…` is the
  same slot. The GitHub-app spike reads `minUi5` the way `parseConfig( )`
  returns it.

- **`--all-classes` judges the classes that build no view.** The hygiene rules
  — the 256-column line abapGit cannot import, the round-trip family, the
  activation rules, the released-API check — ran only over a class that calls
  the view builder; every other `.clas.abap` in the tree was dropped at
  collection, and the AGENTS.md sentence that justified `source-line-too-long`
  ("a class that cannot be imported is the most severe thing this tool can
  find") held for app classes only. With `--all-classes` (config `allClasses`)
  every class is collected, and one that builds no view is judged by the
  source-side rules alone — no view, wire or lifecycle rule runs over it, and
  an app class gets the verdict it always got. Off by default: a repository
  scan must not start judging includes and generated classes unasked.

- **Findings stand where the code is.** `event-arg-unresolved` and
  `trailing-empty-event-arg` reported an offset from two coordinate systems
  and landed up to sixteen columns early — on the previous line where the row
  was indented less than that, which is where a `disable-next-line` directive
  then hit nothing. Both sit on the argument they name now. The
  `obsolete-model-update` fix cut from `client->` and left `li_` or `me->` on
  a torn line for every handle not spelled exactly `client`; it removes the
  whole statement. The `trailing-empty-event-arg` fix keeps the row's
  indentation.

- **Fewer false errors on correct code.** A `WHEN \`A\`` opens the handler
  scope of event A only inside the CASE over the event, and only at that
  CASE's own level — a status switch nested in B's handler is a status
  switch, not A's handler; the same depth-aware read finds a `WHEN OTHERS`
  behind a nested CASE. An id written `n = 'id'` is an id the wire rules
  know: the ids come from the reconstructed tree, the text scan is the
  fallback. A class name in a `'…'` literal is text, like one in backticks.
  `delete-index-in-loop` keeps reporting an ended inner `LOOP` and a `DO`
  between the loop header and the DELETE, and its card now says why: the ABAP
  kernel restores the cursor there, the transpiler runtime the same source
  runs on does not, and both incidents were measured on the latter.

- **Rules read every legal spelling.** `unconverted-abap-boolean` reads the
  arguments by name, so `a( v = mv_flag n = \`visible\` )` and `v =
  me->mv_flag` are the flags they are (one of three was reported before), and
  its fix renames the parameter wherever it stands. `binding-to-reference`
  and `binding-to-local` read chained `DATA:` declarations, where only the
  first name used to be known. `live-event-roundtrip` sees
  `me->client->_event( )` and either argument order. A wire whose action name
  is not the first argument, and a `t_arg = VALUE string_table( )` (or any
  typed table) are read like the `#` form — `frontend-action-unknown-id` and
  its relatives never ran on them.

- **`hardcoded-binding-path` judges values, not prose.** All 18 corpus
  findings were sentences in a documentation class explaining a two-way
  binding, and that corpus had switched the rule off. Only a literal that IS
  a value counts now — the `v = …` of an attribute call, `&&` chains
  included, and the rows of a `t_arg = VALUE …( )` event argument — and the
  finding names the attribute it stands in, so two attributes with the same
  path are two findings (their baseline keys change accordingly).

- **The lifecycle heuristics follow the class's own methods.**
  `redundant-init-display` recognises two identical helper arms
  (`view_display( )` twice, the usual corpus spelling), not only two identical
  `client->…display( )` calls. `missing-on-navigated-branch` follows a
  `main( )` that only delegates into the method it delegates to.
  `missing-view-display-on-navigated` stays silent where the branch hands
  `client` to another object — that object may display, and the linter does
  not see it.

- **`too-many-children` read an absent `multiple` as 0..1; UI5 reads it as 0..n.**
  `ManagedObjectMetadata` defaults `multiple` to `true` when the declaration
  does not say, and the UI5 sources leave it out on 0..n aggregations often
  enough — `sap.m.table.columnmenu.Menu.items` and `.quickActions`, their two
  containers — that a column menu with two actions was an error, and one
  samples-controls port was rebuilt around the false finding. Only an explicit
  `multiple: false` is 0..1 now, for the explicit aggregation tag and for the
  children written straight under a control: `<table:Column><Label/><Text/>`
  fills the 0..1 default aggregation `label` twice, UI5 logs "multiple
  aggregates defined for aggregation label with cardinality 0..1" and keeps
  the last one, and the gate said nothing. Both halves need the snapshot to
  write the flag explicitly, which the regenerated `data/properties.json` does.

- **`invalid-aggregation-child` now honours the harvested `widensAggregation`.**
  The generator has recorded for a while which classes override
  `addAggregation( )`, and nothing read it. `sap.uxap.ObjectPageSubSection`
  declares `blocks` as `sap.ui.core.Control` and then stashes or unwraps an
  `ObjectPageLazyLoader` — an Element — in exactly that method, so the sample
  that is ABOUT lazy loading was invalid by the declaration and fine in the
  browser (samples-controls app 592 carried a `property_gate.skip` for it).
  A flagged owner, or one whose ancestor is flagged, is no longer judged by
  its declared child types. The flag on `sap.ui.base.ManagedObject` itself,
  where the method is defined rather than overridden, is ignored.

- **A dotted namespace prefix is a prefix.** `nsMapOf` had learned that
  `xmlns:viz.data` is a declaration; the XML tag parser had not, so
  `<viz.data:FlattenedDataset>` parsed as an aggregation tag NAMED `viz.data`
  with the real name swallowed into the attribute text, and every VizFrame
  view reported an `aggregation-in-aggregation` at its root.

- **`undeclared-namespace` sees the prefix inside the name.** The builder can
  write `tag( \`core:Icon\` )` instead of `ns = \`core\``, and `resolve( )`
  reads both — the undeclared check read only `ns`, so the name form resolved
  to nothing and the node was silently unjudged while the same view written
  with `ns` was reported (the corpus writes the name form a dozen times in one
  class). Both spellings are reported now, both carry the fix, and an
  aggregation tag with an undeclared prefix is reported as well.

- **`unknown-binding-path`: a field read straight off a table.** The path walk
  stepped into row 0 of every array it met, so `{/T/FIELD}` passed whenever the
  row had the field. The JSONModel reads `/T/FIELD` as the property `FIELD` of
  the array, which is undefined, and the control renders blank. A table segment
  now has to be followed by a row index (`/T/0/FIELD`), or the path has to end
  at the table (`{/T}` is what an aggregation binds; `length` is the one
  property an array has); the message says a row index is missing rather than
  calling the field a typo.

- **Two controls with the same wrong value are two findings.** The dedupe key
  was `type|control|member|value`, so a second `<Button type="Wrong"/>` was
  folded into the first: the count understated and `--fix` corrected one
  Button per pass. The node's offset is part of the key now. What the dedupe
  exists for still holds — a helper method replayed at several call sites
  builds its nodes at the helper body's offsets and its one defect stays one
  finding, corrected everywhere by one fix. On a corpus that repeats a
  post-floor member across many controls, `member-too-new` and its siblings
  are counted per occurrence from now on, so a baseline's counts move;
  `--update-baseline` settles them.

- **`member-too-new` no longer dates a member by a base class younger than the
  control.** UI5 extracts base classes out of existing controls —
  `sap.m.ListItemActionBase` (@1.137) out of the @1.52 `FeedListItemAction`,
  `sap.f.cards.BaseHeader` (@1.86) out of the @1.64 `Header`,
  `sap.tnt.NavigationListItemBase` (@1.121) out of `NavigationListItem` — and
  the members that move up arrive untagged, so the scan dated
  `FeedListItemAction.text` at 1.137 and `Header.press` at 1.86 although both
  shipped with their control (checked in the tagged 1.64.0 source). A member
  that shipped with a base class younger than the control is now dated at the
  control's own release; a member the base class gained after its own release
  keeps its date, because it is new for the subclass too. Sixteen findings on
  the samples-controls corpus go with it, all of them documented in sidecars
  as a blind spot no gate could see.

- **An aggregation tag has to be in its parent tag's namespace.**
  `XMLTemplateProcessor` recognizes an aggregation only where
  `childNode.namespaceURI === ns`, the namespace of the control tag it sits in;
  `<f:content>` under a `sap.m.Page` is loaded as the control `sap.f.content`
  and the 404 takes the view down. Reported as `unknown-aggregation`, with a
  message that names the rule and what UI5 makes of the tag. The comparison
  is against the parent TAG's library, not the declaring class: `items` on an
  `f:GridList` is inherited from `sap.m.ListBase` and is still `<f:items>`.

- **An association written as a child tag is reported.**
  `<Button><ariaLabelledBy>lbl</ariaLabelledBy></Button>` was accepted because
  the tag check looked associations up alongside aggregations. UI5 knows only
  aggregations there and resolves the tag as a control. Reported as
  `unknown-aggregation` with the attribute form spelled out, deliberately
  without a did-you-mean or a fix; a tag that is an association up to letter
  case is no longer offered the association's spelling either.

- **48 controls were roots that inherit nothing.** The generator read a
  module's parent by pairing the `sap.ui.define` dependency list with the
  first `function (` of the FILE, split on commas. Every `sap.m.p13n` module
  and integration's `Paginator` are written with an arrow factory, four
  calendar controls carry a comment inside the parameter list, `DragDropBase`
  comments two dependencies out, `MockServer` writes `sap.ui` and `.define(`
  on two lines — and all of them came out with `parent: null`, which the
  property gate reads as "a root class": every inherited property an
  `unknown-property`, and `sap.m.p13n.SelectionPanel is not allowed in
  sap.m.Page content`. The header is read with its comments stripped, the
  factory is matched right after the dependency array in every shape
  (`function`, `(…) =>`, a bare arrow parameter), and a class extending a
  class of the same file (`CustomLocaleData`) finds it. No class in the
  snapshot is parentless now; the one real root, `sap.ui.base.Object`, has no
  entry and the gate knows it by name.

  Two more things the same walk got wrong, and both papered over the first.
  `sap.ui.integration` ships a minified thirdparty bundle carrying copies of a
  dozen core classes (`Locale`, `CustomData`, the calendars) with no header to
  read a parent from, and because the walk is last-writer-wins those copies
  REPLACED the real entries. And the JSDoc of `Control`, `Element`,
  `UIComponent` and friends carries `@example` code — `sap.mylib.MyControl`,
  `my.Component`, `myapp.views.MainView`, thirteen names in all — which the
  snapshot listed as controls, next to a `...` that an error message in
  `mvc/Controller.js` quotes. Thirdparty trees are skipped, example code is
  not a class, and the two enums only the bundle had contributed
  (`sap.ui.core.CalendarType`, `sap.ui.core.date.CalendarWeekNumbering`) are
  read from where the core really registers them: an alias for an object a
  `sap/base` module exports. 973 controls become 959, all of them real.

- **An aggregation that says nothing is 0..n, not 0..1.** The snapshot wrote
  `multiple` only when a declaration said `multiple: true`, and the reader
  took its absence as "single" — the opposite of UI5's default. Eight
  aggregations omit the flag, `sap.m.table.columnmenu.Menu.items` and
  `quickActions` among them, so a menu with two items was `too-many-children`.
  Every aggregation and association now carries `multiple` as
  `ManagedObjectMetadata` resolves it (`false` written out where it used to be
  implied), and `Page.subHeader` with two bars is still one too many.

- **84 deprecations lost their release.** The sources spell it `As of version
  1.20`, `as of 1.20`, `Since version 1.20`, `since 1.115` and `Since 1.130`;
  the reader knew the first three, and the gate treats a deprecation without a
  version as older than every floor. `sap.ui.core.mvc.JSView` (`Since 1.90`)
  and `sap.ui.integration.ActionDefinition.buttonType` (`Since 1.130`) were
  reported to a 1.71 app. Every spelling is read now (`sap.m.TablePersoController`
  and `sap.ui.core.search.SearchProvider` included), and a version that ended
  a sentence no longer keeps the full stop — 45 entries read `1.88.`.

- **An event parameter is not the aggregation of the same name.** The flat
  `members` map topped itself up from every `@since` block in a class, so
  `SinglePlanningCalendar.appointments` — an aggregation with no version —
  carried `1.67.0` from the `appointments` PARAMETER of `appointmentSelect`,
  and 75 further entries named no member of their class at all. The map
  covers declared members only; a parameter's version lives under its event.

- **What a control fires counts as declared.** `sap.m.table.columnmenu.QuickSort`
  declares `key` and `sortOrder` on `change` and fires `{ item }`, so an app
  reading `$parameters>/item` — the only thing the event carries — was an
  `unknown-event-parameter`. The generator reads the object literal of every
  `fire<Event>({ … })` call and adds its keys to the declared parameters,
  flagged `fired: true` so a reader can tell the two apart; 48 parameters
  across 29 events, and two of the three findings the rule produced on the
  samples-controls corpus are gone (the third, `ColorPickerPopover change
  colorString`, forwards another control's parameters as a variable, which no
  literal reader can see).

- **An XML comment is not a view, and `sap-icon://status-{ code }` is not a
  name.** The icon scan read raw view XML through, so
  `<!-- <Button icon="sap-icon://old-typo"/> -->` was an `unknown-icon`, and an
  interpolated template reported its prefix (`status-`) as a glyph. Comments
  are blanked before the scan (character for character, so every offset still
  points where it did), and a name that ends at `{` is what the reconstructor
  already calls it: composed at runtime, not judged.

- **`npm run generate-icons` runs again.** It read the `@openui5` pin from the
  root manifest's `optionalDependencies`, where the pins had not been since the
  render-runtime split, and threw before touching the network — the
  dependabot-openui5 workflow, whose one job is to run it, could not go green
  on any bump. It reads the workspace manifest now (the root stays as the
  fallback for an older layout), and a full scan reproduces the committed
  `data/icons.json` byte for byte.

- **`HASH_REPLACE` and `HASH_ATTACH_CHANGED` are released constants.** Both
  are in `z2ui5_if_client=>cs_event` and consumed by
  `follow_up_action( )` like the three server events already listed, but the
  linter's mirror did not have them, so the wire the documentation shows was an
  `unknown-frontend-action`. They are listed, and the gap that let them arrive
  unnoticed is closed: `check-upstream` reads the `cs_event` block of the
  released interface and demands that every value in it is accepted by
  `FRONTEND_EVENTS`, `FRONTEND_EVENT_ALIASES` or `SERVER_EVENTS` — the two
  server-side lists used to be the one part of the mirror nothing gated, on
  the grounds that they "live in the server". The server publishes them.

- **One rule card taught a chain this project rejects.** The layout rules are
  the house style every sample corpus is held to, and the half of a card
  labelled "the same code, fixed" is the last place a reader should meet a
  chain that fails them. `popup-without-close-wire`'s remedy squeezed a
  `Dialog`, a `Text` and a `buttons` aggregation onto two lines, and
  `chain-element-per-line` said so. It is one call per line now, and `npm test`
  asks all 125 cards — both halves — whether any of them still shows a chain
  the layout rules reject. It was the only one.

- **`|\n|` is a newline, and the view now says so.** The template resolver
  dropped the backslash and kept the letter, so `|\n|` became `n` and `|\t|`
  became `t` in every value it resolved. The transpiler settles what they
  actually mean: `@abaplint/transpiler`'s `StringTemplateTranspiler` emits the
  template body VERBATIM into a JavaScript backtick literal (it escapes only
  the backtick), so the browser reads the escape with JavaScript's rules — and
  the corpus writes `… && |\n| && …` between the lines of a message box for
  exactly that reason.

  What it cost: the two-line UI5 type binding that
  `cookbook/model/expression_binding.md` teaches reconstructed as
  `{ type : "sap.ui.model.type.Integer",n path:"/INPUT32" }`, and UI5 answers
  *SyntaxError: Expected ':' instead of 'p'* — a render error against an
  example that runs correctly in a playground. Found by running the render gate
  over the documentation's own 69 examples, which its CI cannot do.

  Everything outside `\n`, `\r` and `\t` keeps the old behaviour, which is
  also JavaScript's: `\|`, `\{`, `\}` and `\\` are the character itself.

  Over the three sample corpora (819 results) no finding moves. Three
  reconstructions gain the line breaks and tabs the running app has — a
  `core:HTML` stylesheet, a `CodeEditor` showing JSON and one more — and each
  drops one from its `bindings` count, because a `{ … }` that a newline
  interrupts is not one binding, which is what UI5 sees too.

- **ABAP has three literal forms and the readers knew two.** `'…'` — the text
  field literal, the oldest form and the one most ABAP outside this project's
  house style is written in — was not tracked as a literal at all, so a
  structural character inside one read as the real thing. A `(` in a title made
  the view unreconstructible (`no view reconstructed from builder calls`, an
  ERROR) on ABAP a system compiles without a murmur; a `.` ended the statement
  early, a `"` started a comment that ran to the end of the line, a `)` closed
  the call it sat in and an `=` opened an argument. Every shared scanner now
  tracks it beside `` ` `` and `|`: `scrub( )`, `parenRegion( )`, `topSplit( )`,
  `splitStatements( )` and `parseNamedArgs( )` in `lib/abap.mjs`, `classify( )`
  in the chain-layout reader and the row scanner in `reconstruct.mjs`.

  The quieter half is the value resolver, which knew a backtick literal and a
  template: an attribute written `v = 'Hello'` resolved to nothing and was
  DROPPED from the reconstructed view, so the property rules and the render
  gate judged a view the app does not build. It resolves now, as ABAP does —
  `''` inside is one quote, and the trailing blanks of a type-C literal go.

  The same blindness ran through the readers. `n = `Page`` and `n = 'Page'`
  name the same control, but the chain reader matched only backticks for
  `n`/`ns`, so an element call written the second way came back "unparsed
  element call" and nothing was reconstructed from it; and the seed readers
  behind `VALUE #( )`, the `DATA … VALUE` default and a scalar assignment
  matched only backticks too, so a table seeded the way most ABAP is written
  derived an EMPTY model. `npm test` now asks it of the whole fixture set at
  once: every fixture rewritten from one literal form into the other has to
  reconstruct to the same view and derive the same model. 45 of the 49
  differed; none do now.

  No finding moves on the three sample corpora (831 classes; they are backtick
  throughout) or on the documentation's 44 runnable app classes, which is what
  makes this a gap rather than a regression: it was only ever wrong on code
  nobody here writes.

- **A third off a full run.** `topRows( )` - the reader behind
  `value-header-default-reassigned` and the enum/boolean row rules - found the
  character before a candidate `(` by copying the whole prefix and running
  `/\s+$/` over it, once per paren. Quadratic in the constructor body, and
  pathological on a literal-blanked source, which is mostly runs of spaces:
  41% of a 637-class run was that one regex. Walking back to the last
  non-space character instead takes the same run from 10.4s to 6.9s, measured
  over abap2UI5/samples-controls with the property gate off. Nothing about
  what it decides changes; a fixture dry run reports the same 187 findings in
  52 files.

- **A half-written class is reported, not thrown at.** `npm test` now runs
  every reader in the tool over ~450 deliberately broken sources - each
  fixture truncated at twelve points, with characters deleted, doubled, and
  unbalanced `(`/`)`/`` ` ``/`|`/`'`/`.` spliced in - and fails if any of them
  raises instead of reporting. Nothing did, which is the point: the VS Code
  extension checks on every keystroke pause, so a class mid-edit is the
  normal input, and a throw there takes the findings for every other file in
  the run with it. The fix path is included, under the strict-span mode the
  suite already runs with.

- **The Autofix badge now means the fix works on the card's own example.**
  `class-constructor-visibility` advertised a fix over an example the fix
  declines: the correction moves the declaration into the `PUBLIC SECTION`,
  and the example had none to move it into, so a reader pressing Autofix on
  exactly what the page showed them got nothing. The pair is the real one
  now - the example is a class shell with both sections, the remedy is what
  `--fix` writes - and `npm test` runs every fixable rule's example to a
  fixpoint and fails if the rule survives.

- **A `client->` call written inside a string is prose, not a call.** Every
  scan that locates a call read the source with its literals intact, so a
  class that DOCUMENTS the API it uses — a MessageStrip reading "the view is
  handed to `client->view_display( )`", which is how the sample corpora
  teach — was judged on its own sentence. It reported `obsolete-binder`,
  `obsolete-model-update`, `obsolete-frontend-event`, `obsolete-bind-argument`
  and `binding-to-local` (four of them warnings, so CI went red), raised
  phantom events for `event-without-handler` to call dead, and counted a
  quoted display as the first of two for `double-display-in-branch` — that
  last one on the framework's own Hello World sample. Worse, three of those
  rules carry a fix: `--fix` silently rewrote the sentence inside the string.
  Fifteen more rules had the same defect and were found the way the first
  eight should have been - by asking all 124 at once. `RULE_DOCS[id].example`
  is, by the rules page's own gate, the shortest source that makes that rule
  fire; quoted inside a literal in an otherwise clean class, none of them may
  fire, and `npm test` now asserts exactly that. It caught the whole
  lifecycle module (`missing-on-navigated-branch`, `separate-lifecycle-ifs`,
  `lifecycle-is-initial`, `redundant-init-display`, `duplicate-for-iterator`),
  four more hygiene and client-API scans (`value-header-default-reassigned`,
  `get-viewname-removed`, `popover-display-val`, the DECLARATION half of
  `abap-date-formatter-mismatch`) and the frontend-wire locator behind
  `unknown-view-slot` and `raw-javascript-to-frontend`. Seven rules read a
  literal ON PURPOSE - an icon name, a `t_arg` string, a URL, a brace, a
  path - and are listed with their reason; the test also fails if one of
  those stops needing the exception.

  The same held for the statement-shaped rules: a sentence naming
  `CLASS-METHODS class_constructor` or `INTO CORRESPONDING FIELDS OF TABLE
  @DATA(…)` was reported as an ERROR, and the first of those carries a fix
  too. Every scan that asks where a call or a statement IS now reads the
  literal-blanked copy and reads the arguments out of the source, which is
  offset-for-offset the same text; the rules that read a literal deliberately
  (an event name, a bound path) are unchanged.

- **Every finding links its rule.** `annotate( )` sets `url` on every finding
  — the rule's card on the rules page — so it is in `--format json` and on
  every object a consumer gets; the stylish line carries it after the rule
  id (`line:col severity message rule-id url`), because the reference block
  at the end of the run is too far from the line in a log of any length.
  Markdown, SARIF, checkstyle and JUnit already linked it and are unchanged.

- **The rules page opens the reported code in the playground.** Every card
  whose reported snippet the linter reproduces inside a class carries a link
  that opens that class at abap2ui5.github.io/playground — the snippet in a
  frame (`playgroundSource( )` in `scripts/generate-rules-page.mjs`: a chain
  fragment under a namespaced View root in a displayed `main( )`, a method
  in a class, a section in a class), in the playground's share-link format,
  written at generation time so the page stays self-contained. The frame is
  guessed, so every link is verified before it is written: the wrapped
  source goes through the linter and only a card whose own rule fires on it
  gets the link — 103 of 124 today; the rest are data-shaped or file-level
  (a BOM, CRLF, a 255-character line) that no class frame can carry. `npm
  test` decodes every fragment and holds the count above 100.

- **Five new rules, from the flow of a method and from the one comparison
  `get_event( )` makes.** Three read the statement sequence a call sits in
  (`branchTail( )` in `abap-source.mjs` — what runs whenever the call runs,
  nested blocks blanked): `unconditional-popup-display` (a `popup_display( )`
  at the top level of `main( )`, behind no guard — the frontend loads and
  opens the fragment anew on every call, so every roundtrip rebuilds the
  dialog; a **warning**), `display-after-nav-app-call` (a display behind the
  hand-over, usually a missing RETURN; a hint) and `double-display-in-branch`
  (the same slot twice in one sequence, the first dead; a hint).
  `popup-without-close-wire` reports a `Dialog` built in a method that wires
  no event at all (a hint, per method). `event-name-case-mismatch` is the rule
  `event-without-handler` was deliberately blind to: a raise spelled `save`
  against a handler reading `SAVE` — the runtime compares letter for letter,
  so the handler never runs; a **warning**, with a `--fix` that writes the
  handler's spelling into the raise.

- **Did you mean.** Eight closed-set rules name the one candidate a written
  name can only have meant — the same name up to letter case and `-`/`_` —
  and carry a `--fix` that writes it: `unknown-control`, `unknown-property`,
  `unknown-aggregation`, `invalid-property-value`, `unknown-event-parameter`,
  `unknown-icon`, `frontend-action-unknown-id`, `popover-anchor-unknown-id`.
  The control/aggregation pair suggests across the line UI5 XML draws with
  the first letter (`Content` → `content`, `page` → `Page`). No edit distance,
  on purpose: `Buttom` gets no suggestion, because `Button` would be a guess
  and `Test` for `Text` a wrong one. `lib/suggest.mjs` holds the one
  function; `attachSuggestionFixes( )` in `findings.mjs` finds the span for
  the view-side five (ABAP and raw XML alike), the others compute it where
  they report. 34 rules carry a fix now.

- **`class-constructor-visibility` reads the chained form.** `CLASS-METHODS:
  other, class_constructor.` declares it just the same and was never
  reported; it is now, at the name, without a fix (the line is shared).

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
