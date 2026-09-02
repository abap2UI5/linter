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
import fs from 'fs';
import { caseMatch } from './suggest.mjs';
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

const parseVer = (s) => {
  const m = String(s).match(/(\d+)\.(\d+)/);
  return m ? [+m[1], +m[2]] : null;
};

const lte = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

/* `sap-icon://` plus everything a name may contain. The `/` is included so a
 * collection-qualified name is CAPTURED and then skipped — leaving it out
 * would truncate `sap-icon://tnt/actor` to `tnt` and report a typo that is
 * not there. */
const ICON_URI = /sap-icon:\/\/([A-Za-z0-9_/-]+)/g;

/**
 * Every `sap-icon://` in a piece of source (ABAP with comments already
 * scrubbed, or raw view XML), judged against the target release.
 *
 * Text-level on purpose, rather than per view attribute: an icon name travels
 * as data just as often as it travels as an attribute — a column of a bound
 * table, a constant, a status-to-icon mapping — and those never reach the view
 * tree the property gate walks. One scan of the source sees both.
 */
export function checkIcons(text, { minUi5 = '1.71', iconData = undefined } = {}) {
  const data = iconData === undefined ? loadIcons() : iconData;
  if (!data.since.size) return [];
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

  for (const m of String(text).matchAll(ICON_URI)) {
    const written = m[1];
    if (written.includes('/')) continue; // a custom collection's font
    const name = written.toLowerCase();
    const since = data.since.get(name);

    if (since === undefined) {
      /* Not in any release the scan covers. The name is wrong — a typo, or
       * camelCase for a hyphenated name. Reported whatever the target is:
       * there is no release on which it renders. */
      /* did you mean: the one glyph this is up to case and hyphens —
       * `textFormatting` for `text-formatting`, the camelCase miss the
       * message already describes. The fix rewrites the name in place. */
      const suggestion = caseMatch(written, data.since.keys());
      const at = m.index + m[0].length - written.length;
      report({
        type: 'unknown-icon', value: written, offset: m.index,
        ...(suggestion ? { written, suggestion, fixes: [{ start: at, end: at + written.length, text: suggestion }] } : {}),
      });
      continue;
    }

    const gone = data.removed.get(name);
    if (gone) {
      report({ type: 'icon-removed', value: written, since, lastSeen: gone, offset: m.index });
      continue;
    }

    /* `since` at the data's floor means "at or before" — nothing below the
     * floor was scanned, so a target under it cannot be judged and is left
     * alone rather than guessed at. */
    const arrived = parseVer(since);
    if (!arrived || lte(arrived, floor) || lte(arrived, target)) continue;
    report({ type: 'icon-too-new', value: written, since, minUi5, offset: m.index });
  }
  return findings;
}
