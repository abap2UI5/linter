/*
 * chain-write — a view tree as the builder chain that builds it.
 *
 * The other direction of lib/reconstruct.mjs: that module reads the XML view
 * out of a `z2ui5_cl_ui5_view_builder` chain, this one writes the chain for a
 * view, in the house layout `chain-house-layout` checks (the
 * `view-chain-layout` skill in abap2UI5/abap2UI5 writes the rules out).
 *
 * It exists because the layout was written three times - the playground's
 * View editor, the layout editor's class generator and the VS Code
 * extension's "Convert XML View to Builder Chain" each carried a writer, and
 * the three disagreed about the blank lines, about the `v =` column and about
 * where a wrapped value hangs. There is one now, and the tools hand it a tree.
 *
 * What it writes, in the order of the rules:
 *
 *   1. one call per line, every line opening with `)->`
 *   2. four spaces per level - a child one level in from its container, a
 *      control's attributes one level in from the control
 *   3. the closing parenthesis rides with the arrow; the statement ends in a
 *      single ` ).`
 *   4. `end( )` alone, in the column of the `ele( )` it closes
 *   5. one attribute per line, the `v =` / `b =` / `t =` column aligned across
 *      a control's block
 *
 * and the blank lines, which no rule checks and the skill defines: a blank
 * opens the content of a control that carries attributes (after its last
 * `a( )`, before its first child), a blank opens a run of `tag( )`s that
 * follows something else, a blank stands before an `end( )` unless the line
 * above is another one - and nowhere else.
 *
 * A trailing `end( )` is left off: `stringify( )` renders from the root
 * however deep the chain stopped (`keepTrailingEnds` for a chain that goes on).
 *
 * THE TREE
 *
 *   node  { name, ns?, attrs, children, ... }   anything else rides along and
 *                                               comes back in `owners`
 *   attr  [ name, value ]                       the shape parseXml( ) and the
 *                                               reconstructor produce: a literal
 *         { name, value }                       the same
 *         { name, raw }                         ABAP, written as it stands; a
 *                                               value over several lines keeps
 *                                               its shape and is re-anchored
 *                                               one level in from its call
 *         { name, pieces: [ … ] }               ABAP operands joined with `&&`,
 *                                               one per line, hanging under the
 *                                               first
 *         + key: 'v' | 'b' | 't'                the parameter (default `v`;
 *                                               `boolean: true` means `b`)
 *
 * A root without a name (`parseXml( )`'s document node) stands for its one
 * child, so `writeChain( parseXml( xml ) )` is the XML view as a chain.
 *
 * A literal is written through `v`, as it is: in a view a `{…}` IS a binding
 * and `\{` an escaped brace, and `v` hands both on untouched, so the chain
 * reconstructs to the document it was written from. A caller that holds plain
 * TEXT rather than an attribute value says `key: 't'`.
 *
 * This module imports the builder vocabulary and nothing else - no reader, no
 * registry, no Node API - so a browser tool without a bundler can carry it as
 * two files (docs/agents/consumers.md, "The chain writer").
 */
import { VIEW_BUILDER } from './builders.mjs';

/** Four spaces a level - rule 2, and the unit everything else is measured in. */
export const STEP = 4;

/** ABAP's line limit: a longer line does not survive an abapGit import. */
export const MAX_LINE = 255;

/** A value as an ABAP string literal. Backticks throughout - the framework
 *  and every sample write them - so the backtick is the one character to
 *  escape, by doubling it. */
export const abapLiteral = (value) => '`' + String(value).replaceAll('`', '``') + '`';

/**
 * `value` as one or more literals, none wider than its line allows: `first`
 * characters for the first one as written (delimiters included, a doubled
 * backtick counting two), `rest` for every one after it. One literal when it
 * fits, and one literal when there is no room to make progress either - a
 * caller that must not pass a width checks the lines it gets.
 */
export function literalPieces(value, first, rest = first) {
  const text = String(value);
  const cost = (ch) => (ch === '`' ? 2 : 1);
  let total = 2;
  for (const ch of text) total += cost(ch);
  if (total <= first || first < 10 || rest < 10) return [abapLiteral(text)];
  const pieces = [];
  let current = '';
  let used = 2;
  let room = first;
  for (const ch of text) {
    if (current !== '' && used + cost(ch) > room) {
      pieces.push(abapLiteral(current));
      current = '';
      used = 2;
      room = rest;
    }
    current += ch;
    used += cost(ch);
  }
  pieces.push(abapLiteral(current));
  return pieces;
}

const nameOf = (attr) => (Array.isArray(attr) ? attr[0] : attr.name);
const literalOf = (attr) => (Array.isArray(attr) ? attr[1] : attr.raw === undefined && attr.pieces === undefined ? attr.value ?? '' : undefined);
const keyOf = (attr, builder) => (Array.isArray(attr) ? 'v' : attr.key ?? (attr.boolean ? builder.bool : 'v'));
const qnameOf = (node) => (node.ns ? `${node.ns}:${node.name}` : String(node.name));

/* The element a tree stands for: itself, or the one child of a document node. */
function rootOf(tree) {
  if (tree && tree.name !== null && tree.name !== undefined) return tree;
  const children = tree?.children ?? [];
  if (children.length !== 1) throw new Error(`chain-write: a view has one root element, this document has ${children.length}`);
  return children[0];
}

/**
 * What the writer cannot write, as a sentence - or undefined. A line break is
 * the whole list: an ABAP literal cannot carry one, and a view that wants one
 * writes `&#xA;`, which arrives here as a real line break after the parse.
 * Asked before anything is written; `writeChain( )` throws on the same tree.
 */
export function unwritable(tree) {
  const pending = [rootOf(tree)];
  while (pending.length) {
    const node = pending.pop();
    if (/[\r\n]/.test(String(node.name)) || /[\r\n]/.test(String(node.ns ?? ''))) return `\`${qnameOf(node)}\` is not a name.`;
    for (const attr of node.attrs ?? []) {
      // `literal` is the playground's name for the text behind a `raw` it
      // wrote itself - asked too, so its trees are judged as they are
      const text = literalOf(attr) ?? (Array.isArray(attr) ? undefined : attr.literal);
      if (/[\r\n]/.test(String(nameOf(attr))) || (text !== undefined && /[\r\n]/.test(String(text)))) {
        return `\`${nameOf(attr)}\` has a line break in it, which an ABAP string literal cannot carry.`;
      }
    }
    for (let i = (node.children ?? []).length - 1; i >= 0; i--) pending.push(node.children[i]);
  }
  return undefined;
}

/* `n = \`View\` ns = \`mvc\`` for an element in a namespace and the positional
 * `\`Page\`` for the ordinary case - a lone `n =` is what abaplint's
 * omit_parameter_name reports, and the shorter read where there is nothing to
 * tell apart. */
const nameArguments = (node) =>
  (node.ns ? `n = ${abapLiteral(node.name)} ns = ${abapLiteral(node.ns)}` : abapLiteral(node.name));

/* A value over several lines - a `&&` concatenation, a wrapped `t_arg` list -
 * carried across with its own shape and re-anchored. The lines after the
 * first were indented for the column their call stood in; what is kept is
 * their shape relative to each other, what is replaced is where the block
 * starts: one level in from the call, like any other content. Split on either
 * line ending and joined with the one the value came with. */
function reanchored(raw, column) {
  const text = String(raw);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.length === 1) return text;
  const rest = lines.slice(1);
  const common = Math.min(...rest.filter((l) => l.trim() !== '').map((l) => l.length - l.trimStart().length));
  const pad = ' '.repeat(column);
  return [lines[0], ...rest.map((l) => (l.trim() === '' ? '' : pad + l.slice(common)))].join(eol);
}

/**
 * The attribute block of one control: one `a( )` per line at `column`, the
 * parameter column aligned across the block (rule 5). The width is the
 * block's own - an `id` beside a `noDataText` would otherwise push every
 * view's values to column forty.
 *
 * Exported for a caller that rewrites ONE control's block inside a chain it
 * otherwise leaves alone: the alignment is a property of the block, so the
 * block is the smallest thing that can be written again and still be right.
 *
 *   verbatim( attr )  the text that stands right of the name - `v = …` as a
 *                     source has it - or undefined for one to write here.
 *                     Only the padding in front of it is this function's,
 *                     unless that text opens with a line break of its own (a
 *                     `v =` written under its name), which is kept too.
 *   maxLine           a literal that would pass it is split into `&&` pieces
 *   reserve           what follows the last line (` ).`), counted against it
 *
 * Each entry is one attribute: its text (line breaks inside for a wrapped
 * value, `\n` unless the value brought its own).
 *
 * (The annotation is for a consumer that type-checks its JavaScript against
 * a vendored copy of this file; the package's contract is types.d.ts.)
 * @param {{ attrs?: readonly any[] }} node
 * @param {number} column
 * @param {{ verbatim?: (attr: any) => string | undefined, maxLine?: number, reserve?: number, builder?: typeof VIEW_BUILDER }} [options]
 * @returns {string[]}
 */
export function attributeLines(node, column, { verbatim, maxLine = MAX_LINE, reserve = 3, builder = VIEW_BUILDER } = {}) {
  const pad = ' '.repeat(column);
  const attrs = node.attrs ?? [];
  const names = attrs.map((attr) => `n = ${abapLiteral(nameOf(attr))}`);
  const width = Math.max(0, ...names.map((n) => n.length));
  return attrs.map((attr, i) => {
    const kept = verbatim?.(attr);
    if (kept !== undefined && /^[^\S\n]*\r?\n/.test(kept)) return `${pad})->${builder.att}( ${names[i]}${kept}`;
    const head = `${pad})->${builder.att}( ${names[i].padEnd(width)} `;
    if (kept !== undefined) return head + kept;
    const lead = `${head}${keyOf(attr, builder)} = `;
    if (!Array.isArray(attr) && attr.raw !== undefined) return lead + reanchored(attr.raw, column + STEP);
    const literal = literalOf(attr);
    if (literal !== undefined && /[\r\n]/.test(String(literal))) {
      throw new Error(`chain-write: \`${nameOf(attr)}\` has a line break in it, which an ABAP string literal cannot carry`);
    }
    // the pieces hang under the first: `&&` three columns left of it
    const room = maxLine - lead.length - reserve;
    const pieces = literal !== undefined ? literalPieces(literal, room) : attr.pieces;
    const hang = ' '.repeat(lead.length - 3);
    return lead + pieces.map((piece, k) => (k === 0 ? piece : `\n${hang}&& ${piece}`)).join('');
  });
}

/**
 * The statement that builds `tree`, in the house layout.
 *
 *   indent            the column the statement starts in (0)
 *   variable          the name of the view variable (`view`)
 *   assignment        the text in front of the factory call
 *                     (`DATA(<variable>) = `; `view = ` for a 7.02 class that
 *                     declares it at the top of the method)
 *   factory           which of the two correct shapes:
 *                       'attached'  one statement hanging off `factory(` -
 *                                   the variable holds the root element
 *                       'detached'  `factory( ).` as a statement of its own
 *                                   and the chain starting `<variable>->ele(`,
 *                                   one level further left
 *                       'none'      the chain alone, every line opening `)->`
 *                                   and nothing closing it: a block for the
 *                                   inside of an existing chain
 *   keepTrailingEnds  write the `end( )`s that close the tree (false; a block
 *                     for the inside of a chain needs them)
 *   eol               the line ending of the file the chain goes into (`\n`)
 *   maxLine           the width a literal is split for (255)
 *
 * Returns `{ text, lines, owners }`: the statement, its lines, and per line
 * the node of the tree it belongs to - null for a blank line and for the
 * factory line. A wrapped value is several lines of one owner.
 */
export function writeChain(tree, options = {}) {
  const {
    indent = 0,
    variable = 'view',
    assignment = `DATA(${variable}) = `,
    factory = 'attached',
    keepTrailingEnds = false,
    eol = '\n',
    maxLine = MAX_LINE,
    builder = VIEW_BUILDER,
  } = options;
  if (!['attached', 'detached', 'none'].includes(factory)) throw new Error(`chain-write: no factory shape \`${factory}\``);
  const root = rootOf(tree);
  const why = unwritable(root);
  if (why && /is not a name\.$/.test(why)) throw new Error(`chain-write: ${why}`);
  const base = factory === 'attached' ? indent + STEP : indent;

  // segments: one call each, with the blank line it opens with
  const segments = [];
  const push = (kind, node, column, text, blank) => segments.push({ kind, node, column, text, blank });

  /* Iterative, like every walk over a tree here: a frame is one element whose
   * children are being written, and its `end( )` is written when they are. */
  const open = (node, depth, state) => {
    const children = node.children ?? [];
    const leaf = children.length === 0;
    const column = base + STEP * depth;
    // a blank after a control's last attribute before its first child, and in
    // front of a run of tags that follows something which is not one
    const blank = (state.first && state.parentHasAttrs) || (leaf && !state.first && state.previous !== 'leaf');
    const verb = leaf ? builder.leaf : builder.open;
    const arrow = depth === 0 && factory === 'detached' ? `${variable}->` : ')->';
    push(leaf ? 'leaf' : 'open', node, column, `${' '.repeat(column)}${arrow}${verb}( ${nameArguments(node)}`, blank && segments.length > 0);
    for (const text of attributeLines(node, column + STEP, { maxLine, builder })) push('att', node, column + STEP, text, false);
    return leaf ? null : { node, column, index: 0, previous: undefined };
  };
  const stack = [];
  const first = open(root, 0, { first: true, parentHasAttrs: false, previous: undefined });
  if (first) stack.push(first);
  while (stack.length) {
    const frame = stack[stack.length - 1];
    const children = frame.node.children;
    if (frame.index < children.length) {
      const child = children[frame.index];
      const inner = open(child, stack.length, {
        first: frame.index === 0,
        parentHasAttrs: (frame.node.attrs ?? []).length > 0,
        previous: frame.previous,
      });
      frame.index += 1;
      if (inner) stack.push(inner);
      else frame.previous = 'leaf';
      continue;
    }
    // rule 4: the end( ) in the column of the ele( ) it closes, alone on its
    // line, a blank in front of it unless the line above is another end( )
    push('shut', frame.node, frame.column, `${' '.repeat(frame.column)})->${builder.shut}(`, segments[segments.length - 1].kind !== 'shut');
    stack.pop();
    if (stack.length) stack[stack.length - 1].previous = 'shut';
  }
  if (!keepTrailingEnds) while (segments.length > 1 && segments[segments.length - 1].kind === 'shut') segments.pop();

  const lines = [];
  const owners = [];
  const pad = ' '.repeat(indent);
  if (factory === 'attached') { lines.push(`${pad}${assignment}${builder.class}=>factory(`); owners.push(null); }
  if (factory === 'detached') { lines.push(`${pad}${assignment}${builder.class}=>factory( ).`); owners.push(null); }
  for (const segment of segments) {
    if (segment.blank) { lines.push(''); owners.push(null); }
    for (const line of segment.text.split(/\r?\n/)) { lines.push(line); owners.push(segment.node); }
  }
  // rule 3: one closing parenthesis for the call the last line opened, and
  // the full stop of the statement - never a row of them
  if (factory !== 'none') lines[lines.length - 1] += ' ).';
  return { text: lines.join(eol), lines, owners };
}
