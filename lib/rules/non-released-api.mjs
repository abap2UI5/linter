import { defineRule } from '../rule.mjs';
import { insideSegments, literalSegments } from '../abap-helpers.mjs';
import { apiVerdict } from '../released-api.mjs';

/*
 * abap2UI5 objects a consumer must not name: everything outside the five of
 * `src/02`. See released-api.mjs for what the mirror knows and what it leaves
 * alone.
 */
function check({ src, report, ownObjects = null }) {
  /* An abap2UI5 object outside the released package. `src/02` is the whole
   * contract - five objects - and everything else the framework ships says
   * in its own package description that it is not for consumers: `src/01` is
   * "internal use only", `src/99` is frozen legacy kept only so existing
   * installations keep compiling. Neither side announces a change: one
   * upstream commit renamed the entire core layer (`z2ui5_cl_core_*` ->
   * `z2ui5_cl_ui5_*`) AND moved the old view builder and HTTP handler into
   * the frozen package. An app naming one of those compiles today and fails
   * to activate after the next pull, with no deprecation in between - which
   * is exactly the kind of defect this gate exists for, since no compiler
   * sees it until the object is already gone.
   *
   * Only names the mirror KNOWS are framework objects are judged (see
   * released-api.mjs): the released five are silent, the frozen package and
   * the internal prefix families are reported, and anything else is somebody
   * else's class - the samples are `z2ui5_cl_demo_app_*` and must never be
   * touched by this rule. A name inside a `…`/|…| literal is text, not a
   * reference, and the class's OWN name is not a use of itself.
   *
   * Nor is an object the linted repository DEFINES (`ownObjects`, read off
   * the abapGit file names - lib/project-index.mjs): the name family says
   * whose an object PROBABLY is, the file under `src/` says whose it is. The
   * addons number their tables `z2ui5_t_05` … `_33`, and each access to one
   * was reported as the framework's table. A framework object the
   * repository merely references is in no such list and stays reported. */
  {
    const own = new Set(
      [...src.matchAll(/\b(?:CLASS|INTERFACE)\s+(z2ui5_\w+)/gi)].map((m) => m[1].toLowerCase()),
    );
    for (const name of ownObjects ?? []) own.add(String(name).toLowerCase());
    const inLiteral = insideSegments(literalSegments(src));
    for (const m of src.matchAll(/\bz2ui5_\w+/gi)) {
      const name = m[0].toLowerCase();
      if (own.has(name) || inLiteral(m.index)) continue;
      const verdict = apiVerdict(name);
      if (!verdict) continue;
      report({
        value: name, // lower-cased: ABAP is case-insensitive, so are the findings
        member: verdict.area,
        what: verdict.what,
        replacement: verdict.replacement,
        frozen: verdict.frozen,
        moved: verdict.moved,
        removed: verdict.removed,
        offset: m.index,
      });
    }
  }
}

export default defineRule({
  id: 'non-released-api',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'class',
  message: (f) => `${f.value} is not part of abap2UI5's released API (src/02) — ${f.what} (${f.member}): ${
        f.removed
          ? 'deleted upstream, it does not compile once abap2UI5 is updated'
          : f.moved
          ? 'no longer shipped with abap2UI5 - it compiles only where that repository is installed next to it'
          : f.frozen
            ? 'frozen legacy, kept only so existing installations keep compiling'
            : 'internal, renamed and restructured without notice'}${
        f.replacement ? `; use ${f.replacement}` : ''}`,
  check,
});
