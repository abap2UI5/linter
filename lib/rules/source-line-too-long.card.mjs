import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'source-line-too-long',
  summary: 'a source line over 255 characters — the class does not import',
  detail: 'ABAP holds 255 characters per source line, and over it the defect is not a lint finding but a failed **import**: abapGit reports "Literals across more than one line are not allowed" for the object and carries on with the next one, so what stays behind in the system is an **empty class stub**. The tree looks imported and the app is gone. Nothing else sees it — every check runs against the files, where the line is merely long. Split the literal into `&&` chunks; when the file is generated, fix the generator, or the next generation restores the line.',
  example: 'DATA(html) = `<div class="a">…</div>` && `…`.   " one source line over 255 characters',
  remedy: `DATA(html) = \`<div class="a">…</div>\` &&
             \`…\`.   " wrapped, every line under 255`,
});
