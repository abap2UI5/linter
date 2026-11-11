/*
 * binding-paths - what a binding value addresses, read off the string alone:
 * the absolute path of a simple binding, a relative one, every relative path
 * of the four property-binding shapes, the path an aggregation binds, the
 * absolute paths inside a binding info or an expression, and whether an
 * expression binding is unbalanced. Pure functions of the value - the walk
 * (lib/properties.mjs) and its rules (lib/rules/) read them alike. An
 * internal module: not in the exports map.
 */
import { skipWs } from './abap.mjs';

/* The absolute path of a simple binding `{/X}`, or null -
 * `/^\{\s*(\/[^}>=]*?)\s*\}$/`, whose lazy path and the `\s*` behind it both
 * reached for the same blanks. Nothing between the slash and the closing
 * brace may be `}`, `>` or `=`; the blanks before the brace are not path. */
function absoluteBindingPath(v) {
  const last = v.length - 1;
  if (v[0] !== '{' || v[last] !== '}') return null;
  const slash = skipWs(v, 1);
  if (v[slash] !== '/') return null;
  for (let k = slash + 1; k < last; k++) {
    if (v[k] === '}' || v[k] === '>' || v[k] === '=') return null;
  }
  let end = last;
  while (end > slash + 1 && /\s/.test(v[end - 1])) end--;
  return v.slice(slash, end);
}

/* Every absolute path of a complex binding info (`path: '/X'`) or an
 * expression (`${/X}`), as written -
 * `/\bpath\s*:\s*'(\/[^'>]*)'|\$\{\s*(\/[^}>]*)\}/g`, which searched the rest
 * of the string again from every `${/` whose `}` never came. A path runs to
 * the first `'` (resp. `}`) or `>`; that stop is remembered per kind, so the
 * next path that starts before it does not look for it again. */
export function bindingInfoPaths(text) {
  const paths = [];
  const stops = new Map(); // stop character -> [searched from, found at]
  const stopAt = (from, ch) => {
    const known = stops.get(ch);
    if (known && from >= known[0] && from <= known[1]) return known[1];
    let at = from;
    while (at < text.length && text[at] !== ch && text[at] !== '>') at++;
    stops.set(ch, [from, at]);
    return at;
  };
  let from = 0;
  for (const head of text.matchAll(/\bpath|\$\{/g)) {
    if (head.index < from) continue;
    let slash;
    let stop;
    if (head[0] === 'path') {
      const colon = skipWs(text, head.index + 4);
      if (text[colon] !== ':') continue;
      const open = skipWs(text, colon + 1);
      if (text[open] !== "'") continue;
      slash = open + 1;
      stop = "'";
    } else {
      slash = skipWs(text, head.index + 2);
      stop = '}';
    }
    if (text[slash] !== '/') continue;
    const end = stopAt(slash + 1, stop);
    if (text[end] !== stop) continue;
    paths.push(text.slice(slash, end));
    from = end + 1;
  }
  return paths;
}

/* A binding written by the builder: client->_bind( x ) becomes {/X}.
 * Only ABSOLUTE paths are resolvable without a binding context - a
 * relative {NAME} inside an aggregation template addresses the row, so it
 * is deliberately left alone. Named models and expressions are skipped. */
export const bindingPath = (value) => absoluteBindingPath(String(value).trim());

/* A RELATIVE binding: {NAME} or {NAME/SUB} inside a row template, which
 * addresses the row rather than the model root. Named models ({m>path}),
 * expressions ({= ... }) and complex syntax ({path: ...}) are excluded by
 * the character class - none of them mean "a field of this row". */
export function relativePath(value) {
  const m = String(value).trim().match(/^\{\s*([A-Za-z_]\w*(?:\/\w+)*)\s*\}$/);
  return m ? m[1] : null;
}

/* EVERY relative path a PROPERTY binding addresses, in all four shapes UI5
 * accepts - which `relativePath( )` above cannot see, because it is anchored
 * `^{NAME}$` and a property binding is very often none of those:
 *
 *   simple      text="{STREET}"
 *   COMPOSITE   text="{STREET} {HOUSENUMBER}"        <- app 592's defect
 *   complex     number="{ path: 'PRICE', type: … }"
 *   expression  state="{= ${STATUS} ? 'Error' : … }"
 *
 * All four resolve a slashless path against the binding context and render
 * BLANK when there is none; only the first was ever judged. The AGGREGATION
 * branch grew its own `complex` matcher when relative-aggregation-without-
 * context shipped and the PROPERTY branch never did, which is how 42 dead
 * address bindings across 21 sections of samples-controls app 592 - written
 * in the composite form, over correctly declared root fields - passed a
 * green gate and reached production.
 *
 * A path is a candidate only when it is a bare relative name: `/X` is
 * absolute, `m>X` belongs to a named model (`unknown-model` judges that),
 * `{0}` is a message placeholder, and anything else is expression debris. */
const RELATIVE_NAME = /^[A-Za-z_]\w*(?:\/\w+)*$/;
export function relativeBindings(value) {
  const v = String(value).trim();
  if (!v.includes('{')) return [];
  const out = new Set();
  const add = (p) => { if (RELATIVE_NAME.test(String(p).trim())) out.add(String(p).trim()); };
  /* complex binding info - the binding's own `path:` plus every `parts:`
   * entry, which is the composite form written the long way */
  if (/^\{[^{}]*\bpath\s*:/.test(v) || /^\{[^{}]*\bparts\s*:/.test(v)) {
    for (const m of v.matchAll(/\bpath\s*:\s*'([^']*)'/g)) add(m[1]);
    return [...out];
  }
  // expression binding - every embedded ${…}, the only paths it resolves
  if (v.startsWith('{=')) {
    for (const m of v.matchAll(/\$\{([^{}]*)\}/g)) add(m[1]);
    return [...out];
  }
  // simple AND composite: every {…} the value is assembled from
  for (const m of v.matchAll(/\{([^{}]*)\}/g)) add(m[1]);
  return [...out];
}

/* The path an AGGREGATION binding addresses, including the complex form
 * ({path: 'GROUPS', templateShareable: true}), which is how a nested
 * aggregation is usually written. Returns null when the value binds
 * something this gate cannot follow - a named model, an expression - and
 * that null is meaningful: it means the rows below are unknown, not that
 * the surrounding context still applies. */
export function aggregationPath(value) {
  const v = String(value).trim();
  /* The FIRST `path:` is the binding's own; a later one belongs to a NESTED
   * object - `{path:'/CATEGORIES', sorter:{path:'NAME'}}`, the usual sorted
   * aggregation. The quantifier must therefore be lazy: a greedy [^}]* runs
   * past `sorter: {` (there is no `}` before it) and captures the inner
   * path, so the aggregation resolves against a path the model does not
   * have, the row shape comes out null - and every relative field below it
   * silently stops being checked. */
  const complex = v.match(/^\{[^}]*?\bpath\s*:\s*['"]([^'"]+)['"]/);
  if (complex) return complex[1];
  return bindingPath(v) || relativePath(v);
}

/* {= ...} expression bindings: report only unbalanced braces/parens -
 * anything subtler is the runtime's business, and guessing produces noise. */
export function brokenExpression(value) {
  const v = String(value);
  if (!v.startsWith('{=')) return false;
  let braces = 0;
  let parens = 0;
  for (const c of v) {
    if (c === '{') braces++;
    else if (c === '}') braces--;
    else if (c === '(') parens++;
    else if (c === ')') parens--;
    if (braces < 0 || parens < 0) return true;
  }
  return braces !== 0 || parens !== 0;
}
