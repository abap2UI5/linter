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
