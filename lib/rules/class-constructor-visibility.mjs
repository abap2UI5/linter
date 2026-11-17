import { defineRule } from '../rule.mjs';
import { elementsOf } from '../abap-model.mjs';

/* The mechanical move: delete the declaration's line where it is and write
 * it again directly after the `PUBLIC SECTION.` of the same class
 * definition. Only for `CLASS-METHODS class_constructor.` alone on its line,
 * with a PROTECTED or PRIVATE SECTION between the public section and it -
 * anything else is reported without a fix. */
function moveToPublic(model, cls, at) {
  const { source } = model;
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const lineBreak = source.indexOf('\n', at);
  const lineEnd = lineBreak === -1 ? source.length : lineBreak;
  const shape = source.slice(lineStart, lineEnd).match(/^(\s*)CLASS-METHODS\s+class_constructor\s*\.\s*$/i);
  if (!shape) return {};
  const pub = cls?.sections.filter((s) => s.visibility === 'public' && s.start < at).pop();
  if (!pub) return {};
  // the offset after `PUBLIC SECTION.` - the statement that opens the section
  const opener = model.statements.find((s) => s.start === pub.start);
  if (!opener || !cls.sections.some((s) => s.visibility !== 'public' && s.start > pub.start && s.start < at)) return {};
  // the span has to be the statement as written: a comment between the
  // words would be cut by an insertion computed from the blanked text
  if (!/^PUBLIC\s+SECTION\s*\.$/i.test(source.slice(opener.start, opener.end))) return {};
  return {
    fixes: [
      { start: opener.end, end: opener.end, text: `\n${shape[1]}CLASS-METHODS class_constructor.` },
      { start: lineStart, end: lineBreak === -1 ? lineEnd : lineEnd + 1, text: '' },
    ],
  };
}

export default defineRule({
  id: 'class-constructor-visibility',
  severity: 'error',
  category: 'lifecycle',
  scope: 'class',
  fixable: true,
  message: () => 'class_constructor is declared outside the PUBLIC SECTION — the runtime calls it itself, so the compiler requires it public and the class does not activate',
  check({ model, report }) {
    for (const s of model.statementsOf('CLASS-METHODS')) {
      for (const el of elementsOf(s)) {
        const name = el[0];
        if (name?.kind !== 'word' || name.upper !== 'CLASS_CONSTRUCTOR') continue;
        if (model.sectionAt(name.start) === 'public') continue;
        // the chained form shares its line with other declarations: no fix
        const at = s.chained ? name.start : s.start;
        report({ member: 'class_constructor', offset: at, ...(s.chained ? {} : moveToPublic(model, model.classAt(at), at)) });
      }
    }
  },
});
