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
import zlib from 'zlib';
import { checkAbapSource } from '../lib/index.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE_FILE = path.join(ROOT, 'site', 'index.html');
const REPO = 'https://github.com/abap2UI5/linter';
export const PLAYGROUND = 'https://abap2ui5.github.io/playground/';

/*
 * The jump from a card into the playground: the reported snippet, wrapped
 * into the smallest class that carries it, in the playground's share link.
 *
 * The share format is the playground's (`src/shell/share.mjs` there): one
 * version character, then base64url of the deflate-raw JSON `[{ name, source }]`.
 * Written here at generation time rather than through the embed kit at page
 * time, because this page is deliberately self-contained — no script from
 * anywhere. The format is a contract the playground keeps for every link ever
 * shared; a link it cannot read falls back to its sample, silently.
 *
 * A snippet is not a class. `example` is the shortest source that triggers
 * the rule, so a chain fragment, a method, a section each need a different
 * frame around them — and the frame is GUESSED, which is why every link is
 * verified before it is written: the wrapped source goes through the linter,
 * and only a card whose own rule fires on it gets the link. A card without
 * one is a snippet the frame could not carry, not a rule without an example.
 */
const DEFAULT_CLASS = 'zcl_rule';

/** The first `"` that starts a comment on a line — outside literals. */
function commentStart(line) {
  let lit = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (lit) {
      if (lit === '|' && c === '\\') i++;
      else if (c === lit) lit = null;
      continue;
    }
    if (c === '`' || c === '|' || c === "'") lit = c;
    else if (c === '"') return i;
  }
  return -1;
}
const codeOf = (line) => {
  const at = commentStart(line);
  return (at === -1 ? line : line.slice(0, at)).trimEnd();
};

/* The root every wrapped chain hangs from — a View with the namespaces the
 * examples write (`c` is sap.ui.commons, so deprecated-library has a library
 * to deprecate; `smart` is what sapui5-only-control needs). Only added where
 * the snippet does not open a root of its own. */
const ROOT_CHAIN = [
  'view->ele( n = `View` ns = `mvc`',
  '    )->a( n = `xmlns` v = `sap.m`',
  '    )->a( n = `xmlns:mvc` v = `sap.ui.core.mvc`',
  '    )->a( n = `xmlns:core` v = `sap.ui.core`',
  '    )->a( n = `xmlns:l` v = `sap.ui.layout`',
  '    )->a( n = `xmlns:f` v = `sap.f`',
  '    )->a( n = `xmlns:uxap` v = `sap.uxap`',
  '    )->a( n = `xmlns:table` v = `sap.ui.table`',
  '    )->a( n = `xmlns:card` v = `sap.ui.integration.widgets`',
  '    )->a( n = `xmlns:c` v = `sap.ui.commons`',
  '    )->a( n = `xmlns:u` v = `sap.ui.unified`',
  '    )->a( n = `xmlns:smart` v = `sap.ui.comp.smarttable`',
  '    )->a( n = `xmlns:html` v = `http://www.w3.org/1999/xhtml` ).',
];
const FACTORY = 'DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).';
/* The frame's own root, when the snippet opens none: `view` is the handle of
 * a Page INSIDE the View, so that `view->tag( … )` in the snippet lands in the
 * Page's content the way the card means it. Hung from the factory handle
 * instead, every such call was a second document root beside the View -
 * without a namespace, so no property rule could judge it, and a
 * `headerContent` under it was an aggregation in an aggregation. */
const FRAMED_ROOT = [
  'DATA(root) = z2ui5_cl_ui5_view_builder=>factory( ).',
  'DATA(view) = root->ele( n = `View` ns = `mvc`',
  ...ROOT_CHAIN.slice(1, -1),
  ROOT_CHAIN[ROOT_CHAIN.length - 1].replace(/\s*\)\.$/, ''),   // the last call stays open for the Page
  '    )->ele( `Page` ).',
];
const DISPLAY = 'client->view_display( view->stringify( ) ).';
const opensRoot = (text) => /ns\s*=\s*`mvc`|`xmlns`/.test(text);

/* The control a bare `a( n = \`x\` … )` fragment hangs from: one that HAS
 * the attribute, so the card's rule is what fires and not unknown-property. */
const HOST_BY_ATTR = {
  search: 'SearchField', items: 'List', value: 'Input', liveChange: 'Input', change: 'Input',
  text: 'Text', title: 'Page', src: 'Image', state: 'ObjectStatus', press: 'Button',
  icon: 'Button', enabled: 'Button', visible: 'Button', id: 'Button', tooltip: 'Text',
  expanded: 'Panel', dateValue: 'DatePicker', percentValue: 'ProgressIndicator',
  headerText: 'Table', selectedSection: 'ObjectPageLayout', manifest: 'Card', showSideContent: 'DynamicSideContent',
};
const hostOf = (line) => {
  const attr = line.match(/n\s*=\s*`([^`]+)`/)?.[1];
  const host = HOST_BY_ATTR[attr] || 'Input';
  if (host === 'ObjectPageLayout') return 'n = `ObjectPageLayout` ns = `uxap`';
  if (host === 'Card') return 'n = `Card` ns = `card`';
  return `\`${host}\``;
};
/* statement heads that start a new statement even where the previous chain
 * line was left open - the previous statement gets its dot first */
const STATEMENT_HEAD = /^(?:t_arg\s*=|client->|follow_up_action\s*\(|DATA\b|TYPES\b|INSERT\b|CASE\b|IF\b|ELSEIF\b|LOOP\b|SELECT\b|TRY\b|VALUE\b|view->)/;
const closeLast = (body, suffix = '') => {
  for (let i = body.length - 1; i >= 0; i--) {
    const code = codeOf(body[i]);
    if (code === '') continue;
    if (!code.endsWith('.')) {
      const at = commentStart(body[i]);
      body[i] = at === -1 ? `${body[i].trimEnd()}${suffix}.` : `${body[i].slice(0, at).trimEnd()}${suffix}.${body[i].slice(at - 1)}`;
    }
    break;
  }
};

/** The `" …` lines of an example are elided CONTEXT, not prose: what the
 *  snippet leaves out because the card is about the other line. Uncommented
 *  here — with the comment lines continuing them — so the class carries it. */
const CODE_SHAPED = /^(?:\)->|[a-z_]\w*\s*->|[A-Z][A-Z_-]+\b|a\(|t_arg\b)/;
function unelide(lines) {
  const out = [];
  let inside = false;
  for (const l of lines) {
    const m = l.match(/^(\s*)"\s*…\s*(.*)$/);
    if (m && CODE_SHAPED.test(m[2])) { out.push(`${m[1]}${m[2]}`); inside = true; continue; }
    const cont = inside && l.match(/^(\s*)"\s{2,}(\S.*)$/);
    if (cont) { out.push(`${cont[1]}${cont[2]}`); continue; }
    inside = false;
    out.push(l);
  }
  return out;
}

/** The example (or the remedy) wrapped into a class, and the file name the
 *  playground gives it. */
export function playgroundSource(id, half = 'example') {
  const doc = RULE_DOCS[id];
  const lines = unelide(doc[half].split('\n').filter((l) => l.trim() !== '…'));
  const text = lines.join('\n');
  const named = text.match(/\bCLASS\s+(\w+)\s+DEFINITION\b/i);
  if (named) {
    return { name: `${named[1].toLowerCase()}.clas.abap`, source: text.endsWith('\n') ? text : `${text}\n` };
  }
  const hasMethod = /^\s*METHOD\b/im.test(text);
  const hasSection = /^\s*(?:PUBLIC|PROTECTED|PRIVATE)\s+SECTION\s*\./im.test(text);
  const head = ['    INTERFACES z2ui5_if_app.', '    DATA client TYPE REF TO z2ui5_if_client.'];
  const definition = [];
  const implementation = [];
  /* a main( ) of this frame's own: the root, the snippet's statements, the
   * display — so the class is a view class whichever rule the card is about */
  const ownMain = (statements, { displayFirst = false } = {}) => {
    const text = statements.join('\n');
    /* a snippet that IS the lifecycle dispatcher displays through its own
     * branches; a display of the frame's after it would be a display outside
     * every branch, which is what missing-on-navigated-branch judges */
    const dispatches = /\bcheck_on_(?:init|navigated)\s*\(/.test(text);
    return [
      '  METHOD z2ui5_if_app~main.',
      '    me->client = client.',
      ...(/DATA\(view\)/.test(text) ? []
        : opensRoot(text) ? [`    ${FACTORY}`] : FRAMED_ROOT.map((l) => `    ${l}`)),
      ...(displayFirst ? [`    ${DISPLAY}`] : []),
      ...statements.map((l) => (l === '' ? '' : `    ${l}`)),
      ...(displayFirst || dispatches ? [] : [`    ${DISPLAY}`]),
      '  ENDMETHOD.',
    ];
  };

  if (hasMethod || hasSection) {
    const sectionLines = hasSection ? lines.filter((l) => !/^\s*(?:METHOD|ENDMETHOD)\b/i.test(l)) : [];
    const methods = [...text.matchAll(/^\s*METHOD\s+([\w~]+)\s*\./gim)].map((m) => m[1]).filter((m) => !m.includes('~'));
    const decls = [...methods.map((m) => `    METHODS ${m}.`)];
    if (hasSection && /^\s*PUBLIC\s+SECTION\s*\./im.test(text)) {
      for (const l of sectionLines) {
        definition.push(l === '' ? '' : `  ${l}`);
        if (/^\s*PUBLIC\s+SECTION\s*\./i.test(l)) definition.push(...head, ...decls);
      }
    } else {
      definition.push('  PUBLIC SECTION.', ...head, ...decls);
      if (hasSection) definition.push(...sectionLines.map((l) => (l === '' ? '' : `  ${l}`)));
    }
    if (hasMethod) {
      if (/^\s*METHOD\b/i.test(lines[0])) {
        // whole methods, as they are - given the factory where a method
        // writes `view->` without ever creating one
        for (const l of lines) {
          implementation.push(l === '' ? '' : `  ${l}`);
          if (/^\s*METHOD\b/i.test(l) && !/=>factory\(/.test(text) && !implementation.some((x) => x.includes(FACTORY))) {
            implementation.push(`    ${FACTORY}`, ...ROOT_CHAIN.map((r) => `    ${r}`));
          }
        }
        if (!/z2ui5_if_app~main/i.test(text)) implementation.push('', ...ownMain([]));
      } else {
        // a method BODY (a branch of the dispatcher) becomes main( )'s body,
        // displayed BEFORE it so a branch that never displays stays one
        const branch = /^\s*ELSEIF\b/i.test(lines[0])
          ? ['IF client->check_on_init( ).', `  ${DISPLAY}`, ...lines, 'ENDIF.'] : lines;
        implementation.push(...ownMain(branch, { displayFirst: true }));
      }
    } else {
      // sections only: the finding is in the declarations; the unelided
      // chain lines, if any, hang from the frame's own root
      const chain = lines.filter((l) => /^\s*\)->/.test(l));
      implementation.push(...ownMain(chain));
    }
  } else {
    /* statements: a chain fragment gets the call it hangs from, a bare
     * `t_arg` its action, a declaration (DATA, a TYPES block) goes up into
     * the PUBLIC SECTION so the bindings that read it find an attribute
     * rather than a local, and a branch that begins with ELSEIF gets the IF
     * it continues */
    const body = [];
    const attrs = [];
    let start = true; // at a statement start
    let declaring = false; // inside a multi-line declaration bound for the section
    let pending = ''; // the `)` closing a call the frame opened around a bare t_arg
    let hang = ''; // extra indent for a fragment hung from a call the frame added
    const branch = /^\s*ELSEIF\b/i.test(lines[0]);
    if (branch) body.push('IF client->check_on_init( ).', `  ${DISPLAY}`);
    for (const raw of lines) {
      let line = raw;
      const code = codeOf(line);
      if (declaring) {
        attrs.push(`    ${line.trim()}`);
        declaring = !code.endsWith('.');
        continue;
      }
      if (!start && STATEMENT_HEAD.test(code)) { closeLast(body, pending); pending = ''; hang = ''; start = true; }
      if (start && /^(?:DATA\s+\w+\s+TYPE\b|TYPES\b)/i.test(code)) {
        attrs.push(`    ${line.trim()}`);
        declaring = !code.endsWith('.');
        start = !declaring;
        continue;
      }
      if (start) {
        hang = '';
        if (/^a\(/.test(code)) line = `view->tag( ${hostOf(code)} )->${line}`;
        else if (/^\)->a\(/.test(code)) { body.push(`view->tag( ${hostOf(code)}`); hang = '    '; }
        else if (/^\)->/.test(code)) { body.push('view->ele( `Page`'); hang = '    '; }
        else if (/^t_arg\s*=/.test(code)) { line = `client->follow_up_action( val   = client->cs_event-control_by_id\n                              ${line.trim()}`; pending = ' )'; }
        else if (/^follow_up_action\s*\(/.test(code)) line = `client->${line}`;
      }
      body.push(hang && line !== '' ? `${hang}${line}` : line);
      start = code.endsWith('.') || code === '';
    }
    if (branch) body.push('ENDIF.');
    closeLast(body, pending);
    definition.push('  PUBLIC SECTION.', ...head, ...attrs);
    implementation.push(...ownMain(body));
  }
  const source = [
    `CLASS ${DEFAULT_CLASS} DEFINITION PUBLIC FINAL CREATE PUBLIC.`,
    ...definition,
    'ENDCLASS.',
    '',
    `CLASS ${DEFAULT_CLASS} IMPLEMENTATION.`,
    ...implementation,
    'ENDCLASS.',
    '',
  ].join('\n');
  return { name: `${DEFAULT_CLASS}.clas.abap`, source };
}

/** The playground URL carrying `files` — the share-link format, version 2. */
export function playgroundUrl(files) {
  const payload = Buffer.from(JSON.stringify(files.map(({ name, source }) => ({ name, source }))));
  const deflated = zlib.deflateRawSync(payload);
  return `${PLAYGROUND}#2${deflated.toString('base64url')}`;
}

/** rule id -> playground URL, for every card whose wrapped example the
 *  linter itself reports under that id. Computed once per build. */
export function playgroundLinks() {
  const links = new Map();
  for (const id of PAGE_RULES) {
    if (id === RENDER_RULE) continue; // needs the render gate, which no share link runs
    const file = playgroundSource(id);
    let fires = false;
    try {
      fires = checkAbapSource(file.source, { render: false, file: file.name }).findings.some((f) => f.type === id);
    } catch { fires = false; }
    if (fires) links.set(id, playgroundUrl([file]));
  }
  return links;
}

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
/* the before/after pair - always stacked, reported above fixed: side by side
   the reader's eye has to jump across the page to find the one token that
   changed, and an ABAP chain does not survive a half-width column either */
.ba { display: grid; gap: .6rem; margin: .6rem 0 0; grid-template-columns: 1fr; }
.ba figure { margin: 0; min-width: 0; }
.ba figcaption { font-size: .72rem; font-weight: 600; letter-spacing: .04em;
  text-transform: uppercase; margin: 0 0 .25rem; }
.ba .before figcaption { color: var(--error); }
.ba .after figcaption { color: var(--fix); }
.ba .before pre { box-shadow: inset 3px 0 0 var(--error); }
.ba .after pre { box-shadow: inset 3px 0 0 var(--fix); }
article.rule p.src { margin: .55rem 0 0; font-size: .82rem; color: var(--muted); }
article.rule p.try { margin: .55rem 0 0; font-size: .88rem; }
article.rule p.try .muted { color: var(--muted); font-size: .82rem; }
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

function ruleCard(id, sites, links) {
  const doc = RULE_DOCS[id];
  const play = links.get(id);
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
    play ? `        <p class="try"><a href="${play}" target="_blank" rel="noopener">Open the reported code in the playground ↗</a> <span class="muted">— the snippet in a class, with the linter's verdict beside the editor</span></p>` : null,
    site ? `        <p class="src">Defined in <a href="${REPO}/blob/main/lib/${site.file}#L${site.line}"><code>lib/${site.file}</code></a></p>` : null,
    '      </article>',
  ].filter(Boolean).join('\n');
}

export function buildPage() {
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, PAGE_RULES.filter((r) => defaultSeverityOf(r) === s).length]));
  const sites = emitSites();
  const links = playgroundLinks();
  const sections = CATEGORIES.map((cat) => {
    const ids = PAGE_RULES.filter((id) => RULE_DOCS[id].category === cat.id);
    return [
      `    <section class="cat" id="cat-${cat.id}">`,
      `      <h2>${esc(cat.title)}</h2>`,
      `      <p class="blurb">${inline(cat.blurb)}</p>`,
      ...ids.map((id) => ruleCard(id, sites, links)),
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
