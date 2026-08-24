#!/usr/bin/env node
/*
 * generate-dependents — the "Used by" block in README.md.
 *
 * GitHub already knows who depends on this package. The dependency graph
 * resolves `@abap2ui5/linter` in a consumer's package.json through the npm
 * registry back to this repository — the `repository` field in our own
 * package.json is what makes that link — and lists the result on
 *
 *   https://github.com/abap2UI5/linter/network/dependents
 *
 * What GitHub does NOT do is show the sidebar **"Used by"** panel abaplint
 * has. That panel appears only once the selected package has **at least 100
 * dependents**: a threshold, not a setting. Every mechanical precondition on
 * our side is already met (package published, repository link resolving,
 * dependency graph on, dependents indexed), so there is nothing to switch on
 * and nothing to fix — there are simply not enough dependents yet. Do not go
 * looking for a repository setting; there isn't one.
 *
 * Hence this script: the same fact, rendered where we do decide what is
 * shown. It rewrites the block between the markers in README.md from that
 * page, monthly (`.github/workflows/refresh-dependents.yml`).
 *
 * Two things follow for anyone maintaining it:
 *
 *   - Only a MANIFEST entry counts. `npx --yes @abap2ui5/linter` in a
 *     workflow and the composite Action (`abap2UI5/linter@v0`) are both
 *     invisible to the dependency graph, so a repo using the linter that way
 *     is a user but never a dependent. `npm i -D @abap2ui5/linter` plus a
 *     committed lockfile is what makes it count — which is the one lever we
 *     have on the number itself.
 *   - There is no API for this. The page is scraped, so its markup IS the
 *     contract, and it is GitHub's to change. A parse that comes back empty
 *     is therefore treated as breakage: the script exits 1 and leaves the
 *     README alone rather than quietly publishing "0 repositories".
 *
 *   node scripts/generate-dependents.mjs            fetch and rewrite the block
 *   node scripts/generate-dependents.mjs --check    exit 1 if the block is stale
 *   node scripts/generate-dependents.mjs --from <f> parse a saved page instead
 *                                                   of fetching (offline; also
 *                                                   how the test drives it)
 *   node scripts/generate-dependents.mjs --package-id <id>
 *                                                   this repo publishes two
 *                                                   packages (linter and
 *                                                   render-runtime); the page
 *                                                   shows one at a time
 *
 * Exit codes: 0 written / in sync, 1 stale (--check) or nothing parsed,
 * 2 the page is unreachable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const README_FILE = path.join(ROOT, 'README.md');

export const REPO = 'abap2UI5/linter';
export const DEPENDENTS_URL = `https://github.com/${REPO}/network/dependents`;
export const START = '<!-- dependents:start -->';
export const END = '<!-- dependents:end -->';

/* Rows beyond this are summed into a "and N more" line: the point of the
 * block is that the list is real and checkable, not that it is exhaustive —
 * the link to GitHub's page is the exhaustive one. */
const MAX_ROWS = 24;

/* One dependent per `Box-row`. The repository link is the anchor GitHub marks
 * as a repository hovercard — the row's other anchor is the owner, and the
 * star and fork counts beside it are deliberately not read: they would order
 * the list by popularity and churn the monthly diff for no reader's benefit.
 * This is markup we do not own, so a row that yields no repository link is
 * skipped rather than guessed at. */
const ROW_SPLIT = 'Box-row';
const REPO_LINK = /data-hovercard-type="repository"[^>]*href="\/([^/"]+)\/([^/"?#]+)"/;

export function parseDependents(html) {
  const seen = new Set();
  const rows = [];
  for (const chunk of html.split(ROW_SPLIT).slice(1)) {
    const m = REPO_LINK.exec(chunk);
    if (!m) continue;
    const full = `${m[1]}/${m[2]}`;
    if (seen.has(full)) continue;   // the last row of one page repeats as the first of the next
    seen.add(full);
    rows.push({ owner: m[1], repo: m[2] });
  }
  return rows;
}

/* The pager is a plain link carrying an opaque cursor. "Previous" carries one
 * too (`dependents_before`), so the link text is part of what identifies it. */
export function nextPage(html) {
  const m = /href="([^"]*[?&]dependents_after=[^"]*)"[^>]*>\s*Next/.exec(html);
  if (!m) return null;
  const href = m[1].replace(/&amp;/g, '&');
  return new URL(href, 'https://github.com').href;
}

/* Alphabetical, not by stars: the list is a fact about who depends on this
 * package, not a ranking, and a stable order keeps the monthly diff to the
 * repositories that actually came and went. */
const byName = (a, b) => `${a.owner}/${a.repo}`.toLowerCase()
  .localeCompare(`${b.owner}/${b.repo}`.toLowerCase());

export function renderBlock(rows) {
  const sorted = [...rows].sort(byName);
  const shown = sorted.slice(0, MAX_ROWS);
  const rest = sorted.length - shown.length;
  const lines = [
    START,
    '<!-- generated by scripts/generate-dependents.mjs \u2014 do not edit by hand -->',
    '',
    `**${sorted.length} public repositor${sorted.length === 1 ? 'y' : 'ies'}** declare \`@abap2ui5/linter\``
      + ` in a manifest \u2014 [GitHub's own list](${DEPENDENTS_URL}), refreshed here monthly:`,
    '',
    ...shown.map((r) => `- [${r.owner}/${r.repo}](https://github.com/${r.owner}/${r.repo})`),
  ];
  if (rest > 0) lines.push(`- [\u2026and ${rest} more](${DEPENDENTS_URL})`);
  lines.push('', END);
  return lines.join('\n');
}

export function applyToReadme(text, block) {
  const from = text.indexOf(START);
  const to = text.indexOf(END);
  if (from < 0 || to < 0 || to < from) {
    throw new Error(`README.md carries no ${START} / ${END} pair — the block has no place to go`);
  }
  return text.slice(0, from) + block + text.slice(to + END.length);
}

async function fetchPage(url) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: {
          // an unidentified scraper is what rate limiting is for
          'user-agent': `${REPO} generate-dependents (+https://github.com/${REPO})`,
          accept: 'text/html',
        },
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    if (res.ok) return res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    throw new Error(`${url} answered ${res.status} ${res.statusText}`);
  }
}

export async function collect({ packageId } = {}) {
  const first = new URL(DEPENDENTS_URL);
  first.searchParams.set('dependent_type', 'REPOSITORY');
  if (packageId) first.searchParams.set('package_id', packageId);

  const rows = [];
  const seen = new Set();
  const visited = new Set();
  let url = first.href;
  // a cursor that never ends is the failure mode of a scraped pager, and a
  // repository seen on an earlier page is the failure mode of walking one:
  // the pages are cut by cursor while the underlying list keeps moving
  for (let page = 0; url && page < 40; page++) {
    if (visited.has(url)) break;
    visited.add(url);
    const html = await fetchPage(url);
    for (const row of parseDependents(html)) {
      const key = `${row.owner}/${row.repo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    url = nextPage(html);
  }
  return rows;
}

const arg = (name) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const saved = arg('--from');
  let rows;
  try {
    rows = saved
      ? parseDependents(fs.readFileSync(saved, 'utf8'))
      : await collect({ packageId: arg('--package-id') });
  } catch (err) {
    console.error(`the dependents page is unreachable: ${err.message}`);
    process.exit(2);
  }

  /* GitHub owns this markup. An empty parse is the shape a layout change
   * takes, and it is indistinguishable from "nobody depends on us" — so it
   * fails here instead of rewriting the README into a claim that is almost
   * certainly false. */
  if (rows.length === 0) {
    console.error(`no dependent parsed from ${saved ?? DEPENDENTS_URL}`
      + ' — the page layout has changed, or the package has no dependents at all;'
      + ' check it by hand before touching README.md');
    process.exit(1);
  }

  const text = fs.readFileSync(README_FILE, 'utf8');
  const next = applyToReadme(text, renderBlock(rows));
  if (process.argv.includes('--check')) {
    if (next !== text) {
      console.error('the README "Used by" block is stale — run: npm run generate-dependents');
      process.exit(1);
    }
    console.log(`README.md is up to date (${rows.length} dependents)`);
  } else {
    fs.writeFileSync(README_FILE, next);
    console.log(`wrote the "Used by" block into README.md (${rows.length} dependents`
      + `${rows.length > MAX_ROWS ? `, ${MAX_ROWS} listed` : ''})`);
  }
}
