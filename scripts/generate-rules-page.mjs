#!/usr/bin/env node
/*
 * generate-rules-page — site/index.html, the published rule reference.
 *
 * rules.abaplint.org is where an abaplint user goes to find out what a rule
 * id means; this is the same thing for abap2UI5 views. Generated from the
 * registry (lib/findings.mjs) and the prose (lib/rule-docs.mjs), so a rule
 * that exists is on the page and a rule on the page exists — no third list to
 * keep in step.
 *
 * One self-contained file: no build step, no CDN, no external font. GitHub
 * Pages serves site/ as-is.
 *
 *   node scripts/generate-rules-page.mjs           write the page
 *   node scripts/generate-rules-page.mjs --check   exit 1 if it is stale
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RULES, SEVERITIES, RENDER_RULE, defaultSeverityOf } from '../lib/findings.mjs';
import { RULE_DOCS, CATEGORIES } from '../lib/rule-docs.mjs';
import { FIXABLE } from '../lib/fix.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE_FILE = path.join(ROOT, 'site', 'index.html');
const REPO = 'https://github.com/abap2UI5/linter';

/*
 * Where each rule is DEFINED, so a card can link at the code and not only at
 * the prose. Scanned rather than listed: a hand-kept table is a third list to
 * keep in step (AGENTS.md's "a new rule moves four places together" is already
 * three), and it would go stale silently. The emit site is the line that
 * builds the finding — `type: '<id>'` — and the fallback is the registry in
 * findings.mjs, which every rule is in by definition, including the render
 * gate's pseudo-rule that no check emits.
 *
 * The line numbers ride into the generated page, so a module that shifts its
 * lines makes `--check` fail until the page is regenerated. That is the drift
 * gate doing its job, not noise: the link is only worth having while it lands
 * on the right line.
 */
const LIB = path.join(ROOT, 'lib');
function emitSites() {
  const found = new Map();
  const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.mjs')).sort();
  for (const pass of ['emit', 'mention']) {
    for (const file of files) {
      if (pass === 'emit' && file === 'findings.mjs') continue; // the registry is the fallback
      const lines = fs.readFileSync(path.join(LIB, file), 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const id of PAGE_RULES) {
          if (found.has(id)) continue;
          const hit = pass === 'emit'
            ? lines[i].includes(`type: '${id}'`)
            : lines[i].includes(`'${id}'`);
          if (hit) found.set(id, { file, line: i + 1 });
        }
      }
    }
  }
  return found;
}

/* The page is served from main while every consumer pins a version, so a
 * reader had no way to tell which release it describes - a rule card for a
 * rule their pinned CLI does not have reads exactly like a rule card for one
 * it does. The stamp is the version this build came from. */
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
export const UI5_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'properties.json'), 'utf8')).ui5Version;

/* Everything the page owes an anchor to. RULES plus the render gate's
 * pseudo-rule: `render-error` is emitted by no check, so it is deliberately
 * not in the registry — but it reaches reports and SARIF like any other id,
 * and the SARIF helpUri points here, so it needs its card. */
const PAGE_RULES = [...RULES, RENDER_RULE].sort();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The little bit of markdown the prose uses: `code` and **strong**. */
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  .replace(/\*\*([^*]+)\*\*/g, (_, c) => `<strong>${c}</strong>`);

const CSS = `
:root {
  --bg: #fff; --fg: #1c1e21; --muted: #5c6370; --line: #e3e6ea; --card: #fafbfc;
  --code-bg: #f2f4f6; --link: #0b62c4;
  --error: #b31d28; --error-bg: #ffe9e7; --warning: #8a5300; --warning-bg: #fff4d6;
  --hint: #0a5c8a; --hint-bg: #e2f1fb; --fix: #1a6b3c; --fix-bg: #def3e6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216; --fg: #e6e8eb; --muted: #99a1ad; --line: #262b33; --card: #161a20;
    --code-bg: #1c2128; --link: #6cb6ff;
    --error: #ff9492; --error-bg: #3a1d1d; --warning: #f0c368; --warning-bg: #3a2f13;
    --hint: #8fc9ef; --hint-bg: #16303f; --fix: #7ee2a8; --fix-bg: #14301f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg); line-height: 1.6;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.wrap { max-width: 62rem; margin: 0 auto; padding: 2.5rem 1.25rem 6rem; }
a { color: var(--link); }
code { background: var(--code-bg); padding: .1em .35em; border-radius: 4px; font-size: .9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
pre { background: var(--code-bg); padding: .85rem 1rem; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
header h1 { margin: 0 0 .25rem; font-size: 2rem; letter-spacing: -.02em; }
header p.lede { margin: 0 0 1.25rem; color: var(--muted); font-size: 1.05rem; }
.counts { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.5rem; }
.badge { display: inline-block; padding: .1rem .55rem; border-radius: 999px; font-size: .78rem;
  font-weight: 600; letter-spacing: .01em; white-space: nowrap; }
.badge.error { color: var(--error); background: var(--error-bg); }
.badge.warning { color: var(--warning); background: var(--warning-bg); }
.badge.hint { color: var(--hint); background: var(--hint-bg); }
.badge.fix { color: var(--fix); background: var(--fix-bg); }
#filter { width: 100%; padding: .7rem .9rem; font-size: 1rem; color: var(--fg);
  background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
#filter:focus { outline: 2px solid var(--link); outline-offset: -1px; }
.hint-line { margin: .4rem 0 2rem; color: var(--muted); font-size: .88rem; }
/* which release this page describes - it follows main, every consumer pins */
header p.stamp { margin: 0 0 1rem; color: var(--muted); font-size: .88rem; }
section.cat { margin: 2.5rem 0 0; }
section.cat > h2 { font-size: 1.3rem; margin: 0 0 .2rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
section.cat > p.blurb { margin: 0 0 1.25rem; color: var(--muted); }
article.rule { border: 1px solid var(--line); background: var(--card); border-radius: 10px;
  padding: 1rem 1.15rem; margin-bottom: .85rem; }
article.rule > h3 { margin: 0 0 .4rem; font-size: 1.02rem; display: flex; flex-wrap: wrap;
  align-items: center; gap: .5rem; }
article.rule > h3 a { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-decoration: none; }
article.rule > h3 a:hover { text-decoration: underline; }
article.rule p { margin: .35rem 0; }
article.rule p.summary { font-weight: 500; }
article.rule p.detail, article.rule p.fixnote { color: var(--muted); font-size: .94rem; }
article.rule pre { margin: 0; font-size: .86rem; }
/* the before/after pair - side by side where there is room, stacked below,
   because an ABAP chain does not survive a 30-column column */
.ba { display: grid; gap: .6rem; margin: .6rem 0 0; grid-template-columns: 1fr; }
@media (min-width: 56rem) { .ba { grid-template-columns: 1fr 1fr; } }
.ba figure { margin: 0; min-width: 0; }
.ba figcaption { font-size: .72rem; font-weight: 600; letter-spacing: .04em;
  text-transform: uppercase; margin: 0 0 .25rem; }
.ba .before figcaption { color: var(--error); }
.ba .after figcaption { color: var(--fix); }
.ba .before pre { box-shadow: inset 3px 0 0 var(--error); }
.ba .after pre { box-shadow: inset 3px 0 0 var(--fix); }
article.rule p.src { margin: .55rem 0 0; font-size: .82rem; color: var(--muted); }
.empty { color: var(--muted); font-style: italic; display: none; }
footer { margin-top: 3.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line);
  color: var(--muted); font-size: .88rem; }
table.sev { border-collapse: collapse; margin: .5rem 0 0; font-size: .92rem; }
table.sev td { padding: .3rem .8rem .3rem 0; vertical-align: top; }
`;

const SCRIPT = `
const input = document.getElementById('filter');
const rules = [...document.querySelectorAll('article.rule')];
// only the rule sections take part in filtering - the usage section stays
const cats = [...document.querySelectorAll('section.cat')].filter((c) => c.querySelector('article.rule'));
const empty = document.querySelector('.empty');
const apply = () => {
  const q = input.value.trim().toLowerCase();
  for (const r of rules) r.hidden = q && !r.dataset.search.includes(q);
  for (const c of cats) c.hidden = ![...c.querySelectorAll('article.rule')].some((r) => !r.hidden);
  empty.style.display = rules.every((r) => r.hidden) ? 'block' : 'none';
};
input.addEventListener('input', apply);
// a deep link should never land on a rule the filter is hiding
addEventListener('hashchange', () => { input.value = ''; apply(); });
apply();
`;

function ruleCard(id, sites) {
  const doc = RULE_DOCS[id];
  const severity = defaultSeverityOf(id);
  const fixable = FIXABLE.includes(id);
  const search = [id, doc.summary, doc.detail, severity].join(' ').toLowerCase().replace(/[`*]/g, '');
  const site = sites.get(id);
  return [
    `      <article class="rule" id="${id}" data-search="${esc(search)}">`,
    `        <h3><a href="#${id}">${id}</a>`,
    `          <span class="badge ${severity}">${severity}</span>`,
    fixable ? '          <span class="badge fix">--fix</span>' : null,
    '        </h3>',
    `        <p class="summary">${inline(doc.summary)}</p>`,
    `        <p class="detail">${inline(doc.detail)}</p>`,
    doc.fixNote ? `        <p class="fixnote"><strong>--fix:</strong> ${inline(doc.fixNote)}</p>` : null,
    /* The anchor sits on the PAIR, not on the card: a report links a reader
     * straight at the two snippets, which is the half they act on. */
    `        <div class="ba" id="${id}-example">`,
    '          <figure class="before"><figcaption>reported</figcaption>',
    `            <pre><code>${esc(doc.example)}</code></pre></figure>`,
    '          <figure class="after"><figcaption>fixed</figcaption>',
    `            <pre><code>${esc(doc.remedy)}</code></pre></figure>`,
    '        </div>',
    site ? `        <p class="src">Defined in <a href="${REPO}/blob/main/lib/${site.file}#L${site.line}"><code>lib/${site.file}</code></a></p>` : null,
    '      </article>',
  ].filter(Boolean).join('\n');
}

export function buildPage() {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, PAGE_RULES.filter((r) => defaultSeverityOf(r) === s).length]));
  const sites = emitSites();
  const sections = CATEGORIES.map((cat) => {
    const ids = PAGE_RULES.filter((id) => RULE_DOCS[id].category === cat.id);
    return [
      `    <section class="cat" id="cat-${cat.id}">`,
      `      <h2>${esc(cat.title)}</h2>`,
      `      <p class="blurb">${inline(cat.blurb)}</p>`,
      ...ids.map((id) => ruleCard(id, sites)),
      '    </section>',
    ].join('\n');
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>abap2UI5 linter rules</title>
<meta name="description" content="Every rule the abap2UI5 view linter reports: what it means, how severe it is, and how to configure or waive it.">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>abap2UI5 linter rules</h1>
    <p class="lede">Every rule the <a href="${REPO}">abap2UI5 view linter</a> can report — the id it prints,
      what it means, and what to do about it.</p>
    <div class="counts">
      <span class="badge error">${counts.error} error</span>
      <span class="badge warning">${counts.warning} warning</span>
      <span class="badge hint">${counts.hint} hint</span>
      <span class="badge fix">${FIXABLE.length} autofixable</span>
    </div>
    <p class="stamp">Generated from <strong>v${VERSION}</strong>, against the OpenUI5 ${UI5_VERSION} metadata
      snapshot. This page follows <code>main</code>; your pinned CLI reports the rules of the version it is.
      <code>npx abap2ui5lint --version</code> says which that is.</p>
    <input id="filter" type="search" placeholder="Filter ${RULES.length} rules + ${RENDER_RULE} — id, wording, severity" autocomplete="off" spellcheck="false">
    <p class="hint-line">The id is what the linter prints at the end of every reported line, what the
      <code>rules</code> block of <code>abap2ui5lint.jsonc</code> is keyed by, and what a
      <code>abap2ui5lint-disable-next-line</code> comment names.</p>
  </header>

  <p class="empty">No rule matches that.</p>

  <section class="cat" id="cat-usage">
    <h2>Severity, and how to waive a rule</h2>
    <p class="blurb">Every finding is always reported; <code>--fail-on</code> only decides the exit code
      (default: <code>warning</code>).</p>
    <table class="sev">
      <tr><td><span class="badge error">error</span></td><td>the app breaks: a dump, a control that will not load, a value UI5 rejects, or a defect that silently destroys the view</td></tr>
      <tr><td><span class="badge warning">warning</span></td><td>it works where it was written, but not necessarily on the target system — or the data behind it is not what the author thinks it is</td></tr>
      <tr><td><span class="badge hint">hint</span></td><td>worth knowing, never wrong by itself</td></tr>
    </table>
    <p>One line, in the source it applies to:</p>
    <pre><code>" abap2ui5lint-disable-next-line unknown-binding-path -- filled in a LOOP
)-&gt;a( n = \`text\` v = \`{PRICE}\` )</code></pre>
    <p>One repo, in <code>abap2ui5lint.jsonc</code>:</p>
    <pre><code>{
  "rules": {
    "missing-accessibility": false,
    "member-deprecated": "hint",
    "event-without-handler": { "severity": "warning", "exclude": ["/test/"] }
  }
}</code></pre>
  </section>

${sections}

  <footer>
    Generated from the rule registry of
    <a href="${REPO}">abap2UI5 linter</a> <strong>v${VERSION}</strong> — do not edit by hand.
    The two gates, the metadata snapshot and the config file are described in
    <a href="https://abap2ui5.github.io/docs/advanced/linter.html">the linter documentation</a>.
    <br>
    ${RULES.length} configurable rules, plus <code>${RENDER_RULE}</code> — the render gate's
    pseudo-rule, which no check emits and every report can name. That is why
    <code>--badge</code> says “${RULES.length} rules passed” while this page has ${PAGE_RULES.length} cards.
  </footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const invokedDirectly = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const text = buildPage();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(PAGE_FILE) ? fs.readFileSync(PAGE_FILE, 'utf8') : '';
    if (current !== text) {
      console.error('site/index.html is stale — run: npm run generate-rules-page');
      process.exit(1);
    }
    console.log('site/index.html is up to date');
  } else {
    fs.mkdirSync(path.dirname(PAGE_FILE), { recursive: true });
    fs.writeFileSync(PAGE_FILE, text);
    console.log(`wrote ${path.relative(ROOT, PAGE_FILE)} (${PAGE_RULES.length} rules)`);
  }
}
