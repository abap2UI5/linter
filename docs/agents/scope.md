# Scope — what the linter reads, and how

What is collected, which builders are read, how a name is resolved to a value and which model a view is judged against. Read it before touching `lib/reconstruct.mjs`, `collectFiles( )` or anything that decides whether a class is looked at at all.

## Scope — what the linter can and cannot see

- Input is **generic-builder classes** — `z2ui5_cl_ui5_view_builder`
  (`ele`/`tag`/`a`/`end`); `collectFiles` picks ABAP files containing
  `<class>=>factory`, plus every app class (`INTERFACES z2ui5_if_app`) even
  when its view is built in another class — such a class is judged by the
  source-side rules and the ABAP-side rules that read the class rather than
  the view (`VIEWLESS_APP_RULE` in `lib/check.mjs`), and counted in the run
  summary as building no view here — plus raw `*.view.xml` /
  `*.fragment.xml`, and any file NAMED on the command line that starts with
  `<` — except abapGit's own `<abapGit …>` metadata (`*.clas.xml`,
  `*.devc.xml`), which bulk naming (`src/*`, a pre-commit hook's changed
  files) hands over too and which is never a view (`isAbapGitXml( )`).
  **`lib/builders.mjs` owns the vocabulary and nothing else may hard-code a
  verb**: the reconstructor
  works on a verb's ROLE (`open`/`leaf`/`att`/`shut`), and every rule that
  reads a builder call out of the source text builds its regex from
  `dialectOf(source)`. The two are the same tree walk — the attribute target
  rule is identical (`IF t_child IS INITIAL` / last-child-or-self) — which is
  what makes one reconstructor enough; a fixture pair (`good.clas.abap`,
  `viewbuilder.clas.abap`) pins that they rebuild the SAME document.
- **ABAP is case-insensitive outside its literals and comments, and so is
  every reader here.** `DATA(VIEW) = Z2UI5_CL_UI5_VIEW_BUILDER=>FACTORY( )` is
  the statement `data(view) = …` is, and a pretty printer set to "uppercase"
  or "lowercase" produces exactly such sources — an all-uppercase class used
  to be not collected at all, and a lowercase-keyword corpus lost 166 of 173
  views. The policy: every keyword and identifier regex carries the `i` flag,
  identifiers are folded (`toLowerCase( )`/`toUpperCase( )`) wherever they
  are compared or used as keys, and only literal CONTENT (an event name, an
  attribute name, an id) keeps its case. `test/review/core.mjs` gates it:
  every fixture is recased to upper and to lower case outside literals and
  comments, and the findings (type, line, column) and the reconstructed
  documents have to be identical. A new regex over ABAP text that forgets the
  flag fails that gate on the first fixture that exercises it.
- Classes built with the **`z2ui5_cl_xml_view` fluent builder** (the
  per-control wrapper API, also frozen) are still **silently skipped** — that
  design boundary stands, and it is a different thing from the two generic
  builders above: it has one method per UI5 control, so reading it is not a
  vocabulary mapping but a second reconstructor. Support for it was
  deliberately added and reverted once already. The way in for such a repo is
  to migrate it (as
  [cds-wrapper](https://github.com/abap2UI5-addons/cds-wrapper) did).
- The knowledge bound is the committed metadata snapshot (`docs/agents/data.md`): the
  gate cannot know about anything newer than its `ui5Version`.
- **One builder chain per document, or one handle replayed.** A chain split
  across statements on the same handle is replayed handle by handle (copies of
  the handle's stack, so a statement moves its own cursor). A standalone
  `factory( ).` followed by `view->ele( … )` statements adds SIBLINGS of the
  root - at runtime too - and `second-root` reports it.
- **Helpers are replayed, not guessed.** A void helper that takes a handle and
  a RETURNING helper whose body is more than `result = io_x->chain` are both
  replayed against the handle the call passes, and a call that captures the
  result (`DATA(form) = create_layout_form( page )`) gets the handle the body
  leaves in the returning parameter. A one-statement RETURNING body is still
  inlined as text. A handle a factory method leaves in an ATTRIBUTE
  (`DATA mo_page TYPE REF TO z2ui5_cl_ui5_view_builder` in the definition,
  `mo_page = page.`) is replayed in every other method that builds on or
  stringifies it - unless that method hands the attribute to anything but its
  own builder calls (a field symbol, an argument), in which case what lands in
  the view depends on code this source does not show and its builder calls
  count as calls outside any chain: the render is skipped, not given half a
  view. A call on a receiver declared `TYPE REF TO` another class, or inline
  from a `NEW` / `cl_…=>` expression naming no builder, is not a builder call
  (`t->end( )` on a transaction).
- **A name's value is read in its scope.** The reconstructor resolves an
  attribute value written as a name (`v = lv_type`) to the literal or the
  template the class gives it (`makeResolver( )` in `lib/reconstruct.mjs`),
  and reads that per method - a write spelled `me->x` is the attribute's
  write, whatever local `x` the method declares (`OWN`, the one `(?:me->)?`
  fragment every target and handle reader carries; `FINAL(x)` is an inline
  declaration like `DATA(x)`): a name declared in the method it is used in (an
  inline or a `DATA`/`STATICS`/`CONSTANTS` declaration, or a parameter) is
  that method's variable and takes the last of its writes before the use;
  any other name is the class's attribute and takes the class's last write.
  A parameter is the caller's, so it stays unresolved - except in a void
  helper the replay enters: during the replay of ONE call the parameter is
  the value that call passes, resolved where the call stands (a forwarded
  parameter through its caller's frame), as long as EVERY call of the
  helper in the class passes a value that resolves and the helper never
  writes the parameter itself (`inHelperCall( )`; a `me->` call or a
  `CALL METHOD` is a call the replay does not enter, so it keeps the
  parameter a variable). A value with no position (a RETURNING helper
  inlined with its arguments - substituted in code spans only, never inside
  a literal, `codeOnly( )`) reads class-wide with the single-declaration
  guard. A parameter the call omits takes its `DEFAULT`. Helpers are
  declared per METHODS element (`parseHelpers( )` reads `METHODS:` chains
  through `splitStatements` + `topSplit`), and the returning parameter has
  whatever name the signature gives it. A template is expanded only whole — a
  piece the scan cannot compute would leave a guess the render gate refuses.
  An element or attribute NAME is read the same way: `ele( n = c_page )`
  resolves through the constant (`nameOf( )`), and a name that does not
  resolve still opens an element - a nameless placeholder node
  (`unresolvedName`) that keeps the `end( )` count right and that `toXml( )`
  and the walk look through like the document wrapper. A binding is read off
  any word ending in `client` (`bindingOf( )`, as `clientArrows` reads the
  events), and a `##NO_TEXT` after a `VALUE` is blanked before a declaration
  or a constant is read.

### The start path — what the first display shows

The model a document is judged and rendered against is DERIVED from the
class's literal seeds (`deriveModel( )` in `lib/reconstruct.mjs`). Class-wide,
the last literal assignment anywhere wins — including one in an event
handler, which has not run when the view is first shown. That hid
samples-stack app 013: a MessageStrip `type` seeded `Error` in a `CATCH`
block was rendered with `Error`, shipped `""` on every start, and terminated
the app with both gates green.

So a class with a lifecycle dispatcher gets a second model. `initPath( )`
(`lib/abap-source.mjs`) reads the start path — `main( )`'s statements ahead of
its dispatch `IF`, the `check_on_init( )` arm (the `check_on_navigated( )` arm
where there is no init arm: init implies navigated), the constructor, and the
methods those call — and `prepareAbap( )` returns `initModel` /
`initModelShape`, seeded from that path only, plus `initialFields` (root
scalars nothing there gives a value: no literal seed, no declared `VALUE`, no
other write) and `nodeOnInit` / `docOnInit`. A document built on the start
path is judged (`checkNodes`) and rendered (`docModels` on the result) against
the start-path model; every other document — a popup built in a handler, shown
after the handler ran — keeps the class-wide one. A scalar the start path
writes non-literally (an expression, a `SELECT … INTO`, an `IMPORTING` actual)
keeps the class-wide guess and is never in `initialFields`: its value is a
runtime matter, and the rule that reads the set must not guess. A class with
neither arm has no start path (`init` is null) and keeps the old behaviour
everywhere. Tables are not restricted: a row built at runtime is
`enum-field-unset-on-insert`'s, and an empty array has nothing to resolve.
Inside a `VALUE #( )` row a parenthesised value (`COND #( )`, a method call)
is one region (`SEED_CALL` in `parseRows( )`): a conditional whose every
branch is a literal seeds its ELSE, anything else leaves the field out of the
render model and at its declared default in the shape.
Branches inside the start path: a literal seed counts as given only when it
stands at the level of its span, or when every arm of a complete `IF … ELSE`
or `CASE … WHEN OTHERS` gives one (`unconditionalSeeds( )`); a seed inside a
`LOOP`/`WHILE`/`DO` or in some arms only puts the field in
`conditionalFields`, which `enum-bound-to-conditional-field` reads (a
warning: whether the other arm runs is a runtime matter). The render model
keeps the seed. Not modelled: whether a method the start path calls is
itself called conditionally.

Measured when it shipped (2026-10-08): no new finding and no new render error
on samples-controls, samples-stack, abap2UI5, popups, sapgui and
abap-cloud-gui; app 013 as it was before its fix is reported by both gates.
