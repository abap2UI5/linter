/*
 * abap-helpers — readers of ABAP text that several rules share.
 *
 * Moved out of abap-rules.mjs so that a rule written as one unit
 * (lib/rules/) can use them: abap-rules.mjs imports the rule registry, so a
 * rule importing it would be a cycle. Nothing here reports a finding, and
 * nothing here imports a registry (findings, rule-docs, fix, abap-rules) -
 * test/review/rule-units.mjs holds that line.
 */
import { blankLiterals, literalEnd } from './abap.mjs';
import { declarationElements } from './reconstruct.mjs';

/** Every string literal in the source with its kind: a backtick literal takes
 *  a backslash verbatim, a |…| template reads it as an escape. That is the
 *  whole difference between CSS that renders and CSS that kills the view. */
let segmentsMemo = { src: null, segments: null };

export function literalSegments(abap) {
  // three rules ask for the segments of the same source, once per file
  if (segmentsMemo.src !== abap) segmentsMemo = { src: abap, segments: Object.freeze(literalSegmentsUncached(abap)) };
  return segmentsMemo.segments;
}

/** A membership test over segments in source order (literalSegments( ) yields
 *  them sorted and disjoint): whether offset `at` lies inside one, by binary
 *  search - a rule asking it for every match of a whole class used to scan
 *  every literal each time. */
export function insideSegments(segments) {
  return (at) => {
    let lo = 0, hi = segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = segments[mid];
      if (at < s.start) hi = mid - 1;
      else if (at >= s.end) lo = mid + 1;
      else return true;
    }
    return false;
  };
}

function literalSegmentsUncached(abap) {
  const segments = [];
  let kind = null;
  let start = 0;
  for (let i = 0; i < abap.length; i++) {
    const c = abap[i];
    if (kind === '`' || kind === "'") {
      // a text field literal ('…') is a literal like the backtick one: text,
      // not code - it used to be invisible here, so a name written in one was
      // judged as a call while the same name in backticks was prose
      if (c === kind) { segments.push({ kind, start, end: i }); kind = null; }
    } else if (kind === '|') {
      if (c === '\\') i++;
      else if (c === '|') { segments.push({ kind, start, end: i }); kind = null; }
    } else if (c === '`' || c === '|' || c === "'") {
      kind = c;
      start = i + 1;
    }
  }
  return segments;
}

/** The names the class declares as CONSTANTS or CLASS-DATA, anywhere in the
 *  source, each mapped to the keyword that declared it. Neither is instance
 *  state: the framework's attribute search (`attri_search` in
 *  z2ui5_cl_ui5_srv_model) filters on `is_class = abap_false AND is_constant
 *  = abap_false`, so a bind on one of these finds no attribute and raises
 *  BINDING_ERROR — and a constant is a literal to every rule that asks where
 *  a value comes from. A structured constant registers under the name after
 *  `BEGIN OF`, since a component travels with its root. */
export function staticAttributes(src) {
  const kinds = new Map();
  for (const keyword of ['CONSTANTS', 'CLASS-DATA']) {
    for (const el of declarationElements(src, new RegExp(`^${keyword}$`, 'i'))) {
      const n = el.match(/^(?:BEGIN\s+OF\s+)?(\w+)/i);
      if (n) kinds.set(n[1].toUpperCase(), keyword);
    }
  }
  return kinds;
}

export const isCall = (code, index, head) => code.slice(index, index + head.length).toLowerCase() === head.toLowerCase();

/** Every raised event literal AS WRITTEN, with the span of the name inside
 *  its quotes — what a spelling rule compares and what a fix rewrites. */
export function raisedEventLiterals(src) {
  const code = blankLiterals(src);
  const out = [];
  for (const m of src.matchAll(/client->_event(?:_client)?\s*\(\s*(?:val\s*=\s*)?[`'|]([A-Z0-9_]+)[`'|]/gi)) {
    if (!isCall(code, m.index, 'client->')) continue;
    out.push({ name: m[1], offset: m.index, at: m.index + m[0].length - 1 - m[1].length });
  }
  return out;
}

/* `_bind( val = x path = abap_true )` - the PATH form spelled through the
 * flag. `_bind_path( x )` is the same call byte for byte (z2ui5_if_client:
 * "it delegates rather than repeat the call, so the two can never drift
 * apart") and exists because the flag reads like nothing: a named val and a
 * boolean whose meaning a reader has to know. Judged only where the call
 * passes exactly those two arguments - with a third one (json, tab,
 * switch_default_model, ...) `_bind( )` is the right call and the flag stays.
 * A call that is the whole `v =` value of an attribute is bind-path-as-value's
 * (a bare path there is no binding at all), and is left to that rule. */
/* The source with every literal blanked EXCEPT the embedded expressions of a
 * string template: `|{ client->_bind( … ) }|` is a call, and blankLiterals( )
 * blanks a template whole, embeds included. Offsets are kept. */
export function codeWithEmbeds(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const quoted = (i) => { const e = literalEnd(src, i); blank(i + 1, e); return e + 1; };
  const embed = (j) => {
    while (j < src.length) {
      const t = src[j];
      if (t === '`' || t === "'") { j = quoted(j); continue; }
      if (t === '|') { j = template(j); continue; }
      if (t === '}') return j + 1;
      j++;
    }
    return j;
  };
  const template = (i) => {
    let j = i + 1;
    let from = j;
    while (j < src.length) {
      const t = src[j];
      if (t === '\\') { j += 2; continue; }
      if (t === '{') { blank(from, j); j = embed(j + 1); from = j; continue; }
      if (t === '|' || t === '\n') { blank(from, j); return t === '|' ? j + 1 : j; }
      j++;
    }
    blank(from, j);
    return j;
  };
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '`' || c === "'") { i = quoted(i); continue; }
    if (c === '|') { i = template(i); continue; }
    i++;
  }
  return out.join('');
}

/* The marks of BINDING VOCABULARY in a value or in the statement that
 * assigns it: an escaped brace (a binding or an expression written as text
 * for the view), a `${…}` expression-binding reference, a bind or event call,
 * a wire, an already-escaped literal, or a backslash of any kind (an escape
 * the author placed on purpose). A value that shows one of these is what `v`
 * is FOR and never a finding. */
export const BINDING_VOCAB = /\\|\$\{|\{=|_bind\w*\s*\(|_event\w*\s*\(|follow_up_action\s*\(|escape_literal\s*\(/i;

/* a name a value can be: `mv_x`, `me->mv_x`, `ls_row-field`, `lr_row->field`,
 * `<fs>-field` - one token, no call, no operator */
export const DATA_NAME = /^(?:me->)?(?:<\w+>|\w+)(?:(?:-|->)\w+)*$/;

/* The property types text can never be SHOWN in: a number, a boolean, a CSS
 * size or colour, an id, an enum. A brace in such a value is not a binding
 * mistaken for text, it is a value the property refuses on its own terms,
 * and `t =` would not make it valid either - so the rule stands down where
 * the metadata says the attribute is one of these. A URI is one of them: it
 * is loaded or navigated, never shown, and a brace in it is not text that
 * went missing but a target that was never a URL. */
export const NON_TEXT_TYPE = /^(?:int|float|boolean|sap\.ui\.core\.(?:CSSSize|CSSSizeShortHand|CSSColor|ID|Percentage|URI))(?:\[\])?$/;

export const VERBATIM_ATTRIBUTE = /^(?:id|class)$/;
