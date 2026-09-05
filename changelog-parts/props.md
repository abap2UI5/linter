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
