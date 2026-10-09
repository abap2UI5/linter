/*
 * tree — the one way a node tree is walked: `{ name, children }`, the shape
 * parseXml( ) and the reconstructor both produce.
 *
 * Without recursion. A tree is as deep as its source nests, and a walk that
 * recursed once per level ran out of stack at about a thousand levels - a
 * `RangeError` out of the middle of a run instead of a verdict. No real view
 * nests that deep; a generated or adversarial one can, and a linter is the
 * last thing that may crash on the input it exists to judge.
 *
 * A leaf module: no imports, so every module that walks a tree can use it.
 */

/**
 * Pre-order over a tree, iteratively, written the way a recursive walk is:
 * `visit(walk, node, ...state)` - and every `walk(child, ...childState)` in
 * it hands the child to the loop rather than calling into it. The order is
 * the recursion's (a node, then each child's whole subtree, siblings in the
 * order they were handed over) as long as every `walk( )` stands last in its
 * branch, which is the shape every walk here has: nothing runs AFTER a
 * subtree, so nothing can tell the two apart.
 */
export function walkTree(visit, ...start) {
  const pending = [start];
  let scheduled = [];
  const walk = (...args) => { scheduled.push(args); };
  while (pending.length) {
    scheduled = [];
    visit(walk, ...pending.pop());
    for (let i = scheduled.length - 1; i >= 0; i--) pending.push(scheduled[i]);
  }
}

/** Every node of a tree, the root first, in document order. */
export function* nodesOf(root) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    yield node;
    const children = node?.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
  }
}
