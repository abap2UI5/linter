/*
 * escape-sequence-in-backtick's fix on a literal that reads as a Windows
 * path. The rule's own header calls a backslash in a path legitimate, and
 * its fix still split `C:\temp\new file` at `\t` and `\n` - rewriting the
 * path. Found by the 2026-11-12 org-wide bug hunt. The finding stays, the
 * fix is withheld (AGENTS.md rule 6). See test/review/README.md for the
 * harness.
 */
import { checkAbapRules } from '../observe.mjs';

export default async function ({ section, assert }) {
  const of = (src) => checkAbapRules(src).filter((x) => x.type === 'escape-sequence-in-backtick');

  section('escape-sequence-in-backtick: no fix on a literal that reads as a path', () => {
    for (const lit of ['C:\\temp\\new file', '\\\\server\\share\\new', 'x\\Users\\new']) {
      const hits = of(`client->message_toast_display( \`saved to ${lit}\` ).`);
      assert(hits.length === 1 && !hits[0].fixes, `${lit}: reported, no fix (${hits.length}, ${JSON.stringify(hits[0]?.fixes)})`);
    }
    const lines = of('client->message_toast_display( `one\\ntwo\\nthree` ).');
    assert(lines.length === 1 && lines[0].fixes?.length === 1, 'two line breaks in a sentence keep their fix');
  });
}
