import { defineRule } from '../rule.mjs';

/* Run before the walk resolves any control, not after it like the other
 * rules of the document. */
function check({ root, report }) {
  /* The document parseXml( ) could not read as XML at all - reported first,
   * and before any control is resolved: every other finding on such a
   * document is about a tree the browser never builds. */
  for (const m of root.malformed ?? []) {
    report({ control: m.name, member: m.kind, value: m.other ?? '', offset: m.offset });
  }
}

export default defineRule({
  id: 'malformed-xml',
  severity: 'error',
  category: 'structure',
  scope: 'document',
  message: (f) => {
    const refused = 'not well-formed XML, the browser\'s parser refuses the whole document and the view never loads';
    if (f.member === 'bad-entity') {
      return f.value === '&'
        ? `<${f.control}> holds a bare & — ${refused}; write &amp;`
        : `<${f.control}> holds the entity ${f.value}, which XML does not declare (only &amp; &lt; &gt; &quot; &apos; and numeric references) — ${refused}; write the character itself or a numeric reference (&#160; for &nbsp;)`;
    }
    if (f.member === 'unquoted-attribute') return `<${f.control}> writes the attribute ${f.value} without quotes — ${refused}; write ${f.value}="…"`;
    if (f.member === 'lt-in-attribute') return `<${f.control}> has a raw < in the attribute ${f.value} — ${refused}; write &lt;`;
    return f.member === 'duplicate-attribute'
      ? `<${f.control}> carries the attribute ${f.value} twice — not well-formed XML, the browser's parser refuses the whole document and the view never loads; keep one`
      : f.member === 'mismatched-tag'
        ? `</${f.control}> closes nothing that is open — <${f.value}> is — not well-formed XML, the browser's parser refuses the whole document and the view never loads; close <${f.value}> with </${f.value}>`
        : f.member === 'stray-close'
          ? `</${f.control}> with no element open — not well-formed XML, the browser's parser refuses the whole document and the view never loads; remove it`
          : `<${f.control}> is never closed${f.value ? ` before </${f.value}>` : ''} — not well-formed XML, the browser's parser refuses the whole document and the view never loads; add </${f.control}> or write it self-closing`;
  },
  check,
});
