/*
 * rule-aliases — the old ids of renamed rules.
 *
 * A rule id is a public name: it sits in every repository's
 * abap2ui5lint.jsonc `rules` block, in source directives and in baseline
 * keys. Renaming one used to be a silent breaking change - the config
 * refused the old id, the directive turned into an `unknown-directive-rule`
 * and the baseline entry into a stale one (exit 1). docs/agents/consumers.md
 * called it the one change that is breaking on its own.
 *
 * So a rename is an entry here, `'old-id': 'new-id'`, and the old id keeps
 * working for one minor line in all three places: the config maps it onto
 * the new id, a directive naming it waives the new one, and a baseline key
 * carrying it is read as the new one (migrateKey in lib/baseline.mjs). The
 * CHANGELOG's "Read before upgrading" names every entry added; an entry is
 * removed in the next minor after it.
 *
 * A leaf module (no import): lib/config.mjs, lib/findings.mjs and
 * lib/baseline.mjs read it, and a browser bundle may reach all three.
 */
export const RULE_ALIASES = {};

/** The current id for `id` - itself when it was never renamed. */
export const canonicalRule = (id) => (Object.hasOwn(RULE_ALIASES, id) ? RULE_ALIASES[id] : id);
