import { defineRule, short } from '../rule.mjs';
import { isCall } from '../abap-helpers.mjs';
import { blankLiterals, parenRegion } from '../abap.mjs';

/* A backslash escape written in a literal that has no escapes.
 *
 * An ABAP `backtick` literal is RAW: `\n` in it is a backslash followed by an
 * n, and nothing further down the chain turns it into a line break — the
 * client's formatTemplate substitutes {N} placeholders and passes everything
 * else through. So a toast built as `` `value - {0}, \n action - {1}` ``
 * renders the two characters on screen, where the original (a double-quoted JS
 * string, shown through `.sapMMessageToast`'s `white-space: pre-line`) breaks
 * the line. The |…| STRING TEMPLATE is the ABAP form that does process
 * escapes, so the working spelling concatenates one:
 *
 *     `value - {0},` && |\n| && ` action - {1}`
 *
 * Scoped to text that REACHES THE USER — an attribute value and the on-screen
 * message helpers — rather than to every backtick literal in the class. A
 * backslash is legitimate in a regex pattern and in a Windows path, and those
 * are not read by anybody; reporting them would trade this rule's precision
 * for occurrences nobody can act on. A DOUBLED backslash is left alone
 * everywhere: whoever wrote it meant a backslash. */
function check({ src, source, report }) {
  /* WHERE a display call is comes out of the blanked copy; WHAT it says is
   * read out of `src`, because the finding IS a literal. */
  const code = blankLiterals(src);
  const ESCAPE = /(?<!\\)\\[nrt]/;
  /* The fix is the spelling the paragraph above recommends, computed rather
   * than guessed: the literal is split at every escape, the text between
   * stays a backtick literal and each escape becomes its own |…| template,
   * concatenated with `&&`. Empty pieces are dropped, so a literal that
   * starts with the escape opens with the template. Offered only where the
   * ORIGINAL source spells the literal the same — the scan runs over the
   * scrubbed copy — and everything the rule reads is in expression position
   * (an attribute value, a message helper's argument), where a `&&` chain is
   * as valid as the literal it replaces. */
  const split = (text, at) => {
    const start = at - 1;
    const end = at + text.length + 1;
    if (!source || source.slice(start, end) !== src.slice(start, end)) return {};
    const pieces = text.split(/((?<!\\)\\[nrt])/).filter(Boolean)
      .map((piece) => (/^\\[nrt]$/.test(piece) ? `|${piece}|` : `\`${piece}\``));
    return { fixes: [{ start, end, text: pieces.join(' && ') }] };
  };
  /* The LITERAL is the finding's value, not the escape: `report( )` collapses
   * findings of an identical shape, and keyed on the escape alone a class with
   * a `\n` in a toast AND one in an attribute would report the first and
   * swallow the second — which is how one of the corpus occurrences survived
   * its own fix. Two identical texts still collapse, which is right. */
  const judge = (text, at) => {
    const m = text.match(ESCAPE);
    if (!m) return;
    report({
      member: m[0],
      value: text.trim().slice(0, 40), offset: at + m.index,
      ...split(text, at),
    });
  };

  for (const m of src.matchAll(/\bv\s*=\s*`([^`\n]*)`/gi)) {
    judge(m[1], m.index + m[0].indexOf('`') + 1);
  }
  for (const m of src.matchAll(/client->(?:message_toast_display|message_box_display)\s*\(/gi)) {
    if (!isCall(code, m.index, 'client->')) continue;
    const open = src.indexOf('(', m.index + m[0].length - 1);
    const { body } = parenRegion(src, open);
    if (body === undefined) continue;
    for (const lit of body.matchAll(/`([^`\n]*)`/g)) {
      judge(lit[1], open + 1 + lit.index + 1);
    }
  }
}

export default defineRule({
  id: 'escape-sequence-in-backtick',
  severity: 'warning',
  category: 'data',
  scope: 'app',
  summary: 'a `\\n` written in a `backtick` literal, which has no escapes',
  detail: 'An ABAP `` `backtick` `` literal is RAW: `\\n` inside it is a backslash followed by an `n`, and nothing further down the chain turns it into a line break — the client\'s `formatTemplate` substitutes `{N}` placeholders and passes everything else through. So a toast built as `` `value - {0}, \\n action - {1}` `` renders the two characters on screen, where the original (a double-quoted JS string, shown through `.sapMMessageToast`\'s `white-space: pre-line`) breaks the line. The `|…|` STRING TEMPLATE is the ABAP form that does process escapes, so the working spelling concatenates one. Scoped to text that reaches the user — an attribute value and the on-screen message helpers — rather than to every backtick literal: a backslash is legitimate in a regex pattern and in a Windows path, and nobody reads those. A doubled backslash is never reported; whoever wrote it meant a backslash.',
  example: 'client->message_toast_display( `saved,\\n and closed` )   " the two characters \\ and n',
  remedy: 'client->message_toast_display( `saved,` && |\\n| && ` and closed` )',
  fixNote: 'The literal is split at every escape: the text between stays a backtick literal and each escape becomes its own |…| template, concatenated with `&&` — ``saved,\\n and closed`` becomes ``saved,` && |\\n| && ` and closed``. Empty pieces are dropped, so a literal that starts with the escape opens with the template. Everything the rule reads is in expression position, where the chain is as valid as the literal it replaces.',
  message: (f) => `a \`backtick\` literal has no escape processing, so the '${f.member}' in \`${short(f.value, 40)}\` renders as those two characters instead of the ${f.member === '\\n' ? 'line break' : 'whitespace'} it was written for — concatenate a string template for it: \`left\` && |${f.member}| && \`right\``,
  check,
});
