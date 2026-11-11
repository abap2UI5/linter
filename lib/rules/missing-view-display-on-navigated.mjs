import { defineRule } from '../rule.mjs';
import { dispatchFacts, handsClientOn, navigatedRedisplayFix } from '../lifecycle-rules.mjs';
import { ifBlockEnd, ifBranchEnd } from '../abap-source.mjs';
import { parenRegion } from '../abap.mjs';

function check({ source, src, report }) {
  /* A check_on_navigated( ) branch that never hands a view back. When the
   * called app leaves, the browser still shows ITS view — the caller has to
   * re-display its own with view_display( ). A branch that only reads the
   * result and returns leaves the screen showing the wrong app, with no error
   * anywhere. view_model_update( ) used to count here and no longer does: it
   * is an empty method now (obsolete-model-update), and the automatic push it
   * was replaced by reaches the MAIN SLOT — which is still holding the called
   * app's view. Only a display call puts this app's view back in it. */
  const { redisplays } = dispatchFacts(src);
  for (const m of src.matchAll(/\b(?:ELSE)?IF\s+(?:me->)?\w*client\s*->check_on_navigated\s*\(/gi)) {
    const end = ifBranchEnd(src, m.index + m[0].length);
    const branch = src.slice(m.index, end);
    /* `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.` is a
     * guard, and its branch is the roundtrip that did NOT navigate: the
     * navigated path is what follows the construct. Judging the RETURN arm
     * called a class broken whose re-display stood right below it. So a
     * negated condition whose branch leaves the method is judged on the
     * rest of the method, without a fix (the display belongs there, not in
     * the guard); one that does not leave is not a navigated branch at all. */
    const cond = parenRegion(src, m.index + m[0].length - 1);
    if (/^\s*(?:=\s*abap_false|<>\s*abap_true|IS\s+INITIAL)\b/i.test(src.slice(cond.end + 1))) {
      if (!/\b(?:RETURN|EXIT|CHECK|LEAVE)\b/i.test(branch)) continue;
      const from = ifBlockEnd(src, m.index + m[0].length);
      const stop = src.slice(from).search(/\bENDMETHOD\b/i);
      const rest = src.slice(from, stop === -1 ? src.length : from + stop);
      if (!redisplays(rest) && !handsClientOn(rest)) {
        report({ offset: m.index });
      }
      continue;
    }
    if (!redisplays(branch) && !handsClientOn(branch)) {
      const fixes = navigatedRedisplayFix({ src, source, at: m.index, end, redisplays });
      report({ offset: m.index, ...(fixes ? { fixes } : {}) });
    }
  }
}

export default defineRule({
  id: 'missing-view-display-on-navigated',
  severity: 'error',
  category: 'lifecycle',
  scope: 'app',
  summary: 'a `check_on_navigated( )` branch that never re-displays the view',
  detail: 'When a called app leaves, the browser still shows THAT app\'s view — returning control alone changes nothing on screen. The `check_on_navigated( )` branch has to hand a view back with `client->view_display( )`. A branch that only reads the result and falls through leaves the screen showing the wrong app, with no error anywhere. A negated guard — `IF client->check_on_navigated( ) = abap_false. RETURN. ENDIF.` — is judged on what follows it, which is the navigated path. `view_model_update( )` used to count as a re-display here and no longer does: it is an empty method now (`obsolete-model-update`), and the automatic model push that replaced it reaches the MAIN slot — which is still holding the called app\'s view.',
  example: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
ENDIF.`,
  remedy: `IF client->check_on_init( ).
  client->view_display( render_view( ) ).
ELSEIF client->check_on_navigated( ).
  result = client->get_app( client->get( )-s_draft-id ).
  client->view_display( render_view( ) ).   " without this the sub-app stays on screen
ENDIF.`,
  fixNote: `The init branch's own display statement (the same method, exactly one statement at its level that displays) is written as the navigated branch's last statement. With none or several to copy, the finding stays without a fix.`,
  message: (f) => 'this check_on_navigated( ) branch never re-displays the view — after returning from the called app the browser keeps showing THAT app\'s view; call client->view_display( ) in the branch',
  check,
});
