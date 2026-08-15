/*
 * released-api — which abap2UI5 objects an app is allowed to name.
 *
 * abap2UI5 has exactly ONE released package: `src/02`. Everything else in
 * the repository is engine or history, and the repository says so itself
 * (`src/01` is "abap2UI5 - internal use only", `src/99` is "FROZEN legacy
 * code … ships solely so existing downstream installations keep compiling").
 * Neither carries a compatibility promise, and neither announces a change:
 * the whole Layer 1 was renamed from `z2ui5_cl_core_*` to `z2ui5_cl_ui5_*`
 * in ONE upstream commit, and the same commit moved `z2ui5_cl_http_handler`
 * into the frozen package. An app that names an object from either side
 * compiles today and fails to activate after the next `abapGit` pull, with
 * no deprecation in between.
 *
 * So this file is a mirror of the two ENDS of that split, and the rule
 * (`non-released-api` in abap-rules.mjs) judges a name against it:
 *
 *   RELEASED_OBJECTS   src/02 — the whole allowed surface, 6 objects
 *   FROZEN_OBJECTS     src/99 — with what replaced each one
 *   INTERNAL_AREAS     the prefix families of src/00 and src/01
 *
 * `scripts/check-upstream.mjs` gates all three against the abap2UI5 repo
 * (weekly, via upstream-sync.yml): the two lists must match their package
 * exactly, and every remaining upstream object must be classified by a
 * prefix — a package upstream renames or a family it invents shows up as
 * drift here instead of as a silent verdict change at some user's desk.
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
 *  `z2ui5_if_types` is one of them: the released `z2ui5_if_client~get( )`
 *  returns `z2ui5_if_types=>ty_s_get`, so an app that stores that result in a
 *  declared variable cannot avoid the name — and does not have to, it ships
 *  in the released package. */
export const RELEASED_OBJECTS = Object.freeze([
  'z2ui5_cl_ui5_http_handler',
  'z2ui5_cl_ui5_view_builder',
  'z2ui5_if_app',
  'z2ui5_if_client',
  'z2ui5_if_exit',
  'z2ui5_if_types',
]);

/*
 * The frozen package `src/99`, with the successor of each object.
 */
export const FROZEN_OBJECTS = Object.freeze({
  // package top level — the two superseded view builders and the old entry point
  z2ui5_cl_xml_view: { area: 'src/99', replacement: 'z2ui5_cl_ui5_view_builder' },
  z2ui5_cl_xml_view_cc: { area: 'src/99', replacement: 'z2ui5_cl_ui5_view_builder' },
  z2ui5_cl_http_handler: { area: 'src/99', replacement: 'z2ui5_cl_ui5_http_handler' },
  // src/99/01 — the retired utility classes
  z2ui5_cl_util: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_db: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_ext: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_http: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_log: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_msg: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_range: { area: 'src/99/01', replacement: null },
  z2ui5_cl_util_xml: { area: 'src/99/01', replacement: null },
  z2ui5_cx_util_error: { area: 'src/99/01', replacement: null },
  z2ui5_t_91: { area: 'src/99/01', replacement: null },
  // src/99/02 — the built-in popups, replaced by the addon
  z2ui5_cl_pop_data: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_demo_output: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_error: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_file_dl: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_file_ul: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_get_range: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_get_range_m: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_html: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_image_editor: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_input_val: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_js_loader: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_messages: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_pdf: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_table: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_textedit: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_to_confirm: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_to_inform: { area: 'src/99/02', replacement: null },
  z2ui5_cl_pop_to_select: { area: 'src/99/02', replacement: null },
});

/** What each frozen sub-package is, and what took its place. Per package
 *  rather than per object — they were retired as packages, and all eighteen
 *  popups went to the same addon. A `replacement` on the object itself wins
 *  (only the two builders and the entry point have one of their own). */
export const FROZEN_AREAS = Object.freeze({
  'src/99': { what: 'the superseded view builders and entry point', replacement: null },
  'src/99/01': { what: 'the retired utility classes', replacement: 'abap-util (github.com/abap-util/abap-util), or your own helper' },
  'src/99/02': { what: 'the obsolete built-in popups', replacement: 'the popups addon (abap2UI5-addons/popups)' },
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
 *   { area, what, replacement, frozen }   everything else
 *
 * Case-insensitive: ABAP names are.
 */
export function apiVerdict(objectName) {
  const name = String(objectName).toLowerCase();
  if (RELEASED_OBJECTS.includes(name)) return null;
  const frozen = FROZEN_OBJECTS[name];
  if (frozen) {
    const area = FROZEN_AREAS[frozen.area];
    return {
      area: frozen.area,
      what: area.what,
      replacement: frozen.replacement ?? area.replacement,
      frozen: true,
    };
  }
  for (const [re, area] of INTERNAL_AREAS) {
    if (re.test(name)) return { ...area, frozen: false };
  }
  return null;
}
