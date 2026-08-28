/*
 * lifecycle-rules — what the app CLASS does across a roundtrip.
 *
 * Split out of lib/abap-rules.mjs when its entry point had grown to 600 lines
 * and 55% of a 2,000-line file sat in two functions. These belong together as
 * one subject: the abap2UI5 dispatcher, and the ways a class can be written so
 * that it works standalone, indefinitely, and stops working the moment
 * something navigates into it.
 *
 *   manualInitFlag           a hand-rolled boolean where check_on_init( ) is
 *                            the contract
 *   viewNeverDisplayed       a view built and never handed to the client
 *   checkLifecycleDispatch   the dispatcher itself: lifecycle checks in
 *                            separate IF blocks, a check_on_navigated( )
 *                            branch that displays nothing, and the absence of
 *                            that branch altogether. Plus duplicate-for-iterator,
 *                            a downport hazard rather than a lifecycle one, but
 *                            judged over the same per-METHOD walk
 *
 * Each takes the caller's `report( )` and is called from exactly the point in
 * checkAbapRules its code used to sit at. That matters: the entry point's
 * `report( )` collapses repeats and the FIRST finding of a shape wins, so the
 * ORDER of these calls is part of the output, not a detail. `npm test` and a
 * diff of the 637-file corpus before and after are what prove the move
 * changed nothing.
 */
import { ifBranchEnd, ifBlockEnd } from './abap-source.mjs';

/* `boolVars`, `attrs` and `locals` come from the caller, which derived them
 * for its own rules; deriving them a second time here would read the class
 * twice to reach the same answer. */
export function manualInitFlag({ src, report, boolVars, attrs, locals }) {
  /* A hand-rolled init flag where client->check_on_init( ) is the contract.
   * The framework already knows whether this is the first run of the app
   * instance — a boolean attribute that gates the first render duplicates
   * that knowledge as serialized state: it travels to the browser on every
   * roundtrip for nothing, and subtle ordering bugs grow around it (a popup
   * or JS loader initialized before the flag flips sees the wrong phase).
   * One mass migration replaced this pattern in 111 sample classes at once.
   * Only the unambiguous shape is judged: an IF on the attribute being
   * initial/false whose branch BOTH sets it true AND hands a view over — a
   * lazy-load guard that displays nothing is left alone. */
  for (const m of src.matchAll(/\bIF\s+(?:me->)?(\w+)\s*(?:=\s*abap_false|IS\s+INITIAL)\b/gi)) {
    const name = m[1].toUpperCase();
    if (!boolVars.has(name) && !attrs.has(name)) continue;
    if (locals.has(name)) continue;
    const end = ifBranchEnd(src, m.index + m[0].length);
    const branch = src.slice(m.index, end);
    if (!new RegExp(`\\b(?:me->)?${m[1]}\\s*=\\s*abap_true\\b`, 'i').test(branch)) continue;
    if (!/\b(?:view_display|nest2?_view_display|popup_display|popover_display)\s*\(/i.test(branch)) continue;
    report({ type: 'manual-init-flag', member: m[1], offset: m.index });
  }
}

export function viewNeverDisplayed({ src, d, report }) {
  /* A view that is built but never handed to the client renders nothing -
   * an empty page with no error anywhere. Only reported when the class
   * builds a view itself and no display/handover call appears at all. The
   * display family is complete on purpose: a popover-only or nested-view
   * helper class is legitimate, and the rule reporting one was the false
   * positive the extension's snippet gate caught. */
  const factory = src.match(new RegExp(`${d.factory}\\s*\\(`));
  if (factory
      && !/((?:nest2?_)?view_display|popup_display|popover_display|nav_app_call|nav_app_leave)\s*\(/.test(src)) {
    report({ type: 'view-never-displayed', offset: factory.index });
  }
}

export function checkLifecycleDispatch({ src, report }) {
  /* The same FOR iterator name twice in one method. Fine on 7.50+, where the
   * iterator is local to its VALUE #( ) expression — but a 7.02 downport
   * (abaplint --fix, and the transpiler behind the e2e runtime) materializes
   * each one as `DATA <name> TYPE i` in the method body, and the second
   * declaration fails activation with "variable already defined". */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const iterators = new Set();
    for (const m of mm[0].matchAll(/\bFOR\s+(\w+)\s*=/g)) {
      if (iterators.has(m[1])) {
        report({ type: 'duplicate-for-iterator', member: m[1], offset: mm.index + m.index });
      } else {
        iterators.add(m[1]);
      }
    }
  }

  /* Lifecycle checks split into separate IF blocks instead of one IF/ELSEIF
   * chain. The lifecycle flags are not all mutually exclusive, so separate
   * blocks can execute more than one branch on a single roundtrip — the
   * classic symptom is work done twice after a navigation. An ELSEIF chain
   * makes the branches exclusive by construction (the spelling has no word
   * boundary before its IF, so it never counts here). The one other
   * exclusive form is the GUARD idiom — an IF block that leaves the method
   * (`IF client->check_on_event( \`GO\` ). … RETURN. ENDIF.`): control never
   * flows from it into the next block, so it does not count either. */
  /* The client handle is conventionally named `client`, but a corpus is not
   * obliged to: abap2UI5/samples-stack's app 319 calls it `m_client`, others
   * use `mo_client` or reach it as `me->client`. Every lifecycle rule below
   * used to hard-code `client->` and was therefore BLIND to those classes -
   * app 319 has no check_on_navigated( ) branch and no rule saw it. Matching
   * the handle by shape rather than by one spelling closes that. */
  for (const mm of src.matchAll(/\bMETHOD\b[\s\S]*?\bENDMETHOD\b/gi)) {
    const open = [];
    for (const c of mm[0].matchAll(/\bIF\s+(?:me->)?\w*client\s*->(check_on_\w+)\s*\(/gi)) {
      const end = ifBranchEnd(mm[0], c.index + c[0].length);
      if (!/\bRETURN\b|\bLEAVE\b/i.test(mm[0].slice(c.index, end))) open.push(c);
    }
    if (open.length >= 2) {
      report({
        type: 'separate-lifecycle-ifs', member: open[1][1],
        count: open.length, offset: mm.index + open[1].index,
      });
    }
  }

  /* A check_on_navigated( ) branch that never hands a view back. When the
   * called app leaves, the browser still shows ITS view — the caller has to
   * re-display its own with view_display( ). A branch that only reads the
   * result and returns leaves the screen showing the wrong app, with no error
   * anywhere. view_model_update( ) used to count here and no longer does: it
   * is an empty method now (obsolete-model-update), and the automatic push it
   * was replaced by reaches the MAIN SLOT — which is still holding the called
   * app's view. Only a display call puts this app's view back in it. */
  {
    const REDISPLAY = /\b(?:view_display|nest2?_view_display|popup_display|popover_display|nav_app_call|nav_app_leave)\s*\(/i;
    /* The branch usually does not display anything ITSELF - it calls
     * `set_view( )` or `on_navigation( )`, and that method displays. Reading
     * only the branch text called three correct samples broken and offered a
     * fix that would have displayed the view twice. So a call to a method of
     * this class is followed, a few levels deep: the promise is that the
     * branch hands a view back somewhere, not that it does so inline. */
    const bodies = new Map();
    for (const mm of src.matchAll(/\bMETHOD\s+([\w~]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
      bodies.set(mm[1].toLowerCase().replace(/^.*~/, ''), mm[2]);
    }
    const redisplays = (code, seen = new Set()) => {
      if (REDISPLAY.test(code)) return true;
      if (seen.size > 8) return false;
      for (const call of code.matchAll(/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g)) {
        const name = call[1].toLowerCase();
        if (seen.has(name) || !bodies.has(name)) continue;
        seen.add(name);
        if (redisplays(bodies.get(name), seen)) return true;
      }
      return false;
    };
    for (const m of src.matchAll(/\b(?:ELSE)?IF\s+(?:me->)?\w*client\s*->check_on_navigated\s*\(/gi)) {
      const end = ifBranchEnd(src, m.index + m[0].length);
      if (!redisplays(src.slice(m.index, end))) {
        report({ type: 'missing-view-display-on-navigated', offset: m.index });
      }
    }

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
    if (dispatcher && !/(?:me->)?\w*client\s*->check_on_navigated\s*\(/i.test(src)) {
      const body = dispatcher[2];
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
        report({
          type: 'missing-on-navigated-branch',
          offset: dispatcher.index + dispatcher[1].length + init.index,
        });
      }
    }
  }
}
