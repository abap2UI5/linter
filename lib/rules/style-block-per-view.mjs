import { defineRule } from '../rule.mjs';
import { STYLE_OPEN, insideSegments, literalSegments, styleCloseAt } from '../abap-helpers.mjs';
import { elementsOf } from '../abap-model.mjs';
import { armsAt, ownCallSites } from '../lifecycle-rules.mjs';

/* A large stylesheet in a view the class displays from an event branch.
 *
 * The usual way to give an app its own CSS is a core:HTML whose `content` is
 * a <style> block. The view is XML sent with the response, so the sheet
 * travels with every view_display( ) - and an app that rebuilds its view on
 * every event sends it on every roundtrip. Two cheaper places exist: the
 * installation's exit (z2ui5_if_ui5_exit=>ty_s_http_config-styles_css, written
 * into the page head once per page load), and a view displayed once, which a
 * data-only roundtrip updates through the model.
 *
 * The threshold is a constant: a rule takes no options in the `rules` block
 * (lib/config.mjs knows `severity` and `exclude`), and 2 KB is what the
 * backlog item asks for - a rule or two for one control stays well under it.
 *
 * What is judged, conservatively:
 *   - the CSS is the literal text between <style …> and </style> in the
 *     source, delimiters, `&&` and line breaks not counted. A sheet with
 *     anything else in it - a variable concatenated in, a |…| template with
 *     an embedded expression - is built from data: it changes per
 *     roundtrip, its size is the data's, and it is not judged.
 *   - "displayed from an event branch": the method holding the sheet (or the
 *     constant holding it, through every method that reads it) is followed
 *     back through the class's own calls to main( ). A path is reported when
 *     no arm on it is check_on_init( ) / check_on_navigated( ) and it either
 *     runs unconditionally or passes an event arm (a WHEN of the event CASE,
 *     check_on_event( ), the ELSE of a lifecycle fork). A path through any
 *     other condition only is not judged, nor is a sheet whose method nothing
 *     in the class calls.
 *   - a native html:style element is not read: the builder writes it as a
 *     generic tag whose text is not a <style> literal. */
const MAX_BYTES = 2048;
const utf8 = new TextEncoder();

/* The byte size of the CSS between `from` and `to`, or null when the sheet
 * is not one run of literals joined by `&&`. */
function cssBytes(src, segments, from, to) {
  let bytes = 0;
  let pos = from;
  let inside = false;
  for (const seg of segments) {
    if (seg.end < from) continue;
    if (seg.start > to) break;
    if (!inside) {
      if (seg.start > from) return null; // the opening tag is not in a literal
      inside = true;
    } else if (!/^[\s&`'|]*$/.test(src.slice(pos, seg.start))) {
      return null; // code between two literals: a variable, a call
    }
    const text = src.slice(Math.max(seg.start, from), Math.min(seg.end, to));
    if (seg.kind === '|' && /(?:^|[^\\])\{/.test(text)) return null; // an embedded expression
    bytes += utf8.encode(seg.kind === '|' ? text.replace(/\\(.)/g, '$1') : text).length;
    pos = seg.end;
    if (seg.end >= to) return bytes;
  }
  return null; // the closing tag is not in a literal
}

/* The name a declaration statement declares at offset `at` (a CONSTANTS or
 * DATA holding the sheet), or null. */
function declaredAt(model, at) {
  const s = model.statements.find((x) => x.start <= at && at < x.end);
  if (!s || !['CONSTANTS', 'DATA', 'CLASS-DATA'].includes(s.keyword)) return null;
  for (const el of elementsOf(s)) {
    const first = el[0];
    const last = el[el.length - 1];
    if (first?.kind === 'word' && first.start <= at && at < (last?.end ?? first.end) + 1) return first.upper;
  }
  return null;
}

/* Where the class reads the name `upper` inside a method - not a call. */
function readSites(model, upper) {
  const sites = [];
  for (const method of model.methods) {
    for (const s of method.statements) {
      const t = s.tokens;
      for (let i = 0; i < t.length; i++) {
        if (t[i].kind !== 'word' || t[i].upper.split('-')[0] !== upper) continue;
        const prev = t[i - 1];
        if (prev?.text === '=>' || (prev?.text === '->' && t[i - 2]?.upper !== 'ME')) continue;
        sites.push({ method, offset: t[i].start });
      }
    }
  }
  return sites;
}

const LIFECYCLE = new Set(['init', 'navigated']);

/* Whether the sheet at `at` reaches main( ) on a path that displays it from
 * an event roundtrip (see the head comment). */
function displayedOnEvents(model, src, at) {
  let verdict = false;
  let budget = 200;
  const walk = (offset, armsSoFar, seen, depth) => {
    if (verdict || budget-- <= 0 || depth > 8) return;
    const method = model.methodAt(offset);
    if (!method) {
      const name = declaredAt(model, offset);
      if (!name || seen.has(`=${name}`)) return;
      for (const site of readSites(model, name)) walk(site.offset, armsSoFar, new Set(seen).add(`=${name}`), depth + 1);
      return;
    }
    const arms = armsAt(method, src, offset);
    if (!arms) return;
    const path = [...arms, ...armsSoFar];
    if (path.some((a) => LIFECYCLE.has(a.kind))) return;
    if (method.name.toLowerCase() === 'main') {
      const deciding = path.filter((a) => a.kind !== 'loop' && a.kind !== 'try');
      if (!deciding.length || deciding.some((a) => a.kind === 'event')) verdict = true;
      return;
    }
    const name = method.name.toLowerCase();
    if (seen.has(name)) return;
    for (const site of ownCallSites(model, name)) {
      if (site.method === method) continue;
      walk(site.offset, path, new Set(seen).add(name), depth + 1);
    }
  };
  walk(at, [], new Set(), 0);
  return verdict;
}

function check({ model, src, report }) {
  if (!/<style\b/i.test(src)) return;
  if (!model.methods.some((m) => m.name.toLowerCase() === 'main')) return;
  const segments = literalSegments(src);
  const inLiteral = insideSegments(segments);
  for (const open of src.matchAll(STYLE_OPEN)) {
    if (!inLiteral(open.index)) continue;
    const from = open.index + open[0].length;
    const to = styleCloseAt(src, from);
    if (to === -1) continue;
    const bytes = cssBytes(src, segments, from, to);
    if (bytes === null || bytes < MAX_BYTES) continue;
    if (!displayedOnEvents(model, src, open.index)) continue;
    const owner = model.methodAt(open.index)?.name.toLowerCase() ?? declaredAt(model, open.index)?.toLowerCase();
    report({ count: bytes, ...(owner ? { member: owner } : {}), offset: open.index, dedupe: String(open.index) });
  }
}

export default defineRule({
  id: 'style-block-per-view',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  message: (f) => `about ${f.count} bytes of CSS in a <style> block are sent with every display of this view, and the class displays it from an event branch — move a stylesheet that does not change into the installation's styles_css (z2ui5_if_ui5_exit), or display the view once and let the model update it`,
  check,
});
