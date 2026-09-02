/*
 * report — turning results into the output a user reads.
 *
 * The shape is deliberately the one ui5lint and abaplint users already know,
 * because they are the same people: the file path as a heading, one indented
 * line per problem carrying `line:col`, severity, message and the **rule id**,
 * and a closing `N problems (…)` count. A file with nothing to say is not
 * printed at all — on a corpus of a few hundred views the old per-file `pass`
 * line was the bulk of the output.
 *
 *   formats      stylish (default) | json | markdown
 *   annotations  GitHub workflow commands, so findings land on the diff of a
 *                pull request instead of in the log only
 *   run summary  what the run LOOKED at (files, views, controls, bindings,
 *                icons, gates, timings, the rules that spoke) — because a
 *                clean corpus otherwise prints three lines and a reader
 *                cannot tell a passing gate from a gate that judged nothing
 *   progress     the same numbers while the run is still going, on stderr
 *   badge        a shields.io endpoint object, so a repo can show the state
 *                of its corpus in the README without a service in between
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SEVERITIES, severityOf, describe, RENDER_RULE, RULES, defaultSeverityOf } from './findings.mjs';
import { RULE_DOCS, ruleUrl, ruleExampleUrl } from './rule-docs.mjs';

export const FORMATS = ['stylish', 'json', 'markdown', 'sarif', 'checkstyle', 'junit'];

/* ── colour ─────────────────────────────────────────────────────────────── */

const ANSI = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', underline: '\x1b[4m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m', green: '\x1b[32m' };

/** NO_COLOR / FORCE_COLOR are honoured before the TTY check — the usual
 *  contract, and what keeps the test output free of escape codes. */
export function colorEnabled(stream = process.stdout) {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0';
  return Boolean(stream && stream.isTTY);
}

const painter = (on) => (code, text) => (on ? `${ANSI[code]}${text}${ANSI.reset}` : text);

const SEVERITY_COLOR = { error: 'red', warning: 'yellow', hint: 'blue' };

/* ── problems ───────────────────────────────────────────────────────────── */

/**
 * One flat, source-ordered list of what a result has to report: its findings
 * plus the render-gate failures, which get a rule id of their own so every
 * printed line has the same five columns. Problems the gate could not place
 * (a finding inlined from a helper chain) sort last.
 */
export function problemsOf(result) {
  const problems = result.findings.map((f) => ({
    line: f.line,
    column: f.column,
    severity: severityOf(f),
    message: f.message || describe(f),
    rule: f.type,
  }));
  for (const e of result.renderErrors) {
    // rules['render-error'] may have decided a render failure weighs less
    problems.push({ line: undefined, column: undefined, severity: result.renderSeverity ?? 'error', message: String(e).replace(/\s+/g, ' ').slice(0, 220), rule: RENDER_RULE });
  }
  return problems.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity) || (a.column ?? 0) - (b.column ?? 0));
}

/**
 * The distinct rules a run reported, in the order a reader first meets them.
 *
 * Every reference block below is built from this: the reader has a rule id in
 * front of them and no way to get from it to what it means — the id is not a
 * sentence, and the one-line message is as much as a terminal can carry. The
 * published card is where the rest lives (the paragraph, the before/after
 * pair, the link into the code that decides it), so the report's job is to
 * hand over its address.
 */
export function rulesReported(results, quiet) {
  const seen = [];
  for (const r of results) {
    for (const p of visible(problemsOf(r), quiet)) {
      if (!seen.some((x) => x.rule === p.rule)) seen.push({ rule: p.rule, severity: p.severity });
    }
  }
  return seen;
}

/** `--quiet`: report errors only. The summary still counts everything, so a
 *  hidden warning never becomes an invisible one. */
const visible = (problems, quiet) => (quiet ? problems.filter((p) => p.severity === 'error') : problems);

/** Why the render gate was skipped for this file — a notice, not a problem. */
const skipNote = (r) =>
  `${r.helperTokens} builder call(s) in helper methods — not statically reconstructable, render gate skipped`;

/* ── summary ────────────────────────────────────────────────────────────── */

export function summarize(results) {
  const totals = { error: 0, warning: 0, hint: 0 };
  let skipped = 0;
  for (const r of results) {
    for (const p of problemsOf(r)) totals[p.severity]++;
    if (r.skippedRender && !r.findings.length && !r.renderErrors.length) skipped++;
  }
  const problems = totals.error + totals.warning + totals.hint;
  return { files: results.length, skipped, totals, problems };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `6 problems (3 errors, 2 warnings, 1 hint)` — the line both reference
 *  linters close with, and the phrase users grep their CI logs for. */
export function countLine(totals) {
  const problems = totals.error + totals.warning + totals.hint;
  if (!problems) return null;
  const parts = [...SEVERITIES].reverse().map((s) => plural(totals[s], s));
  return `${plural(problems, 'problem')} (${parts.join(', ')})`;
}

/** The run's context: what was checked against, and what breaks the build. */
export function contextLine(opt, summary, snapshot) {
  /* No `distribution` is its own answer, not a synonym for SAPUI5 — the run
   * reports a SAPUI5-only control as a hint rather than as an error or not at
   * all, and this line is where a reader checks what the run assumed. */
  const target = opt.distribution
    ? `${opt.distribution === 'openui5' ? 'OpenUI5' : 'SAPUI5'} ${opt.minUi5}`
    : `UI5 ${opt.minUi5} (distribution unset)`;
  return `abap2ui5-linter: ${plural(summary.files, 'file')}, ${summary.failing} failing, ${summary.skipped} skipped ` +
    `(target ${target}${snapshot ? `, metadata from ${snapshot}` : ''}, failing on ${opt.failOn})`;
}

/* ── run summary ────────────────────────────────────────────────────────── */

/**
 * What the run LOOKED at, aggregated from the per-result profiles.
 *
 * The reason this exists: on a clean corpus the report is three lines, and
 * they cannot distinguish a gate that judged four thousand controls from a
 * gate whose reconstruction produced nothing to judge. Both print
 * "Success! No findings detected." — only the numbers below tell them apart,
 * which is why `emptyViews` is in here next to the totals.
 */
export function runStats(results) {
  const s = {
    abap: 0, xml: 0, builder: 0, emptyViews: 0,
    documents: 0, controls: 0, aggregations: 0, attributes: 0, bindings: 0, icons: 0, depth: 0,
    rendered: 0, renderSkipped: 0,
    types: new Map(),   // control name -> occurrences
    rules: new Map(),   // rule id -> reported problems
    /* rule id -> findings the gate PRODUCED, counted before the `rules`
     * block, the directives and the baseline suppressed anything - so a
     * fully baselined corpus still says which rules fired on it, which is
     * the number "only six types fired" was once guessed at. */
    ruleHits: new Map(),
  };
  for (const r of results) {
    if (r.kind === 'xml') s.xml++;
    else {
      s.abap++;
      if (r.usesBuilder !== false) s.builder++;
    }
    const st = r.stats;
    if (st) {
      s.documents += st.documents;
      s.controls += st.controls;
      s.aggregations += st.aggregations;
      s.attributes += st.attributes;
      s.bindings += st.bindings;
      s.icons += st.icons;
      s.rendered += st.rendered;
      s.depth = Math.max(s.depth, st.depth);
      if (!st.documents && r.usesBuilder !== false) s.emptyViews++;
      for (const [name, n] of Object.entries(st.types)) s.types.set(name, (s.types.get(name) || 0) + n);
    }
    if (r.skippedRender) s.renderSkipped++;
    for (const p of problemsOf(r)) s.rules.set(p.rule, (s.rules.get(p.rule) || 0) + 1);
    // pre-suppression, from the walk the gate already did; a result assembled
    // by an older consumer carries none and falls back to what it reports
    if (r.ruleHits) {
      for (const [id, n] of Object.entries(r.ruleHits)) s.ruleHits.set(id, (s.ruleHits.get(id) || 0) + n);
    } else {
      for (const finding of r.findings) s.ruleHits.set(finding.type, (s.ruleHits.get(finding.type) || 0) + 1);
    }
  }
  return s;
}

const num = (n) => Number(n).toLocaleString('en-US');

/** `a 12, b 7, +3 more` — the head of a count map, longest first. */
export function topOf(map, limit = 3) {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, limit).map(([k, n]) => `${k} ${num(n)}`);
  const rest = sorted.length - head.length;
  return [...head, ...(rest > 0 ? [`+${rest} more`] : [])].join(', ');
}

/**
 * The run summary as `[label, value]` rows — the answer to "what actually
 * happened?" for a corpus run. A row is omitted when it has nothing to say
 * (no baseline, no timings, no findings), so the block never pads itself out
 * with zeroes. Rows, not lines: the terminal and the markdown report lay the
 * same content out differently.
 */
export function statsRows(stats, summary, opt = {}) {
  const rows = [];
  const row = (label, value) => { if (value) rows.push([label, value]); };

  const sources = [];
  if (stats.abap) {
    sources.push(`${num(stats.abap)} app class${stats.abap === 1 ? '' : 'es'}`
      + (stats.builder !== stats.abap ? ` (${num(stats.builder)} building a view)` : ''));
  }
  if (stats.xml) sources.push(`${num(stats.xml)} view/fragment XML file${stats.xml === 1 ? '' : 's'}`);
  row('sources', sources.join(', '));
  row('views', `${num(stats.documents)} document${stats.documents === 1 ? '' : 's'} reconstructed, nested ${stats.depth} deep`
    + (stats.emptyViews ? `, ${num(stats.emptyViews)} class${stats.emptyViews === 1 ? '' : 'es'} produced none` : ''));
  row('judged', [
    `${num(stats.controls)} controls of ${num(stats.types.size)} types`,
    `${num(stats.bindings)} bindings`,
    `${num(stats.icons)} icons`,
    `${num(stats.attributes)} attributes`,
  ].join(', '));
  row('most used', topOf(stats.types, 4));

  const gates = [];
  if (opt.properties !== false) gates.push(`properties ${plural(summary.files, 'file')}`);
  if (opt.render !== false) {
    gates.push(`render ${plural(stats.rendered, 'document')}`
      + (stats.renderSkipped ? `, ${stats.renderSkipped} skipped (built in helper methods)` : ''));
  } else gates.push('render off');
  row('gates', gates.join(', '));

  row('findings', `${countLine(summary.totals) ?? 'none'}${summary.failing ? ` in ${plural(summary.failing, 'failing file')}` : ''}`);
  if (stats.rules.size) row('by rule', topOf(stats.rules, 5));
  if (opt.baseline?.suppressed || opt.baseline?.stale) {
    row('baselined', `${plural(opt.baseline.suppressed, 'finding')} suppressed by ${opt.baseline.file}`
      + (opt.baseline.byRule ? ` (${topOf(new Map(Object.entries(opt.baseline.byRule)), 3)})` : '')
      + (opt.baseline.stale
        ? `, ${opt.baseline.stale} STALE — the finding is gone, remove the entry or run --update-baseline`
        : ''));
  }
  const times = Object.entries(opt.times ?? {}).filter(([, ms]) => ms > 0);
  if (times.length) {
    row('time', [...times.map(([phase, ms]) => `${phase} ${(ms / 1000).toFixed(1)}s`),
      `total ${(times.reduce((sum, [, ms]) => sum + ms, 0) / 1000).toFixed(1)}s`].join(', '));
  }
  return rows;
}

/** The run summary block for the terminal — dim, under the count line the
 *  reference linters end with, aligned on the label column. */
export function formatStats(stats, summary, opt = {}) {
  const paint = painter(opt.color ?? colorEnabled());
  const rows = statsRows(stats, summary, opt);
  const width = Math.max(0, ...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => paint('dim', `${label.padEnd(width)}  ${value}`));
}

/* ── progress ───────────────────────────────────────────────────────────── */

/**
 * Live progress for a corpus run, on stderr — stdout is the report and stays
 * pipeable. A run over a few hundred classes is minutes of render gate with
 * nothing printed until it ends, which reads as a hang.
 *
 * Two shapes, because two readers: on a terminal one rewriting line that
 * leaves nothing behind, and inside GitHub Actions one line per file wrapped
 * in a collapsed `::group::` — a log nobody has to read, but everybody can.
 * Phase timings are collected either way: the run summary wants them even
 * when nothing was printed.
 */
export function createProgress({ enabled = false, stream = process.stderr, github = false } = {}) {
  const times = {};
  const tty = Boolean(stream && stream.isTTY) && !github;
  const state = { phase: null, start: 0, total: 0, last: 0 };
  // a one-file run has no progress to report - it is over before the line is
  // read. The phase TIMES are still taken: the run summary wants them
  const write = (text) => { if (enabled && stream && state.total > 1) stream.write(text); };
  const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

  const close = () => {
    if (!state.phase) return;
    times[state.phase] = (times[state.phase] ?? 0) + (Date.now() - state.start);
    if (tty) write('\r\x1b[K');
    // the closing line goes OUTSIDE the group: collapsed, a group shows its
    // title only, and "how long did the render gate take" is the one number
    // worth seeing without expanding anything
    if (github) write('::endgroup::\n');
    write(`abap2ui5-linter: ${state.phase} gate — ${plural(state.total, 'file')} in ${secs(times[state.phase])}\n`);
    state.phase = null;
  };

  return {
    times,
    update(ev) {
      if (!ev || !ev.phase) return;
      if (ev.done === 0) {
        close();
        Object.assign(state, { phase: ev.phase, start: Date.now(), total: ev.total, last: 0 });
        if (github) {
          write(`::group::abap2ui5-linter: ${ev.phase} gate, ${plural(ev.total, 'file')}`
            + `${ev.pages ? ` on ${plural(ev.pages, 'browser page')}` : ''}\n`);
        }
        return;
      }
      if (state.phase !== ev.phase) return; // an event without its opening one
      state.total = ev.total;
      const where = ev.file ? path.relative(process.cwd(), ev.file) : '';
      if (github) {
        /* Deliberately only the file and whether it was skipped: a finding
         * count here would be the count BEFORE the baseline and the rules
         * block have had their say, so a fully baselined corpus would log
         * hundreds of findings and then report none. The report is the
         * record; this is only "where the run currently is". */
        write(`  [${String(ev.done).padStart(String(ev.total).length)}/${ev.total}] ${where}`
          + `${ev.skipped ? ' — render skipped (built in helper methods)' : ''}\n`);
      } else if (tty) {
        // throttled: on a fast property gate the terminal, not the gate, would
        // become the bottleneck
        const now = Date.now();
        if (ev.done !== ev.total && now - state.last < 60) return;
        state.last = now;
        write(`\r\x1b[K${ev.phase} ${ev.done}/${ev.total}  ${where.slice(-60)}`);
      }
    },
    finish() { close(); },
  };
}

/* ── badges ─────────────────────────────────────────────────────────────── */

/**
 * The two things a run can put in a README, and they are not the same
 * statement:
 *
 *   corpus   what the repository IS — `abap2UI5 | 148 apps · 172 views ·
 *            2,176 controls`. A fact, blue, and it moves only when somebody
 *            adds or removes an app.
 *   checks   what the gate SAID about it — `check-abap2UI5 | 83 rules
 *            passed`, green, or `7 errors`, red. A verdict, and it moves on
 *            every run.
 *
 * They were one badge before, and the sentence that came out
 * ("abap2UI5-linter 148 apps · 172 views · 2,176 controls | clean") made the
 * reach something to read on the way to the colour. Two badges say each thing
 * once, in the shape README readers already know from every other badge: a
 * grey name on the left, the number or the verdict coloured on the right.
 */
export const BADGE_KINDS = Object.freeze(['corpus', 'checks']);

/** The shields palette, by what a colour MEANS here — so the two badges can
 *  never drift apart on which green or which red they use. */
const BADGE_COLOR = Object.freeze({
  fact: '007ec6',      // shields "blue": a number, no verdict in it
  passed: '4c1',       // "brightgreen"
  problems: 'dfb317',  // "yellow": warnings and hints only
  errors: 'e05d44',    // "red"
  nothing: '9f9f9f',   // "lightgrey": there was nothing to say
});

/**
 * A shields.io **endpoint** object: the repo commits this file, the README
 * points shields at its raw URL, and the badge then shows the state of the
 * corpus itself — how much there is, and what the gate made of it — instead
 * of only whether some workflow exited zero.
 *
 *   https://img.shields.io/endpoint?url=<raw url of this file>
 *
 * `opt.kind` picks which of the two above is written (default `checks`).
 * Only keys the endpoint schema defines are written: shields rejects a
 * response carrying anything else, and a rejected response renders as
 * "invalid" in the README of everyone who sees it.
 */
export function badgeEndpoint(summary, stats, opt = {}) {
  /* A run that found NOTHING to check says so, grey, on either badge. It is
   * the state a badge can hide longest - a corpus the gate stopped
   * recognising keeps reading "148 apps" and "clean" until somebody opens a
   * log - and the reason the badge is written on this path at all. */
  const nothing = summary.files === 0;
  const kind = opt.kind ?? 'checks';
  const { message, color } = nothing
    ? { message: 'nothing checkable', color: BADGE_COLOR.nothing }
    : kind === 'corpus' ? corpusMessage(summary, stats) : checksMessage(summary, opt);
  return {
    schemaVersion: 1,
    label: opt.label ?? (kind === 'corpus' ? 'abap2UI5' : 'check-abap2UI5'),
    message,
    color,
    labelColor: opt.labelColor ?? '555',
    // no logo by default - the two badges usually sit in a row of others that
    // carry none either, and one logo among them only draws the eye
    ...(opt.logo ? { namedLogo: opt.logo, logoColor: 'white' } : {}),
    // the file only changes when a run changes what it says, so the badge may
    // be cached for as long as shields is willing to
    cacheSeconds: 3600,
  };
}

/** The REACH of the check, in the units the run summary counts: how many
 *  classes were read, how many views came out of them, how many controls
 *  those were made of. It is the number that grows with the repository and
 *  that no workflow badge can carry. A segment with nothing to say (an
 *  XML-only corpus has no app classes) is left out rather than printed as a
 *  zero, so raw views read `12 views · 340 controls`. */
function corpusMessage(summary, stats) {
  const count = (n, word) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;
  const reach = [
    stats?.abap ? count(stats.abap, 'app') : null,
    stats?.documents ? count(stats.documents, 'view') : null,
    stats?.controls ? count(stats.controls, 'control') : null,
  ].filter(Boolean);
  return {
    message: reach.length ? reach.join(' · ') : count(summary.files, 'file'),
    color: BADGE_COLOR.fact,
  };
}

/** The verdict, in the unit a check badge is read in: `N rules passed` the
 *  way a test badge says `1,234 tests passed`, and the count of what went
 *  wrong when something did. N is never written down anywhere - it is counted
 *  from the registry at run time, which is why this comment does not quote it.
 *
 *  The count is the rules that RAN — the registry minus what this repo's
 *  config switched off — so a repo that turns ten rules off does not get
 *  credit for them. What a baseline swallowed is not in it either way: those
 *  findings exist, the run just does not report them, and the run summary is
 *  where that number belongs. */
function checksMessage(summary, opt) {
  const problems = summary.totals.error + summary.totals.warning + summary.totals.hint;
  if (summary.totals.error) return { message: plural(summary.totals.error, 'error'), color: BADGE_COLOR.errors };
  if (problems) return { message: plural(problems, 'problem'), color: BADGE_COLOR.problems };
  const ran = RULES.filter((id) => opt.rules?.[id] !== false).length;
  return { message: `${num(ran)} rules passed`, color: BADGE_COLOR.passed };
}

/* ── stylish ────────────────────────────────────────────────────────────── */

export function formatStylish(results, summary, opt = {}) {
  const paint = painter(opt.color ?? colorEnabled());
  const out = [];
  for (const r of results) {
    const problems = visible(problemsOf(r), opt.quiet);
    const skipped = r.skippedRender && !r.findings.length && !r.renderErrors.length;
    if (!problems.length && !skipped) continue;
    out.push(paint('underline', path.relative(process.cwd(), r.file ?? '')));
    if (skipped) out.push(`  ${paint('dim', skipNote(r))}`);
    const width = Math.max(0, ...problems.map((p) => (p.line ? `${p.line}:${p.column}`.length : 0)));
    // aligning the rule id keeps the column readable; a single very long
    // message (a render error) must not push it off the screen for the rest
    const msgWidth = Math.min(100, Math.max(0, ...problems.map((p) => p.message.length)));
    for (const p of problems) {
      const where = p.line ? `${p.line}:${p.column}` : '';
      out.push(
        `  ${paint('dim', where.padEnd(width))}  ${paint(SEVERITY_COLOR[p.severity], p.severity.padEnd(7))}  ` +
        `${p.message.padEnd(msgWidth)}  ${paint('dim', p.rule)}`.trimEnd()
      );
    }
    out.push('');
  }
  const counts = countLine(summary.totals);
  out.push(counts
    ? paint(summary.totals.error ? 'red' : 'yellow', counts)
    : paint('green', 'Success! No findings detected.'));
  // the run summary rides UNDER the count line: the line the reference
  // linters end with keeps its place, the numbers behind it follow
  if (opt.stats) out.push('', ...formatStats(opt.stats, summary, opt));
  /* …and under THAT, where each id printed above is written down. A log is
   * where a rule id is read most and looked up least, because looking it up
   * meant knowing there is a page and guessing its anchor. One line per rule
   * actually reported, so the block is as long as the run was interesting. */
  const reported = rulesReported(results, opt.quiet);
  if (reported.length) {
    const w = Math.max(...reported.map((r) => r.rule.length));
    out.push('', paint('dim', 'rule reference — what each id means, and the same code fixed'));
    for (const r of reported) {
      out.push(`  ${paint('dim', r.rule.padEnd(w))}  ${paint('dim', ruleExampleUrl(r.rule))}`);
    }
  }
  if (opt.context) out.push(paint('dim', opt.context));
  return out.join('\n');
}

/* ── json ───────────────────────────────────────────────────────────────── */

/** Machine-readable output for tool integrations (the VS Code extension, a
 *  CI collector). `docs` and `model` stay out — they can be megabytes. */
export function formatJson(results, summary, opt = {}) {
  const stats = opt.stats ?? runStats(results);
  return JSON.stringify({
    files: summary.files,
    failing: summary.failing,
    skipped: summary.skipped,
    problems: summary.problems,
    totals: summary.totals,
    failOn: opt.failOn,
    // what the run looked at. The control-name histogram lives HERE only:
    // per result it would repeat every name a few hundred times over a corpus
    stats: {
      ...stats,
      types: Object.fromEntries([...stats.types.entries()].sort((a, b) => b[1] - a[1])),
      rules: Object.fromEntries([...stats.rules.entries()].sort((a, b) => b[1] - a[1])),
      // pre-suppression: what FIRED, before the rules block, directives and
      // baseline had their say. Additive key - see runStats
      ruleHits: Object.fromEntries([...(stats.ruleHits ?? new Map()).entries()].sort((a, b) => b[1] - a[1])),
    },
    results: results.map((r) => ({
      file: r.file,
      kind: r.kind,
      usesBuilder: r.usesBuilder ?? true,
      findings: r.findings,
      renderErrors: r.renderErrors,
      // additive: present only when rules['render-error'] set a severity
      ...(r.renderSeverity ? { renderSeverity: r.renderSeverity } : {}),
      skippedRender: r.skippedRender,
      helperTokens: r.helperTokens,
      notes: r.notes,
      ...(r.stats ? { stats: { ...r.stats, types: undefined } } : {}),
    })),
  });
}

/* ── markdown ───────────────────────────────────────────────────────────── */

/* One markdown table cell. The backslash goes first: escaping only the pipe
 * turns a message containing `\|` into `\\|`, an escaped backslash followed
 * by a LIVE column separator, so the row the escaping exists to keep intact
 * is the row it breaks. Findings quote source text, and this markdown is a
 * pull request comment. */
const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/** For a PR comment or a `$GITHUB_STEP_SUMMARY`. */
export function formatMarkdown(results, summary, opt = {}) {
  const out = ['# abap2UI5-linter', ''];
  out.push(countLine(summary.totals) ? `**${countLine(summary.totals)}**` : '**Success! No findings detected.**', '');
  for (const r of results) {
    const problems = visible(problemsOf(r), opt.quiet);
    const skipped = r.skippedRender && !r.findings.length && !r.renderErrors.length;
    if (!problems.length && !skipped) continue;
    out.push(`### \`${path.relative(process.cwd(), r.file ?? '')}\``, '');
    if (skipped) out.push(`> ${skipNote(r)}`, '');
    if (problems.length) {
      out.push('| Location | Severity | Message | Rule |', '| --- | --- | --- | --- |');
      for (const p of problems) {
        out.push(`| ${p.line ? `${p.line}:${p.column}` : '—'} | ${p.severity} | ${cell(p.message)} | [\`${p.rule}\`](${ruleUrl(p.rule)}) |`);
      }
      out.push('');
    }
  }
  /* The reference block, and this is the format that needs it most: a job
   * summary is read by someone who did not run the linter and has only the
   * table above to go on. Two links per rule because they answer two
   * different questions — what the rule is about, and what the fix looks
   * like in code. The card behind the first also carries the line in `lib/`
   * that decides the finding. */
  const reported = rulesReported(results, opt.quiet);
  if (reported.length) {
    out.push('### Rules reported', '');
    out.push('| Rule | Severity | Reference |', '| --- | --- | --- |');
    for (const r of reported) {
      out.push(`| \`${r.rule}\` | ${r.severity} | [what it means](${ruleUrl(r.rule)}) · `
        + `[before / after](${ruleExampleUrl(r.rule)}) |`);
    }
    out.push('');
  }
  // the same run summary the terminal gets — this is the format a workflow
  // writes into $GITHUB_STEP_SUMMARY, where "what was checked" is the half a
  // reader cannot reconstruct from the findings
  if (opt.stats) {
    out.push('### Run summary', '');
    for (const [label, value] of statsRows(opt.stats, summary, opt)) out.push(`- **${label}** — ${cell(value)}`);
    out.push('');
  }
  if (opt.context) out.push(`_${opt.context}_`);
  return out.join('\n');
}

/* ── sarif ──────────────────────────────────────────────────────────────── */

const SARIF_LEVEL = { error: 'error', warning: 'warning', hint: 'note' };

/**
 * SARIF 2.1.0 — the exchange format GitHub code scanning ingests, so findings
 * land in the Security tab and on the PR as native review annotations
 * (`github/codeql-action/upload-sarif` with this file). Like `--json` a
 * machine format: complete (never `--quiet`-filtered) and free of the
 * workflow-command annotations that ride alongside stylish output only.
 */
export function formatSarif(results) {
  const ruleIds = new Set();
  const sarifResults = [];
  for (const r of results) {
    const uri = path.relative(process.cwd(), r.file ?? '').split(path.sep).join('/');
    for (const p of problemsOf(r)) {
      ruleIds.add(p.rule);
      sarifResults.push({
        ruleId: p.rule,
        level: SARIF_LEVEL[p.severity] || 'warning',
        message: { text: p.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri },
            ...(p.line ? { region: { startLine: p.line, startColumn: p.column || 1 } } : {}),
          },
        }],
      });
    }
  }
  return JSON.stringify({
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'abap2ui5-linter',
          ...(toolVersion() ? { version: toolVersion(), semanticVersion: toolVersion() } : {}),
          informationUri: 'https://github.com/abap2UI5/linter',
          rules: [...ruleIds].sort().map(sarifRule),
        },
      },
      results: sarifResults,
    }],
  });
}

/* The package version, so code scanning can tell one tool release from the
 * next instead of attributing every alert to an unversioned "abap2ui5-linter".
 * Read lazily and never fatally: a report is not worth failing over. */
let cachedVersion;
function toolVersion() {
  if (cachedVersion === undefined) {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      cachedVersion = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version || null;
    } catch {
      cachedVersion = null;
    }
  }
  return cachedVersion;
}

/* A rule as code scanning renders it. `id` and `helpUri` alone left the
 * Security tab showing a bare rule id; the summary that the rules page is
 * built from is the same sentence a reader wants there, so it is reused
 * rather than restated. `defaultConfiguration.level` is what a viewer falls
 * back to for a result that carries no level of its own. */
function sarifRule(id) {
  const doc = RULE_DOCS[id];
  const summary = doc && doc.summary;
  return {
    id,
    name: id,
    ...(summary
      ? { shortDescription: { text: summary.replace(/`/g, ''), markdown: summary } }
      : {}),
    defaultConfiguration: { level: SARIF_LEVEL[defaultSeverityOf(id)] || 'warning' },
    helpUri: ruleUrl(id),
  };
}

/* ── checkstyle / junit ─────────────────────────────────────────────────── */

/* Two CI-native XML shapes, because most CI systems ingest one of them out of
 * the box (Jenkins, GitLab, Azure DevOps test tabs). Both are THIN renderers
 * over the same problemsOf( ) walk every other formatter reads - no new
 * information, only new spelling. */

const escXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// checkstyle knows error/warning/info; our hint is its info
const CHECKSTYLE_SEVERITY = { error: 'error', warning: 'warning', hint: 'info' };

/** The checkstyle XML shape: one <file> per result, one <error> per problem.
 *  A clean file still gets its (empty) element - presence says it was seen. */
export function formatCheckstyle(results) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<checkstyle version="4.3">'];
  for (const r of results) {
    lines.push(`  <file name="${escXml(r.file ?? '')}">`);
    for (const p of problemsOf(r)) {
      const attrs = [
        p.line ? `line="${p.line}"` : 'line="1"',
        ...(p.column ? [`column="${p.column}"`] : []),
        `severity="${CHECKSTYLE_SEVERITY[p.severity] || 'warning'}"`,
        `message="${escXml(p.message)}"`,
        `source="${escXml(p.rule)}"`,
      ];
      lines.push(`    <error ${attrs.join(' ')}/>`);
    }
    lines.push('  </file>');
  }
  lines.push('</checkstyle>');
  return lines.join('\n');
}

/** The JUnit XML shape: one <testsuite> per file, one <testcase> per problem
 *  (a failure each); a clean file is one passing testcase, so a test tab
 *  shows the file was checked rather than showing nothing. */
export function formatJunit(results) {
  let tests = 0;
  let failures = 0;
  const suites = [];
  for (const r of results) {
    const name = escXml(r.file ?? '');
    const problems = problemsOf(r);
    const cases = [];
    if (!problems.length) {
      tests++;
      cases.push(`    <testcase name="clean" classname="${name}"/>`);
    }
    for (const p of problems) {
      tests++;
      failures++;
      const where = p.line ? ` at ${p.line}:${p.column || 1}` : '';
      cases.push(`    <testcase name="${escXml(p.rule)}${where}" classname="${name}">`);
      cases.push(`      <failure message="${escXml(p.message)}" type="${escXml(p.severity)}">`
        + `${escXml(`${p.line ? `line ${p.line}, col ${p.column || 1}, ` : ''}${p.severity} - ${p.message} (${p.rule})`)}</failure>`);
      cases.push('    </testcase>');
    }
    suites.push({ name, cases, tests: Math.max(problems.length, 1), failures: problems.length });
  }
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="abap2ui5-linter" tests="${tests}" failures="${failures}">`];
  for (const s of suites) {
    lines.push(`  <testsuite name="${s.name}" tests="${s.tests}" failures="${s.failures}" errors="0">`);
    lines.push(...s.cases);
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>');
  return lines.join('\n');
}

/* ── GitHub annotations ─────────────────────────────────────────────────── */

// https://docs.github.com/actions/reference/workflow-commands-for-github-actions
const escData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

const ANNOTATION_LEVEL = { error: 'error', warning: 'warning', hint: 'notice' };

/**
 * GitHub workflow commands, one per problem — this is what puts a finding on
 * the changed line of a pull request instead of into a log nobody opens. Only
 * placed problems can be annotated on a line; the rest are attached to the
 * file. Emitted alongside the chosen format, never instead of it.
 */
export function githubAnnotations(results, opt = {}) {
  const out = [];
  for (const r of results) {
    const file = path.relative(process.cwd(), r.file ?? '');
    for (const p of visible(problemsOf(r), opt.quiet)) {
      const props = [`file=${escProp(file)}`];
      if (p.line) props.push(`line=${p.line}`, `col=${p.column}`);
      props.push(`title=${escProp(`abap2ui5-linter(${p.rule})`)}`);
      /* An annotation renders the message and the title and nothing else — no
       * rule id a reader could look up, and no link unless the message carries
       * one. GitHub does not linkify it, but it is selectable, and it lands on
       * the before/after rather than on the top of the page. */
      out.push(`::${ANNOTATION_LEVEL[p.severity]} ${props.join(',')}::`
        + `${escData(`${p.message} [${p.rule}] ${ruleExampleUrl(p.rule)}`)}`);
    }
  }
  return out;
}
