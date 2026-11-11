/*
 * icons — the SAP icon font, resolved against the target release.
 *
 * An unknown `sap-icon://` name is the quietest defect in a UI5 view. It is
 * not an error anywhere: IconPool looks the name up at render time, finds
 * nothing, and the control renders with no icon at all. Nothing is logged,
 * nothing fails, no other gate can see it — abaplint reads ABAP, ui5lint never
 * sees a backend-built view, and the property gate reads control metadata,
 * where a font glyph does not appear. So it ships, and it surfaces months
 * later as "not all icons are shown", reported by whoever runs the oldest
 * release.
 *
 * Three findings, all from data/icons.json (see scripts/generate-icons.mjs):
 *   unknown-icon    the name is in no scanned release — a typo, forever
 *   icon-too-new    the glyph reached the font after the target release
 *   icon-removed    the glyph left the font again (renamed) and is gone on
 *                   releases from that one on
 *
 * Case is not a detail here. `IconPool.getIconInfo` resolves the URI through
 * `URI.parse( )` and reads `parts.hostname`, and a hostname is LOWER-CASED —
 * so icon names are effectively case-insensitive, and a camelCase name is not
 * "nearly right": `sap-icon://textFormatting` matches nothing, in every
 * release, forever (the name is `text-formatting`). Every comparison here is
 * therefore lower-cased, and so is the registry data.
 *
 * A collection-qualified name (`sap-icon://collection/name`) belongs to a
 * custom icon font registered at runtime — out of scope, never judged.
 */
import { runRule } from './rule.mjs';
import unknownIcon from './rules/unknown-icon.mjs';
import iconRemoved from './rules/icon-removed.mjs';
import iconTooNew from './rules/icon-too-new.mjs';
import fs from 'fs';
import { majorMinor } from './abap.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ICONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'icons.json');

/* Parsed once per path, like the metadata snapshot: checkAbapSource /
 * checkXmlSource load it per call, and over a corpus of a few hundred files
 * the repeated parse is the whole cost of the rule. Treated as immutable. */
const cache = new Map();

export function loadIcons(file = DEFAULT_ICONS) {
  const cached = cache.get(file);
  if (cached) return cached;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* Missing data is not a reason to fail the run: the icon rules are one
     * gate among many, and a partial install (the file ships in package.json
     * files[]) must not take the property gate down with it. An empty
     * registry simply reports nothing — the same "no guessing" the rest of
     * the linter follows. */
    raw = null;
  }
  const data = raw && raw.icons
    ? {
      floor: raw.floor || '1.71',
      ui5Version: raw.ui5Version || '',
      since: new Map(Object.entries(raw.icons).map(([n, v]) => [n.toLowerCase(), v])),
      removed: new Map(Object.entries(raw.removed || {}).map(([n, v]) => [n.toLowerCase(), v])),
    }
    : { floor: '1.71', ui5Version: '', since: new Map(), removed: new Map() };
  cache.set(file, data);
  return data;
}

const parseVer = (s) => majorMinor(String(s));


/* `sap-icon://` plus everything a name may contain. The `/` is included so a
 * collection-qualified name is CAPTURED and then skipped — leaving it out
 * would truncate `sap-icon://tnt/actor` to `tnt` and report a typo that is
 * not there. */
const ICON_URI = /sap-icon:\/\/([A-Za-z0-9_/-]+)/g;
// the literal closes right behind the name and the next operand is joined on
const CONCATENATED = /^[`']\s*&&/;

/**
 * XML comments blanked out, character for character, so every offset into
 * the result is an offset into the original. `<!-- <Button
 * icon="sap-icon://old-typo"/> -->` is a note about a control that is not
 * there, and the ABAP side already arrives with its comments scrubbed; the
 * XML side handed the raw text through and reported the note. Only a
 * TERMINATED comment is blanked — a stray `<!--` must not swallow the view.
 * Found with indexOf (what `/<!--[\s\S]*?-->/g` matched): once a `<!--` has
 * no `-->` after it, neither has any later one, where that regex searched the
 * rest of the text again from each of them.
 */
function blankXmlComments(xml) {
  const text = String(xml);
  let out = '';
  let done = 0;
  for (let open = text.indexOf('<!--'); open >= 0; open = text.indexOf('<!--', done)) {
    const close = text.indexOf('-->', open + 4);
    if (close < 0) break;
    out += text.slice(done, open) + text.slice(open, close + 3).replace(/[^\n]/g, ' ');
    done = close + 3;
  }
  return out + text.slice(done);
}

/**
 * Every `sap-icon://` in a piece of source (ABAP with comments already
 * scrubbed, or view XML — pass `xml: true` and its comments are scrubbed
 * here), judged against the target release.
 *
 * Text-level on purpose, rather than per view attribute: an icon name travels
 * as data just as often as it travels as an attribute — a column of a bound
 * table, a constant, a status-to-icon mapping — and those never reach the view
 * tree the property gate walks. One scan of the source sees both.
 */
export function checkIcons(text, { minUi5 = '1.71', iconData = undefined, xml = false, timings = null } = {}) {
  const data = iconData === undefined ? loadIcons() : iconData;
  if (!data.since.size) return [];
  const scanned = xml ? blankXmlComments(text) : String(text);
  const target = parseVer(minUi5) || [1, 71];
  const floor = parseVer(data.floor) || [1, 71];
  const findings = [];
  /* One report per name, not per occurrence — the same dedupe key the other
   * two gates use, so a status-to-icon mapping that writes the same wrong
   * name in twenty rows is one finding, at its first position. */
  const seen = new Set();
  const report = (f) => {
    const key = `${f.type}|${f.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };
  // the three rules (lib/rules/), in the order a name is judged: no release
  // has it, a release removed it, it arrived after the floor
  const run = (rule, context) => runRule(rule, context, { timings });

  for (const m of scanned.matchAll(ICON_URI)) {
    const written = m[1];
    if (written.includes('/')) continue; // a custom collection's font
    /* An interpolation follows: `|sap-icon://status-{ code }|` names its glyph
     * at runtime, and `status-` is the prefix of that name, not a glyph of its
     * own. The reconstructor's literalElements draws the same line for an
     * interpolated template — what is not literal is not judged. */
    if (scanned[m.index + m[0].length] === '{') continue;
    /* …and so does a literal that ENDS at the name and is concatenated:
     * `` `sap-icon://status-` && lv_code `` is the backtick spelling of the
     * same prefix, and `status-` was reported as a glyph nobody wrote. */
    if (!xml && CONCATENATED.test(scanned.slice(m.index + m[0].length, m.index + m[0].length + 64))) continue;
    const name = written.toLowerCase();
    const since = data.since.get(name);

    const named = { written, since, offset: m.index, data, report };
    if (run(unknownIcon, { ...named, at: m.index + m[0].length - written.length })) continue;
    if (run(iconRemoved, { ...named, name })) continue;
    run(iconTooNew, { ...named, floor, minUi5, target });
  }
  return findings;
}
