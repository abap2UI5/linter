import { defineRule } from '../rule.mjs';
import { indentOf } from '../chain-layout.mjs';

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
function indentation(src, tokens, report) {
  // one frame per open element: where it was written, where its children go,
  // where its own attributes go
  const stack = [{ col: null, childCol: null, attrCol: null }];
  let leaf = null; // the frame of the leaf the cursor sits on, if any

  const deviation = (t, pos, want, shape) => {
    report({
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

/* Called once per multi-line chain (multiLineChains( ) in chain-layout.mjs),
 * with its calls and the scrubbed source they address. */
function check({ src, tokens, report }) {
  indentation(src, tokens, report);
}

export default defineRule({
  id: 'chain-indentation',
  severity: 'hint',
  category: 'layout',
  scope: 'app',
  summary: 'a builder call whose indentation contradicts the tree it builds',
  detail: 'A builder chain is the one part of an abap2UI5 class that nothing else formats: abaplint has `indentation` and `in_statement_indentation` switched off (a chain is a single statement spanning fifty lines), so neither `abaplint --fix` nor the auto-format workflow ever touches its inner lines. And the reader has no other picture of the view — the XML the builder emits is one long line by construction, so **the ABAP indentation IS the view\'s structure**. When it drifts, the tree in the file stops matching the tree in the browser. What is judged is only that: a sibling written at a different column than the siblings it shares a parent with, or a call written to the LEFT of the element it belongs to. The SIZE of the indent step is not judged — two and four are both house styles in the wild, and the first child under a node defines the column its siblings are held to, so a chain that keeps its own rhythm is never reported. Neither is the column of `end( )` (the hanging close is established), nor `v =` alignment, nor line length, nor a chain written entirely on one line. A hint: the view renders identically either way.',
  example: `)->ele( \`Page\`
    )->tag( \`Input\`
  )->tag( \`Button\`   " a sibling of Input, written a level out`,
  remedy: `)->ele( \`Page\`
    )->tag( \`Input\`
    )->tag( \`Button\``,
  message: (f) => {
    const what = f.member === 'att' ? 'attribute' : 'element';
    const why = ' — the indentation stops showing the tree the view actually has';
    return f.shape === 'outdented'
      ? `this ${what} call is written at column ${f.value}, LEFT of the element it belongs to (column ${f.count})${why}`
      : f.shape === 'attributes'
        ? `this attribute is written at column ${f.value}, the other attributes of the same control at ${f.count}${why}`
        : `this element is written at column ${f.value}, its siblings under the same parent at ${f.count}${why}`;
  },
  check,
});
