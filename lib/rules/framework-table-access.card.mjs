import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'framework-table-access',
  summary: 'Open SQL on a table the framework or an addon keeps its own state in (`z2ui5_t_01` drafts, `z2ui5_t_11` layouts)',
  detail: 'abap2UI5 keeps its drafts in `z2ui5_t_01`, layout-management its layouts in `z2ui5_t_11`. Both are one `SELECT` or `DELETE` away from any app, and an app that cleans up its drafts or copies a layout to another user is tempted to go there directly. That bypasses the owner and authority checks the API applies (a layout copied by `INSERT` skips `z2ui5_if_layo_auth`; a draft deleted by hand may belong to an app stack or a kept app state), the draft store a host can replace (`z2ui5_if_ui5_draft_store` - then the drafts are not in the table at all), and it depends on a shape that is internal and changes without notice. Reported: a `SELECT`, `INSERT`, `UPDATE`, `MODIFY`, `DELETE`, `OPEN CURSOR` or `WITH` whose statement names a listed table (a subquery included). The list is data in the rule, each table with the prefix of the package that owns it: code of the owner (`z2ui5_cl_ui5_*` for the drafts, `z2ui5_cl_layo_*` for the layouts) is not reported, nor is a repository that defines the table itself. A `TYPE` reference (`DATA ls TYPE z2ui5_t_11`) is a structure, not an access, and any other `z2ui5_t_*` table is somebody else\'s and stays silent.',
  example: `DELETE FROM z2ui5_t_01 WHERE uname = @sy-uname.
SELECT * FROM z2ui5_t_11 WHERE uname = @lv_from INTO TABLE @DATA(lt_layouts).`,
  remedy: `" drafts: pruned by the framework - draft_keep_per_chain / draft_exp_time_in_hours in the exit
DATA(lt_heads) = z2ui5_cl_layo_manager=>select_layouts_by_range( … ).`,
});
