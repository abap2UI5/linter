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
