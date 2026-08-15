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
 *     view->open( n = `View` ns = `mvc`        <- the anchor line
 *         )->a( n = `xmlns` v = `sap.m`        <- inside View
 *         )->open( `Page`                      <- a child of View
 *             )->a( n = `title` v = `My App`   <- inside Page
 *             )->leaf( `Input`                 <- a child of Page
 *                 )->a( n = `value` v = …      <- inside the Input
 *             )->leaf( `Button`                <- back out: a SIBLING of Input
 *         )->shut( ).
 *
 * What is checked is that the layout does not CONTRADICT that tree — not that
 * the step is four. Measured before it shipped: demanding four reported
 * abap2UI5's own app classes, its four test apps and 15 of this repo's own
 * fixtures, on three idioms that are style rather than defect — a two-space
 * step below the first level, a pass-through container written at its
 * parent's column (`)->open( `Shell` )` then `)->open( `Page` )`, the standard
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
import { scrub, splitStatements } from './abap.mjs';

const lineStartOf = (src, at) => src.lastIndexOf('\n', at - 1) + 1;

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
function indentOf(src, at) {
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
export function checkChainLayout(source, d) {
  const src = scrub(source);
  const findings = [];
  const tokenRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`, 'g');

  for (const stmt of splitStatements(src)) {
    const text = stmt.text;
    const tokens = [];
    for (const m of text.matchAll(tokenRe)) {
      const role = d.kindOf(m[1]);
      if (role === 'stringify') continue;
      tokens.push({ role, at: stmt.offset + m.index });
    }
    if (tokens.length < 2) continue; // nothing to lay out
    // a chain written on ONE line has no layout to judge (see the header)
    const firstLine = lineStartOf(src, tokens[0].at);
    if (lineStartOf(src, tokens[tokens.length - 1].at) === firstLine) continue;

    checkElementsPerLine(src, tokens, findings);
    checkIndentation(src, tokens, findings);
  }
  return findings;
}

/* Several ELEMENTS on one line of an otherwise multi-line chain. Each of them
 * is a level of the tree that the indentation can no longer show.
 *
 * Only element calls count, and that distinction is the whole rule. An
 * attribute on the same line as the control it belongs to hides NOTHING —
 * `)->leaf( `Text` )->a( n = `text` v = `{TITLE}` )` is one control with its
 * one property, the compact form half the samples and abap2UI5's own
 * `z2ui5_cl_ui5_app_start` are written in. Counting calls instead of elements
 * reported exactly that idiom and nothing else on the corpus: four hits, four
 * deliberate. A second CONTROL on the line is different — it is a sibling or
 * a child whose place in the tree the reader can no longer see.
 *
 * Closing calls do not count either: `)->shut( )->shut( ).` as a chain's last
 * line is an established ending, not a readability problem. */
function checkElementsPerLine(src, tokens, findings) {
  const perLine = new Map();
  for (const t of tokens) {
    if (t.role !== 'open' && t.role !== 'leaf') continue;
    const line = lineStartOf(src, t.at);
    if (!perLine.has(line)) perLine.set(line, []);
    perLine.get(line).push(t);
  }
  for (const [, group] of perLine) {
    if (group.length < 2) continue;
    findings.push({
      type: 'chain-element-per-line',
      count: group.length,
      offset: group[1].at,
    });
    return; // one per chain
  }
}

/* The indentation of the chain against the tree it builds.
 *
 * Every element and attribute call that OPENS its line is placed in the tree
 * the walk is building anyway, and compared with the two things that cannot
 * be a matter of taste: the column its own siblings sit on, and the column of
 * the element it belongs to. The first sibling under a node DEFINES that
 * node's child column — so a chain that indents by two is judged by two, and
 * only a line that steps out of its own file's rhythm is reported.
 *
 * A token sharing its line with another call has no indentation of its own
 * (that is `chain-element-per-line`'s business), and neither has the anchor,
 * which usually shares its line with `DATA(view) = … =>factory( )`.
 */
function checkIndentation(src, tokens, findings) {
  // one frame per open element: where it was written, where its children go,
  // where its own attributes go
  const stack = [{ col: null, childCol: null, attrCol: null }];
  let leaf = null; // the frame of the leaf the cursor sits on, if any

  const deviation = (t, pos, want, shape) => {
    findings.push({
      type: 'chain-indentation',
      member: t.role,
      shape,
      value: String(pos.column),
      count: want,
      offset: t.at,
    });
  };

  for (const [i, t] of tokens.entries()) {
    const pos = i === 0 ? null : indentOf(src, t.at);
    const column = pos && pos.leading ? pos.column : null;

    if (t.role === 'shut') {
      if (stack.length > 1) stack.pop();
      leaf = null;
      continue;
    }
    const owner = t.role === 'att' ? (leaf ?? stack[stack.length - 1]) : stack[stack.length - 1];
    if (column !== null) {
      const slot = t.role === 'att' ? 'attrCol' : 'childCol';
      if (owner.col !== null && column < owner.col) {
        deviation(t, pos, owner.col, 'outdented');
        return; // one per chain — everything below a shifted block looks wrong too
      }
      if (owner[slot] === null) owner[slot] = column;
      else if (owner[slot] !== column) {
        deviation(t, pos, owner[slot], t.role === 'att' ? 'attributes' : 'siblings');
        return;
      }
    }
    if (t.role === 'open') {
      stack.push({ col: column, childCol: null, attrCol: null });
      leaf = null;
    } else if (t.role === 'leaf') {
      leaf = { col: column, childCol: null, attrCol: null };
    }
  }
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

const STEP = 4;
const CODE = 0, LIT = 1, COMMENT = 2;

/* Which characters are code, literal or comment. `scrub( )` blanks comments
 * but keeps literal TEXT, and this rule needs the difference: a line that
 * continues a |…| template carries its indentation as content and must not
 * move, while a comment line between two segments must move with them. */
function classify(text) {
  const mask = new Uint8Array(text.length);
  let i = 0, lineStart = true;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { mask[i++] = CODE; lineStart = true; continue; }
    if (lineStart && (c === ' ' || c === '\t')) { mask[i++] = CODE; continue; }
    if (lineStart && c === '*') { while (i < text.length && text[i] !== '\n') mask[i++] = COMMENT; continue; }
    lineStart = false;
    if (c === '"') { while (i < text.length && text[i] !== '\n') mask[i++] = COMMENT; continue; }
    if (c === '`') {
      mask[i++] = LIT;
      while (i < text.length) {
        if (text[i] === '`') { mask[i++] = LIT; if (text[i] === '`') { mask[i++] = LIT; continue; } break; }
        if (text[i] === '\n') break;
        mask[i++] = LIT;
      }
      continue;
    }
    if (c === '|') {
      mask[i++] = LIT;
      while (i < text.length) {
        if (text[i] === '\\') { mask[i] = LIT; if (i + 1 < text.length) mask[i + 1] = LIT; i += 2; continue; }
        if (text[i] === '|') { mask[i++] = LIT; break; }
        mask[i++] = LIT;
      }
      continue;
    }
    mask[i++] = CODE;
  }
  return mask;
}

/** Indices of a `)` that closes back to depth 0 and is followed by `->`. */
function segmentStarts(src, mask, lo, hi) {
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

/**
 * The canonical layout of every builder chain in one source, as fixes.
 *
 * `d` is the builder dialect, so the verbs are read the same way the rest of
 * the linter reads them.
 */
export function checkChainHouseLayout(source, d) {
  const src = source;
  const mask = classify(src);
  const scrubbed = scrub(source);
  const findings = [];
  const kindRe = new RegExp(`^\\)->\\s*${d.verbs}\\s*\\(`);
  const anyVerbRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`);

  for (const stmt of splitStatements(scrubbed)) {
    const lo0 = stmt.offset;
    const hi = stmt.offset + stmt.text.length;
    if (!anyVerbRe.test(stmt.text)) continue;

    let lo = lo0;
    while (lo < hi && ' \t\r\n'.includes(src[lo])) lo++;
    const pts = segmentStarts(src, mask, lo, hi);
    if (!pts.length) continue;

    // the statement has to start its own line, or there is no base column
    const anchorLine = lineStartOf(src, lo);
    if (src.slice(anchorLine, lo).trim()) continue;
    if (src.slice(anchorLine, lo).includes('\t')) continue;
    const base = src.slice(anchorLine, lo).length;

    // a chain written entirely on one line is a deliberate compact form
    if (lineStartOf(src, pts[pts.length - 1]) === anchorLine) continue;

    const roleAt = (at, end) => {
      const m = kindRe.exec(src.slice(at, end));
      return m ? d.kindOf(m[1]) : 'other';
    };
    const headRole = (() => {
      const ms = [...src.slice(lo, pts[0]).matchAll(new RegExp(`(?:->|=>)\\s*${d.verbs}\\s*\\(`, 'g'))];
      return ms.length ? d.kindOf(ms[ms.length - 1][1]) : 'other';
    })();

    const open = headRole === 'open' ? [base] : [];
    let attrCol = base + STEP;
    const fixes = [];

    for (const [k, p] of pts.entries()) {
      const role = roleAt(p, k + 1 < pts.length ? pts[k + 1] : hi);
      const childCol = open.length ? open[open.length - 1] + STEP : base + STEP;
      let col;
      if (role === 'att') col = attrCol;
      else if (role === 'open') { col = childCol; open.push(col); attrCol = col + STEP; }
      else if (role === 'leaf') { col = childCol; attrCol = col + STEP; }
      else if (role === 'shut') {
        col = open.length ? open.pop() : Math.max(base, childCol - STEP);
        attrCol = open.length ? open[open.length - 1] + STEP : base + STEP;
      } else col = childCol;

      // the whitespace run in front of the segment: blank lines are kept, the
      // indent is restated. A comment in front of it is not whitespace and so
      // is never swallowed.
      let gs = p;
      while (gs > 0 && ' \t\r\n'.includes(src[gs - 1]) && mask[gs - 1] === CODE) gs--;
      const gap = src.slice(gs, p);
      if (gap.includes('\t')) continue;
      const want = '\n'.repeat(Math.max(1, (gap.match(/\n/g) || []).length)) + ' '.repeat(col);
      if (gap !== want) fixes.push({ start: gs, end: p, text: want });

      // the segment's own continuation lines move with it
      const segEnd = k + 1 < pts.length ? pts[k + 1] : hi;
      const delta = col - (p - lineStartOf(src, p));
      if (delta !== 0) {
        for (let i = src.indexOf('\n', p); i !== -1 && i < segEnd; i = src.indexOf('\n', i + 1)) {
          const from = i + 1;
          const lead = /^[ \t]*/.exec(src.slice(from, segEnd))[0].length;
          if (from + lead >= segEnd) continue;                      // blank line
          if (src[from + lead] === '\n' || src[from + lead] === '\r') continue;
          if (src.slice(from, from + lead).includes('\t')) continue;
          if (mask[from + lead] === LIT) continue;                  // indent is content
          let movable = true;
          for (let j = 0; j < lead; j++) if (mask[from + j] !== CODE) movable = false;
          if (!movable) continue;
          fixes.push({ start: from, end: from + lead, text: ' '.repeat(Math.max(0, lead + delta)) });
        }
      }
    }

    if (fixes.length) {
      findings.push({
        type: 'chain-house-layout',
        count: fixes.length,
        offset: pts.find((p) => fixes.some((f) => f.start <= p && p <= f.end + 1)) ?? pts[0],
        fixes,
      });
    }
  }
  return findings;
}
