/*
 * builders — the view builder a class is written on.
 *
 * abap2UI5 builds views with `z2ui5_cl_ui5_view_builder` (`src/02`, the
 * released package). It is a tree walk with five verbs:
 *
 *   factory( )        a new empty root
 *   ele( n ns )       add a child and DESCEND into it
 *   tag( n ns )       add a child and STAY here
 *   a( n v )          set an attribute
 *   end( )            ascend to the parent
 *   stringify( )      render from the root
 *
 * The attribute target rule is the one thing the reconstructor has to know:
 * `a( )` lands on the element the chain is POINTING AT — the child just
 * added by `ele( )`/`tag( )`, or the node itself while it has none
 * (`IF t_child IS INITIAL` in the class). Once an element has a child, an
 * `a( )` can no longer reach it.
 *
 * `a( b = <abap_bool> )` renders `true`/`false` itself, so a flag needs no
 * conversion of its own — passing one through `v` instead is the silent
 * inversion `unconverted-abap-boolean` reports.
 *
 * The module keeps the builder in a list and the dialect behind
 * `dialectOf( )` because everything downstream reads it that way; there is
 * one entry today.
 */

/** The view builder of the released package `src/02`. */
export const VIEW_BUILDER = Object.freeze({
  class: 'z2ui5_cl_ui5_view_builder',
  open: 'ele', leaf: 'tag', att: 'a', shut: 'end',
  bool: 'b',
  boolFix: 'pass it as a( b = … ), which renders true/false itself',
});

export const BUILDERS = Object.freeze([VIEW_BUILDER]);

/*
 * The builder this one replaced, recognised but NOT checked.
 *
 * `z2ui5_cl_xml_view` was the API from 2023 until the generic builder arrived,
 * and it moved into the frozen `src/99` rather than being deleted - so a class
 * written on it still compiles, still renders, and raises nothing anywhere.
 * That is the whole problem: every blog post, forum answer and tutorial about
 * abap2UI5 shows it, which also makes it what a language model reproduces when
 * asked to write an app. The wrong answer is the silent one.
 *
 * Until now this linter did not merely fail to judge such a class - it did not
 * SEE it. `collectFiles` keeps a class that calls a builder factory, the frozen
 * one is not a builder here, and the run ended with "no checkable app classes"
 * and exit 0. A generated app on the retired API passed the gate by being
 * invisible to it.
 *
 * So it is collected and reported (`frozen-view-builder`), and deliberately
 * nothing more: these verbs are a different API - `page( )`, `button( )`,
 * `_bind( )` on the view - that the reconstructor does not model, and guessing
 * at a view it cannot build would be worse than saying it did not.
 */
export const FROZEN_BUILDERS = Object.freeze([
  'z2ui5_cl_xml_view',
  'z2ui5_cl_xml_view_cc',
]);

/** The frozen builder a source builds its view with, or null. */
export const frozenBuilderOf = (content) =>
  FROZEN_BUILDERS.find((c) => new RegExp(`\\b${c}\\s*=>\\s*factory`, 'i').test(content)) ?? null;

/** Which builder a verb spelling belongs to. */
export const builderOfVerb = (verb) => BUILDERS.find(
  (b) => [b.open, b.leaf, b.att, b.shut].includes(String(verb).toLowerCase()),
) ?? null;

const KIND_BY_VERB = new Map([
  ['ele', 'open'],
  ['tag', 'leaf'],
  ['a', 'att'],
  ['end', 'shut'],
  ['stringify', 'stringify'],
]);

/* Longest first, so the alternation reads naturally — `\s*\(` after the
 * group already disambiguates the one-letter verb by backtracking. */
const verbGroup = (builders) => `(${[...new Set(builders.flatMap(
  (b) => [b.open, b.leaf, b.att, b.shut],
))].sort((x, y) => y.length - x.length).concat('stringify').join('|')})`;

const cache = new Map();

/**
 * The dialect of one ABAP source: which builder classes it names, and the
 * regex sources built from them.
 *
 *   factory     `class=>factory( )`
 *   verbs       the capture group of every navigation method
 *   kindOf(v)   a verb -> its role ('open'|'leaf'|'att'|'shut'|'stringify')
 *   handleType  `TYPE REF TO <builder>`, for the helper-method signatures
 *   boolParam   the `a( b = )` parameter, or null when there is none
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
    // the spellings of one role, as a regex alternation
    open: alt('open'),
    leaf: alt('leaf'),
    att: alt('att'),
    shut: alt('shut'),
    handleType: `TYPE REF TO (?:${classes})`,
    // the `a( b = )` parameter — present as soon as ANY builder in this
    // dialect has one
    boolParam: builders.map((b) => b.bool).find(Boolean) ?? null,
    kindOf: (verb) => KIND_BY_VERB.get(String(verb).toLowerCase()) ?? null,
  });
  cache.set(key, dialect);
  return dialect;
}
