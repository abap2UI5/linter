import { defineRule } from '../rule.mjs';
import { dispatchFacts, navigatedBranchFix, ownCalls } from '../lifecycle-rules.mjs';
import { ifBlockEnd } from '../abap-source.mjs';

function check({ source, src, report }) {
  const { bodies, redisplays } = dispatchFacts(src);
  /* The other half of the same defect: no check_on_navigated( ) branch AT
   * ALL. The rule above judges a branch that exists; this one judges its
   * absence, so the two can never both fire on one class.
   *
   * check_on_init( ) is "this app INSTANCE never ran", not "the app starts"
   * — abap2UI5 flips mv_check_initialized in db_save( ) after the very first
   * roundtrip. It is therefore false on three roundtrips that put this app
   * back on screen: a called app leaving through nav_app_leave( ), one of
   * the built-in z2ui5_cl_pop_* value helps returning (they run over
   * nav_app_call too), and a bookmarked draft being restored. All three
   * raise check_on_navigated( ) alone, and with no branch for it main( )
   * does nothing: the response carries no display, so the model is pushed
   * into a MAIN slot still holding the OTHER app's view. The screen stays
   * wrong with no error anywhere — which is why apps written this way work
   * perfectly until the day something navigates into them.
   *
   * Judged on the dispatcher, never on the mere absence of the word: an app
   * whose display is NOT gated by the lifecycle at all is correct without a
   * branch, and reading the text alone called one such sample broken. So
   * every lifecycle IF … ENDIF construct is cut out of main( ) and what
   * remains has to reach no display — a `view_display( )` after the chain,
   * or the `client->nav_app_leave( )` a popup helper ends on, both mean the
   * app is covered. The class must display SOMEWHERE too: one that never
   * builds a view is a helper, and `view-never-displayed` speaks for it. */
  const dispatcher = src.match(/(\bMETHOD\s+z2ui5_if_app~main\s*\.)([\s\S]*?)\bENDMETHOD\b/i);
  // (yes/no tests, so they begin at `client`: a `(?:me->)?\w*` in front
  // answers the same and restarted inside every long word)
  if (dispatcher && !/client\s*->check_on_navigated\s*\(/i.test(src)) {
    let body = dispatcher[2];
    let base = dispatcher.index + dispatcher[1].length;
    /* a main( ) that only delegates - `dispatch( client )`, `me->run( )` -
     * is judged on the method it delegates to, the first own method whose
     * body tests the lifecycle; that class used to escape the rule for
     * putting its dispatcher one call away */
    if (!/\bcheck_on_\w+\s*\(/i.test(body)) {
      for (const call of ownCalls(body)) {
        const own = bodies.get(call.toLowerCase());
        if (own && /client\s*->check_on_init\s*\(/i.test(own.text)) {
          body = own.text;
          base = own.start;
          break;
        }
      }
    }
    const init = body.match(/\b(?:ELSE)?IF\s+(?:me->)?\w*client\s*->check_on_init\s*\(/i);
    let ungated = '';
    let at = 0;
    for (const m of body.matchAll(/\bIF\s+(?:me->)?\w*client\s*->check_on_\w+\s*\(/gi)) {
      if (m.index < at) continue;   // an inner one, already inside a cut block
      ungated += body.slice(at, m.index);
      at = ifBlockEnd(body, m.index + m[0].length);
    }
    ungated += body.slice(at);
    if (init && redisplays(body) && !redisplays(ungated)) {
      const fixes = navigatedBranchFix({ body, base, init, source, redisplays, callsApps: /\bnav_app_call\s*\(/i.test(src) });
      report({
        offset: base + init.index,
        ...(fixes ? { fixes } : {}),
      });
    }
  }
}

export default defineRule({
  id: 'missing-on-navigated-branch',
  severity: 'warning',
  category: 'lifecycle',
  scope: 'app',
  fixable: true,
  message: (f) => 'main( ) dispatches on check_on_init( ) but has no check_on_navigated( ) branch — check_on_init is false when a called app or a popup hands control back and when a bookmarked state is restored, so nothing re-displays and the browser keeps showing the previous view; dispatch the display on client->check_on_navigated( ) instead (check_on_init implies it, so the first start is covered too), and keep a check_on_init( ) branch only for one-time seeding',
  check,
});
