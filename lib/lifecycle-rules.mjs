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
import { ifBranchEnd, ifBlockEnd, branchTail, methodSpans } from './abap-source.mjs';
import { parenRegion, blankLiterals, skipWs, ciAt, clientArrows } from './abap.mjs';




/* Whether the class hands a stringified view to its CALLER: `result =
 * view->stringify( )` where `result` is a RETURNING, EXPORTING or CHANGING
 * parameter of the method the statement is in. That is a view-building
 * helper (abap-cloud-gui's `z2ui5_cl_cgui_list=>stringify( )`, whose caller
 * displays what it returns), not an app that forgot to display - the rule
 * named both until 2026-10. Read off the signature in this source; a method
 * declared elsewhere (an interface's) is not taken on trust. */
export function handsOutStringify(src) {
  const spans = methodSpans(src);
  for (const m of src.matchAll(/->\s*stringify\s*\(/gi)) {
    const head = src.slice(src.lastIndexOf('.', m.index) + 1, m.index);
    const target = /^\s*(\w+)\s*=(?![=>])/.exec(head)?.[1].toLowerCase();
    const method = spans.find((sp) => sp.from <= m.index && m.index < sp.to);
    if (!target || !method) continue;
    const decl = new RegExp(`\\bMETHODS(?:\\s*:)?\\s+${method.name}\\b([^.]*)\\.`, 'i').exec(src);
    if (decl && outwardParameters(decl[1]).has(target)) return true;
  }
  return false;
}

/* The EXPORTING, CHANGING and RETURNING parameter names of a METHODS
 * statement's signature (lower case): the word in front of each TYPE/LIKE,
 * `VALUE( )`/`REFERENCE( )` unwrapped. */
function outwardParameters(signature) {
  const names = new Set();
  let outward = false;
  const toks = signature.split(/[\s()]+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].toUpperCase();
    if (/^(?:IMPORTING|EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS)$/.test(t)) outward = /^(?:EXPORTING|CHANGING|RETURNING)$/.test(t);
    else if (outward && (t === 'TYPE' || t === 'LIKE') && i > 0) names.add(toks[i - 1].toLowerCase());
  }
  return names;
}

/* Does the IF construct whose condition ends at `from` carry an ELSE at its
 * own level? Walks its branches with ifBranchEnd; an ELSEIF continues, an
 * ELSE answers yes, ENDIF (or the method's end) answers no. */
export function hasOwnElse(text, from) {
  let at = from;
  for (let guard = 0; guard < 200; guard++) {
    const p = ifBranchEnd(text, at);
    const tok = text.slice(p).match(/^(ELSEIF|ELSE|ENDIF|ENDMETHOD)\b/i)?.[1].toUpperCase();
    if (tok === 'ELSE') return true;
    if (tok !== 'ELSEIF') return false;
    at = p + 'ELSEIF'.length;
  }
  return true;
}

/* The names a branch declares for itself: `DATA x`, `DATA(x)` (also inside
 * `INTO DATA(x)`, `REF DATA(x)`), `FIELD-SYMBOLS <x>` and `FIELD-SYMBOL(<x>)`.
 * Chained declarations (`DATA: a …, b …`) name their first entry only - a
 * statement copied past a missed one is exactly the case this guards, but a
 * chain inside a lifecycle arm has not been seen in any corpus. */
function branchLocals(branch) {
  const names = new Set();
  for (const m of branch.matchAll(/\bDATA\s*\(\s*(\w+)\s*\)|\bDATA\s*:?\s+(\w+)|\bFIELD-SYMBOL\s*\(\s*(<\w+>)\s*\)|\bFIELD-SYMBOLS\s*:?\s+(<\w+>)/gi)) {
    names.add(m[1] ?? m[2] ?? m[3] ?? m[4]);
  }
  return names;
}

/* The arms that follow the branch ending at `branchEnd` in its own IF
 * construct: whether any follow, whether the construct ends in an ELSE, and
 * where its ENDIF stands. */
function chainAfter(text, branchEnd) {
  let at = branchEnd;
  let arms = 0;
  for (let guard = 0; guard < 200; guard++) {
    const tok = text.slice(at).match(/^(ELSEIF|ELSE|ENDIF|ENDMETHOD)\b/i)?.[1].toUpperCase();
    if (tok === 'ENDIF') return { arms, hasElse: false, endif: at };
    if (tok === 'ELSE') return { arms: arms + 1, hasElse: true, endif: -1 };
    if (tok !== 'ELSEIF') return { arms, hasElse: false, endif: -1 };
    arms++;
    at = ifBranchEnd(text, at + 'ELSEIF'.length);
  }
  return { arms, hasElse: false, endif: -1 };
}

/* The fix for a dispatcher with no check_on_navigated( ) branch: the two
 * lines the remedy shows, written before the token that ends the init
 * branch — `ELSEIF <handle>->check_on_navigated( ).` and the init branch's
 * own display statement, copied from the ORIGINAL source. Mechanical only
 * when the init branch has exactly ONE statement at its own level that
 * displays (itself, or through a method of the class), and the branch-end
 * token has its line to itself; anything else is reported without a fix.
 * `body` is the literal-blanked dispatcher body, `base` where it starts in
 * the source, `init` the match of its check_on_init( ) condition. */
function navigatedBranchFix({ body, base, init, source, redisplays, callsApps }) {
  const condEnd = init.index + init[0].length;
  const branchEnd = ifBranchEnd(body, condEnd);
  const found = singleDisplayStatement({ body, base, condEnd, branchEnd, source, redisplays });
  if (!found) return null;
  /* Where the new arm goes. A called app that leaves with an event -
   * `nav_app_leave( event = … )`, how the confirm and select popups hand
   * back their result - raises check_on_navigated( ) AND that event on the
   * same roundtrip. Right behind the init branch the new arm would then be
   * taken instead of the event arms that follow it, and the popup's result
   * would never arrive. So in a class that calls other apps the arm goes
   * LAST, where it only catches the roundtrips on which the chain did
   * nothing at all; a chain that ends in an ELSE has no such place, and is
   * reported without a fix. */
  let endAt = branchEnd;
  if (callsApps) {
    const chain = chainAfter(body, branchEnd);
    if (chain.hasElse) return null;
    if (chain.arms > 0) {
      if (chain.endif === -1) return null;
      endAt = chain.endif;
    }
  }
  const tokenAt = base + endAt;
  const lineStart = source.lastIndexOf('\n', tokenAt - 1) + 1;
  if (source.slice(lineStart, tokenAt).trim() !== '') return null;
  const ifAt = base + init.index;
  const ifIndent = source.slice(source.lastIndexOf('\n', ifAt - 1) + 1, ifAt);
  if (ifIndent.trim() !== '') return null;
  const indent = found.indent ?? `${ifIndent}  `;
  const handle = clientArrows(init[0]).next().value?.handle ?? 'client';
  return [{ start: lineStart, end: lineStart, text: `${ifIndent}ELSEIF ${handle}->check_on_navigated( ).\n${indent}${found.text}\n` }];
}

/* The ONE statement of a branch, at the branch's own level, that displays
 * (itself or through a method of the class): its original text and the
 * indentation of its line. Null when the branch has none or several - the
 * two cases where copying it would be a guess. `body` is literal-blanked
 * text starting at `base` in `source`; the branch runs from `condEnd`
 * (just past the condition's opening paren) to `branchEnd`. */
function singleDisplayStatement({ body, base, condEnd, branchEnd, source, redisplays }) {
  const branch = body.slice(condEnd, branchEnd);
  const stmts = [];
  let depth = 0;
  let paren = 1;   // inside the `check_on_…(` the condition match ends on
  let start = 0;
  let first = true;
  for (let i = 0; i < branch.length; i++) {
    const c = branch[i];
    if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === '.' && paren === 0) {
      if (first) { first = false; start = i + 1; continue; }
      const text = branch.slice(start, i).trim();
      const head = text.match(/^(IF|CASE|LOOP|DO|WHILE|TRY|ENDIF|ENDCASE|ENDLOOP|ENDDO|ENDWHILE|ENDTRY)\b/i)?.[1].toUpperCase();
      if (head && !head.startsWith('END')) depth++;
      else if (head) depth--;
      else if (depth === 0 && text) stmts.push({ text, start: condEnd + start, end: condEnd + i + 1 });
      start = i + 1;
    }
  }
  const displays = stmts.filter((s) => redisplays(s.text));
  if (displays.length !== 1) return null;
  const s = displays[0];
  const text = source.slice(base + s.start, base + s.end).trim();
  if (!text) return null;
  /* A statement that reads a variable the branch itself declares cannot be
   * copied out of it: `DATA(view) = …factory( ).` in the init arm and
   * `client->view_display( view->stringify( ) ).` copied into another arm
   * compiles - an inline declaration is method-wide in ABAP - and then
   * dereferences an initial reference on the first navigated roundtrip. */
  for (const name of branchLocals(branch)) {
    const esc = name.replace(/[<>]/g, (c) => `\\${c}`);
    if (new RegExp(`(?<![\\w>~-])${esc}(?!\\w|\\s*\\()`, 'i').test(blankLiterals(text))) return null;
  }
  const stmtBegin = base + s.start + source.slice(base + s.start, base + s.end).search(/\S/);
  const stmtIndent = source.slice(source.lastIndexOf('\n', stmtBegin - 1) + 1, stmtBegin);
  return { text, indent: stmtIndent.trim() === '' ? stmtIndent : null };
}

/* The fix for a check_on_navigated( ) branch that never re-displays: the
 * init branch's single display statement (the same method, the same
 * condition shape) is written as the navigated branch's last statement,
 * before the token that ends it. Null without exactly one such statement to
 * copy, or where the end token shares its line. `src` is the whole class,
 * literal-blanked; `at` the navigated IF match, `end` where its branch ends. */
function navigatedRedisplayFix({ src, source, at, end, redisplays }) {
  const method = [...src.matchAll(/\bMETHOD\s+[\w~]+\s*\.([\s\S]*?)\bENDMETHOD\b/gi)]
    .find((mm) => mm.index <= at && at < mm.index + mm[0].length);
  // a bare dispatcher (a snippet, no METHOD around it) is its own body
  const base = method ? method.index + method[0].length - 'ENDMETHOD'.length - method[1].length : 0;
  const body = method ? method[1] : src;
  const init = /\b(?:ELSE)?IF\s+(?:me->)?\w*client\s*->check_on_init\s*\(/i.exec(body);
  if (!init) return null;
  const condEnd = init.index + init[0].length;
  const found = singleDisplayStatement({ body, base, condEnd, branchEnd: ifBranchEnd(body, condEnd), source, redisplays });
  if (!found) return null;
  const lineStart = source.lastIndexOf('\n', end - 1) + 1;
  if (source.slice(lineStart, end).trim() !== '') return null;
  const ifIndent = source.slice(source.lastIndexOf('\n', at - 1) + 1, at);
  if (ifIndent.trim() !== '') return null;
  return [{ start: lineStart, end: lineStart, text: `${found.indent ?? `${ifIndent}  `}${found.text}\n` }];
}

/* The names `/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/gi` captured: every word a
 * paren follows, blanks allowed, called bare or through `me->` - not
 * `other->meth(` or `cl=>meth(`, whose `>` in front turns them away. Read
 * word by word, where that regex restarted inside every long word no paren
 * follows. The character in front belongs to the match, so it has to lie
 * past the previous call's paren: in `a(b(` only `a` is read, as the regex
 * reads it. */
function* ownCalls(code) {
  let last = 0;
  for (const w of code.matchAll(/\w+/g)) {
    const paren = skipWs(code, w.index + w[0].length);
    if (code[paren] !== '(') continue;
    const at = ciAt(code, w.index - 4, 'me->') ? w.index - 4 : w.index;
    if (at > 0 && (at - 1 < last || /[\w>]/.test(code[at - 1]))) continue;
    last = paren + 1;
    yield w[0];
  }
}

/* What the dispatch rules share about a class: its methods' bodies by name,
 * and whether a stretch of code puts a view on screen - itself or through
 * a method of the class it calls. Read once per source (the rules ask in
 * turn), for the rule files (lib/rules/) and checkLifecycleDispatch( ). */
let factsMemo = { src: null, facts: null };
export function dispatchFacts(src) {
  if (factsMemo.src === src) return factsMemo.facts;
  /* The client handle is conventionally named `client`, but a corpus is not
   * obliged to: abap2UI5/samples-stack's app 319 calls it `m_client`, others
   * use `mo_client` or reach it as `me->client`. Every lifecycle rule below
   * used to hard-code `client->` and was therefore BLIND to those classes -
   * app 319 has no check_on_navigated( ) branch and no rule saw it. Matching
   * the handle by shape rather than by one spelling closes that. */
  /* The methods of this class, by name, with where each body starts - the
   * rules below follow a call into its body: a branch that hands the view
   * back through `set_view( )`, a `main( )` that delegates to `dispatch( )`,
   * two fork arms that call the same display helper. */
  const bodies = new Map();
  for (const mm of src.matchAll(/\bMETHOD\s+([\w~]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
    bodies.set(mm[1].toLowerCase().replace(/^.*~/, ''), {
      text: mm[2],
      start: mm.index + mm[0].length - 'ENDMETHOD'.length - mm[2].length,
    });
  }
  /* A display is a call ON an object: `client->view_display( )`,
   * `mo_client->…`. A bare name - or `me->view_display( )` - that is a
   * method of THIS class is only called so (the corpus names its view
   * builder exactly that) and is followed into its body below like any own
   * method. Read as the client call, a sub-app that only builds into its
   * parent's view (samples apps 105 and 112 under 104) counted as
   * displaying, and was told to add a check_on_navigated( ) branch for a
   * display it never makes. A bare display name the class does NOT define
   * is inherited, and still counts. */
  const DISPLAY_NAME = '(?:view_display|nest2?_view_display|popup_display|popover_display|nav_app_call|nav_app_leave)';
  const REDISPLAY = new RegExp(`(?<!\\bme\\s*)(?:->|=>)\\s*${DISPLAY_NAME}\\s*\\(`, 'i');
  const INHERITED_DISPLAY = new RegExp(`^${DISPLAY_NAME}$`, 'i');
  /* Does this code put a view on screen - itself, or through a method of
   * this class it calls, a few levels deep? The promise a branch makes is
   * that it hands a view back SOMEWHERE, not that it does so inline. */
  const redisplays = (code, seen = new Set()) => {
    if (REDISPLAY.test(code)) return true;
    if (seen.size > 8) return false;
    for (const call of ownCalls(code)) {
      const name = call.toLowerCase();
      if (!bodies.has(name) && INHERITED_DISPLAY.test(name)) return true;
      if (seen.has(name) || !bodies.has(name)) continue;
      seen.add(name);
      if (redisplays(bodies.get(name).text, seen)) return true;
    }
    return false;
  };
  const facts = { bodies, redisplays };
  factsMemo = { src, facts };
  return facts;
}

export function checkLifecycleDispatch({ src, source, report }) {
  const { bodies, redisplays } = dispatchFacts(src);

  /* Three rules over the statement SEQUENCE a call sits in — `branchTail`
   * hands back what runs whenever the call runs, nested blocks blanked, so
   * each is a regex over that text and nothing more.
   *
   * They read `blank`, not `src`: `scrub( )` blanks comments and KEEPS literal
   * content, and a sample that TELLS the reader what it does quotes the call
   * it makes (`… handed to client->view_display( ). `). Read raw, that
   * sentence is a display call in the same sequence as the real one, and the
   * real one gets reported as the second of two. `branchTail( )` blanks the
   * tails it hands back already; these are the outer scans that pick the
   * statements to walk from, and `blankLiterals( )` is offset-for-offset, so
   * every index reported still addresses `src`. */
  {
    const DISPLAY = /\b(?:me->)?\w*client\s*->\s*(view_display|nest_view_display|nest2_view_display|popup_display|popover_display)\s*\(/gi;
    const SLOT = { view_display: 'MAIN', nest_view_display: 'NEST', nest2_view_display: 'NEST2', popup_display: 'POPUP', popover_display: 'POPOVER' };
    const blank = blankLiterals(src);
    /* the index just past the statement a call at `index` belongs to */
    const afterStatement = (index) => {
      const open = src.indexOf('(', index);
      const { end } = parenRegion(src, open);
      if (end === undefined) return -1;
      const dot = blank.indexOf('.', end);
      return dot === -1 ? -1 : dot + 1;
    };
    /* A display call is not always written out where it runs: the corpus
     * idiom is a `view_display( )` or `popup_display( )` METHOD of the class
     * that builds the view and hands it over, and `main( )` calls that. Two
     * of the three flow rules asked only for the spelled-out client call and
     * so never saw the idiom - a `popup_display( )` helper called at the top
     * level of main( ), a `nav_app_call( )` followed by the helper. So a
     * call to a method of this class counts as the display that method (or
     * one it calls, a few levels deep) issues. `displayIn` answers which. */
    const displayIn = (name, re, seen = new Set()) => {
      if (seen.has(name) || seen.size > 8 || !bodies.has(name)) return null;
      seen.add(name);
      const body = blankLiterals(bodies.get(name).text);
      const hit = re.exec(body);
      if (hit) return hit[1].toLowerCase();
      for (const call of body.matchAll(/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g)) {
        const via = displayIn(call[1].toLowerCase(), re, seen);
        if (via) return via;
      }
      return null;
    };
    /* the first display in `text`, written out or through a helper: where it
     * stands and the slot method it reaches. `re` is a non-global copy. */
    const displayCallIn = (text, re) => {
      const direct = re.exec(text);
      const found = direct ? { index: direct.index, member: direct[1].toLowerCase() } : null;
      for (const call of text.matchAll(/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g)) {
        if (found && call.index >= found.index) break;
        const via = displayIn(call[1].toLowerCase(), re);
        if (via) return { index: call.index + call[0].indexOf(call[1]), member: via };
      }
      return found;
    };
    const DISPLAY_ONE = new RegExp(DISPLAY.source, 'i');
    const POPUP_ONE = /\b(?:me->)?\w*client\s*->\s*(popup_display|popover_display)\s*\(/i;

    /* A popup or popover displayed on EVERY roundtrip. `popup_display( )`
     * loads the fragment anew and opens it each time it is called — there is
     * no "unchanged, keep it" path on the frontend — so a call at the top
     * level of main( ), outside any branch and behind no guard, rebuilds the
     * dialog on every event the app receives: the field being typed in loses
     * focus, the scroll position resets, a selection is gone. Every popup
     * class in the framework itself displays from its check_on_init( ) branch
     * or behind a RETURN guard. Judged on z2ui5_if_app~main only, and only
     * where no RETURN/LEAVE/CHECK/EXIT precedes the call — a guard block that
     * leaves the method makes everything after it conditional. */
    for (const mm of blank.matchAll(/\bMETHOD\s+z2ui5_if_app~main\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
      const body = mm[1];
      const base = mm.index + mm[0].length - 'ENDMETHOD'.length - body.length;
      const tail = branchTail(body, 0);
      const m = displayCallIn(tail.text, POPUP_ONE);
      if (!m) continue;
      if (/\b(?:RETURN|LEAVE|CHECK|EXIT)\b/i.test(blankLiterals(body.slice(0, m.index)))) continue;
      report({ type: 'unconditional-popup-display', member: m.member, offset: base + m.index });
    }

    /* A display after nav_app_call( ) in the same sequence. The call hands the
     * roundtrip to another app: what the browser shows next is THAT app's
     * view, and a view_display( ) issued behind it in the same flow is work
     * the user never sees — or, for a popup, a dialog that opens over the
     * app being left. Usually a missing RETURN. */
    for (const m of blank.matchAll(/\b(?:me->)?\w*client\s*->\s*nav_app_call\s*\(/gi)) {
      const from = afterStatement(m.index);
      if (from === -1) continue;
      const tail = branchTail(src, from);
      const d = displayCallIn(tail.text, DISPLAY_ONE);
      if (d) report({ type: 'display-after-nav-app-call', member: d.member, offset: from + d.index, dedupe: String(m.index) });
    }

    /* The same slot displayed twice in one sequence. The second call replaces
     * what the first built before the browser ever saw it — the first is dead
     * code, and the view it built (often a different one) is the one the
     * author probably meant to keep or to branch on. */
    for (const m of blank.matchAll(DISPLAY)) {
      const from = afterStatement(m.index);
      if (from === -1) continue;
      const tail = branchTail(src, from);
      const again = new RegExp(`\\b(?:me->)?\\w*client\\s*->\\s*${m[1]}\\s*\\(`, 'i').exec(tail.text);
      if (again) {
        report({ type: 'double-display-in-branch', member: SLOT[m[1].toLowerCase()], offset: from + again.index, dedupe: String(m.index) });
      }
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
    /* The branch usually does not display anything ITSELF - it calls
     * `set_view( )` or `on_navigation( )`, and that method displays. Reading
     * only the branch text called three correct samples broken and offered a
     * fix that would have displayed the view twice. So `redisplays( )`
     * follows a call to a method of this class, a few levels deep.
     *
     * A branch that hands `client` to ANOTHER object is not judged either:
     * `mo_controller->on_navigated( client )` may well display through the
     * handle it was given, and the linter does not see that class. The same
     * restraint viewIds( ) shows towards a `->` call that receives client. */
    const handsClientOn = (code) => {
      // from the start of a receiver run only: tried inside it too, every
      // try re-read the run (quadratic on a long one), for the same matches
      for (const m of code.matchAll(/(?<![\w>-])([\w>-]+)\s*(?:->|=>)\s*\w+\s*\(/g)) {
        // the client's own calls are not a hand-over, whatever they are given
        if (/^\w*client$/i.test(m[1].replace(/^.*->/, ''))) continue;
        const { body } = parenRegion(code, m.index + m[0].length - 1);
        // `client` as a whole argument - not `client->get( )`, a value read off it
        if (/(?:^|[\s(=])(?:me->)?\w*client(?=\s*(?:\)|$)|\s)/i.test(body)) return true;
      }
      return false;
    };
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
          report({ type: 'missing-view-display-on-navigated', offset: m.index });
        }
        continue;
      }
      if (!redisplays(branch) && !handsClientOn(branch)) {
        const fixes = navigatedRedisplayFix({ src, source, at: m.index, end, redisplays });
        report({ type: 'missing-view-display-on-navigated', offset: m.index, ...(fixes ? { fixes } : {}) });
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
          type: 'missing-on-navigated-branch',
          offset: base + init.index,
          ...(fixes ? { fixes } : {}),
        });
      }
    }
  }
}
