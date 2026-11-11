import { LINE_LIMIT, defineRule } from '../rule.mjs';

/* A source line ABAP cannot hold. 255 characters is the limit, and over it
 * the class does not fail to lint — it fails to IMPORT: abapGit reports
 * "Literals across more than one line are not allowed" for the object and
 * CARRIES ON, so what stays behind in the system is an empty class stub.
 * The tree looks imported and the app is gone (abap2UI5/samples#669 left
 * two demo classes as stubs exactly this way, and it reached main because
 * every check runs on the files, where the line is merely long).
 *
 * Over the RAW source, not the scrubbed copy: a comment is part of the line
 * the system has to hold. Generated code is where this comes from, so the
 * fix usually belongs in the generator — split the literal into && chunks. */
function check({ source, report }) {
  let lineStart = 0;
  for (const [i, line] of source.split('\n').entries()) {
    // \r is the line separator's other half, not content the system stores
    const length = line.replace(/\r$/, '').length;
    /* Kept apart by line number rather than by length, so twenty over-long
     * lines are twenty findings: each one needs its own split, and the
     * collapse key would otherwise merge two lines that happen to be
     * equally long. */
    if (length > LINE_LIMIT) report({ dedupe: String(i + 1), value: length, offset: lineStart + LINE_LIMIT });
    lineStart += line.length + 1;
  }
}

export default defineRule({
  id: 'source-line-too-long',
  severity: 'error',
  category: 'structure',
  scope: 'class',
  summary: 'a source line over 255 characters — the class does not import',
  detail: 'ABAP holds 255 characters per source line, and over it the defect is not a lint finding but a failed **import**: abapGit reports "Literals across more than one line are not allowed" for the object and carries on with the next one, so what stays behind in the system is an **empty class stub**. The tree looks imported and the app is gone. Nothing else sees it — every check runs against the files, where the line is merely long. Split the literal into `&&` chunks; when the file is generated, fix the generator, or the next generation restores the line.',
  example: 'DATA(html) = `<div class="a">…</div>` && `…`.   " one source line over 255 characters',
  remedy: `DATA(html) = \`<div class="a">…</div>\` &&
             \`…\`.   " wrapped, every line under 255`,
  message: (f) => `line is ${f.value} characters — abapGit cannot import a source line over ${LINE_LIMIT} ("Literals across more than one line are not allowed"), and it carries on after the error, leaving an EMPTY class behind; split the literal into && chunks`,
  check,
});
