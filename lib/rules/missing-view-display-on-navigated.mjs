import { defineRule } from '../rule.mjs';
import { dispatchFacts, handsClientOn, navigatedRedisplayFix, DYNAMIC_CALL } from '../lifecycle-rules.mjs';
import { ifBlockEnd, ifBranchEnd } from '../abap-source.mjs';
import { parenRegion } from '../abap.mjs';

function check({ source, src, inheritedDynamicCall = false, mayShowPopup = () => false, report }) {
  /* A check_on_navigated( ) branch that never hands a view back. When the
   * called app leaves, the browser still shows ITS view — the caller has to
   * re-display its own with view_display( ). A branch that only reads the
   * result and returns leaves the screen showing the wrong app, with no error
   * anywhere. view_model_update( ) used to count here and no longer does: it
   * is an empty method now (obsolete-model-update), and the automatic push it
   * was replaced by reaches the MAIN SLOT — which is still holding the called
   * app's view. Only a display call puts this app's view back in it. */
  /* A class that calls a method by a name picked at runtime - itself or in
   * a superclass of the run (`CALL METHOD lo_obj->(render_method)`, the
   * customizing-driven renderer of a base app) - may re-display through it,
   * anywhere in the roundtrip. "Never re-displays" is not decidable then,
   * and an error-level claim about it would be a guess: the rule stands
   * down (rule 5, unknown is not missing). */
  if (inheritedDynamicCall || DYNAMIC_CALL.test(src)) return;
  const { redisplays } = dispatchFacts(src);
  /* A branch that asks whether the app it returns from was one of the
   * popups addon's (`IS [NOT] INSTANCE OF z2ui5_cl_popup_value_help`, `CAST
   * z2ui5_if_popup_result( … )`) handles the return from a POPUP: that app
   * opened a dialog over this one's view and closed it again, the main
   * slot never stopped showing this app, and there is nothing to
   * re-display - a view_display( ) there would only rebuild the view. */
  /* ...and the same for a class of the run that may display a popup itself
   * or through a superclass (mayShowPopup( ), the class index): whether it
   * replaced the view is then a runtime matter - a customizing-driven
   * view-or-popup base app - and not this rule's to guess. */
  const POPUP_LIB = /\b(?:INSTANCE\s+OF|CAST)\s+(?:z2ui5_cl_popup_\w+|z2ui5_if_popup_result)\b/i;
  const POPUP_PREV = { test: (text) => POPUP_LIB.test(text)
    || [...text.matchAll(/\b(?:INSTANCE\s+OF|CAST)\s+([\w/]+)/gi)].some((m) => mayShowPopup(m[1].toLowerCase())) };
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
      if (POPUP_PREV.test(rest)) continue;
      if (!redisplays(rest) && !handsClientOn(rest)) {
        report({ offset: m.index });
      }
      continue;
    }
    if (POPUP_PREV.test(branch)) continue;
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
  fixable: true,
  message: (f) => 'this check_on_navigated( ) branch never re-displays the view — after returning from the called app the browser keeps showing THAT app\'s view; call client->view_display( ) in the branch',
  check,
});
