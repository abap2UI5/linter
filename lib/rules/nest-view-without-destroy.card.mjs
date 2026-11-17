import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'nest-view-without-destroy',
  summary: 'a `nest_view_display( )` with no `method_destroy`',
  detail: 'A nested view is inserted into a control of the main view through the UI5 mutator named in `method_insert`, "after `method_destroy` has cleared what was there" — and `method_destroy` is OPTIONAL, so the call compiles without it and the first display looks right. The interface\'s ABAP Doc on that parameter: "the mutator that removes the previous content first (`removeAllContent`, `removeAllItems`); without it every call adds one more fragment." The second `nest_view_display( )` of the same slot then stacks a copy under the first, and the anchor grows by one fragment per roundtrip that re-renders it. Both slots are judged (`nest2_view_display( )` has exactly the contract of the first).',
  example: 'client->nest_view_display( val = nest->stringify( ) id = `host` method_insert = `addContent` ).   " the second call shows two',
  remedy: 'client->nest_view_display( val = nest->stringify( ) id = `host` method_insert = `addContent` method_destroy = `removeAllContent` ).',
  fixNote: 'Only where `method_insert` is one of the three mutators the ABAP Doc names — `addContent`, `addItem`, `addPage` — the matching `method_destroy` (`removeAllContent`, `removeAllItems`, `removeAllPages`) is appended after it. Any other insert, or one that is not a literal, keeps the finding without a fix: the right remover is a fact about the anchor control.',
});
