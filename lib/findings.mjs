import unknownDirectiveRule from './rules/unknown-directive-rule.mjs';
import { canonicalRule } from './rule-aliases.mjs';
import unusedDirective from './rules/unused-directive.mjs';
import path from 'path';

/*
 * findings — severity, wording and source position for a finding.
 *
 * Every gate produces findings in the same shape ({ type, control?, member?,
 * value?, offset? }). What a finding *means* — does it break the app, is it
 * a portability warning, is it merely a hint — was until now decided
 * separately by each consumer (the CLI failed the build on everything, the
 * VS Code extension carried its own error/warning table, the wording was
 * copy-pasted between them). That judgement belongs to the linter, so it
 * lives here and everything else reads it from one place.
 *
 * A finding's `type` is its **rule id** — the name printed at the end of
 * every reported line, keyed in `abap2ui5lint.jsonc`'s `rules` block and
 * usable in a source directive. Every rule is one unit under lib/rules/
 * (lib/rule.mjs says what a unit carries); the tables here - RULES, the
 * severities, OPT_IN, describe( ) - are read off those units, and a type no
 * unit defines is not a known rule.
 */
import { scrub, parenRegion } from './abap.mjs';
import { ruleUrl } from './rule-docs.mjs';
import { UNIT_RULES, unitRule } from './rules/index.mjs';
import { LINE_LIMIT, runRule, RENDER_RULE } from './rule.mjs';

/** Ordered from the mildest to the most severe — comparisons use the index. */
export const SEVERITIES = ['hint', 'warning', 'error'];

/** ABAP's hard limit on a source line, and therefore abapGit's. Not a style
 *  setting and not configurable: over it the object does not import. Defined
 *  in rule.mjs, where the rule that enforces it can read it. */
export { LINE_LIMIT };

export const severityRank = (s) => Math.max(0, SEVERITIES.indexOf(s));

/*
 * error   — the app breaks: a dump, a control that will not load, a value
 *           UI5 rejects, or a defect that silently destroys the view
 * warning — it works on the machine it was written for, but not necessarily
 *           on the target system (version floor, deprecation), or the data
 *           behind it is not what the author thinks it is
 * hint    — worth knowing, never wrong by itself
 */
/* Every rule is one unit (lib/rules/) and brings its own severity. */
const SEVERITY_BY_TYPE = Object.fromEntries(UNIT_RULES.map((rule) => [rule.id, rule.severity]));

/*
 * Rules that do not run until a config asks for them.
 *
 * Every other rule here reports a defect or an inconsistency, so shipping it
 * on is right. `chain-house-layout` reports a deviation from ONE house style —
 * abap2UI5's — and two established styles (a two-space step, an attribute on
 * its control's line) are deviations from it. A linter that hands one
 * project's taste to every consumer as a default is what lib/chain-layout.mjs
 * argues against at length, so this one is offered rather than applied:
 *
 *   "rules": { "chain-house-layout": "warning" }
 *
 * turns it on, and nothing else changes for anybody who does not write that.
 *
 * `portable-app` is opt-in for the other reason a rule can be: it reports no
 * defect at all. An app outside the protocol's portable profile runs on the
 * UI5 frontend exactly as written; staying inside it is a goal an author
 * chooses (a UI5 Web Components frontend, an Adaptive Cards renderer, an
 * agent), and a default that reported every sap.f control would be noise to
 * everyone who did not:
 *
 *   "rules": { "portable-app": "error" }
 *
 * `bound-aggregation-over-size-limit` is opt-in for a third reason: it is
 * right about an app and wrong about a port. A list bound to a table the
 * class seeds with 123 rows shows 100 - in an app's own code that is the
 * defect, and nothing else in the toolchain says a word. But the corpus it
 * was measured on in 0.3 is ports of UI5 samples, whose ORIGINALS bind the
 * same oversized mock to a JSONModel with the same 100 and show the same
 * 100: 101 findings on 637 files, about one worth having. What separates
 * the two - whether the original raised its limit - is in no source this
 * linter reads, so an app author turns it on and a port corpus does not:
 *
 *   "rules": { "bound-aggregation-over-size-limit": "warning" }
 */
export const OPT_IN = Object.freeze(new Set(UNIT_RULES.filter((r) => r.optIn).map((r) => r.id)));

/** Whether a `rules` block switches an opt-in rule on. */
export const isOptInEnabled = (rules, type) => {
  const cfg = ruleConfig(rules?.[type]);
  return Boolean(cfg) && !cfg.off;
};

/** Every rule id the linter can report, sorted — the registry the config
 *  file and the schema generator validate against. */
export const RULES = Object.freeze(Object.keys(SEVERITY_BY_TYPE).sort());

/** The severity a rule carries before any `rules` override. */
export const defaultSeverityOf = (type) => SEVERITY_BY_TYPE[type] || 'error';

/** The rule id render-gate failures are reported under. It is not a
 *  configurable rule (use `render: false` to switch the gate off) — it only
 *  labels the line, so a render error reads like every other finding. */
export { RENDER_RULE };

/* The conventional prefix -> library pairs an undeclared-namespace fix may
 * assume. Closed by convention: anything else could mean any library, and a
 * fix that has to guess is worse than the finding. Lives HERE (not in
 * index.mjs) so in-process consumers that replicate the pipeline — the VS
 * Code extension's gate — attach the same fixes the CLI does. */
export const KNOWN_NS = Object.freeze({
  core: 'sap.ui.core', mvc: 'sap.ui.core.mvc',
  l: 'sap.ui.layout', layout: 'sap.ui.layout', form: 'sap.ui.layout.form',
  f: 'sap.f', table: 'sap.ui.table', u: 'sap.ui.unified', unified: 'sap.ui.unified',
  uxap: 'sap.uxap', tnt: 'sap.tnt', html: 'http://www.w3.org/1999/xhtml', cc: 'z2ui5.cc',
});

/**
 * Attach the undeclared-namespace fix where the prefix is conventional: the
 * declaration is inserted as a sibling attribute call right before the root's
 * first xmlns write — a single-line insertion, nothing to guess. ABAP sources
 * only; raw XML rarely misses one and has its own insertion grammar.
 * Mutates the findings, returns them.
 */
/**
 * Attach the json-bind-on-scalar-property fix: the `json = abap_true` argument
 * is deleted from the `_bind( )` the reported attribute carries, together with
 * the whitespace in front of it. The rule is judged on the reconstructed view
 * (properties.mjs), which knows the property's type but not the source span,
 * so the span is found here: the attribute write the finding points at, its
 * argument list, the first `_bind( )` in it, and the one argument. Anything
 * that does not read exactly like that is left without a fix.
 * Mutates the findings, returns them.
 */
export function attachJsonBindFixes(findings, source) {
  const text = String(source);
  let scrubbed = null;
  for (const f of findings) {
    if (f.type !== 'json-bind-on-scalar-property' || !Number.isInteger(f.offset)) continue;
    scrubbed ??= scrub(text);
    const attrOpen = scrubbed.indexOf('(', f.offset);
    if (attrOpen === -1) continue;
    const attr = parenRegion(scrubbed, attrOpen);
    if (attr.body === undefined) continue;
    const bind = /\b_bind(?:_edit)?\s*\(/gi.exec(attr.body);
    if (!bind) continue;
    const bindOpen = attrOpen + 1 + bind.index + bind[0].length - 1;
    const call = parenRegion(scrubbed, bindOpen);
    if (call.body === undefined) continue;
    const arg = /\s*\bjson\s*=\s*abap_true\b/i.exec(call.body);
    if (!arg) continue;
    const start = bindOpen + 1 + arg.index;
    const end = start + arg[0].length;
    if (text.slice(start, end) !== scrubbed.slice(start, end)) continue;
    f.fixes = [{ start, end, text: '' }];
  }
  return findings;
}

/**
 * Attach the did-you-mean fix a finding carries as `written`/`suggestion`
 * but no span for: the view-side rules (properties.mjs) judge a
 * reconstructed node and know the write's offset, not where inside the
 * builder call the name sits. The name is looked for from that offset on,
 * as a whole token (`\`Buton\``, `<Buton`, `type="Emphasised"`), within the
 * next few hundred characters; the first hit is rewritten. In ABAP the
 * search runs over the scrubbed copy so a commented-out line is never it,
 * and the raw source has to spell the same characters there.
 * Mutates the findings, returns them.
 */
export function attachSuggestionFixes(findings, source, { xml = false } = {}) {
  const text = String(source);
  let haystack = null;
  for (const f of findings) {
    if (!f.suggestion || f.written === undefined || f.fixes || !Number.isInteger(f.offset)) continue;
    haystack ??= xml ? text : scrub(text);
    const escaped = String(f.written).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w.-])${escaped}(?![\\w.-])`, 'g');
    re.lastIndex = f.offset;
    const m = re.exec(haystack);
    if (!m || m.index > f.offset + 600) continue;
    const start = m.index;
    const end = start + String(f.written).length;
    if (text.slice(start, end) !== String(f.written)) continue;
    f.fixes = [{ start, end, text: f.suggestion }];
  }
  return findings;
}

/**
 * Attach the duplicate-property fix where the second write REPEATS the first:
 * both attribute calls (the reconstructor records where each one is) read as
 * the same verb with the same argument text, blanks aside, so the second one
 * - which the builder's ASSERT refuses - says nothing the first does not, and
 * deleting it is the whole correction. Two different values are a conflict
 * only the author can settle, and keep the finding.
 */
export function attachDuplicatePropertyFixes(findings, source) {
  const text = String(source);
  let scrubbed = null;
  const callAt = (at) => {
    const m = scrubbed.slice(at, at + 200).match(/^->\s*(\w+)\s*\(/);
    if (!m) return null;
    const open = at + m[0].length - 1;
    const { body, end } = parenRegion(scrubbed, open);
    return end < scrubbed.length ? { verb: m[1].toLowerCase(), args: body.replace(/\s+/g, ' ').trim(), end } : null;
  };
  for (const f of findings) {
    if (f.type !== 'duplicate-property' || f.fixes || !Number.isInteger(f.offset) || !Number.isInteger(f.firstOffset)) continue;
    scrubbed ??= scrub(text);
    const first = callAt(f.firstOffset);
    const second = callAt(f.offset);
    if (!first || !second || first.verb !== second.verb || first.args !== second.args) continue;
    f.fixes = [{ start: f.offset, end: second.end + 1, text: '' }];
  }
  return findings;
}

/** Every fix the pipeline attaches AFTER the rules ran, in one call. */
export function attachSourceFixes(findings, source) {
  return attachDuplicatePropertyFixes(attachSuggestionFixes(attachExcessShutFixes(attachTargetFixes(attachJsonBindFixes(attachNamespaceFixes(attachUnusedNamespaceFixes(findings, source), source), source), source), source), source), source);
}

/**
 * Attach the excess-shut fix: the `->end( )` call the finding sits on is
 * deleted. The reconstructor reports the call that pops past the root, and
 * that call is exactly `->end( )` in the source - the paren before it closes
 * the previous call and stays. Only where the source spells the call that
 * way at the offset; a shut written otherwise keeps the finding.
 */
export function attachExcessShutFixes(findings, source) {
  const text = String(source);
  let scrubbed = null;
  for (const f of findings) {
    if (f.type !== 'excess-shut' || f.fixes || !Number.isInteger(f.offset)) continue;
    scrubbed ??= scrub(text);
    const m = scrubbed.slice(f.offset).match(/^->\s*end\s*\(\s*\)/i);
    if (!m || text.slice(f.offset, f.offset + m[0].length) !== m[0]) continue;
    f.fixes = [{ start: f.offset, end: f.offset + m[0].length, text: '' }];
  }
  return findings;
}

/**
 * Attach the external-link-without-target fix: a `target` attribute call
 * written right behind the href's own `a( )` call, with the value the rule
 * asks for (`_blank`) and the quote the call itself uses. The finding sits on
 * the href's `->a(` write, so its call is one parenRegion away. Two layouts:
 * in the house layout the call's closing paren opens the NEXT line, so the
 * new call takes a line of its own between the two, closed by that same
 * paren; a call closed on its own line gets the new one appended after it.
 * The ObjectHeader pairs write their own target (`titleHref` -> `titleTarget`).
 * ABAP sources only - the raw XML form has no fix. Mutates the findings,
 * returns them.
 */
export function attachTargetFixes(findings, source) {
  const text = String(source);
  let scrubbed = null;
  for (const f of findings) {
    if (f.type !== 'external-link-without-target' || f.fixes || !Number.isInteger(f.offset)) continue;
    scrubbed ??= scrub(text);
    const head = scrubbed.slice(f.offset).match(/^->\s*a\s*\(/i);
    if (!head) continue;
    const open = f.offset + head[0].length - 1;
    const call = parenRegion(scrubbed, open);
    if (call.body === undefined) continue;
    const close = open + 1 + call.body.length;
    if (scrubbed[close] !== ')') continue;
    const q = call.body.match(/\bn\s*=\s*([`'])/i)?.[1] ?? '`';
    const targetAttr = f.member === 'href' ? 'target' : String(f.member).replace(/Href$/, 'Target');
    const attr = `n = ${q}${targetAttr}${q} v = ${q}_blank${q}`;
    const argEnd = open + 1 + call.body.trimEnd().length;
    const between = text.slice(argEnd, close);
    if (between.includes('\n')) {
      // the href call's own line sets the column; the paren that closed it
      // may open a line further out (`)->end( )`)
      const lineStart = text.lastIndexOf('\n', f.offset) + 1;
      const own = text.slice(lineStart, f.offset).match(/^\s*/)[0];
      f.fixes = [{ start: argEnd, end: argEnd, text: `\n${own})->a( ${attr}` }];
    } else {
      f.fixes = [{ start: close + 1, end: close + 1, text: `->a( ${attr} )` }];
    }
  }
  return findings;
}

/**
 * Attach the unused-namespace-declaration fix: the declaring `a( )` call is
 * deleted, and ONLY when that is mechanical — the call has a line to itself.
 * In the house layout that line is `)->a( n = \`xmlns:x\` v = \`…\`` with the
 * call's own closing paren opening the next line, so the line holds exactly
 * one `(` and one `)` and deleting it whole keeps the chain balanced; the
 * other one-line form, `->a( … )` with nothing else on the line, deletes the
 * same way. A declaration sharing its line with another call, a comment or
 * the root element itself is reported without a fix — removing anything
 * beside it would be a guess. ABAP sources only; a raw XML root has its own
 * grammar and rarely carries a stale prefix. Anchored in the SCRUBBED source
 * (a commented-out root before the live one) and verified against the raw
 * text before the span is trusted. Mutates the findings, returns them.
 */
export function attachUnusedNamespaceFixes(findings, source) {
  const text = String(source);
  let scrubbed = null;
  for (const f of findings) {
    if (f.type !== 'unused-namespace-declaration' || !Number.isInteger(f.offset)) continue;
    scrubbed ??= scrub(text);
    // the finding sits on the `->a(` write; the call's argument list follows
    const head = scrubbed.slice(f.offset).match(/^->\s*a\s*\(/i);
    if (!head) continue;
    const open = f.offset + head[0].length - 1;
    const call = parenRegion(scrubbed, open);
    if (call.body === undefined || call.end >= text.length) continue;
    const close = call.end; // the call's own `)`
    const prefix = f.member.replace(/[.-]/g, '\\$&');
    if (!new RegExp(`^\\s*n\\s*=\\s*[\`']xmlns:${prefix}[\`']\\s+v\\s*=\\s*[\`'][^\`']*[\`']\\s*$`, 'i').test(call.body)) continue;
    // the raw line (a trailing comment is still visible there) has to be
    // exactly the call, with at most the previous call's `)` in front of it
    const lineStart = text.lastIndexOf('\n', f.offset - 1) + 1;
    const nl = text.indexOf('\n', f.offset);
    const lineStop = nl === -1 ? text.length : nl; // exclusive
    const lineEnd = nl === -1 ? text.length : nl + 1; // the newline included
    const before = text.slice(lineStart, f.offset);
    if (!/^\s*\)?$/.test(before)) continue;
    if (text.slice(f.offset, close + 1) !== scrubbed.slice(f.offset, close + 1)) continue;
    /* The LAST call of the chain: `)->a( n = \`xmlns:x\` v = \`…\` ).` - the
     * call's own `)` is followed by the statement's end, not by the next
     * call. Deleting the line would take that end with it, so the call is
     * cut out from the end of the line before instead: the previous call's
     * argument list is then closed by what closed this one, `… \`sap.m\` ).`
     * - the shape an author writes. Only when that line ends in code (a
     * comment there would swallow the paren) and nothing but the statement's
     * end follows the call; two stale ones in a row overlap here, and the
     * second pass of --fix takes the last. */
    if (close < lineStop && /^\s*[.)]/.test(text.slice(close + 1, lineStop)) && lineStart > 0) {
      const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
      const prevEnd = prevStart + text.slice(prevStart, lineStart - 1).replace(/\s+$/, '').length;
      const prevLine = text.slice(prevStart, prevEnd);
      if (prevLine.trim() === '' || prevLine !== scrubbed.slice(prevStart, prevEnd)) continue;
      const own = before.trim() === ')';
      f.fixes = [own ? { start: prevEnd, end: close, text: ' ' } : { start: prevEnd, end: close + 1, text: '' }];
      continue;
    }
    if (close < lineStop) {
      // `->a( … )` complete on its line: balanced on its own only without a
      // leading `)` that closes the call before it
      if (before.trim() !== '' || text.slice(close + 1, lineStop).trim() !== '') continue;
    } else {
      // house layout: this line holds the previous call's `)` and this call's
      // `(`, and the call's own `)` opens the next line - the argument list
      // has to end the line, nothing else may sit between it and that `)`
      if (text.slice(open + 1, lineStop).trim() !== call.body.trim()) continue;
      if (!/^\s*\)/.test(text.slice(lineEnd))) continue;
    }
    f.fixes = [{ start: lineStart, end: lineEnd, text: '' }];
  }
  return findings;
}

export function attachNamespaceFixes(findings, source) {
  for (const f of findings) {
    if (f.type !== 'undeclared-namespace') continue;
    const lib = KNOWN_NS[f.member];
    if (!lib) continue;
    /* Anchored in the SCRUBBED source: a commented-out builder line
     * (`" )->a( n = `xmlns` … ` — a previous root kept for reference) comes
     * before the live one often enough, and inserting the declaration there
     * would leave the view unfixed and the comment mangled. scrub( ) blanks
     * comments without moving anything, so the offset stays valid for the
     * raw source the fix is applied to.
     * The anchor is the attribute verb, `)->a( `. */
    const anchor = scrub(String(source)).match(/->\s*(a)\(\s*(?=n\s*=\s*`xmlns`)/i);
    if (!anchor) continue;
    const at = anchor.index + anchor[0].length;
    f.fixes = [{ start: at, end: at, text: `n = \`xmlns:${f.member}\` v = \`${lib}\` )->${anchor[1]}( ` }];
  }
  return findings;
}

/** The parsed `rules` entry for the render gate's pseudo-rule. Render errors
 *  are strings, not findings, so applyRules never sees them — index.mjs
 *  applies this to a result's renderErrors instead: `false` and a matching
 *  `exclude` drop them (with a note), a severity decides what a render error
 *  counts as for the exit code. Directives cannot address them — a render
 *  error has no line in the ABAP source. */
export function renderRuleConfig(rules) {
  return ruleConfig(rules?.[RENDER_RULE]);
}

/** An unlisted type counts as an error: a new rule is loud until it is
 *  deliberately classified, never silently ignored. A severity already set
 *  on the finding wins — that is how a `rules` override survives. */
export function severityOf(finding) {
  return finding?.severity || defaultSeverityOf(finding?.type);
}


/** One line, plain English, no leading punctuation — the same sentence for
 *  the CLI, the JSON output and any editor integration. */
export function describe(f) {
  const unit = unitRule(f.type);
  if (unit) return unit.message(f);
  // a type no unit defines: the shape the version findings always had
  return `${f.control} ${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`;
}

/*
 * Source positions. The gates record a character offset into the file they
 * were given (the ABAP class or the XML document); turning that into a
 * 1-based line/column needs the source, which only the caller has.
 */
/** Offsets where each line starts — computed once per source, so locating
 *  many findings in one file does not rescan the file per finding. */
function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/* A UTF-8 byte-order mark is a character of the decoded source but no column
 * of the file anybody looks at: an editor shows line 1 starting after it. So
 * on the first line of a source that opens with one, the columns behind it
 * count from the character after it - the mark itself keeps column 1, where
 * `byte-order-mark` reports it. */
const positionIn = (starts, length, offset, bom = false) => {
  if (typeof offset !== 'number' || offset < 0 || offset > length) return null;
  // binary search: the last line start at or before the offset
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  const shift = bom && lo === 0 && offset > 0 ? 1 : 0;
  return { line: lo + 1, column: offset - starts[lo] + 1 - shift };
};
const opensWithBom = (source) => source.charCodeAt(0) === 0xFEFF;

export function positionAt(source, offset) {
  return positionIn(lineStarts(source), source.length, offset, opensWithBom(source));
}

/**
 * Enrich findings in place with everything a consumer would otherwise
 * recompute: severity, message and — when the gate recorded an offset —
 * line/column in `source`.
 */
export function annotate(findings, source) {
  const starts = source == null ? null : lineStarts(source);
  const bom = source != null && opensWithBom(String(source));
  for (const f of findings) {
    f.severity = severityOf(f);
    f.message = describe(f);
    /* The card on the rules page, on every finding — so a consumer that
     * shows one (an editor's problems panel, a bot's comment, the playground)
     * has a link to hand the reader without knowing there is a page. */
    f.url = ruleUrl(f.type);
    const pos = starts ? positionIn(starts, source.length, f.offset, bom) : null;
    if (pos) { f.line = pos.line; f.column = pos.column; }
  }
  return findings;
}

/*
 * Per-rule configuration — the `rules` block of abap2ui5lint.jsonc.
 *
 * Same shape as abaplint's rule config next door: a rule is switched off with
 * `false`, given another severity with a string, and both plus a file
 * `exclude` list with an object. A repo that considers, say, the
 * accessibility hints noise says so once in its config instead of teaching
 * every consumer of the library its own opinion table.
 *
 *   "rules": {
 *     "missing-accessibility": false,
 *     "member-deprecated": "hint",
 *     "event-without-handler": { "severity": "warning", "exclude": ["/test/"] }
 *   }
 */
function ruleConfig(value) {
  if (value === undefined || value === null) return null;
  /* `true` is "on, as it is": an entry with nothing to override - which is
   * not the same as no entry for an opt-in rule, where only an entry
   * switches the rule on at all. Read as no entry, `"chain-house-layout":
   * true` passed the config check and ran nothing. */
  if (value === true) return {};
  if (value === false) return { off: true };
  if (typeof value === 'string') return { severity: value.toLowerCase() };
  const cfg = {};
  if (value.severity) cfg.severity = String(value.severity).toLowerCase();
  // abaplint's wording: "file regex filename patterns to exclude, case insensitive"
  if (Array.isArray(value.exclude)) cfg.exclude = value.exclude.map((p) => new RegExp(p, 'i'));
  return cfg;
}

/* Compiled once per (rules object, rule id), not once per finding: a corpus
 * run calls applyRules for every file, and every finding used to recompile
 * its rule's `exclude` regexes from scratch. The WeakMap keys on the rules
 * OBJECT, so a config reloaded into a new object simply compiles fresh. */
const ruleConfigMemo = new WeakMap();
function ruleConfigFor(rules, id) {
  if (rules === undefined || rules === null) return null;
  let byId = ruleConfigMemo.get(rules);
  if (!byId) { byId = new Map(); ruleConfigMemo.set(rules, byId); }
  if (byId.has(id)) return byId.get(id);
  const cfg = ruleConfig(rules[id]);
  byId.set(id, cfg);
  return cfg;
}

/** Every spelling of `file` an `exclude` pattern is tried against - and an
 *  `ignore` pattern, and the render gate's `exclude`: every path pattern a
 *  config holds (see pathMatches). */
function fileForms(file = '') {
  /* An `exclude` has to mean the same thing however the run was started.
   *
   * The path a finding carries is whatever string the file was COLLECTED
   * under, and that is absolute or relative depending on the invocation: a
   * discovered config joins `paths` onto its absolute dirname, while
   * `abap2ui5lint src` and `--config abap2ui5lint.jsonc` both leave it
   * relative. So the same config, on the same tree, silently waived different
   * things - and it was the run that LOOKED stricter that was broken
   * (abap2UI5/linter#35: `"exclude": ["/src/02/"]`, written with the leading
   * slash abaplint's convention gives it, matched only the absolute form, so
   * `abap2ui5lint src` reported 25 findings the repository had waived on
   * purpose). The mirror case is just as silent: `["^src/00/98/"]`, written
   * the way the REPORT prints the path, matched only the relative form.
   *
   * Both are the same defect, so both forms are derived here and the pattern
   * is tried against each - and against the string as given, which is what a
   * pattern written for some third spelling would have matched before. */
  const forms = new Set([file]);
  if (file) {
    forms.add(path.resolve(file));
    forms.add(path.relative(process.cwd(), path.resolve(file)));
  }
  /* And every one of them with forward slashes. An `exclude` pattern is a path
   * regex, and both spellings the README gives are written with `/` - but on
   * Windows `path.resolve` and `path.relative` hand back `\`, so `^src/00/98/`
   * matched none of the three forms and the config silently waived nothing.
   * The separator is not part of what the pattern is trying to say, so it is
   * normalised away rather than asking every config to spell both. */
  for (const f of [...forms]) if (f.includes('\\')) forms.add(f.replace(/\\/g, '/'));
  const formList = [...forms];
  return formList;
}

/** Whether one of `patterns` (RegExps) matches `file` in any of its
 *  spellings - as reached, absolute, cwd-relative, with `/` separators. The
 *  one reading every path pattern of a config gets: `rules[id].exclude`
 *  had it since abap2UI5/linter#35, `ignore` and `rules['render-error']
 *  .exclude` tested the path only as it was reached, so `"/src/99/"`
 *  ignored the frozen package in `abap2ui5lint` (the config's absolute
 *  `paths`) and not in `abap2ui5lint src`. */
export function pathMatches(patterns, file = '') {
  if (!patterns?.length) return false;
  const formList = fileForms(file);
  return patterns.some((re) => formList.some((f) => re.test(f)));
}

/** Whether the `rules` block lets `id` report on `file` at all: not
 *  switched off, not excluded for the file, and - for an opt-in rule -
 *  asked for. What applyRules filters by, and what decides whether a
 *  directive naming the rule could have had anything to suppress. */
export function ruleRuns(rules, id, file = '') {
  const cfg = ruleConfigFor(rules, id);
  if (OPT_IN.has(id) && (!cfg || cfg.off)) return false;
  if (!cfg) return true;
  if (cfg.off) return false;
  const formList = fileForms(file);
  return !cfg.exclude?.some((re) => formList.some((f) => re.test(f)));
}

/**
 * Drop the findings a `rules` entry switched off (or excluded for this file)
 * and apply its severity overrides. Returns the surviving findings — the
 * input array is not mutated, the findings themselves are.
 */
export function applyRules(findings, rules, file = '') {
  const formList = fileForms(file);
  const excluded = (cfg) => cfg.exclude?.some((re) => formList.some((f) => re.test(f)));
  const kept = [];
  for (const f of findings) {
    const cfg = ruleConfigFor(rules, f.type);
    // an opt-in rule needs a config entry that is not `false` to run at all
    if (OPT_IN.has(f.type) && (!cfg || cfg.off)) continue;
    if (cfg) {
      if (cfg.off) continue;
      if (excluded(cfg)) continue;
      if (cfg.severity) f.severity = cfg.severity;
    }
    kept.push(f);
  }
  return kept;
}

/*
 * Source directives — the local escape hatch.
 *
 * `--allow` and the `rules` block are repo-wide; the case that actually
 * comes up is one line that knows better than the gate. Spelled the way
 * ui5lint spells it, carried by whatever comment the file has:
 *
 *   " abap2ui5lint-disable-next-line unknown-binding-path -- filled in a LOOP
 *   <!-- abap2ui5lint-disable-next-line -->
 *   " abap2ui5lint-disable   ... " abap2ui5lint-enable
 *
 * No rule id after the directive means every rule. Everything after `--` is
 * a reason and ignored — which is also what terminates an XML comment, so
 * the `-->` never reads as a rule. One directive per line; `-enable` closes
 * every open `-disable` block. A finding the gate could not place (no line)
 * cannot be suppressed this way.
 *
 * And the directives are judged in turn, because a directive is the one
 * statement in a source that nothing else checks: `binding-to-locl` used to
 * waive nothing and say nothing, so the finding it was written for stayed
 * reported one line down and read as the linter ignoring the comment. An id
 * no rule has is `unknown-directive-rule` (with the one did-you-mean
 * lib/suggest.mjs makes), and a directive that suppressed nothing is
 * `unused-directive` — ESLint's --report-unused-disable-directives, on by
 * default here because a suppression that outlives its finding is exactly
 * what the baseline refuses to keep too. Both are ordinary rule ids: the
 * `rules` block switches them off, and so does a directive.
 */
const DIRECTIVE_RE = /abap2ui5lint-(disable-next-line|disable-line|disable|enable)\b([^\n]*)/;

/** The rule ids named after a directive; null means "all rules". */
function directiveRules(text) {
  const ids = String(text).split('--')[0].split(/[\s,]+/).filter(Boolean).map(canonicalRule);
  return ids.length ? new Set(ids) : null;
}

/**
 * Scan a source for directives. Returns null when it holds none (the common
 * case, and the reason this never costs anything), otherwise
 * `{ suppresses(line, rule), findings() }` — `suppresses` is the question
 * every finding asks, and it remembers which directive answered it, so that
 * `findings()` afterwards can name the directives nothing asked.
 */
export function parseDirectives(source, { ran = () => true, gatesRan = true } = {}) {
  if (!source || !String(source).includes('abap2ui5lint-')) return null;
  const perLine = new Map(); // target line -> directives aimed at it
  const spans = [];          // block directives, with `from`/`to`
  const open = [];
  const all = [];
  const lines = String(source).split('\n');
  const xml = /^\s*</.test(String(source));
  let offset = 0;
  lines.forEach((text, i) => {
    const at = offset;
    offset += text.length + 1;
    const m = DIRECTIVE_RE.exec(text);
    if (!m) return;
    const commentAt = directiveInComment(text, m.index, xml);
    if (commentAt < 0) return;
    const line = i + 1;
    const rules = directiveRules(m[2]);
    const idAt = at + m.index + m[0].length - m[2].length;
    const d = {
      kind: m[1], line, rules, used: new Set(),
      // where the comment stands in the source: the whole line when it has
      // the line to itself, else the comment alone - what a fix deletes
      offset: at + commentAt,
      lineStart: at, lineEnd: at + text.length,
      commentEnd: at + commentEndIn(text, m.index, xml),
      // every id as written, with its own span, for the did-you-mean fix
      // an old id of a renamed rule is read as the new one (lib/rule-aliases.mjs)
      ids: [...String(m[2]).split('--')[0].matchAll(/[^\s,]+/g)].map((x) => ({ id: canonicalRule(x[0]), start: idAt + x.index, end: idAt + x.index + x[0].length })),
    };
    all.push(d);
    if (m[1] === 'disable-next-line') addTo(perLine, line + 1, d);
    else if (m[1] === 'disable-line') addTo(perLine, line, d);
    else if (m[1] === 'disable') { d.from = line; open.push(d); }
    else while (open.length) { const o = open.pop(); o.to = line; spans.push(o); }
  });
  while (open.length) { const o = open.pop(); o.to = lines.length + 1; spans.push(o); }
  const covers = (d, rule) => d.rules === null || d.rules.has(rule);
  const answer = (d, rule) => { d.used.add(d.rules === null ? '*' : rule); return true; };
  /* The ids of a directive nothing asked for so far - `[null]` for a bare
   * directive, which names none. An id no rule has is reported as unknown
   * and not counted here a second time. */
  /* An id whose rule did not RUN on this source (switched off or excluded
   * by the `rules` block, an opt-in nobody asked for, a gate the run left
   * out - `ran` says) had nothing to suppress, so it is not unused: it is
   * unjudged. Reporting it told a `--no-properties` run, or a repo that
   * switched a rule off, to delete the very waiver the full run needs. */
  /* A BARE directive names every rule, so it is unjudged as soon as the run
   * left a whole GATE out (`gatesRan` false - the property walk under
   * `properties: false`): the line may carry exactly the finding that gate
   * would have made. A rule the `rules` block switched off does not count
   * here - the config speaks for every run of the repository, and otherwise
   * no bare directive in a configured repository could ever be unused. */
  const unusedOf = (d) => (d.rules === null
    ? (d.used.size || !gatesRan ? [] : [null])
    : d.ids.filter((x) => RULES.includes(x.id) && !d.used.has(x.id) && ran(x.id)).map((x) => x.id));
  return {
    /** Whether a directive waives `rule` on `line`. `own` is the directive a
     *  finding is ABOUT: a bare directive cannot waive its own finding (a
     *  catch-all that satisfied itself would never be reported), while one
     *  that names `unused-directive` says so on purpose and may. */
    suppresses(line, rule, own = null) {
      let hit = false;
      const skip = (d) => d === own && d.rules === null;
      for (const d of perLine.get(line) ?? []) if (!skip(d) && covers(d, rule)) hit = answer(d, rule);
      for (const d of spans) if (!skip(d) && line >= d.from && line <= d.to && covers(d, rule)) hit = answer(d, rule);
      return hit;
    },
    /** Whether the directive a finding is `about` is still unused - asked
     *  again after the directive findings themselves went through
     *  `suppresses`, since one directive may exist to waive another's hint. */
    stillUnused: (d) => unusedOf(d).length > 0,
    /** The findings about the directives themselves — asked AFTER every
     *  finding of the source has been through `suppresses`. Each carries the
     *  directive it is `about`, for the caller to strip. */
    findings() {
      const out = [];
      const report = (f) => out.push(f);
      for (const d of all) {
        if (d.kind === 'enable') continue;
        runRule(unknownDirectiveRule, { directive: d, known: RULES, renderRule: RENDER_RULE, report });
        runRule(unusedDirective, { directive: d, unused: unusedOf(d), source, report });
      }
      return out;
    },
  };
}

function addTo(map, line, d) {
  if (!map.has(line)) map.set(line, []);
  map.get(line).push(d);
}

/* Where the comment a directive stands in STARTS - the only place a
 * directive can be - or -1. It used to be honoured anywhere in the text, so
 * a string literal that merely contained the words (a help text quoting the
 * syntax, a message about the linter) opened a block for every rule. In ABAP
 * a comment is a `*` in column one or a `"` outside every literal; in XML it
 * is a `<!-- … -->` pair. */
function directiveInComment(line, index, xml) {
  if (xml) {
    const before = line.slice(0, index);
    const at = before.lastIndexOf('<!--');
    return at > before.lastIndexOf('-->') ? at : -1;
  }
  if (line[0] === '*') return 0;
  let str = null;
  for (let i = 0; i < index; i++) {
    const c = line[i];
    if (str) {
      if (str === '|' && c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '`' || c === "'" || c === '|') { str = c; continue; }
    if (c === '"') return i;
  }
  return -1;
}

/* Where that comment ends, as an index into the line: an ABAP comment runs
 * to the end of the line, an XML one to its `-->`. `trimEnd( )` drops what
 * `/\s+$/` did - the two share one definition of whitespace - without
 * trying every blank of the line as the start of the trailing run. */
function commentEndIn(line, index, xml) {
  if (xml) {
    const close = line.indexOf('-->', index);
    if (close >= 0) return close + 3;
  }
  return line.trimEnd().length;
}

/**
 * What the directives in `source` say back: the findings they suppress are
 * dropped, and the findings ABOUT them (an unknown rule id, a directive that
 * suppressed nothing) are added — themselves subject to the `rules` block
 * and to the directives, so `" abap2ui5lint-disable unused-directive` does
 * not report itself. Returns the input array unchanged when the source holds
 * no directive at all. `ran(id)` says which rules the caller actually ran
 * (default: all); an id the `rules` block switched off never counts as run.
 */
export function applyDirectives(findings, source, { rules, file = '', ran = () => true, stoodDown = [] } = {}) {
  const directives = parseDirectives(source, {
    // `stoodDown`: rules that ran and then withdrew their verdict on this
    // source (a view they could not fully see) - a waiver of one is unjudged
    ran: (id) => ruleRuns(rules, id, file) && ran(id) && !stoodDown.includes(id),
    // the caller's gates alone - see unusedOf in parseDirectives
    gatesRan: RULES.every((id) => ran(id)),
  });
  if (!directives) return findings;
  const kept = findings.filter((f) => !(f.line && directives.suppresses(f.line, f.type)));
  const own = applyRules(annotate(directives.findings(), source), rules, file)
    .filter((f) => !directives.suppresses(f.line, f.type, f.about))
    /* a directive whose only job was to waive another directive's hint has
     * just done it: it is used now, and the finding computed before says
     * otherwise */
    .filter((f) => f.type !== 'unused-directive' || directives.stillUnused(f.about));
  for (const f of own) delete f.about; // the directive itself is not part of the finding's shape
  return own.length ? [...kept, ...own] : kept;
}
