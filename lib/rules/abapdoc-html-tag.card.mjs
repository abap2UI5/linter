import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'abapdoc-html-tag',
  summary: 'a raw `<tag>` inside an ABAP Doc line',
  detail: 'ABAP Doc (`"!`) is parsed as HTML. A placeholder written as `<name>` or a control named as `<Button>` is read as markup: it is dropped from the rendered documentation and ADT\'s ABAP Doc check reports it. Only the tags ABAP Doc defines are markup — `p`, `em`, `strong`, `ul`, `ol`, `li`, `br`, `h1`–`h3` (and `{@link}`, which is not a tag) — and they are left alone; anything else has to be written plain or escaped (`&lt;name&gt;`, the spelling `z2ui5_if_client`\'s own documentation uses). Read from the raw source, since the scrubbed copy has the comment blanked. A warning: the code runs, the documentation says something other than what was written.',
  example: '"! Returns the <name> of the selected row',
  remedy: '"! Returns the &lt;name&gt; of the selected row',
  fixNote: 'The two brackets of the tag are escaped in place — `<` to `&lt;`, `>` to `&gt;` — so the documentation renders the characters that were written. Nothing else on the line changes, and the tags ABAP Doc defines are never touched.',
});
