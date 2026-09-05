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
