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
  summary: '`class_constructor` declared outside the `PUBLIC SECTION`',
  detail: 'The static constructor is called by the runtime itself, so its visibility is not a design choice: the compiler requires it public and a class declaring it PROTECTED or PRIVATE does not activate. Nothing in a systemless pipeline sees that — the class lints, the tests run, and the error appears the first time somebody imports the transport.',
  example: `PUBLIC SECTION.
  METHODS run.
PRIVATE SECTION.
  CLASS-METHODS class_constructor.`,
  remedy: `PUBLIC SECTION.
  CLASS-METHODS class_constructor.
  METHODS run.
PRIVATE SECTION.`,
  fixNote: 'The declaration line is deleted where it is and written again directly after the `PUBLIC SECTION.` of the same class definition, at its own indentation. Only for the one shape that is exactly that: `CLASS-METHODS class_constructor.` alone on its line, no chained colon form, no comment on the line, and a PROTECTED or PRIVATE SECTION between the public section and the line; anything else is reported without a fix.',
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
