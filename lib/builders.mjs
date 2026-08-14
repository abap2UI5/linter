/*
 * builders — the two view builders a class can be written on.
 *
 * abap2UI5 has replaced `z2ui5_cl_ai_xml` with `z2ui5_cl_ui5_view_builder`
 * (upstream 43452e8, then db10b13 which moved the old one into the frozen
 * `src/99` package). The two are the SAME tree walk under different names:
 *
 *   z2ui5_cl_ai_xml   z2ui5_cl_ui5_view_builder   what it does
 *   ---------------   -------------------------   -------------------------
 *   factory( )        factory( )                  a new empty root
 *   open( n ns )      ele( n ns )                 add a child and DESCEND
 *   leaf( n ns )      tag( n ns )                 add a child and STAY
 *   a( n v )          att( n v )                  set an attribute
 *   shut( )           end( )                      ascend to the parent
 *   stringify( )      stringify( )                render from the root
 *
 * The attribute target rule is identical in both — the last child, or the
 * node itself while it has none (`IF t_child IS INITIAL` in the new class,
 * `a( )`'s last-child-or-self in the old one) — which is what makes ONE
 * reconstructor able to read both. Two real differences:
 *
 *   - `att( b = <abap_bool> )` renders `true`/`false` itself, so the new
 *     builder needs no `as_bool( )` — and passing such a flag through `v`
 *     instead is the same silent inversion `unconverted-abap-boolean` has
 *     always reported, with a different correction.
 *   - the old `open( a = VALUE #( ( `k=v` ) ) )` up-front attribute table
 *     has no counterpart; `ele( )`/`tag( )` take `n` and `ns` only.
 *
 * A source is read in the dialect its factory names. Both at once is legal
 * (a class migrating one view at a time) and gets the union — the method
 * names of the two do not overlap, so nothing is ambiguous.
 */

/** The old builder, frozen in `src/99` — still what most classes are on. */
export const AI_XML = Object.freeze({
  class: 'z2ui5_cl_ai_xml',
  open: 'open', leaf: 'leaf', att: 'a', shut: 'shut',
  bool: null,   // no boolean parameter of its own…
  boolFix: 'wrap it in z2ui5_cl_ai_xml=>as_bool( )',   // …so a flag is wrapped
});

/** Its successor in the released package `src/02`. */
export const VIEW_BUILDER = Object.freeze({
  class: 'z2ui5_cl_ui5_view_builder',
  open: 'ele', leaf: 'tag', att: 'att', shut: 'end',
  bool: 'b',
  boolFix: 'pass it as att( b = … ), which renders true/false itself',
});

export const BUILDERS = Object.freeze([AI_XML, VIEW_BUILDER]);

/** Which builder a verb spelling belongs to — the two vocabularies do not
 *  overlap, so one token is enough to say which class a call is on even in a
 *  class that (mid-migration) uses both. */
export const builderOfVerb = (verb) => BUILDERS.find(
  (b) => [b.open, b.leaf, b.att, b.shut].includes(String(verb).toLowerCase()),
) ?? null;

const KIND_BY_VERB = new Map([
  ['open', 'open'], ['ele', 'open'],
  ['leaf', 'leaf'], ['tag', 'leaf'],
  ['a', 'att'], ['att', 'att'],
  ['shut', 'shut'], ['end', 'shut'],
  ['stringify', 'stringify'],
]);

/* Longest first, so the alternation reads naturally — `\s*\(` after the
 * group already disambiguates `a` from `att` by backtracking. */
const verbGroup = (builders) => `(${[...new Set(builders.flatMap(
  (b) => [b.open, b.leaf, b.att, b.shut],
))].sort((x, y) => y.length - x.length).concat('stringify').join('|')})`;

const cache = new Map();

/**
 * The dialect of one ABAP source: which builder classes it names, and the
 * regex sources built from them. Compiled once per combination (there are
 * three) — the reconstructor asks per statement.
 *
 *   factory     `class=>factory( )`, alternated over this source's builders
 *   verbs       the capture group of every navigation method
 *   kindOf(v)   a verb -> its role ('open'|'leaf'|'att'|'shut'|'stringify')
 *   handleType  `TYPE REF TO <builder>`, for the helper-method signatures
 *   boolParam   the `att( b = )` parameter, or null when there is none
 */
export function dialectOf(content) {
  const used = BUILDERS.filter((b) => content.includes(`${b.class}=>factory`));
  const builders = used.length ? used : BUILDERS;
  const key = builders.map((b) => b.class).join('+');
  if (cache.has(key)) return cache.get(key);
  const classes = builders.map((b) => b.class).join('|');
  const alt = (role) => builders.map((b) => b[role]).join('|');
  const dialect = Object.freeze({
    builders,
    classes: builders.map((b) => b.class),
    factory: `(?:${classes})=>factory`,
    verbs: verbGroup(builders),
    // the spellings of one role, as a regex alternation (`open` / `open|ele`)
    open: alt('open'),
    leaf: alt('leaf'),
    att: alt('att'),
    shut: alt('shut'),
    handleType: `TYPE REF TO (?:${classes})`,
    // the `att( b = )` parameter — present as soon as ANY builder in this
    // dialect has one; the other's attribute call simply never carries it
    boolParam: builders.map((b) => b.bool).find(Boolean) ?? null,
    kindOf: (verb) => KIND_BY_VERB.get(String(verb).toLowerCase()) ?? null,
  });
  cache.set(key, dialect);
  return dialect;
}
