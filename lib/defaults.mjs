/*
 * defaults — the options every entry point starts from (check.mjs for one
 * source, index.mjs for a run). Internal: not in the exports map, so the
 * object stays the library's to change; types.d.ts documents the options.
 */
export const DEFAULTS = {
  minUi5: '1.71',
  /* null = nobody said. NOT the same as 'sapui5': saying "sapui5" is a
   * decision (this system ships sap.ui.comp, stop telling me about it), while
   * saying nothing is the absence of one — so a SAPUI5-only control is a hint
   * here and an error under 'openui5'. See the emit site in properties.mjs. */
  distribution: null,
  allow: [],
  render: true,
  renderPages: 4,      // page-pool size for the render gate (see checkFiles)
  jobs: 1,             // property-gate threads for checkFiles (checkInWorkers)
  properties: true,
  /* collect EVERY .clas.abap, and judge a class that builds no view by the
   * source-side rules alone (checkSourceRules in abap-rules.mjs): a class that
   * cannot be imported is the most severe thing this tool can find, and until
   * this option it could find it only in an app class */
  allClasses: false,
  rules: {},           // per-rule off/severity/exclude, see findings.mjs
  file: '',            // the path the source came from - `rules.*.exclude` matches it
  snapshot: undefined, // path override for data/properties.json
  /* The snapshot ITSELF, as loadSnapshot( )/snapshotFromJson( ) return it -
   * for a host that has no path to hand over (a browser bundle reading the
   * file as text). Wins over `snapshot`. */
  data: undefined,
  /* prepareAbap( ) of exactly the source handed to checkAbapSource( ), when
   * the caller already has it (an editor memoises it per document version).
   * One source's: checkFiles( ) never passes it on. */
  prep: undefined,
  onProgress: undefined, // ({ phase, done, total, file }) while checkFiles runs
  /* An ALREADY-OPEN renderer from openRenderer( ) (the ./render export). When
   * given, checkFiles/screenshotFiles use it and do NOT close it - the caller
   * owns its lifecycle, which is what lets a long-lived consumer (mcp-server's
   * validate_view) keep one warm Chromium across many calls instead of paying
   * a cold start per call. Absent, each call opens and closes its own. */
  renderer: undefined,
  /* The other classes of the run, from classIndexOf( ) (the ./abap-rules
   * export): class name -> { superclass, csEvent }. What lets a class that
   * INHERITS a `cs_event` be told apart from one naming the client's.
   * checkFiles builds it over its own files when none is given. */
  classIndex: null,
  /* The portable profile the opt-in `portable-app` rule judges against, as
   * an OBJECT (the shape of data/portable-v1.json). Absent, the vendored copy
   * is read - only when the rule is switched on. */
  portableProfile: undefined,
};
