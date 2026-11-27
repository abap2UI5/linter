/*
 * released-api — which abap2UI5 objects an app is allowed to name.
 *
 * abap2UI5 has exactly ONE released package: `src/02`. Everything else in
 * the repository is engine, and the repository says so itself (`src/01` is
 * "abap2UI5 - internal use only"). It carries no compatibility promise and
 * announces no change: the whole Layer 1 was renamed from `z2ui5_cl_core_*`
 * to `z2ui5_cl_ui5_*` in ONE upstream commit. An app that names an internal
 * object compiles today and fails to activate after the next `abapGit` pull,
 * with no deprecation in between. The frozen legacy package `src/99` is gone
 * since abap2UI5 1.151.0: all of it moved, unchanged, to abap2UI5/abap2UI5-ext.
 *
 * So this file is a mirror of the two ENDS of that split, and the rule
 * (`non-released-api` in abap-rules.mjs) judges a name against it:
 *
 *   RELEASED_OBJECTS   src/02 — the whole allowed surface
 *   MOVED_OBJECTS      what left abap2UI5 for abap2UI5-ext (formerly src/99)
 *   REMOVED_OBJECTS    what abap2UI5 deleted, with its successor
 *   INTERNAL_AREAS     the prefix families of src/00, src/01 and src/03
 *
 * `scripts/check-upstream.mjs` gates them against the abap2UI5 repo (weekly,
 * via upstream-sync.yml): the released list must match its package exactly,
 * no moved or removed name may be back in any package, and every remaining
 * upstream object must be classified by a prefix — a package upstream
 * renames or a family it invents shows up as drift here instead of as a
 * silent verdict change at some user's desk.
 *
 * The classification is deliberately by PREFIX and not by an enumeration of
 * every internal object. An enumeration would have to grow with every new
 * core class (~120 objects today, most of them generated), and a name it
 * had not learned yet would be reported like an unknown one. The prefixes
 * are what upstream actually reserves — `z2ui5_cl_ui5_*` for the engine,
 * `z2ui5_cl_ui5f_*` for the generated frontend — so an unknown name that
 * matches none of them is somebody's OWN class (the samples are
 * `z2ui5_cl_demo_app_*`) and must stay silent. Under-reporting a name this
 * file has never heard of is the tolerable direction; reporting an app's
 * own class is not.
 */

/** The released package `src/02` — the entire surface an app may build on.
 *
 *  `z2ui5_if_types` used to be one of them, because the released
 *  `z2ui5_if_client~get( )` returned `z2ui5_if_types=>ty_s_get` and an app
 *  storing that result in a declared variable could not avoid the name.
 *  Upstream has since moved every type onto the object that USES it —
 *  `ty_s_get` and `ty_s_event_control` (and `cs_device`) onto
 *  `z2ui5_if_client`, the three HTTP-config types onto `z2ui5_if_ui5_exit` —
 *  and retired the shared interface; it left abap2UI5 with the rest of
 *  `src/99` (MOVED_OBJECTS below). */
export const RELEASED_OBJECTS = Object.freeze([
  'z2ui5_cl_ui5_http_handler',
  'z2ui5_cl_ui5_view_builder',
  'z2ui5_if_app',
  'z2ui5_if_client',
  'z2ui5_if_ui5_exit',
  // the roundtrip monitor seam (abap2UI5 branch claude/abap2ui5-project-brainstorm-nt7ifs,
  // not yet in a release): an addon implements it to log usage, timing and errors
  'z2ui5_if_ui5_monitor',
  // the language model seam (abap2UI5#2925): the interface an app calls,
  // its exception, and the factory that creates the providers - which
  // themselves stay internal in src/01/05
  'z2ui5_cl_ui5_llm',
  'z2ui5_cx_ui5_llm',
  'z2ui5_if_ui5_llm',
  // the test harness for apps (abap2UI5 1.151.0): a global FOR TESTING class
  // that drives a z2ui5_if_app class from ABAP Unit through the real framework
  'z2ui5_cl_ui5_test',
  // Two objects released in 2026-09 are GONE again, and are not listed so a
  // call to either is not passed as released:
  //
  // - z2ui5_cl_ui5_json, a JSON reader, removed 2026-09-14 before it had
  //   shipped in any release tag. JSON is built and read by hand now — see
  //   the remedy of `non-released-api`.
  // - z2ui5_t_02, the two-field structure a dynamic CREATE DATA could name
  //   without touching the framework's own draft table, removed 2026-09-22
  //   (abap2UI5/abap2UI5#2776): nothing in the ecosystem named it, and
  //   abap2UI5 adds no new dictionary objects. Any name the system already
  //   has will do for a type computed at runtime. It now falls into the
  //   z2ui5_t_ table family below like the framework's own tables.
]);

/*
 * Objects that LEFT abap2UI5 for another repository - the whole former frozen
 * package `src/99`, now abap2UI5/abap2UI5-ext: the retired utility classes
 * (src/99/01, abap2UI5/abap2UI5#2978) first, then in 1.151.0 the rest - the
 * two superseded view builders, the retired types interface and the
 * seventeen built-in popups (src/99/02). The core no longer ships them; a
 * system whose code still names one installs that repository next to
 * abap2UI5. (The repository was called abap2UI5-ext, then abap2UI5-obsolet
 * from 2026-11-17, and abap2UI5-ext again from 2026-11-25 - lib/baseline.mjs
 * reads a key written under an older name as today's.)
 *
 * Not mirrored from a package (they are in none of abap2UI5's any more:
 * check-upstream fails if one comes back), and still reported: they are not
 * the released surface, and an app naming one needs a second repository.
 * Each maps to the package it had in abap2UI5, which picks the advice
 * (MOVED_AREAS); `replacement` on the object itself wins.
 */
export const MOVED_TO = 'abap2UI5-ext';

export const MOVED_OBJECTS = Object.freeze({
  // src/99/01 — the retired utility classes
  ...Object.fromEntries([
    'z2ui5_cl_util',
    'z2ui5_cl_util_db',
    'z2ui5_cl_util_ext',
    'z2ui5_cl_util_http',
    'z2ui5_cl_util_log',
    'z2ui5_cl_util_msg',
    'z2ui5_cl_util_range',
    'z2ui5_cl_util_xml',
    'z2ui5_cx_util_error',
    'z2ui5_t_91',
  ].map((name) => [name, { formerly: 'src/99/01', replacement: null }])),
  // src/99 top level — the two superseded view builders and the retired types
  // interface, whose types moved onto the objects that use them:
  // z2ui5_if_client holds all an app is likely to name (ty_s_get,
  // ty_s_event_control, cs_device), the three HTTP-config types went to
  // z2ui5_if_ui5_exit
  z2ui5_cl_xml_view: { formerly: 'src/99', replacement: 'z2ui5_cl_ui5_view_builder' },
  z2ui5_cl_xml_view_cc: { formerly: 'src/99', replacement: 'z2ui5_cl_ui5_view_builder' },
  z2ui5_if_types: { formerly: 'src/99', replacement: 'z2ui5_if_client' },
  // src/99/02 — the built-in popups, replaced by the addon
  ...Object.fromEntries([
    'z2ui5_cl_pop_data',
    'z2ui5_cl_pop_demo_output',
    'z2ui5_cl_pop_error',
    'z2ui5_cl_pop_file_dl',
    'z2ui5_cl_pop_file_ul',
    'z2ui5_cl_pop_get_range',
    'z2ui5_cl_pop_get_range_m',
    'z2ui5_cl_pop_html',
    'z2ui5_cl_pop_image_editor',
    'z2ui5_cl_pop_input_val',
    'z2ui5_cl_pop_messages',
    'z2ui5_cl_pop_pdf',
    'z2ui5_cl_pop_table',
    'z2ui5_cl_pop_textedit',
    'z2ui5_cl_pop_to_confirm',
    'z2ui5_cl_pop_to_inform',
    'z2ui5_cl_pop_to_select',
  ].map((name) => [name, { formerly: 'src/99/02', replacement: null }])),
});

/** What each former package was, and what took its place. */
const MOVED_AREAS = Object.freeze({
  'src/99/01': {
    what: 'the retired utility classes, moved out of abap2UI5 (formerly src/99/01) into github.com/abap2UI5/abap2UI5-ext',
    replacement: 'abap-util (github.com/abap-util/abap-util), or your own helper',
  },
  'src/99': {
    what: 'the superseded view builders and interfaces, moved out of abap2UI5 (formerly src/99) into github.com/abap2UI5/abap2UI5-ext',
    replacement: null,
  },
  'src/99/02': {
    what: 'the obsolete built-in popups, moved out of abap2UI5 (formerly src/99/02) into github.com/abap2UI5/abap2UI5-ext',
    replacement: 'z2ui5_cl_popup_* from the popups addon (abap2UI5-addons/popups)',
  },
});

/** Whether a name is one of the framework's former built-in popups (now in
 *  abap2UI5-ext) - a nav_app_call( ) target that comes back, as a popup app
 *  does. Case-insensitive. */
export const isMovedPopup = (name) => MOVED_OBJECTS[String(name).toLowerCase()]?.formerly === 'src/99/02';

/*
 * Deleted from abap2UI5 (formerly `src/99`, docs/removal-plan.md upstream):
 * kept so an app that still names one is told what replaced it - after the
 * next pull it does not compile at all.
 */
export const REMOVED_OBJECTS = Object.freeze({
  z2ui5_cl_http_handler: 'z2ui5_cl_ui5_http_handler',
  z2ui5_if_exit: 'z2ui5_if_ui5_exit',
});

/*
 * The internal packages, by the prefix upstream reserves for each. Ordered:
 * the first match wins, so the narrower `z2ui5_cl_ui5f_` / `z2ui5_*_ui5_util_`
 * families are listed before the broad engine prefix they sit inside.
 */
const INTERNAL_AREAS = [
  [/^z2ui5_cl_ui5f_/, {
    area: 'src/01/03',
    what: 'the generated frontend artefacts',
    replacement: null,
  }],
  [/^z2ui5_(?:cl|cx)_ui5_util_/, {
    area: 'src/00/03',
    what: 'the framework\'s vendored utility classes',
    replacement: 'abap-util (github.com/abap-util/abap-util), or your own helper',
  }],
  [/^z2ui5_(?:cl|if|cx)_ajson/, {
    area: 'src/00/01',
    what: 'the vendored AJSON copy',
    replacement: 'your own copy of ajson (github.com/sbcgua/ajson)',
  }],
  [/^z2ui5_cl_srt_|^z2ui5_cx_srt$/, {
    area: 'src/00/02',
    what: 'the vendored S-RTTI copy',
    replacement: 'your own copy of S-RTTI (github.com/sandraros/S-RTTI)',
  }],
  [/^z2ui5_(?:cl|if|cx)_ui5_/, {
    area: 'src/01',
    what: 'the core engine',
    replacement: 'the released interfaces z2ui5_if_app / z2ui5_if_client',
  }],
  [/^z2ui5_t_\d+$/, {
    area: 'src/01',
    what: 'the framework\'s own database tables',
    replacement: null,
  }],
];

/**
 * What an object name is, as far as the released-API rule is concerned.
 *
 *   null                     released, or not a framework object
 *   { area, what, replacement, frozen, moved?, removed?, formerly? }   everything else
 *
 * Case-insensitive: ABAP names are.
 */
export function apiVerdict(objectName) {
  const name = String(objectName).toLowerCase();
  if (RELEASED_OBJECTS.includes(name)) return null;
  if (REMOVED_OBJECTS[name]) {
    return {
      area: 'removed',
      what: 'an object abap2UI5 has deleted (formerly the frozen package src/99) - it does not compile after the next pull',
      replacement: REMOVED_OBJECTS[name],
      frozen: false,
      removed: true,
    };
  }
  const moved = MOVED_OBJECTS[name];
  if (moved) {
    const area = MOVED_AREAS[moved.formerly];
    return {
      area: MOVED_TO,
      what: area.what,
      replacement: moved.replacement ?? area.replacement,
      frozen: false,
      moved: true,
      formerly: moved.formerly,
    };
  }
  for (const [re, area] of INTERNAL_AREAS) {
    if (re.test(name)) return { ...area, frozen: false };
  }
  return null;
}

/** Whether release `a` (`1.151.0`-shaped, the configured `abap2ui5`) is
 *  older than `b`, a date of data/abap2ui5-since.json - `main` or `DEV` is in
 *  no release, so every release is older. What decides whether a rule may
 *  write a name into the class (message-before-navigation's keep_messages,
 *  namespaced-row-binding's component_path( )). */
export const releaseOlder = (a, b) => {
  if (b === 'main' || b === 'DEV') return true;
  const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
