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

/* A boolean asked whether it is EMPTY.
 *
 * The three `check_on_*( )` methods return `abap_bool`, so the branch is the
 * PREDICATIVE CALL — `IF client->check_on_init( ).` — which is how the
 * interface documents it and how the whole sample corpus is written. Compounds
 * keep the shape. `IS NOT INITIAL` asks a boolean whether it is empty, which is
 * what that question means for a STRING, and it is one more dialect every later
 * reader of the class has to hold. Only a NEGATIVE branch is spelled out, as
 * `= abap_false`; there is no negated predicative form in the corpus. The same
 * rule covers every other `abap_bool`, in a WHERE clause as much as in an IF.
 *
 * A hint, and deliberately: `abap_false` IS the initial value of a `char(1)`,
 * so the two spellings agree and the code does exactly what it says. Nothing
 * here is broken; it is the one dialect question in the app guide that a
 * finding can settle mechanically. */
export function lifecycleIsInitial({ src, source, report, boolVars }) {
  const shape = (not) => (not ? 'IS NOT INITIAL' : 'IS INITIAL');

  /* The tail a fix rewrites: ` IS [NOT ]INITIAL` at the end of the match. Only
   * offered when the ORIGINAL source spells the same characters there - the
   * scan runs over the scrubbed copy, where a comment inside the whitespace
   * would have been blanked to spaces, and deleting one is a guess. */
  /* Whitespace runs in this family are BOUNDED ({1,600} instead of +): the
   * unbounded form is ambiguous next to its neighbours and quadratic on a
   * crafted run of blanks (CodeQL js/polynomial-redos), and a scrubbed source
   * is full of long blank runs where comments used to be. 600 covers a couple
   * of full-line blanked comments inside one statement; a gap beyond that is
   * a match deliberately given up, not a defect. */
  const tailFix = (m, text) => {
    const tail = /\s{1,600}IS\s{1,600}(?:NOT\s{1,600})?INITIAL$/i.exec(m[0]);
    if (!tail) return {};
    const start = m.index + tail.index;
    const end = m.index + m[0].length;
    if (source && source.slice(start, end) !== src.slice(start, end)) return {};
    return { fixes: [{ start, end, text }] };
  };

  /* The handle is captured as a WHOLE identifier and its `client` suffix is
   * tested afterwards: `\w*client` in the pattern is the other quadratic
   * shape (the literal's letters are \w, so every failing start position
   * re-splits the run - CodeQL's '0' pump), while `\w+` against the disjoint
   * `\s`/`->` that follow backs off in one step. */
  for (const m of src.matchAll(/(?<!\w)(?:me->)?(\w+)\s{0,600}->(check_on_\w+)\s{0,600}\(\s{0,600}\)\s{1,600}IS\s{1,600}(NOT\s{1,600})?INITIAL\b/gi)) {
    if (!/client$/i.test(m[1])) continue;
    /* Both directions are mechanical HERE, because the framework's lifecycle
     * checks return only abap_true/abap_false: `IS NOT INITIAL` becomes the
     * predicative call (the tail is deleted), `IS INITIAL` becomes the
     * spelled-out negative `= abap_false`. */
    report({
      type: 'lifecycle-is-initial', member: `${m[2]}( )`,
      value: shape(m[3]), offset: m.index,
      ...tailFix(m, m[3] ? '' : ' = abap_false'),
    });
  }

  /* The lookbehind keeps a STRUCTURE COMPONENT out: in `row-flag IS INITIAL`
   * the component may be any type, and the class's own `flag` attribute is not
   * evidence about it. A `me->` handle is matched explicitly, so the lookbehind
   * sits in front of it rather than in front of the name. */
  for (const m of src.matchAll(/(?<![\w>-])(?:me->)?(\w+)\s{1,600}IS\s{1,600}(NOT\s{1,600})?INITIAL\b/gi)) {
    if (!boolVars.has(m[1].toUpperCase())) continue;
    /* Only `IS INITIAL` carries a fix on a plain variable: it is exactly
     * `= abap_false` (the initial value of a char(1) IS abap_false). The NOT
     * form is not mechanical - a declared abap_bool can technically hold any
     * character, so `IS NOT INITIAL` is `<> abap_false` while the dialect the
     * rule teaches writes `= abap_true`; choosing between the two is a guess
     * this fix must not make. */
    report({
      type: 'lifecycle-is-initial', member: m[1],
      value: shape(m[2]), offset: m.index,
      ...(m[2] ? {} : tailFix(m, ' = abap_false')),
    });
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

  /* The INVERSE of the two rules below: a lifecycle fork that decides nothing.
   *
   * `check_on_init( )` is "this app INSTANCE never ran", and it IMPLIES
   * `check_on_navigated( )` — every path to an instance's first `main( )`
   * raises the navigated flag as well (`factory_first_start` for a fresh start
   * and for a draft restore, `factory_system_startup`, `prepare_app_stack` for
   * both legs of a nav_app_call). The interface says so itself. So two shapes
   * are pure redundancy:
   *
   *   IF client->check_on_init( ) OR client->check_on_navigated( ).
   *   → the OR can never change the verdict; the second call alone is it.
   *
   *   IF client->check_on_init( ).      ELSEIF client->check_on_navigated( ).
   *     client->view_display( … ).        client->view_display( … ).
   *   → the arms are the same statement, so the fork is four lines saying what
   *     the ELSEIF says on its own.
   *
   * The fork is judged only where BOTH arms are one IDENTICAL display call.
   * Where the navigated arm does anything else — an on_navigation( ), an app
   * return handled first — the fork really does decide something and the init
   * arm stays; reading the branches less exactly is what would report those.
   * 201 classes in the corpus carried one of the two forms. */
  {
    /* Statements of a branch, literal-aware: a `.` inside a backtick literal
     * or a |…| template does not end a statement, and scrub( ) keeps literal
     * CONTENT (it only blanks comments), so splitting on a bare dot would cut
     * one statement into two and let a two-statement branch read as one. */
    const statements = (text) => {
      const out = [];
      let cur = '';
      let str = null;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (str) {
          cur += c;
          if (str === '|' && c === '\\') { cur += text[++i] ?? ''; continue; }
          if (c === str) str = null;
          continue;
        }
        if (c === '`' || c === '|' || c === "'") { str = c; cur += c; continue; }
        if (c === '.') {
          const t = cur.trim().replace(/\s+/g, ' ');
          if (t) out.push(t);
          cur = '';
          continue;
        }
        cur += c;
      }
      return out;
    };
    const DISPLAY_CALL = /^(?:me->)?\w*client\s*->\s*(?:view_display|nest2?_view_display|popup_display|popover_display)\s*\(/i;

    for (const m of src.matchAll(/\bIF\s+(?:me->)?\w*client\s*->check_on_(init|navigated)\s*\(\s*\)\s+OR\s+(?:me->)?\w*client\s*->check_on_(init|navigated)\s*\(\s*\)\s*\./gi)) {
      if (m[1].toLowerCase() === m[2].toLowerCase()) continue;
      report({ type: 'redundant-init-display', member: 'OR', offset: m.index });
    }

    for (const m of src.matchAll(/\bIF\s+(?:me->)?\w*client\s*->check_on_init\s*\(\s*\)\s*\./gi)) {
      const initEnd = ifBranchEnd(src, m.index + m[0].length);
      const el = src.slice(initEnd).match(/^\s*ELSEIF\s+(?:me->)?\w*client\s*->check_on_navigated\s*\(\s*\)\s*\./i);
      if (!el) continue;
      const navStart = initEnd + el[0].length;
      const initStmts = statements(src.slice(m.index + m[0].length, initEnd));
      const navStmts = statements(src.slice(navStart, ifBranchEnd(src, navStart)));
      if (initStmts.length !== 1 || navStmts.length !== 1) continue;
      if (initStmts[0] !== navStmts[0] || !DISPLAY_CALL.test(initStmts[0])) continue;
      report({ type: 'redundant-init-display', member: 'fork', offset: m.index });
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
