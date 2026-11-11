/*
 * chain-layout — how a builder chain is WRITTEN, not what it builds.
 *
 * Every other rule in this linter judges the view; these two judge the ABAP
 * text that produces it. They exist because a builder chain is the one part
 * of an abap2UI5 class that NOTHING else formats:
 *
 *   - abaplint has `indentation` and `in_statement_indentation` switched OFF
 *     in abap2UI5's own config, precisely because a chain is a single
 *     statement spanning fifty lines and its rule cannot model one;
 *   - `abaplint --fix` / the auto-format workflow therefore never touch a
 *     chain's inner lines either;
 *   - and the reader has no other picture of the view. The XML the builder
 *     emits is one long line by construction (`render( )` concatenates
 *     without whitespace), so the ABAP indentation IS the view's structure.
 *     When it drifts, the tree in the file stops matching the tree in the
 *     browser — and every review after that is reading a wrong diagram.
 *
 * The house form is the one every sample and the app guide are written in
 * (docs/agents/building-apps.md): one indent step per level of the tree, the
 * closing paren leading the next line, one element per line.
 *
 *     view->ele( n = `View` ns = `mvc`         <- the anchor line
 *         )->a( n = `xmlns` v = `sap.m`        <- inside View
 *         )->ele( `Page`                       <- a child of View
 *             )->a( n = `title` v = `My App`   <- inside Page
 *             )->tag( `Input`                  <- a child of Page
 *                 )->a( n = `value` v = …      <- inside the Input
 *             )->tag( `Button`                 <- back out: a SIBLING of Input
 *         )->end( ).
 *
 * What is checked is that the layout does not CONTRADICT that tree — not that
 * the step is four. Measured before it shipped: demanding four reported
 * abap2UI5's own app classes, its four test apps and 15 of this repo's own
 * fixtures, on three idioms that are style rather than defect — a two-space
 * step below the first level, a pass-through container written at its
 * parent's column (`)->ele( `Shell` )` then `)->ele( `Page` )`, the standard
 * app skeleton), and a hanging `)->end( ).`. A rule that lights up the corpus
 * is wrong before the corpus is, so the step is whatever the chain itself
 * uses and only two things are reported, both of which make the reader see a
 * DIFFERENT tree than the one that renders:
 *
 *   - two siblings under the same element written at different columns, and
 *   - a call written to the LEFT of the element it belongs to.
 *
 * As it stands the family reports NOTHING on abap2UI5's own app classes, its
 * four test apps and 28 of this repo's 29 fixtures — only the one fixture
 * written to carry each defect on purpose. That is the intended shape for a
 * formatting rule: silent on every layout that is merely a choice, loud on
 * the three that mislead.
 *
 * Both rules are HINTS, and deliberately so: a badly laid-out chain builds
 * exactly the same view as a beautiful one, and this file has no business
 * failing anybody's build. A repo that wants them louder says so once in its
 * abap2ui5lint.jsonc (`"chain-indentation": "warning"`).
 *
 * What is deliberately NOT judged, to keep the rules free of taste:
 *   - the SIZE of the indent step (two and four are both house styles in the
 *     wild, and a chain that keeps its own is readable either way),
 *   - the column of `shut( )`/`end( )` — the hanging close is established,
 *   - the alignment of `v =` inside a line (the samples align a run of
 *     attributes and leave a lone one unpadded — both are house style),
 *   - blank lines between blocks, and line length,
 *   - anything about a chain written entirely on ONE line: that is a
 *     deliberate compact form with no layout to be inconsistent with.
 */
import { scrub, splitStatements, skipLiteral } from './abap.mjs';

export const lineStartOf = (src, at) => src.lastIndexOf('\n', at - 1) + 1;

/*
 * Where on its line a token sits.
 *
 *   column   the column of the line's first non-space character — which in
 *            the house form is the CLOSING PAREN of the previous call, not
 *            the token itself. That paren is what the reader sees lined up,
 *            so it is what the tree is measured against.
 *   leading  the token effectively opens the line: nothing before it but
 *            spaces and that one closing paren. Anything else (a second call,
 *            an `IF`, an assignment) makes it a mid-line token, which is the
 *            other rule's business and has no indentation of its own.
 *
 * null when the line is indented with tabs — then there is no column to
 * compare and the chain is simply not judged.
 */
export function indentOf(src, at) {
  const from = lineStartOf(src, at);
  const before = src.slice(from, at);
  if (before.includes('\t')) return null;
  return {
    column: before.length - before.trimStart().length,
    leading: /^ *\)? *$/.test(before),
  };
}

/**
 * Layout findings for one ABAP source. `d` is the builder dialect
 * (lib/builders.mjs) — the verbs are its, so every class is judged by the
 * same shape.
 *
 * One finding per chain per rule: after the first deviation every line below
 * it looks wrong too, and forty findings for one misplaced block is not a
 * report anybody reads.
 */
/* The chains of a class worth judging, read once per source for the two
 * rules above (chain-element-per-line, chain-indentation): every statement
 * with at least two builder calls spread over more than one line, as its
 * calls - their role and where they stand. `src` is the scrubbed source the
 * positions address. */
let chainsMemo = { source: null, d: null, chains: null };
export function multiLineChains(source, d) {
  if (chainsMemo.source === source && chainsMemo.d === d) return chainsMemo.chains;
  const src = scrub(source);
  const chains = [];
  const tokenRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`, 'gi');
  /* scrub( ) blanks comments and keeps literals - the value resolver reads
   * them - so a verb spelled inside a literal (`v = |{ 'a' } )->ele( |`, a
   * help text that quotes the builder) matched as a chain token and opened
   * a phantom element, which put every line below it on the wrong column.
   * The house-layout rule reads the chain through the same mask. */
  const mask = classify(src);

  for (const stmt of splitStatements(src)) {
    const text = stmt.text;
    const tokens = [];
    for (const m of text.matchAll(tokenRe)) {
      if (mask[stmt.offset + m.index] !== CODE) continue;
      const role = d.kindOf(m[1]);
      if (role === 'stringify') continue;
      tokens.push({ role, at: stmt.offset + m.index });
    }
    if (tokens.length < 2) continue; // nothing to lay out
    // a chain written on ONE line has no layout to judge (see the header)
    const firstLine = lineStartOf(src, tokens[0].at);
    if (lineStartOf(src, tokens[tokens.length - 1].at) === firstLine) continue;

    chains.push(tokens);
  }
  chainsMemo = { source, d, chains: { src, list: chains } };
  return chainsMemo.chains;
}


/*
 * ── chain-house-layout ─────────────────────────────────────────────────────
 *
 * The third rule, and the only one that names a step. Everything above judges
 * a chain against ITSELF and is silent on any layout that is merely a choice.
 * This one judges it against ONE canonical form:
 *
 *   - one call per line, attributes included — stricter than
 *     `chain-element-per-line`, which deliberately lets an attribute share the
 *     line of the control it belongs to;
 *   - four spaces per level of the tree, everywhere;
 *   - `shut( )` alone in the column of the `open( )` it closes.
 *
 * It is `off` by default and has to be asked for, because a house style is
 * exactly what the two rules above refuse to be: two-space steps and the
 * compact attribute form are established elsewhere, and a linter that ships
 * one project's taste as everyone's default is the thing this family's header
 * argues against. What changed is that the taste now has a corpus behind it —
 * abap2UI5, abap2UI5/samples and abap2UI5/samples-controls were unified onto
 * this form (2026-08), which is why it is worth offering at all.
 *
 * Every finding carries FIXES, so `--fix` reformats. They only ever replace
 * whitespace BETWEEN chain segments and the leading whitespace of a
 * continuation line whose indent is not content — never a literal, never a
 * comment's text, never the inside of a call's argument list. Blank lines and
 * comment lines between segments are preserved.
 */

export const STEP = 4;
export const CODE = 0, LIT = 1, COMMENT = 2;

/* Which characters are code, literal or comment. `scrub( )` blanks comments
 * but keeps literal TEXT, and this rule needs the difference: a line that
 * continues a |…| template carries its indentation as content and must not
 * move, while a comment line between two segments must move with them. */
export function classify(text) {
  const mask = new Uint8Array(text.length);
  let i = 0, lineStart = true;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { mask[i++] = CODE; lineStart = true; continue; }
    if (lineStart && (c === ' ' || c === '\t')) { mask[i++] = CODE; continue; }
    if (lineStart && c === '*') { while (i < text.length && text[i] !== '\n') mask[i++] = COMMENT; continue; }
    lineStart = false;
    if (c === '"') { while (i < text.length && text[i] !== '\n') mask[i++] = COMMENT; continue; }
    /* A literal is read by the one literal reader every scanner shares, so a
     * template's embedded expression - a `|` in a backtick there, a call
     * whose parens run over the line break - ends where scrub( ) and the
     * statement splitter end it. Read on its own here, the template closed
     * at the first `|`, the backtick behind it opened a literal that took
     * the rest of the line, and the chain's closing parens went with it. */
    if (c === '`' || c === "'" || c === '|') {
      const end = skipLiteral(text, i);
      mask.fill(LIT, i, end);
      i = end;
      continue;
    }
    mask[i++] = CODE;
  }
  return mask;
}

/** Indices of a `)` that closes back to depth 0 and is followed by `->`. */
export function segmentStarts(src, mask, lo, hi) {
  const pts = [];
  let depth = 0;
  for (let i = lo; i < hi; i++) {
    if (mask[i] !== CODE) continue;
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0 && src.slice(i + 1, i + 3) === '->') pts.push(i);
    }
  }
  return pts;
}

