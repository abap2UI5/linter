import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'escape-sequence-in-backtick',
  summary: 'a `\\n` written in a `backtick` literal, which has no escapes',
  detail: 'An ABAP `` `backtick` `` literal is RAW: `\\n` inside it is a backslash followed by an `n`, and nothing further down the chain turns it into a line break — the client\'s `formatTemplate` substitutes `{N}` placeholders and passes everything else through. So a toast built as `` `value - {0}, \\n action - {1}` `` renders the two characters on screen, where the original (a double-quoted JS string, shown through `.sapMMessageToast`\'s `white-space: pre-line`) breaks the line. The `|…|` STRING TEMPLATE is the ABAP form that does process escapes, so the working spelling concatenates one. Scoped to text that reaches the user — an attribute value and the on-screen message helpers — rather than to every backtick literal: a backslash is legitimate in a regex pattern and in a Windows path, and nobody reads those. A doubled backslash is never reported; whoever wrote it meant a backslash.',
  example: 'client->message_toast_display( `saved,\\n and closed` )   " the two characters \\ and n',
  remedy: 'client->message_toast_display( `saved,` && |\\n| && ` and closed` )',
  fixNote: 'The literal is split at every escape: the text between stays a backtick literal and each escape becomes its own |…| template, concatenated with `&&` — ``saved,\\n and closed`` becomes ``saved,` && |\\n| && ` and closed``. Empty pieces are dropped, so a literal that starts with the escape opens with the template. Everything the rule reads is in expression position, where the chain is as valid as the literal it replaces. Withheld when the literal reads as a Windows path — a drive (`C:\\temp\\new file`) or a backslash that escapes nothing elsewhere in it: the finding stays, the rewrite would break the path.',
});
