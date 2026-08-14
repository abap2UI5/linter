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
 * closing paren leading the next line, one call per line.
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
 * (lib/builders.mjs) — the verbs are its, so a class on either builder is
 * judged by the same shape.
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

    checkOneCallPerLine(src, tokens, findings);
    checkIndentation(src, tokens, findings);
  }
  return findings;
}

/* Several element/attribute calls crammed onto one line of an otherwise
 * multi-line chain. The tree is in the indentation, and a line holding three
 * controls hides three levels of it.
 *
 * Closing calls (`shut( )`/`end( )`) do not count: they carry no content, and
 * `)->shut( )->shut( ).` as a chain's last line is an established compact
 * ending, not the readability problem this rule is about. */
function checkOneCallPerLine(src, tokens, findings) {
  const perLine = new Map();
  for (const t of tokens) {
    if (t.role === 'shut') continue;
    const line = lineStartOf(src, t.at);
    if (!perLine.has(line)) perLine.set(line, []);
    perLine.get(line).push(t);
  }
  for (const [, group] of perLine) {
    if (group.length < 2) continue;
    findings.push({
      type: 'chain-call-per-line',
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
 * (that is `chain-call-per-line`'s business), and neither has the anchor,
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
