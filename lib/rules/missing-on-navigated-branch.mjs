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
  summary: 'a lifecycle dispatcher with no `check_on_navigated( )` branch at all',
  detail: '`check_on_init( )` means "this app INSTANCE never ran", not "the app starts" — abap2UI5 flips the flag after the very first roundtrip. So it is false on three roundtrips that put the app back on screen: a called app leaving through `nav_app_leave( )`, one of the built-in `z2ui5_cl_pop_*` value helps returning (those run over `nav_app_call` too), and a bookmarked draft being restored. All three raise `check_on_navigated( )` — a called app that leaves with an event (`nav_app_leave( event = … )`, how the confirm and select popups hand back their result) raises that event on the same roundtrip, which is why a class that calls other apps keeps its event arms AHEAD of the navigated arm. With no branch for it `main( )` does nothing, the response carries no display, and the model is pushed into a MAIN slot still holding the other app\'s view. The screen stays wrong with no error anywhere — which is why an app written this way works perfectly until the day something navigates into it. This is the complement of `missing-view-display-on-navigated`, which judges a branch that exists but never displays; the two never fire on the same class. An app whose display is not gated by the lifecycle at all — a `view_display( )` after the `IF`/`ELSEIF` chain, or the `client->nav_app_leave( )` a popup helper ends on — is correct as it stands and is not reported. The remedy is a rename, not a second branch: `check_on_init( )` implies `check_on_navigated( )` (every path to an instance\'s first `main( )` raises the navigated flag too), so dispatching the display on `check_on_navigated( )` covers the first start AND every hop back — and an `ELSEIF check_on_navigated( )` twin added under an init branch that only displays is the fork `redundant-init-display` reports. Keep a `check_on_init( )` branch only for what must happen once: `model_init( ). view_display( ).` in the init arm ahead of the navigated arm is a fork that decides something, and stays.',
  example: `IF client->check_on_init( ).
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
  remedy: `IF client->check_on_navigated( ).   " true on the first start too: check_on_init( ) implies it
  view_display( ).
ELSEIF client->check_on_event( ).
  on_event( ).
ENDIF.`,
  fixNote: 'An `ELSEIF client->check_on_navigated( ).` branch is written before the token that ends the init branch, carrying a copy of the init branch\'s own display statement — only when that branch has exactly one statement at its own level that displays (directly, or through a method of the class) and that statement reads no variable the branch declares; otherwise the finding stays without a fix. In a class that calls other apps (`nav_app_call`) the branch is written LAST in the chain instead, behind the event arms a returning app\'s event has to reach, and a chain ending in `ELSE` is left without a fix.',
  message: (f) => 'main( ) dispatches on check_on_init( ) but has no check_on_navigated( ) branch — check_on_init is false when a called app or a popup hands control back and when a bookmarked state is restored, so nothing re-displays and the browser keeps showing the previous view; dispatch the display on client->check_on_navigated( ) instead (check_on_init implies it, so the first start is covered too), and keep a check_on_init( ) branch only for one-time seeding',
  check,
});
