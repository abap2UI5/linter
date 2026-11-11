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
 * usable in a source directive. `SEVERITY_BY_TYPE` below is therefore the
 * rule registry: a type missing from it is not a known rule.
 */
import { scrub, parenRegion } from './abap.mjs';
import { CS_VIEW_CONSTANT } from './frontend-actions.mjs';
import { OBSOLETE_CC_CONTROLS } from './cc-controls.mjs';
import { ruleUrl } from './rule-docs.mjs';
import { caseMatch } from './suggest.mjs';
import { UNIT_RULES, unitRule } from './rules/index.mjs';
import { short, LINE_LIMIT } from './rule.mjs';

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
const SEVERITY_BY_TYPE = {
  // --- runtime dumps in the view builder itself ----------------------------
  'excess-shut': 'error',
  'duplicate-property': 'error',
  'attribute-without-element': 'error',
  /* a chain whose parentheses do not balance: a syntax error in the class,
   * and the one shape that makes the reconstructor produce nothing at all */
  'chain-unbalanced-parens': 'warning',
  // --- the class does not even compile -------------------------------------
  // --- the view does not load / UI5 rejects it -----------------------------
  /* a CSS-typed literal its type's regex refuses (`width="100"`): the XML
   * parser only logs it, the control's setter throws, the view never loads */
  /* a model type no release has: by global name the binding runs without
   * its type (raw value shown, input never parsed back), through
   * core:require the module 404s and the view never loads */
  /* The one rule whose severity depends on what the CONFIG says rather
   * than on what the view does. `"distribution": "openui5"` states that
   * the target does not ship the library, so the control cannot load and
   * this is the error below. With no `distribution` at all the linter
   * does not know which system this runs on, so properties.mjs attaches
   * `hint` to the finding instead - see the emit site. `"sapui5"` reports
   * nothing. A `rules` override still beats both. */
  /* A library SAP deprecated whole. A warning rather than an error for the
   * same reason `control-deprecated` is one: it renders today, and the run
   * that reports it is not the run that breaks. It is louder than the
   * per-control deprecations only in what it costs to fix - a whole namespace
   * comes out of the view - and that is a reason to hear about it early, not
   * a reason to fail the build over it. */
  // a name that matches no glyph in any release: the control renders without
  // an icon, in every system, and nothing anywhere says so
  // an aggregation TAG the target release does not have: UI5 resolves it as a
  // control class and the 404 kills the whole view — the property version of
  // the same mistake is merely dropped, which is why this is not member-too-new
  // --- the class does not import into a system --------------------------------
  /* deleting by the loop's own cursor either skips the row after every
   * deletion (silently wrong data) or dumps with TABLE_INVALID_INDEX when an
   * inner construct reset sy-tabix — a live app answered HTTP 500 with
   * exactly that. Real runtime breakage on every system, so an error. */
  // --- silent at runtime, but the view is not what was written -------------
  /* a value carrying data written through `v`: text on every roundtrip in
   * which the data holds no brace, a binding read out of the view model on
   * the one in which it does - a warning, because the corpus writes the
   * pattern legitimately for constants held in variables and the fix is
   * one letter */
  'display-root-mismatch': 'error',
  // --- portability and data ------------------------------------------------
  /* An `http://` asset on a page served over https is BLOCKED by the browser
   * as mixed content - the image never arrives and only the console says so.
   * An error for every loading property, and a hint for `href`, which the
   * browser navigates to rather than loads: properties.mjs puts `severity:
   * 'hint'` on that finding the way sapui5-only-control does. */
  /* --- the abapGit round trip: the file comes back DIFFERENT on every pull —
   * abapGit writes every file one specific way (LF only, no BOM on .abap, one
   * terminating newline, no trailing blanks), so a file written another way
   * diffs against what the system serializes back, permanently, for everyone.
   * Warnings, not errors: unlike source-line-too-long nothing fails to
   * import; the tree merely never stops diffing. */
  // the ecosystem's downport converts xsdbool -> boolc for the old releases;
  // a hand-written boolc breaks that conversion in the other direction, and
  // the two differ in what FALSE is (a blank vs an initial char)
  /* A deprecation NOT yet in effect on the target, inside the horizon the
   * config asked for (`deprecatedAt`). Nothing breaks on the target, and the
   * replacement may not even exist there yet - advice for the day the floor
   * moves, so a hint, and only ever reported when the horizon is set. */
  /* Native XHTML/SVG in a view, on a target where UI5 already deprecates it
   * (1.120 on). A hint for its first release - an advisory period: abap2UI5
   * views have long carried <html:style> blocks, and the corpora should see
   * the count before it can fail a build. */
  /* The only rule whose severity is about what was NOT checked: a class on
   * the frozen builder reconstructs no view, so every other rule here is
   * silent about it for lack of anything to read.
   *
   * A warning, and the message says why without calling the app broken:
   * `z2ui5_cl_xml_view` keeps working and is headed for an addon of its own,
   * so staying on it is a legitimate choice - what it costs is this gate,
   * every view rule silent for lack of a view to read. That is a reason to
   * say something, not a reason to fail the class outright.
   * A repo that maintains such an app deliberately says so once:
   * `"rules": { "frozen-view-builder": "hint" }` (or `false`). */
  'frozen-view-builder': 'warning',
  /* An ERROR although the control still works, and that is a project
   * decision rather than a runtime fact: abap2UI5 marks eight companion
   * controls `// OBSOLETE: replaced by …` (Timer, Focus, Scrolling, Title,
   * LPTitle, Favicon, Info, History) and they must never be used - each has
   * a released replacement, and they are on the removal plan. A warning
   * would let every gate that fails on errors only ship a new one. */
  'obsolete-custom-control': 'error',
  'raw-javascript-to-frontend': 'warning',
  // a warning, not an error, and deliberately: the app is not broken TODAY.
  // It breaks the first time something navigates into it — a sub-app, a
  // built-in popup, a restored bookmark — and that day may never come for a
  // standalone app. The defect is latent, so it is reported as one
  /* A warning, not an error, and the boundary is deliberate. That the control
   * writes a LOCALE string back through the two-way binding is measured, not
   * inferred — but whether the field on the other end is really a date is read
   * off what the ABAP writes into it, which is strong evidence and not proof.
   * "the data behind it is not what the author thinks it is" is exactly this
   * bucket, and it still fails a corpus gate: only `hint` is advisory. */
  // --- worth knowing -------------------------------------------------------
  // a hint, not a warning: a control can FIRE more than its metadata
  // declares (ColorPickerPopover forwards the picker's change parameters
  // verbatim, colorString included, and declares none of that) — so a
  // missing declaration is strong evidence of a typo, never proof
  /* The sibling that is NOT a hint: an unbound PUBLIC attribute is shipped to
   * the browser on every roundtrip for nothing, and the remedy (PROTECTED) is
   * one word. A warning rather than an error because a called app may read
   * it from outside, which no single source can see. */
  /* The implicit default key is a fact about the DATA - every character-like
   * component, in declaration order - that SORT, COLLECT and DELETE ADJACENT
   * use without the author having written it: "the data behind it is not
   * what the author thinks it is", the warning bucket. */
  // ADT's ABAP Doc check reports the tag; the rendered documentation drops it
  /* Not a defect at runtime - the reconstructor is what goes blind: the
   * attribute holding the captured handle is dropped from every gate's view
   * of the class, silently. The same bucket as unresolved-attribute-value,
   * one notch up because the attribute vanishes rather than merely its check. */
  // the default spelled out: correct, fixable, and nothing else
  // the same category one parameter over: a one-row table where arg says it
  // the parser ignores a declaration nothing uses; it is a stale claim, not a defect
  // CSS may arrive from outside the class - a served stylesheet, a theme
  // the navigation is what the author wrote; whether it should leave the app is theirs
  // the inverse rule, and a hint for the same reason its sibling is one: the
  // wire is not broken, it is incomplete — and only the app knows whether the
  // state it sets still matters after the screen has been rebuilt
  /* its navigation twin: the container comes back on its first page while a
   * bound field still names the page it was on */
  // formatting: a chain builds the same view however it is written, so this
  // family is advisory by construction — see lib/chain-layout.mjs
  // a hint like its extended-check sibling above: the code is correct and
  // runs — SLIN wants the deliberately empty handler to say so (##NO_HANDLER)
  'chain-indentation': 'hint',
  'chain-element-per-line': 'hint',
  // the one rule in this linter that encodes a HOUSE STYLE rather than an
  // inconsistency, and therefore the one that is OFF until asked for — see
  // OPT_IN below
  'chain-house-layout': 'hint',
  /* The second opt-in (OPT_IN below): not a defect at all, a GOAL - the app
   * stays inside the protocol's portable profile v1, so a non-UI5 frontend
   * renders it. Whoever asks for it asks for it to matter, so a warning;
   * `"portable-app": "error"` makes it a gate. lib/portable.mjs */
  'portable-app': 'warning',
  /* The third opt-in (OPT_IN below): a real defect in an app's own code -
   * the list stops at 100 of the rows it was given - and noise on a corpus
   * of faithful ports, whose originals cap at 100 too. Whoever asks for it
   * asks for it to matter, so a warning. lib/properties.mjs */
  /* The wire WORKS — that is the whole distinction from `unknown-view-slot`
   * next to it. What it lacks is the compiler: a retyped slot value is one
   * keystroke from being that error, and `cs_view-nested` -> `NEST` is a
   * pairing nobody holds in their head. `--fix` writes the constant. */
  // --- 2026-09-19: the abap2UI5-specific round ----------------------------
  /* a `_bind( )` on something that is not an attribute has no model path to
   * derive - the framework raises at runtime */
  /* the inverse of event-without-handler, and a hint for the same reason: a
   * handler nothing raises is dead code or a typo, never a broken view */
  /* both silent in UI5: an association that resolves to no control, a row
   * template whose cells do not line up with the columns */
  /* the wire works today; the constant is kept for compatibility only */
  /* a bound aggregation with no template: bindAggregation throws, the view
   * never loads */
  /* a binding into a LOOP's work area: every row binds the same path (an
   * attribute), or a path the model does not have (a local, a field symbol) */
  /* a `$source>/name` the source control does not have - undefined in the
   * browser, empty in ABAP, like an unknown event parameter */
  /* an input nothing reads: a legitimate demo shape, so a hint */
  /* a second element beside the document root: the render rejects it */
  // the browser's XML parser refuses the document: the view never loads
  /* a parameter the message methods no longer have: the class does not compile */
  /* a box type the server does not know: the box still opens, as a plain
   * show( ) with no icon and no title of its kind */
  /* a bare model path as an attribute's value: the attribute is the TEXT
   * "/X", and a typed property refuses it outright */
  /* text where sap.ui.core.HTML wants markup: jQuery reads it as a selector,
   * and the control renders nothing or throws */
  /* the variant handshake nobody sent: saving a variant fails silently */
  // --- 2026-09-25: the app guide and z2ui5_if_client's ABAP Doc, read as rules
  /* a cs_event- constant raised through `_event( )`: a backend event named
   * POPUP_CLOSE that reaches main( ) and closes nothing */
  /* the mirror of popover-display-val: popup_display( ) imports val, so the
   * class does not compile */
  /* the wire works and loses nothing; the overlay flashes over the field */
  /* every nested display adds one more fragment: the second call shows two */
  /* the boolean the blanket omission drops: the control renders its default */
  // --- what a source says back to the linter --------------------------------
  /* a directive naming an id no rule has: it waives nothing, and the finding
   * it was written for is still reported one line down - which reads as the
   * linter ignoring the directive. A warning, the way an unknown id in the
   * config is an error: a typo here is a typo in a suppression */
  'unknown-directive-rule': 'warning',
  /* a directive that suppressed nothing - the rule went quiet, the code
   * moved, or the id was never the one that fired. ESLint's
   * --report-unused-disable-directives; a hint, because nothing is wrong
   * with the code, only with what the file says about it */
  'unused-directive': 'hint',
};

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
export const OPT_IN = Object.freeze(new Set([
  'bound-aggregation-over-size-limit', 'chain-house-layout', 'portable-app',
  ...UNIT_RULES.filter((r) => r.optIn).map((r) => r.id),
]));

/** Whether a `rules` block switches an opt-in rule on. */
export const isOptInEnabled = (rules, type) => {
  const cfg = ruleConfig(rules?.[type]);
  return Boolean(cfg) && !cfg.off;
};

/** Every rule id the linter can report, sorted — the registry the config
 *  file and the schema generator validate against. */
/* The rules written as one unit (lib/rule.mjs, lib/rules/): each brings its
 * own severity, and its own sentence in describe( ) below. An id defined both
 * ways would have two severities and no way to say which one counts. */
for (const rule of UNIT_RULES) {
  if (rule.id in SEVERITY_BY_TYPE) throw new Error(`rule '${rule.id}' is defined as a unit AND listed in SEVERITY_BY_TYPE`);
  SEVERITY_BY_TYPE[rule.id] = rule.severity;
}

export const RULES = Object.freeze(Object.keys(SEVERITY_BY_TYPE).sort());

/** The severity a rule carries before any `rules` override. */
export const defaultSeverityOf = (type) => SEVERITY_BY_TYPE[type] || 'error';

/** The rule id render-gate failures are reported under. It is not a
 *  configurable rule (use `render: false` to switch the gate off) — it only
 *  labels the line, so a render error reads like every other finding. */
export const RENDER_RULE = 'render-error';

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
  switch (f.type) {
    case 'display-root-mismatch':
      return f.value === 'mvc:View'
        ? `client->${f.member}( ) loads its XML as a fragment, but the document root is a ${f.value} — a view has no open( )`
        : `client->${f.member}( ) loads its XML as a view, but the document root is a ${f.value} — XMLView.create needs a mvc:View`;
    case 'duplicate-property':
      return `${f.member} is set twice on the same control — the view builder asserts on that`;
    case 'attribute-without-element':
      return `an attribute (${f.member}) without an element to attach it to — the view builder asserts on that`;
    case 'chain-indentation': {
      const what = f.member === 'att' ? 'attribute' : 'element';
      const why = ' — the indentation stops showing the tree the view actually has';
      return f.shape === 'outdented'
        ? `this ${what} call is written at column ${f.value}, LEFT of the element it belongs to (column ${f.count})${why}`
        : f.shape === 'attributes'
          ? `this attribute is written at column ${f.value}, the other attributes of the same control at ${f.count}${why}`
          : `this element is written at column ${f.value}, its siblings under the same parent at ${f.count}${why}`;
    }
    case 'chain-house-layout':
      return `this chain is not in the house layout — ${f.count} line(s) differ (one call per line including attributes, 4 spaces per level of the tree, the closing call in the column of the element it closes); \`--fix\` rewrites it`;
    case 'portable-app': {
      const v1 = 'the portable profile v1';
      const at = f.control ? `${f.control}${f.member ? ` ${f.member}` : ''}: ` : '';
      switch (f.reason) {
        case 'control':
          return `${f.control} is not in ${v1}${f.namespace ? ` (namespace ${f.namespace} is outside it)` : ''} — a non-UI5 frontend renders a placeholder for it`;
        case 'custom-control':
          return `${f.control} is an abap2UI5 custom control (z2ui5.cc), bound to the UI5 runtime — not part of ${v1}`;
        case 'member':
          return `${f.control} ${f.kind ? `${f.kind} ` : ''}${f.member} is not in ${v1} — a portable frontend ignores it`;
        case 'binding':
          return `${at}the binding uses ${f.value}, outside the binding forms of ${v1}`;
        case 'expression':
          return `${at}the expression binding uses ${f.value}, outside the restricted grammar of ${v1} (references, literals, comparison/logic/arithmetic operators, .length, Math.max/min/abs/round/floor/ceil and six string methods)`;
        case 'event-wire':
          return `${at}the event wire ${short(f.value, 60)} is outside ${v1}`;
        case 'event-argument':
          return `${at}the event argument uses ${f.value}, outside ${v1} — bind the value two-way or pass \${REL} / \${/ABS} / a listed event parameter instead`;
        case 'frontend-action':
          return `the frontend action ${f.value} is not in the frontend actions of ${v1} — a portable frontend skips it`;
        case 'nested-view':
          return `client->${f.member}( ) displays into a nested view slot (NEST/NEST2) — portable renderers tolerate it without rendering it, so a portable app must not use it; build the content into the main view or a popup`;
        case 'client-api':
          return `client->${f.member}( ${f.value ? `${f.value} = … ` : ''}) is outside the client API of ${v1}`;
        default:
          return `outside ${v1}: ${short(f.value ?? f.control ?? f.member, 60)}`;
      }
    }
    case 'chain-element-per-line':
      return `${f.count} controls on one line of a multi-line chain — one element per line, or the indentation cannot show where they sit in the tree (their attributes may share the line)`;
    case 'obsolete-custom-control': {
      const use = f.replacement ?? OBSOLETE_CC_CONTROLS[f.value]?.replacement;
      const gone = OBSOLETE_CC_CONTROLS[f.value]?.removedAfter;
      const what = gone
        ? `an obsolete abap2UI5 custom control, removed after ${gone} (a later release fails to load the view)`
        : 'an obsolete abap2UI5 custom control (kept only so existing apps keep running)';
      return (f.member
        ? `_z2ui5( )->${f.member}( ) writes ${f.control}, ${what}`
        : `${f.control} is ${what}`) + ' — do not use it' + (use ? `; use ${use} instead` : '');
    }
    case 'frozen-view-builder':
      return `this class builds its view with ${f.value} — still fine to use, and planned to move into a separate addon rather than to disappear. It does mean no view check ran here: on z2ui5_cl_ui5_view_builder (verbs: ele, tag, a, end, stringify) the whole gate applies — controls, properties, bindings, render. Switching is recommended`;
    case 'chain-unbalanced-parens':
      return `the parentheses of this builder chain do not balance (${f.value}) — the class does not activate, and the statement reader here runs the chain into the statement behind it, so the class reconstructs no view and no other rule judges it`;
    case 'raw-javascript-to-frontend':
      return f.member === 'follow_up_action'
        ? `follow_up_action carries raw JavaScript (…${f.value}…) — it runs unchecked in the browser; use a cs_event- frontend action, which travels as data`
        : f.value === 'script tag'
          ? `${f.control} ${f.member} carries a <script> tag — code does not travel in the view; move the logic to ABAP or a cs_event- frontend action`
          : f.value === 'inline handler'
            ? `${f.control} ${f.member} carries markup with an inline on…= handler — the default CSP refuses inline script, so it never runs (the console says so, nothing else); wire the behaviour as a client->_event*( ) or a cs_event- frontend action`
            : f.value === 'javascript: URL'
              ? `${f.control} ${f.member} is a javascript: URL — code in a URI the default CSP refuses to run; a link that acts is a press wired with client->_event*( ) or a cs_event- frontend action`
              : `${f.control} ${f.member} carries a JavaScript handler string (…${f.value}…) — wire the event with client->_event*( ) so behaviour travels as data, not code`;
    case 'excess-shut':
      return 'one end( ) more than the tree is deep — asserts at runtime';
    case 'unknown-directive-rule':
      return f.value === RENDER_RULE
        ? `the directive names ${f.value}, which is not a rule a directive can address — a render error has no source line; waive the gate per file with rules['render-error'] in abap2ui5lint.jsonc instead`
        : `the directive names '${f.value}', which is not a rule id, so it waives nothing` + (f.suggestion ? ` — did you mean ${f.suggestion}?` : ' — abap2ui5lint --explain lists every id');
    case 'unused-directive':
      return `${f.member} suppressed nothing${f.value ? ` — ${f.value} did not report ${f.member === 'abap2ui5lint-disable' ? 'inside the block' : 'on that line'}` : ''}; the code moved, the rule went quiet, or the id was never the one that fired — remove the directive`;
    default:
      return `${f.control} ${f.member} is @since ${f.since} — newer than the ${f.minUi5} floor`;
  }
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
  const ids = String(text).split('--')[0].split(/[\s,]+/).filter(Boolean);
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
      ids: [...String(m[2]).split('--')[0].matchAll(/[^\s,]+/g)].map((x) => ({ id: x[0], start: idAt + x.index, end: idAt + x.index + x[0].length })),
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
      for (const d of all) {
        if (d.kind === 'enable') continue;
        for (const x of d.ids.filter((y) => !RULES.includes(y.id))) {
          const suggestion = x.id === RENDER_RULE ? null : caseMatch(x.id, RULES);
          out.push({
            type: 'unknown-directive-rule', value: x.id, offset: x.start, about: d,
            ...(suggestion ? { suggestion, fixes: [{ start: x.start, end: x.end, text: suggestion }] } : {}),
          });
        }
        const unused = unusedOf(d);
        if (!unused.length) continue;
        /* The whole directive dead, on a line form: mechanical to delete -
         * the line when the comment has it to itself, else the comment. A
         * block directive keeps its -enable partner, and deleting one half
         * of a pair is a guess; so is trimming ids out of a list. */
        const whole = d.rules === null || unused.length === d.ids.length;
        const alone = source.slice(d.lineStart, d.offset).trim() === '' && source.slice(d.commentEnd, d.lineEnd).trim() === '';
        const start = alone ? d.lineStart : d.lineStart + source.slice(d.lineStart, d.offset).search(/\s*$/);
        const end = alone ? Math.min(source.length, d.lineEnd + 1) : d.commentEnd;
        out.push({
          type: 'unused-directive', member: `abap2ui5lint-${d.kind}`, value: unused.filter(Boolean).join(', '), offset: d.offset, about: d,
          ...(whole && d.kind !== 'disable' ? { fixes: [{ start, end, text: '' }] } : {}),
        });
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
