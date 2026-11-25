import { defineRule } from '../rule.mjs';

/*
 * Open SQL on a table the framework or an addon keeps its own state in.
 *
 * `z2ui5_t_01` holds abap2UI5's drafts, `z2ui5_t_11` the layouts of
 * layout-management. Both are one SELECT or DELETE away from any app, and an
 * app that cleans up its drafts or copies a layout to another user is tempted
 * to go there directly - past the owner and authority checks the API applies
 * (`z2ui5_if_layo_auth`), past the draft store a host can replace
 * (`z2ui5_if_ui5_draft_store`: then the drafts are not in the table at all),
 * and onto a shape that changes without notice (abap2UI5 cdd2fb25 / 04ead8ec,
 * layout-management 569a35e).
 *
 * The list is data: a new addon table is one entry - the table, what it
 * holds, the API to use instead, and the class-name prefix of the package
 * that owns it. Code of the owner is not reported (judged by the names of
 * the classes the source defines), nor is a repository that defines the
 * table itself (`ownObjects`, lib/project-index.mjs: the framework's or the
 * addon's own checkout).
 *
 * What is an ACCESS: a word of the list inside a statement that starts with
 * SELECT, INSERT, UPDATE, MODIFY, DELETE, OPEN (CURSOR) or WITH, or that holds
 * a SELECT (a subquery). A data source is named nowhere else in those
 * statements, a `TYPE`/`LIKE` reference is not one (`DATA ls TYPE
 * z2ui5_t_11` is a structure), and a name with a component (`ls-z2ui5_t_01`)
 * is one word, not the table. Everything else in the `z2ui5_t_` family is
 * somebody else's table and stays silent.
 */
export const FRAMEWORK_TABLES = Object.freeze({
  z2ui5_t_01: Object.freeze({
    holds: 'the drafts of abap2UI5',
    owner: /^z2ui5_(?:cl|if|cx)_ui5/i,
    instead: 'the exit\'s draft_keep_per_chain / draft_exp_time_in_hours to prune drafts, app_state_* for a kept state',
  }),
  z2ui5_t_11: Object.freeze({
    holds: 'the layouts of layout-management',
    owner: /^z2ui5_(?:cl|if|cx)_layo_/i,
    instead: 'z2ui5_cl_layo_manager (select_layouts_by_range( ), …), which applies z2ui5_if_layo_auth',
  }),
});

const SQL_KEYWORDS = new Set(['SELECT', 'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'OPEN', 'WITH']);

function check({ model, report, ownObjects = null }) {
  const own = new Set([...(ownObjects ?? [])].map((n) => String(n).toLowerCase()));
  const classNames = model.classes.map((c) => c.name).filter(Boolean);
  const judged = Object.entries(FRAMEWORK_TABLES)
    .filter(([table, entry]) => !own.has(table) && !classNames.some((n) => entry.owner.test(n)));
  if (!judged.length) return;
  const tables = new Map(judged.map(([table, entry]) => [table.toUpperCase(), { table, ...entry }]));
  for (const s of model.statements) {
    const sql = SQL_KEYWORDS.has(s.keyword) || s.tokens.some((t, k) => k > 0 && t.kind === 'word' && t.upper === 'SELECT');
    if (!sql) continue;
    const seen = new Set();
    s.tokens.forEach((t, k) => {
      if (t.kind !== 'word') return;
      const entry = tables.get(t.upper);
      if (!entry || seen.has(entry.table)) return;
      const before = s.tokens[k - 1];
      if (before?.kind === 'word' && (before.upper === 'TYPE' || before.upper === 'LIKE')) return;
      seen.add(entry.table);
      report({
        value: entry.table,
        member: s.keyword === 'OPEN' ? 'OPEN CURSOR' : s.keyword,
        holds: entry.holds,
        instead: entry.instead,
        offset: t.start,
        dedupe: String(t.start),
      });
    });
  }
}

export default defineRule({
  id: 'framework-table-access',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'class',
  message: (f) => `${f.member} on ${f.value} (${f.holds}) - the table is internal to the package that owns it: the access bypasses its API and the checks that API applies, and breaks when the table changes. Use ${f.instead}`,
  check,
});
