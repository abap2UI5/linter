import { defineRule } from '../rule.mjs';

/* The tags of an XML text, in order - comments, CDATA, processing
 * instructions and doctypes stepped over, attribute values with a `>` in
 * them read as part of their tag. */
function* tags(xml) {
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][\s\S]*?>|<\/?[A-Za-z_][\w:.-]*(?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/g;
  for (const m of xml.matchAll(re)) {
    const t = m[0];
    if (t.startsWith('<!') || t.startsWith('<?')) continue;
    yield { at: m.index, close: t.startsWith('</'), self: t.endsWith('/>') };
  }
}

/* The indentation of the line `at` stands on, or null when anything but
 * blanks stands in front of it there - only a tag that BEGINS a line has an
 * indentation of its own. Tabs count as one column each, as written. */
function indentAt(xml, at) {
  const start = xml.lastIndexOf('\n', at - 1) + 1;
  const lead = xml.slice(start, at);
  return /^[ \t]*$/.test(lead) ? lead.length : null;
}

function check({ source, report }) {
  /* The raw-view half of the chain-layout family, judged the way
   * chain-indentation judges a chain: against the TREE, never against a
   * number. Two things are reported - an element that begins a line no
   * deeper than its parent's line, and a sibling out of line with the first
   * sibling that began one - plus a closing tag on a line of its own that
   * does not stand in its opening tag's column. Opt-in: a raw view is
   * usually a vendored or generated one, and abap2UI5's own frontend is the
   * one place its layout is a house rule. */
  const stack = []; // { indent, childIndent }
  for (const t of tags(source)) {
    const indent = indentAt(source, t.at);
    if (t.close) {
      const open = stack.pop();
      if (open && indent !== null && open.indent !== null && indent !== open.indent) {
        report({ member: 'closing', value: `${indent}/${open.indent}`, offset: t.at });
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    if (parent && indent !== null) {
      if (parent.indent !== null && indent <= parent.indent) {
        report({ member: 'child', value: `${indent}/${parent.indent}`, offset: t.at });
      } else if (parent.childIndent === undefined) {
        parent.childIndent = indent;
      } else if (indent !== parent.childIndent) {
        report({ member: 'sibling', value: `${indent}/${parent.childIndent}`, offset: t.at });
      }
    }
    if (!t.self) stack.push({ indent });
  }
}

export default defineRule({
  id: 'xml-indentation',
  severity: 'hint',
  category: 'structure',
  scope: 'document',
  optIn: true,
  message: (f) => {
    const [is, want] = String(f.value).split('/');
    return f.member === 'child'
      ? `an element in column ${Number(is) + 1} begins a line no deeper than its parent's (column ${Number(want) + 1}) - the file's indentation stops matching its tree`
      : f.member === 'sibling'
        ? `a sibling in column ${Number(is) + 1}, where the first one stands in column ${Number(want) + 1} - indent siblings alike`
        : `a closing tag in column ${Number(is) + 1}, where its element opens in column ${Number(want) + 1}`;
  },
  check,
});
