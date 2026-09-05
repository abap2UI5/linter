/*
 * reconstruct — view-builder calls in an ABAP class -> XML view document(s)
 * + a typed mock JSON model.
 *
 * The builder is `z2ui5_cl_ui5_view_builder` (ele/tag/a/end) — see
 * lib/builders.mjs, which owns the verb mapping; everything here works on
 * the ROLE of a verb, never on its spelling, and the dialect of a source is
 * decided by the factory it names.
 *
 * Extracted from abap2UI5/samples-controls scripts/render-smoke.mjs. The
 * reconstruction covers the linear factory-chain idiom (one descend/ascend
 * stack) and the handle-aware idiom (view parts built in helper methods that
 * take and return a builder handle). A class whose builder calls cannot be
 * attributed statically reports helperTokens > 0 — the caller decides whether
 * that is a warning or a failure.
 *
 * Substitutions while reconstructing (the harness controls both sides, so
 * exact framework path names do not matter):
 *   client->_bind( var )                        -> {/VAR}
 *   client->_bind( val = var path = abap_true ) -> /VAR   (bare path)
 *   client->_event*( ... ) / follow_up_action( )  -> .eB()  (stub handler)
 *   a( b = <abap_bool> )                        -> true
 *   |...{ expr }...| templates, `lit` && chains -> resolved statically
 */
import { scrub, parenRegion, topSplit, splitStatements, parseNamedArgs } from './abap.mjs';
import { dialectOf } from './builders.mjs';

export const SKIP = Symbol('skip');
const up = (s) => s.toUpperCase();

// ---------------------------------------------------------------------------
// Value expressions -> static strings
// ---------------------------------------------------------------------------
/* client->_bind( X ) / _bind_edit( X ), with X a variable or a structure
 * component. The framework turns the ABAP name into the client path itself:
 * `-` becomes `/`, a `me->` prefix drops away, and a leading `/` is added
 * (z2ui5_cl_ui5_srv_bind=>get_client_name). `path = abap_true` asks for the
 * bare path instead of a {binding}. */
const BIND_NAME = /^(?:me->)?\w+(?:-\w+)*$/i;

/* The two boolean constants, however a class spells them - `abap_true` is
 * `ABAP_TRUE` to the compiler. */
const ABAP_TRUE = /^abap_true$/i;
const ABAP_FALSE = /^abap_false$/i;

/* Parameters that leave the binding's SHAPE alone: the client name is still
 * derived from `val`, only the serialization around it changes (which fields
 * are omitted, whether the string is spliced as JSON) or nothing at all
 * (`view` is documented obsolete). The ones NOT listed change what the
 * binding addresses (`switch_default_model` re-roots the model, a custom
 * mapper/filter renames the serialized fields) — a call passing those stays
 * unresolved rather than reconstructed wrong. `tab`/`tab_index` change it
 * too, but computably, so they have their own branch below. */
const BIND_SHAPE_NEUTRAL = new Set(['path', 'view', 'json', 'omit_initial', 'omit_initial_paths']);

/* The CELL form of the same call: the bound value is one ROW of an internal
 * table, written as `val = mt_emp[ 1 ]-picture` with the table in `tab` and
 * the row number in `tab_index` (framework: z2ui5_cl_ui5_srv_bind->main_cell
 * / bind_tab_cell). ABAP counts rows from 1 and the client path from 0, so
 * `tab_index = 1` renders as `{/MT_EMP/0/PICTURE}`.
 *
 * It is reconstructed only when all three agree — `val` reads the table that
 * `tab` names, and the row number is a literal equal to `tab_index`. They
 * cannot disagree in a call that WORKS: the framework identifies the cell by
 * reference and refuses a `val` that is not a component of the addressed row
 * (BINDING_ERROR_TAB_CELL_LEVEL), so a disagreement means the call is broken
 * and a path computed from it would be a guess reported as fact. Anything
 * else about the form (a variable row number, a table read through a helper)
 * stays unresolved, as before.
 *
 * Until this branch existed the whole call fell through to "unresolved value
 * expression dropped" and the ATTRIBUTE left the reconstructed view with it —
 * the same blindness the `omit_initial_paths`/`json` gap caused, and the
 * reason a port could bind a cell and have no gate look at it. */
const BIND_CELL = /^(?:me->)?(\w+)\[\s*(\d+)\s*\]-(\w+)$/i;

/* The same cell over an ASSIGNED row — `val = <emp1>-name`. It is the form a
 * class uses when it is downported (abaplint lowers the component-level
 * `tab[ n ]-comp` to a work-area copy, and the framework then refuses the
 * cell), so it is the spelling the corpus writes, not a variant.
 *
 * Here `val` contributes only the COMPONENT: the table and the row come from
 * `tab` and `tab_index`, which are the two arguments the framework itself
 * resolves the row from. So the path is derived from the explicit arguments
 * either way, and what the cell form above cross-checks — that `val` reads
 * the same table — simply has nothing to check against: where a field symbol
 * points is not decidable from the source. A field symbol pointing into
 * another table is a runtime BINDING_ERROR rather than a wrong path here, and
 * a component the row type does not have resolves to a path the property gate
 * then reports as unknown - which is the gate doing its job, not this
 * guessing. */
const BIND_CELL_FS = /^<\w+>-(\w+)$/;

export function bindingOf(expr) {
  const s = String(expr).trim();
  const m = s.match(/^client->_bind(_edit)?\(/i);
  if (!m) return null;
  const open = m[0].length - 1;
  const { body, end } = parenRegion(s, open);
  if (end !== s.length - 1) return null; // trailing tokens - not a lone bind call
  let name;
  let bare = false;
  let json = false;
  let omit = null;
  if (/^\s*(?:me->)?\w+(?:-\w+)*\s*$/.test(body)) {
    name = body.trim(); // positional: _bind( var )
  } else {
    const args = parseNamedArgs(body);
    name = args.val;
    if (!name) return null;
    const cellArgs = args.tab !== undefined || args.tab_index !== undefined;
    if (cellArgs) {
      if (args.tab === undefined || args.tab_index === undefined) return null;
      if (!/^\d+$/.test(args.tab_index)) return null;
      const row = Number(args.tab_index);
      if (row < 1) return null;
      const tab = args.tab.replace(/^me->/i, '');
      if (!/^\w+$/.test(tab)) return null;
      const cell = name.match(BIND_CELL);
      const fsCell = name.match(BIND_CELL_FS);
      let component;
      if (cell) {
        // the table expression names its own row: it must be the row and the
        // table the other two arguments name, or the call cannot work
        if (row !== Number(cell[2]) || tab.toLowerCase() !== cell[1].toLowerCase()) return null;
        component = cell[3];
      } else if (fsCell) {
        component = fsCell[1];
      } else {
        return null;
      }
      // the row index becomes a path segment of its own, so the shared tail
      // below turns it into `/MT_EMP/0/PICTURE` like any other component
      name = `${tab}-${row - 1}-${component}`;
    } else if (!BIND_NAME.test(name)) {
      return null;
    }
    for (const key of Object.keys(args)) {
      if (key === 'val') continue;
      if (cellArgs && (key === 'tab' || key === 'tab_index')) continue;
      if (!BIND_SHAPE_NEUTRAL.has(key)) return null;
    }
    bare = ABAP_TRUE.test(args.path ?? '');
    json = ABAP_TRUE.test(args.json ?? '');
    if (ABAP_TRUE.test(args.omit_initial ?? '')) omit = { all: true, paths: new Set() };
    if (args.omit_initial_paths) {
      // the LITERAL elements of the VALUE #( ) list — a dynamic one simply
      // is not applied, which errs on serializing too much, never too little
      omit ??= { all: false, paths: new Set() };
      for (const p of args.omit_initial_paths.matchAll(/[`']([^`']+)[`']/g)) {
        omit.paths.add(p[1].toUpperCase());
      }
    }
  }
  name = name.replace(/^me->/i, '');
  return {
    root: name.split('-')[0],
    path: `/${name.replace(/-/g, '/').toUpperCase()}`,
    bare,
    json,
    omit,
  };
}

export function makeResolver(content, boundVars, notes, bindMeta = null) {
  /* Set whenever a piece of the expression being resolved could NOT be
   * computed statically - a LOOP variable, a field of a work area, a constant
   * the scan does not carry. The value handed back is then a GUESS: the
   * unresolved piece contributed the empty string, so `|{ col-name }_{ i }|`
   * collapses to "_" for every row and `|\{{ path }/{ i }/TITLE\}|` to
   * "{//TITLE}". Rules that judge the value ITSELF (a duplicate id, a binding
   * path against the model) must not fire on that - the id really is distinct
   * per row and the path really does resolve at runtime. Read right after a
   * resolveExpr( ) call; see applyToken. */
  let unresolvedPiece = false;
  /* Serialization facts per bound root, for the caller: which full paths are
   * json-spliced, and which fields the runtime omits when initial. */
  const noteBind = (bind) => {
    if (!bindMeta) return;
    const key = bind.root.toUpperCase();
    const meta = bindMeta.get(key) ?? { json: new Set(), omitAll: false, omitPaths: new Set() };
    if (bind.json) meta.json.add(bind.path);
    if (bind.omit?.all) meta.omitAll = true;
    for (const p of bind.omit?.paths ?? []) meta.omitPaths.add(p);
    bindMeta.set(key, meta);
  };
  /* An ABAP TEXT FIELD literal - `'abc'`, the form every ABAPer outside this
   * project's house style writes - is of type C, and assigning one to a string
   * drops its trailing blanks. `''` is therefore the empty string, not a
   * blank. A doubled quote inside is one quote. */
  const charLiteral = (raw) => raw.replace(/''/g, "'").replace(/ +$/, '');
  const LIT = String.raw`(?:\`(?:[^\`]|\`\`)*\`|'(?:[^']|'')*')`;
  const litText = (raw) => (raw[0] === '`' ? raw.slice(1, -1).replace(/``/g, '`') : charLiteral(raw.slice(1, -1)));

  /* Literal scalar assignments anywhere in the class, incl. multi-line
   * concatenations of pure literals: var = `a` && `b` && ... .
   *
   * Read per STATEMENT, not by a regex over the whole text: `(?:^|\s)NAME =
   * LIT.` also matched the comparison in `IF mv_x = \`open\`.`, a CHECK, an
   * ELSEIF, and whichever of those came last then became the "value" a
   * template `|{ mv_x }|` resolved to - a wrong id or path in the
   * reconstructed view. A statement that IS the assignment starts with the
   * name; a comparison starts with its keyword. Names are folded to lower
   * case, as every ABAP identifier is. */
  const literals = new Map();
  const assignRe = new RegExp(String.raw`^\s*(?:DATA\()?(\w+)\)?\s*=\s*(${LIT}(?:\s*&&\s*${LIT})*)\s*$`, 'i');
  for (const stmt of splitStatements(content)) {
    const m = stmt.text.match(assignRe);
    if (!m) continue;
    const joined = [...m[2].matchAll(new RegExp(LIT, 'g'))].map((p) => litText(p[0])).join('');
    literals.set(m[1].toLowerCase(), joined);
  }

  const resolvePiece = (piece) => {
    const p = piece.trim();
    let m;
    if ((m = p.match(/^`((?:[^`]|``)*)`$/s))) return m[1].replace(/``/g, '`');
    if ((m = p.match(/^'((?:[^']|'')*)'$/s))) return charLiteral(m[1]);
    if (/^cl_abap_char_utilities=>newline$/i.test(p)) return '\n';
    if (/^cl_abap_char_utilities=>horizontal_tab$/i.test(p)) return '\t';
    if ((m = p.match(/^cl_abap_char_utilities=>cr_lf\(1\)$/i))) return '\r';
    if ((m = p.match(/^(\w+)$/))) {
      const key = m[1].toLowerCase();
      if (literals.has(key)) return literals.get(key);
      return null;
    }
    return null;
  };

  const resolveSub = (sub) => {
    const s = sub.trim();
    let m;
    const bind = bindingOf(s);
    if (bind) {
      boundVars.add(bind.root);
      noteBind(bind);
      return bind.bare ? bind.path : `{${bind.path}}`;
    }
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    const lit = resolvePiece(s);
    if (lit !== null) return lit;
    notes.push(`unresolved template expression: { ${s.slice(0, 60)} }`);
    unresolvedPiece = true;
    return '';
  };

  /* What `\\x` inside a string template MEANS. The transpiler settles it: it
   * emits the template body verbatim into a JavaScript backtick literal
   * (@abaplint/transpiler StringTemplateTranspiler escapes only the backtick),
   * so the browser reads the escape with JavaScript's rules - and `|\\n|` is a
   * NEWLINE in the running app, which is exactly what the corpus uses it for
   * (`… && |\\n| && …` between the lines of a message box). Dropping the
   * backslash and keeping the letter turned one documented type binding into
   * `{ type : "…",n path:"…" }`, which UI5 refuses to parse - a render error
   * reported against an example that runs. Everything outside this set keeps
   * the old behaviour, which is also JavaScript's: `\\|`, `\\{`, `\\}` and `\\\\`
   * are the character itself. */
  const TEMPLATE_ESCAPES = { n: '\n', r: '\r', t: '\t' };
  const resolveTemplate = (tpl) => {
    // tpl includes the surrounding pipes
    let out = '';
    for (let i = 1; i < tpl.length - 1; i++) {
      const c = tpl[i];
      if (c === '\\') {
        const esc = tpl[++i];
        out += TEMPLATE_ESCAPES[esc] ?? esc ?? '';
        continue;
      }
      if (c === '{') {
        let depth = 1;
        let j = i + 1;
        for (; j < tpl.length && depth; j++) {
          if (tpl[j] === '{') depth++;
          else if (tpl[j] === '}') depth--;
        }
        out += resolveSub(tpl.slice(i + 1, j - 1));
        i = j - 1;
        continue;
      }
      out += c;
    }
    return out;
  };

  // one chain piece: a template, a _bind form, or a plain literal.
  // Returns null when the piece cannot be resolved statically.
  const resolveOne = (piece) => {
    const s = piece.trim();
    let m;
    if (/^\|/.test(s)) return resolveTemplate(s);
    const bind = bindingOf(s);
    if (bind) {
      boundVars.add(bind.root);
      noteBind(bind);
      return bind.bare ? bind.path : `{${bind.path}}`;
    }
    return resolvePiece(s);
  };

  function resolveExpr(expr) {
    unresolvedPiece = false;
    const e = expr.trim();
    // Keep event handlers as a resolvable stub reference (.eB() resolves
    // against the harness stub controller) instead of dropping them, so UI5
    // future mode still validates the event NAME against the control — this is
    // what catches an event declared on the wrong control.
    /* `follow_up_action( )` belongs here too: since it gained a RETURNING
     * parameter it is `_event_client( )` in the same position - the wire form
     * written INTO a view attribute - and the rename made it the spelling the
     * corpora use. Without it such a handler resolved to nothing and was
     * dropped from the reconstructed view, so every rule that judges an event
     * wire (the event NAME against the control, event-on-disabled-control,
     * event parameters) simply stopped seeing it. */
    if (/client->_event\b|client->_event_client\b|client->follow_up_action\b/i.test(e)) return '.eB()';
    // split any && chain FIRST (topSplit is template-aware, so a && inside a
    // |...| template — e.g. an expression binding — never splits)
    const pieces = topSplit(e, '&&').map(resolveOne);
    if (pieces.length && pieces.every((p) => p !== null)) return pieces.join('');
    notes.push(`unresolved value expression dropped: ${e.slice(0, 70)}`);
    return SKIP;
  }
  /* Whether the LAST resolveExpr( ) call had to guess at part of its value. */
  Object.defineProperty(resolveExpr, 'guessed', { get: () => unresolvedPiece });
  return resolveExpr;
}

// ---------------------------------------------------------------------------
// Builder calls -> node trees
// ---------------------------------------------------------------------------
/* Attach one attribute. The builder refuses a name that is already on the
 * element (`ASSERT NOT line_exists( t_pair[ n = n ] )`) — it dumps rather
 * than render invalid XML with the attribute twice, so the second write is
 * reported and dropped, exactly as ABAP would refuse it. */
/* An event argument read from the UI5 event itself:
 *   client->_event( val = `X` t_arg = VALUE #( ( `${$parameters>/item}` ) ) )
 * The reconstruction replaces the whole _event( ) call with a stub handler,
 * so the parameter names would be lost - they are recorded on the node
 * instead, where the property gate can hold them against the control that
 * fires the event. Only the first path segment is a metadata member; what
 * follows addresses fields of the object it yields. */
function recordEventParams(target, raw, member, offset) {
  for (const m of String(raw).matchAll(/\$parameters>\/(\w+)/g)) {
    (target.eventParams ??= []).push({ name: m[1], member, offset });
  }
}

function addAttr(target, name, value, offset, structure) {
  if (target.attrs.some(([n]) => n === name)) {
    structure?.push({ type: 'duplicate-property', control: target.name, member: name, offset });
    return;
  }
  target.attrs.push([name, value, offset]);
}

/* apply one navigation token to a live stack (mutates the tree). `role` is
 * what the verb DOES ('open'|'leaf'|'att'|'shut'), not how the dialect at
 * hand spells it. */
function applyToken(role, body, stack, resolveExpr, notes, structure, offset, d) {
  if (role === 'shut') {
    if (stack.length > 1) stack.pop();
    // one ascend more than the tree is deep: both builders assert
    // `parent IS BOUND` there, so this dumps at runtime
    else structure?.push({ type: 'excess-shut', offset });
    return;
  }
  if (role === 'att') {
    const nm = body.match(NAME_ARG);
    const vm = body.match(/(?:^|\s)v\s*=\s*([\s\S]+)$/i);
    /* `a( b = flag )` renders `true`/`false` in the builder itself. Which
     * of the two it is at runtime is not statically knowable, so it
     * reconstructs as `true` — the attribute is validated as a boolean
     * either way, and only the VALUE would differ. */
    const bm = !vm && d.boolParam ? body.match(/(?:^|\s)b\s*=\s*[\s\S]+$/i) : null;
    if (!nm || !(vm || bm)) { notes.push(`unparsed attribute call: ${body.slice(0, 60)}`); return; }
    const cur = stack[stack.length - 1];
    const target = cur.children.length ? cur.children[cur.children.length - 1] : cur;
    // an attribute on the bare factory root: there is no element to carry it,
    // and both builders assert on exactly that
    if (target.name === null) {
      structure?.push({ type: 'attribute-without-element', member: nm[2], offset });
      return;
    }
    if (bm) { addAttr(target, nm[2], 'true', offset, structure); return; }
    const val = resolveExpr(vm[1]);
    /* An attribute whose value cannot be resolved AT ALL - `COND #( … )`,
     * `SWITCH #( … )` - is dropped rather than invented, because a made-up
     * value would be judged as if the author had written it. But the fact
     * that the attribute WAS written is real, and a rule asking only that
     * (is this button named? does this control have a press?) has to be able
     * to see it. Reading a dropped `text` as "no text" reported three
     * correctly labelled buttons as unusable with a screen reader. */
    if (val === SKIP) { (target.unresolvedAttrs ??= new Set()).add(nm[2]); return; }
    // the value is a guess (a LOOP variable, a work-area field): keep it, the
    // render gate still needs a well-formed document, but mark it so the rules
    // that judge the value itself leave it alone
    let value = val;
    if (resolveExpr.guessed) {
      (target.guessedAttrs ??= new Set()).add(nm[2]);
      /* An id is the one guessed value the DOCUMENT cannot carry twice: UI5
       * refuses a duplicate id outright, so two loop-built ids that both
       * collapse to the same string kill the render of a view that is fine at
       * runtime, where they differ per row. Making the guess unique per
       * occurrence is also the more faithful one - it is what the loop does.
       * The offset is unique within the file and deterministic, so the same
       * source always reconstructs to the same document. */
      if (nm[2] === 'id' && offset !== null && offset !== undefined) value = `${val}_g${offset}`;
    }
    recordEventParams(target, vm[1], nm[2], offset);
    addAttr(target, nm[2], value, offset, structure);
    return;
  }
  const nm = body.match(NAME_ARG) || body.match(/^\s*([`'])([^`']*)\1/);
  if (!nm) { notes.push(`unparsed element call: ${body.slice(0, 60)}`); return; }
  const nsm = body.match(/(?:^|\s)ns\s*=\s*([`'])([^`']*)\1/i);
  const node = { name: nm[2], ns: nsm ? nsm[2] : null, attrs: [], children: [], offset };
  const cur = stack[stack.length - 1];
  cur.children.push(node);
  if (role === 'open') stack.push(node);
}

/* The `client->*_display( … )` call a document is handed to, or null. The
 * consumer must sit in the SAME statement as the stringify( ) - a stringify
 * parked in a variable first stays unattributed, as before. */
const DISPLAY_CALL = /client->\s*(view_display|nest_view_display|nest2_view_display|popup_display|popover_display)\s*\(/i;
export function consumerIn(statement) {
  const m = String(statement).match(DISPLAY_CALL);
  return m ? m[1].toLowerCase() : null;
}

/* Which VIEW SLOT each display call fills. The five slots are the whole set
 * (`z2ui5_if_client=>cs_view`) and the consuming call names one of them
 * exactly, so a document knows the slot it lands in without any sniffing.
 * `displayKind` cannot answer this - popup and popover are both `fragment`,
 * main/nest/nest2 are all `view` - and BIND_ELEMENT binds exactly ONE slot. */
const SLOT_BY_CONSUMER = {
  view_display: 'MAIN',
  nest_view_display: 'NEST',
  nest2_view_display: 'NEST2',
  popup_display: 'POPUP',
  popover_display: 'POPOVER',
};

/* The statement of a splitStatements( ) list that contains `at`. Statement
 * boundaries have to come from that splitter, not from the nearest `.`: the
 * dots in `sap.ui.core.mvc` sit inside the very chain being read, so a
 * backwards scan for a period lands in the middle of a namespace literal. */
function statementAt(stmts, at) {
  // binary search over the offset-sorted list: last statement with offset <= at
  let lo = 0, hi = stmts.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (stmts[mid].offset <= at) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best >= 0 ? stmts[best].text : '';
}

/* What the consuming call says about a document, for BOTH readers of it:
 *   - `displayKind` on the root, so the render gate loads the document the way
 *     the client will (XMLView.create vs Fragment.load) instead of guessing
 *     from the root tag - which fails a fragment rooted in a bare control, the
 *     very shape the rule below calls legitimate.
 *   - `display-root-mismatch`, the rule itself.
 * Shared because the two extractors used to disagree: only the handle-aware
 * one did this, so a linearly built class - the shape the rule documents as
 * its own example - was never judged at all. */
function noteDisplay(root, consumer, structure, at) {
  if (!consumer) return;
  const wantsFragment = consumer.startsWith('popup') || consumer.startsWith('popover');
  root.displayKind = wantsFragment ? 'fragment' : 'view';
  root.displaySlot = SLOT_BY_CONSUMER[consumer] ?? null;
  const rootEl = root.children[0];
  if (!rootEl || !structure) return;
  const isFragment = rootEl.name === 'FragmentDefinition';
  const isView = rootEl.name === 'View' && rootEl.ns === 'mvc';
  // only the two unambiguous directions - a bare control root is a legitimate
  // fragment and is never reported
  if (wantsFragment && isView) {
    structure.push({ type: 'display-root-mismatch', member: consumer, value: 'mvc:View', offset: at });
  } else if (!wantsFragment && isFragment) {
    structure.push({ type: 'display-root-mismatch', member: consumer, value: 'core:FragmentDefinition', offset: at });
  }
}

export function extractDocs(content, resolveExpr, notes, structure, d = dialectOf(content)) {
  const docs = [];
  let helperTokens = 0; // builder calls outside any factory chain
  let stack = null;
  const stmts = splitStatements(content);
  const tokenRe = new RegExp(`${d.factory}\\(\\s*\\)|->\\s*${d.verbs}\\s*\\(`, 'gi');
  let m;
  while ((m = tokenRe.exec(content)) !== null) {
    if (!m[1]) {
      stack = [{ name: null, ns: null, attrs: [], children: [], offset: m.index }];
      continue;
    }
    if (!stack) { helperTokens++; continue; }
    const verb = d.kindOf(m[1]);
    if (verb === 'shut') {
      applyToken('shut', '', stack, resolveExpr, notes, structure, m.index, d);
      continue;
    }
    if (verb === 'stringify') {
      // levels left open are harmless - render( ) walks the tree from its
      // root, so the XML closes either way; only note them
      if (stack.length > 1 && structure) {
        structure.push({ type: 'open-levels', depth: stack.length - 1, note: true });
      }
      noteDisplay(stack[0], consumerIn(statementAt(stmts, m.index)), structure, m.index);
      docs.push(stack[0]);
      stack = null;
      continue;
    }
    const open = content.indexOf('(', m.index + m[0].length - 1);
    const { body, end } = parenRegion(content, open);
    tokenRe.lastIndex = verb === 'att' ? end : tokenRe.lastIndex;
    applyToken(verb, body, stack, resolveExpr, notes, structure, m.index, d);
  }
  return { docs, helperTokens };
}

/* Process a chain of navigation calls against `stack` (mutates it). `base`
 * is the offset of the chain inside the class source, so the offsets
 * recorded on nodes and attributes stay file-absolute. */
function processChain(chain, stack, resolveExpr, notes, structure, base = null, d = dialectOf(chain)) {
  const tokenRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`, 'gi');
  let m;
  while ((m = tokenRe.exec(chain)) !== null) {
    const verb = d.kindOf(m[1]);
    if (verb === 'stringify') continue;
    const at = base === null ? undefined : base + m.index;
    if (verb === 'shut') {
      applyToken('shut', '', stack, resolveExpr, notes, structure, at, d);
      continue;
    }
    const open = chain.indexOf('(', m.index + m[0].length - 1);
    const { body, end } = parenRegion(chain, open);
    if (verb === 'att') tokenRe.lastIndex = end;
    applyToken(verb, body, stack, resolveExpr, notes, structure, at, d);
  }
}

// Helper methods that build into a handle they are given. Two shapes:
//   RETURNING - takes a handle, returns one; the caller chains on further
//               (`result = io_x->ele( … )`), inlined as a chain
//   void      - takes a handle and fills it, returning nothing. The idiom of
//               every floorplan/renderer that splits rendering into steps a
//               subclass can redefine (render_toolbar( io_table = … )). Its
//               body is REPLAYED with the handle map seeded from the call, so
//               nested helper calls and local handles inside it work too
function parseHelpers(content, dialect) {
  const helpers = new Map();
  const bodyOf = (name) => {
    const implM = content.match(new RegExp('METHOD\\s+' + name + '\\s*\\.([\\s\\S]*?)\\bENDMETHOD\\b', 'i'));
    if (!implM) return null;
    // absolute offset of the body, so a finding inside a replayed helper still
    // points at the line it actually came from
    return { text: implM[1], base: implM.index + implM[0].indexOf(implM[1]) };
  };

  // RETURNING a handle - inlined as a chain, re-anchored to the argument
  // names are folded to lower case throughout - a helper declared as
  // `METHODS Render_Toolbar` is called as `render_toolbar( )` in ABAP
  const retRe = new RegExp(`METHODS\\s+(\\w+)\\s+IMPORTING([\\s\\S]*?)RETURNING\\s+VALUE\\(\\w+\\)\\s+${dialect.handleType}\\s*\\.`, 'gi');
  let d;
  while ((d = retRe.exec(content)) !== null) {
    const name = d[1].toLowerCase();
    const params = [...d[2].matchAll(/(\w+)\s+TYPE\b/gi)].map((x) => x[1].toLowerCase());
    const body = bodyOf(name);
    if (!body) continue;
    const resStmt = splitStatements(body.text).find((s) => /^\s*result\s*=/i.test(s.text));
    if (!resStmt) continue;
    const rm = resStmt.text.match(/^\s*result\s*=\s*(\w+)\s*(->[\s\S]*)$/i);
    if (!rm) continue;
    helpers.set(name, { kind: 'chain', entryParam: rm[1].toLowerCase(), bodyChain: rm[2], params });
  }

  // void, taking a handle - the body is replayed against the passed handle
  const voidRe = /METHODS\s+(\w+)\s+IMPORTING([\s\S]*?)\./gi;
  while ((d = voidRe.exec(content)) !== null) {
    const name = d[1].toLowerCase();
    if (helpers.has(name)) continue;
    const sig = d[2];
    if (/RETURNING|EXPORTING|CHANGING/i.test(sig)) continue;
    const entry = sig.match(new RegExp(`(\\w+)\\s+${dialect.handleType}\\b`, 'i'));
    if (!entry) continue;
    const body = bodyOf(name);
    if (!body) continue;
    const params = [...sig.matchAll(/(\w+)\s+TYPE\b/gi)].map((x) => x[1].toLowerCase());
    helpers.set(name, { kind: 'void', entryParam: entry[1].toLowerCase(), body: body.text, bodyBase: body.base, params });
  }
  return helpers;
}

export function extractDocsWithHelpers(content, resolveExpr, notes, structure, d = dialectOf(content)) {
  const helpers = parseHelpers(content, d);
  const ctx = { helpers, resolveExpr, notes, structure, docs: [], helperTokens: 0, depth: 0, d };
  // EVERY method that opens a factory, each with its own handle map: a class
  // may well build a second view (a popup fragment) in a method of its own.
  // The name pattern allows `~` and `/` - an app that builds its view straight
  // in z2ui5_if_app~main is the most ordinary case there is.
  const methodRe = /\bMETHOD\s+([\w~\/]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi;
  let mm;
  let seen = 0;
  const factoryRe = new RegExp(d.factory, 'i');
  while ((mm = methodRe.exec(content)) !== null) {
    if (!factoryRe.test(mm[2])) continue;
    seen++;
    const bodyBase = mm.index + mm[0].indexOf(mm[2]);
    runStatements(mm[2], bodyBase, new Map(), ctx);
  }
  if (!seen) return { docs: [], helperTokens: 1 };
  return { docs: ctx.docs, helperTokens: ctx.helperTokens };
}

/* Replay one method body statement by statement against `handles`
 * (var -> stack of node refs, root..cursor). Called recursively for the body
 * of a void helper, with the map seeded from the call's arguments. */
function runStatements(text, bodyBase, handles, ctx) {
  const { resolveExpr, notes, structure, d } = ctx;
  const docs = ctx.docs;
  const factoryChain = new RegExp(`^(?:DATA\\()?(\\w+)\\)?\\s*=\\s*${d.factory}\\(\\s*\\)\\s*(->[\\s\\S]*)?$`, 'i');
  const handleChain = new RegExp(`^(\\w+)\\s*(->\\s*(?:${d.verbs.slice(1, -1)})\\b[\\s\\S]*)$`, 'i');
  // handle names are ABAP identifiers: `DATA(View)` and `view->ele( )` name one
  const lc = (s) => s.toLowerCase();
  for (const stmt of splitStatements(text)) {
    const s = stmt.text.trim();
    if (!s) continue;
    // offset of the trimmed statement in the file; a chain group always runs
    // to the end of the statement, so its start is simply the tail position
    const at = bodyBase === null
      ? null
      : bodyBase + stmt.offset + (stmt.text.length - stmt.text.trimStart().length);
    const tail = (group) => (at === null ? null : at + s.length - group.length);
    let m;
    // DATA(v) = <builder>=>factory( ) [ ->chain ]
    if ((m = s.match(factoryChain))) {
      const stack = [{ name: null, ns: null, attrs: [], children: [], offset: at }];
      if (m[2]) processChain(m[2], stack, resolveExpr, notes, structure, tail(m[2]), d);
      handles.set(lc(m[1]), stack);
      continue;
    }
    // DATA(v) = <handleVar>->chain   (capture a handle mid-chain)
    if ((m = s.match(/^(?:DATA\()?(\w+)\)?\s*=\s*(\w+)\s*(->[\s\S]*)$/i)) && handles.has(lc(m[2]))) {
      const stack = handles.get(lc(m[2])).slice();
      processChain(m[3], stack, resolveExpr, notes, structure, tail(m[3]), d);
      handles.set(lc(m[1]), stack);
      continue;
    }
    // <var>->stringify( )  -> emit the doc. Any consumer counts, not just
    // view_display: a popup/popover/nested view is handed over by its own
    // *_display method, and a class may also stringify into a variable first.
    if ((m = s.match(/(\w+)\s*->\s*stringify\s*\(/i)) && handles.has(lc(m[1]))) {
      const stack = handles.get(lc(m[1]));
      if (stack.length > 1 && structure) {
        structure.push({ type: 'open-levels', depth: stack.length - 1, note: true });
      }
      const root = stack[0];
      if (!docs.includes(root)) docs.push(root);
      noteDisplay(root, consumerIn(s), structure, at);   // s IS the statement here
      continue;
    }
    // <handleVar>->chain        (continue from a handle without capturing)
    // Anchored on a COPY of that handle's stack: the statement moves its own
    // cursor, the handle keeps pointing where it did. Without this the
    // statement is either dropped or - in the linear scanner - applied to
    // whatever cursor the previous statement left behind, which silently
    // reparents everything that follows (a Table's columns landing inside its
    // headerToolbar). This is the idiom of every generic renderer: hold the
    // container, fill it from a LOOP.
    if ((m = s.match(handleChain)) && handles.has(lc(m[1]))) {
      processChain(m[2], handles.get(lc(m[1])).slice(), resolveExpr, notes, structure, tail(m[2]), d);
      continue;
    }
    // <helper>( args )[->chain]   the helper builds into the handle it is given
    if ((m = s.match(/^(\w+)\s*\(/)) && ctx.helpers.has(lc(m[1]))) {
      const h = ctx.helpers.get(lc(m[1]));
      const open = s.indexOf('(', m[1].length);
      const { body: argBody, end } = parenRegion(s, open);
      const args = parseNamedArgs(argBody);
      // named argument, or a lone positional one
      const entryVar = lc((args[h.entryParam] ?? (/^\s*\w+\s*$/.test(argBody) ? argBody : '')).trim());
      if (!handles.has(entryVar)) { ctx.helperTokens++; continue; }

      if (h.kind === 'void') {
        // replay the body against the passed handle. Recursion is bounded:
        // a renderer that calls itself (a tree of sections) would otherwise
        // never terminate here
        if (ctx.depth >= 8) { ctx.helperTokens++; continue; }
        const inner = new Map([[h.entryParam, handles.get(entryVar).slice()]]);
        // pass through any other builder handle the call forwards
        for (const p of h.params) {
          const v = lc((args[p] || '').trim());
          if (p !== h.entryParam && handles.has(v)) inner.set(p, handles.get(v).slice());
        }
        ctx.depth++;
        runStatements(h.body, h.bodyBase, inner, ctx);
        ctx.depth--;
        continue;
      }

      const stack = handles.get(entryVar).slice();
      let hchain = h.bodyChain;
      for (const p of h.params) {
        if (p === h.entryParam || args[p] === undefined) continue;
        hchain = hchain.replace(new RegExp('\\b' + p + '\\b', 'gi'), () => args[p]);
      }
      // the helper body is textually inlined with its parameters substituted,
      // so nothing in it maps back to a position: pass no base rather than a
      // plausible-looking wrong one, and let the finding stay position-less
      processChain(hchain, stack, resolveExpr, notes, structure, null, d);
      const cont = s.slice(end + 1);
      if (cont.trim()) processChain(cont, stack, resolveExpr, notes, structure, at === null ? null : at + end + 1, d);
      continue;
    }
    // any other statement (local DATA, model calls) is not builder-relevant
  }
}

const XML_ESC = (v) => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;').replace(/\t/g, '&#x9;');

export function toXml(node) {
  if (node.name === null) return node.children.map(toXml).join('');
  const q = node.ns ? `${node.ns}:${node.name}` : node.name;
  const attrs = node.attrs.map(([n, v]) => ` ${n}="${XML_ESC(v)}"`).join('');
  return node.children.length
    ? `<${q}${attrs}>${node.children.map(toXml).join('')}</${q}>`
    : `<${q}${attrs}/>`;
}

// ---------------------------------------------------------------------------
// Mock model from TYPES / DATA / model_init seeds
// ---------------------------------------------------------------------------
const NUMERIC = /^(i|int1|int2|int8|f|p|decfloat16|decfloat34)\b/i;

/* The two literal forms a seed can be written in, as one alternation - and
 * what each of them MEANS. A backtick string literal is its content with `` for
 * one backtick; a '…' TEXT FIELD literal is of type C, so '' is one quote and
 * assigning it to a string drops the trailing blanks (which makes '' the empty
 * string, not a blank). Only the backtick form was recognized here, so a table
 * seeded the way most ABAP is written derived an EMPTY model - and the render
 * preview, the binding-path rules and the property gate all judged a screen
 * with no data behind it. */
const LITERAL = String.raw`(?:\`(?:[^\`]|\`\`)*\`|'(?:[^']|'')*')`;
/* A |…| string template as a seed VALUE. Without an interpolation it is a
 * literal like any other (`descr = |Price (net)|`); with one its value is a
 * runtime matter and the field keeps its default. Either way it has to be
 * RECOGNISED: a template the row scanner did not know as a string had its
 * parentheses counted as structure, which closed the row early and dropped
 * the row after it from the model altogether. */
const TEMPLATE = String.raw`\|(?:[^|\\]|\\.)*\|`;
const SEED_LITERAL = `(?:${LITERAL}|${TEMPLATE})`;
const isLiteral = (raw) => raw.startsWith('`') || raw.startsWith("'");
const isTemplate = (raw) => raw.startsWith('|');
/* the template's text, or null when an interpolation makes it a runtime value */
function templateText(raw) {
  let out = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c === '\\') { const e = raw[++i]; out += { n: '\n', r: '\r', t: '\t' }[e] ?? e ?? ''; continue; }
    if (c === '{') return null;
    out += c;
  }
  return out;
}
/* `n = \u0060Page\u0060` and `n = 'Page'` name the same control: the builder takes a
 * `string` and both forms convert to one. Group 2 is the name. */
const NAME_ARG = /(?:^|\s)n\s*=\s*([`'])([^`']*)\1/i;
const literalText = (raw) => (raw[0] === '`'
  ? raw.slice(1, -1).replace(/``/g, '`')
  : raw.slice(1, -1).replace(/''/g, "'").replace(/ +$/, ''));

/* The fields of one structure body. */
const FIELD = /(\w+)\s+TYPE\s+([\w~ ]+?(?:=>[\w~]+)?)\s*(?:LENGTH\s+\d+)?\s*(?:DECIMALS\s+\d+)?\s*(?:VALUE\s+(?:IS INITIAL|`(?:[^`]|``)*`|'(?:[^']|'')*'|abap_true|abap_false|-?\d+(?:\.\d+)?))?\s*(?:READ-ONLY\s*)?[,.]/gi;
/* a field as the matcher read it, with the type folded to lower case - every
 * type and structure name in this module is looked up that way */
const fieldOf = (f) => ({ name: f[1], type: f[2].trim().toLowerCase() });

/* A structure declared INSIDE another one:
 *
 *   BEGIN OF ty_s_row,
 *     id TYPE string,
 *     BEGIN OF s_details,
 *       create_date TYPE d,
 *     END OF s_details,
 *   END OF ty_s_row.
 *
 * `s_details` names no TYPE, so the field matcher below cannot see it and the
 * whole subtree used to be dropped - every path through it
 * ({S_DETAILS/CREATE_DATE}) then read as a path the model does not have, which
 * is a warning on correct code and no way to act on it. ABAP nests these
 * freely and the sample corpora do.
 *
 * Each nested block is lifted into a structure of its own and left behind as a
 * field naming it. The name it is filed under is generated, not derived: ABAP
 * lets the SAME name repeat at every level (sample 138 nests seven `ms_data2`
 * inside one another), so a name built from parent + child would have each
 * level overwrite the one below and only the innermost would survive. Nothing
 * outside reads these names, they only have to be unique and to be spelled
 * with characters a type name may carry, so the field matcher accepts the
 * field that names them. Innermost first, so a block nested two deep is lifted
 * before the block containing it. The counter is per parse, not per module, so
 * the same source always produces the same names. */
function liftNested(body, structs, seq) {
  const INNERMOST = /BEGIN OF (\w+)(?:\s+READ-ONLY)?\s*,((?:(?!BEGIN OF )[\s\S])*?)END OF \1\s*,/i;
  let out = body;
  for (let m = INNERMOST.exec(out); m; m = INNERMOST.exec(out)) {
    const key = `nested__${seq.n++}`;
    structs.set(key, [...m[2].matchAll(FIELD)].map(fieldOf));
    out = `${out.slice(0, m.index)}${m[1]} TYPE ${key},${out.slice(m.index + m[0].length)}`;
  }
  return out;
}

function parseTypes(content) {
  const structs = new Map(); // ty_s_x -> [{name, type}]
  const seq = { n: 0 };      // names for lifted nested structures - see liftNested
  /* `READ-ONLY` may sit between the name and the comma - an inline
   * `DATA: BEGIN OF error READ-ONLY, … END OF error.` is a structure like any
   * other, and without it every binding path through such a field reads as
   * "the model has no such path" (see parseData). */
  /* `\b` after the backreference, or the lazy body stops at the wrong END:
   * `BEGIN OF ms_data, BEGIN OF ms_data2, … END OF ms_data2, … END OF ms_data.`
   * has `END OF ms_data` as a PREFIX of `END OF ms_data2`, so without it the
   * outer structure ends at the inner one's close and keeps only the fields
   * written after it. */
  for (const m of content.matchAll(/BEGIN OF (\w+)(?:\s+READ-ONLY)?\s*,([\s\S]*?)END OF \1\b/gi)) {
    // the type may be qualified (z2ui5_cl_x=>ty_t_y, if_x~ty_z) - dropping
    // such a field would make every binding path through it look wrong
    /* An inline structure carries per-field defaults (`type TYPE string VALUE
     * \`None\`,`, `text TYPE string VALUE IS INITIAL,`), which a named TYPES
     * block cannot. Without the VALUE tail the whole field is dropped and the
     * path through it reads as unknown. */
    const body = liftNested(m[2], structs, seq);
    structs.set(m[1].toLowerCase(), [...body.matchAll(FIELD)].map(fieldOf));
  }
  /* The PERIOD-terminated form:
   *
   *   DATA BEGIN OF ms_struc2.
   *     INCLUDE TYPE ty_s_struc.
   *     INCLUDE TYPE ty_s_struc_incl.
   *   DATA END OF ms_struc2.
   *
   * It is a different statement, not a spelling variant - and it is the only
   * one that can carry `INCLUDE TYPE`, which is how ABAP reuses a structure.
   * The included fields land FLAT (`ms_struc2-title`, not
   * `ms_struc2-ty_s_struc-title`), so an include is recorded as a placeholder
   * here and replaced by the fields it names once every structure is known -
   * an include may name a structure declared further down. */
  for (const m of content.matchAll(/BEGIN OF (\w+)\s*\.([\s\S]*?)(?:DATA\s+)?END OF \1\s*\./gi)) {
    const fields = [];
    for (const line of m[2].split('\n')) {
      const inc = /^\s*INCLUDE\s+(?:TYPE|STRUCTURE)\s+(\w+)\s*\./i.exec(line);
      if (inc) { fields.push({ include: inc[1].toLowerCase() }); continue; }
      for (const f of line.matchAll(FIELD)) fields.push(fieldOf(f));
    }
    structs.set(m[1].toLowerCase(), fields);
  }
  const resolveIncludes = (name, depth = 0) => {
    const fields = structs.get(name);
    if (!fields || depth > 15) return fields ?? [];
    if (!fields.some((f) => f.include)) return fields;
    const out = [];
    for (const f of fields) {
      if (!f.include) { out.push(f); continue; }
      if (f.include === name) continue; // a structure cannot include itself
      out.push(...resolveIncludes(f.include, depth + 1));
    }
    structs.set(name, out);
    return out;
  };
  for (const name of [...structs.keys()]) resolveIncludes(name);

  /* ty_t_x -> row type name, from every TYPES declaration the class writes -
   * chained (`TYPES: BEGIN OF ty_row, …, END OF ty_row, ty_t_rows TYPE
   * STANDARD TABLE OF ty_row WITH EMPTY KEY.`) or not, STANDARD, SORTED or
   * HASHED, or with no table category at all (`TYPE TABLE OF`). The old
   * reader knew exactly one spelling, `TYPES name TYPE STANDARD TABLE OF`,
   * so a table type declared in a chain - the commonest form in the corpora,
   * 64 of them - was no table to the model: the DATA typed with it became a
   * scalar '', there was no template row, and every rule that resolves
   * against a row went silent. A type ALIAS (`TYPES ty_a TYPE ty_b`) follows
   * its target so a DATA typed with the alias resolves the same way. */
  const tables = new Map();
  const aliases = [];
  for (const el of declarationElements(content, /^TYPES$/i)) {
    const m = el.match(TABLE_DECL);
    if (m) { tables.set(m[1].toLowerCase(), m[2].toLowerCase()); continue; }
    const a = el.match(/^(\w+)\s+TYPE\s+((?:\w+(?:=>|~))?\w+)\s*$/i);
    if (a) aliases.push([a[1].toLowerCase(), a[2].toLowerCase()]);
  }
  for (let round = 0; round < 3; round++) {
    for (const [alias, target] of aliases) {
      if (tables.has(target) && !tables.has(alias)) tables.set(alias, tables.get(target));
      else if (structs.has(target) && !structs.has(alias)) structs.set(alias, structs.get(target));
    }
  }
  return { structs, tables };
}

/* `name TYPE [STANDARD|SORTED|HASHED] TABLE OF row …` - group 1 the name,
 * group 2 the row type (possibly qualified). The table category is optional:
 * `TYPE TABLE OF` is a standard table. */
const TABLE_DECL = /^(\w+)\s+TYPE\s+(?:(?:STANDARD|SORTED|HASHED)\s+)?TABLE\s+OF\s+((?:\w+(?:=>|~))?\w+)\b/i;

/*
 * The declarations one keyword introduces, one element per declared name.
 *
 * ABAP declares in two shapes and both are everywhere: one statement per name
 * (`DATA mv_x TYPE string.`) and the chained form (`DATA: mv_x TYPE string,
 * mt_y TYPE ty_t_y READ-ONLY.`), where the keyword is written once and the
 * names are separated by commas at the top level. The readers here used to
 * see the first shape only, anchored on `^\s*DATA\s+name … \.` per line, so
 * every name in a chain was simply not declared as far as the model knew -
 * and `DATA: BEGIN OF …` blocks inside a chain hid the names after them too.
 *
 * Statements come from the same splitter every rule uses (dots inside
 * literals and parentheses are not boundaries), the chain is split on the
 * commas at parenthesis depth 0, and `BEGIN OF`/`END OF` nesting is tracked
 * so the fields of an inline structure are not mistaken for top-level names:
 * a `BEGIN OF x` element at the top level is reported as `BEGIN OF x` so a
 * caller can register the structure variable, its fields are not reported.
 * `keyword` selects DATA, CLASS-DATA or TYPES; the elements come back
 * trimmed, without the keyword and without the terminating dot.
 */
export function declarationElements(content, keyword) {
  const out = [];
  let depth = 0; // BEGIN OF … END OF nesting, kept across the period form's statements
  for (const stmt of splitStatements(content)) {
    const m = stmt.text.match(/^\s*([A-Z][A-Z-]*)\s*(:)?\s*([\s\S]*)$/i);
    if (!m || !keyword.test(m[1])) continue;
    // `DATA(x) = …` is an inline declaration inside an expression, not a chain
    if (!m[2] && m[3].startsWith('(')) continue;
    const elements = m[2] ? topSplit(m[3], ',') : [m[3]];
    for (const raw of elements) {
      const el = raw.trim();
      if (!el) continue;
      if (/^BEGIN\s+OF\b/i.test(el)) { if (depth === 0) out.push(el); depth++; continue; }
      if (/^END\s+OF\b/i.test(el)) { depth = Math.max(0, depth - 1); continue; }
      if (depth === 0) out.push(el);
    }
  }
  return out;
}

/* Every value the ABAP itself writes into a root attribute, keyed by the
 * attribute's model name.
 *
 * `model` cannot answer this. It carries the SEEDED value of a BOUND
 * variable and its seed regex reads exactly one shape (`x = `lit`.`), so a
 * field assigned a string template, a method result, or nothing at all all
 * arrive there as the same empty string. A rule that has to know whether the
 * BACKEND is an author of the string - and of what kind of string - needs the
 * assignments themselves.
 *
 * Two facts per name, and only two, because only two are safe to read off a
 * statement without following the data flow:
 *   any          - the class assigns the field somewhere at all
 *   allPlainText - every one of those assignments is a NON-EMPTY literal with
 *                  no digit in it (`n/a`, `unknown`). A literal like that
 *                  cannot be a date, a time or a number in any locale, so the
 *                  field is plain display text. An EMPTY literal certifies
 *                  nothing - `` is the neutral "not set yet" every input
 *                  field starts from - and neither does a template, a method
 *                  call or another variable, whose content is a runtime
 *                  matter.
 * A statement whose right-hand side spans lines has no single-statement
 * terminator to split on and is simply not seen; not seeing a write leaves
 * the field unrecorded, which every consumer must read as "cannot say". */
function parseRootWrites(content) {
  const writes = new Map();
  const note = (name, plain) => {
    const w = writes.get(up(name)) ?? { any: true, allPlainText: true };
    if (!plain) w.allPlainText = false;
    writes.set(up(name), w);
  };
  // a literal with no digit in it can be neither a date nor a time
  const plainText = (rhs) => {
    const m = rhs.match(/^`((?:[^`]|``)*)`$/);
    return Boolean(m) && m[1].length > 0 && !/\d/.test(m[1]);
  };
  /* `me->x = …` is the same write as `x = …`. A component (`s-field = …`),
   * an inline declaration (`DATA(x) = …`) and a named argument inside a
   * VALUE #( ) body all fail the anchor rather than being excluded by hand:
   * none of them is `NAME =` at the start of a statement. */
  for (const st of splitStatements(content)) {
    const m = st.text.match(/^\s*(?:me->)?(\w+)\s*=\s*([\s\S]+)$/);
    if (!m || /^(?:data|field-symbols|types|constants|methods|class|value)$/i.test(m[1])) continue;
    note(m[1], plainText(m[2].trim()));
  }
  // a DATA … VALUE `lit` declaration authors the field just as an assignment does
  for (const [name, decl] of parseData(content)) {
    if (decl.value != null) note(name, plainText(String(decl.value).trim()));
  }
  return writes;
}

/* var -> { kind: 'scalar'|'table', type, value? }, every name a DATA or
 * CLASS-DATA statement of the class declares, however it is spelled: one per
 * statement or chained, STANDARD/SORTED/HASHED or plain `TABLE OF`, with a
 * LENGTH, DECIMALS, key clause, VALUE and READ-ONLY in any of the places ABAP
 * allows them. Names and types are folded to lower case.
 *
 * The type may be QUALIFIED - `z2ui5_cl_smp_app_489=>ty_s_result`,
 * `if_x~ty_z`. A variable typed by something the class does not declare takes
 * the "declared elsewhere, shape unknowable" branch in buildModel and its
 * paths are accepted rather than guessed at - which is only possible when the
 * declaration was SEEN. Every spelling this reader misses is a bound variable
 * "with no DATA declaration", mocked as a string, and a table mocked as a
 * string takes a whole family of row rules down without a word: this is the
 * blind spot that once hid `WITH DEFAULT KEY`, then the chained `TYPES:`
 * table type, then `READ-ONLY`. */
const DATA_DECL = new RegExp(String.raw`^(\w+)\s+TYPE\s+(?:(?:(?:STANDARD|SORTED|HASHED)\s+)?TABLE\s+OF\s+((?:\w+(?:=>|~))?\w+)|(REF\s+TO\s+[\w=>~]+)|((?:\w+(?:=>|~))?\w+))(?:\s+LENGTH\s+\d+)?(?:\s+DECIMALS\s+\d+)?(?:\s+WITH\b[\s\S]*?)?(?:\s+VALUE\s+(${LITERAL}|abap_true|abap_false|-?\d+(?:\.\d+)?|IS\s+INITIAL))?(?:\s+READ-ONLY)?\s*$`, 'i');
const LIKE_DECL = /^(\w+)\s+LIKE\s+(\w+)(?:\s+READ-ONLY)?\s*$/i;

function parseData(content) {
  const vars = new Map();
  const likes = [];
  for (const el of declarationElements(content, /^(?:CLASS-)?DATA$/i)) {
    /* An INLINE structure - `DATA: BEGIN OF message, … END OF message.` -
     * names no type at all: the variable and its structure are declared in
     * one go. parseTypes collects it under its own name, so the variable is
     * registered with itself as the type and every consumer that asks
     * `types.structs.has(decl.type)` resolves it like a named ty_s_. */
    const begin = el.match(/^BEGIN\s+OF\s+(\w+)/i);
    if (begin) {
      const name = begin[1].toLowerCase();
      if (!vars.has(name)) vars.set(name, { kind: 'scalar', type: name });
      continue;
    }
    const m = el.match(DATA_DECL);
    if (m) {
      const name = m[1].toLowerCase();
      if (m[2]) vars.set(name, { kind: 'table', type: m[2].toLowerCase() });
      else if (m[4]) {
        const value = m[5] && !/^IS\s+INITIAL$/i.test(m[5]) ? m[5] : undefined;
        vars.set(name, { kind: 'scalar', type: m[4].toLowerCase(), value });
      }
      // a reference (m[3]) is not model data: it stays undeclared on purpose,
      // as it always was - binding-to-reference judges those
      continue;
    }
    const like = el.match(LIKE_DECL);
    if (like) likes.push([like[1].toLowerCase(), like[2].toLowerCase()]);
  }
  // `DATA b LIKE a` takes a's declaration, one level deep
  for (const [name, other] of likes) {
    if (!vars.has(name) && vars.has(other)) vars.set(name, { ...vars.get(other), value: undefined });
  }
  return vars;
}

const scalarDefault = (type) =>
  /^abap_bool$/i.test(type) ? false : NUMERIC.test(type) ? 0 : '';

/* A row whose shape comes from a declared structure, not from whatever a
 * VALUE #( ) seed happened to set. Non-enumerable, so it never reaches the
 * JSON model the renderer is handed. */
const markComplete = (row) => Object.defineProperty(row, '__complete', { value: true });
/* A bound variable typed by something the class does not declare - a DDIC
 * structure or CDS entity, a type owned by another class. Its shape is simply
 * not knowable from this source, so the SHAPE gets this marker and every path
 * below it is accepted rather than guessed at. (Most real apps bind DDIC
 * structures; reporting their fields as missing would be noise, not a check.) */
const markUnknown = (o) => Object.defineProperty(o, '__unknownShape', { value: true });
/* the ABAP built-ins a scalar declaration can name; anything else that is not
 * a declared struct/table is a type we cannot see into */
/* Standard ABAP table types of a SCALAR row. They are tables, but neither
 * declared in the class (so `types.tables` cannot know them) nor written in
 * the inline `STANDARD TABLE OF` form parseData recognizes - and a scalar ''
 * where the view binds an array property fails strict validation
 * (`"" is of type string, expected sap.ui.core.Priority[]`). */
const SCALAR_TABLE_TYPE = /^(string_table|stringtab|char_tab|int4_table)$/i;

const SCALAR_TYPE = /^(string|xstring|i|int1|int2|int8|f|p|d|t|c|n|x|decfloat16|decfloat34|utclong|abap_bool|abap_boolean|char\d*|numc\d*|clike|csequence|numeric|simple|any|data)$/i;

/* The initial value of a field, following the class's own TYPES: a nested
 * structure is an object with its fields, a nested table one row of them -
 * not the empty string a scalar would get. That is what makes a deep path
 * like {TRANSACTION_AMOUNT/SIZE} resolvable, and what makes a nested
 * aggregation binding hand its template a row instead of a string. */
function defaultFor(type, types, depth = 0) {
  /* A cycle has to end somewhere. ABAP cannot express one - a structure
   * containing itself does not activate - so this only ever catches a type
   * graph misread out of garbage input, and the number just has to clear real
   * nesting: sample 138 in abap2UI5/samples nests seven deep on purpose, and
   * at the old limit of 5 its deepest field silently stopped existing. */
  if (depth > 15) return '';
  if (types.structs.has(type)) {
    return markComplete(Object.fromEntries(
      types.structs.get(type).map((f) => [up(f.name), defaultFor(f.type, types, depth + 1)])
    ));
  }
  const rowType = types.tables.get(type);
  if (rowType) {
    return types.structs.has(rowType) ? [defaultFor(rowType, types, depth + 1)] : [];
  }
  return scalarDefault(type);
}

const coerceScalar = (raw, type) =>
  ABAP_TRUE.test(raw) ? true
    : ABAP_FALSE.test(raw) ? false
      : isLiteral(raw) ? (NUMERIC.test(type) ? Number(literalText(raw)) || 0 : literalText(raw))
        : isTemplate(raw) ? (NUMERIC.test(type) ? Number(templateText(raw)) || 0 : templateText(raw) ?? '')
          : NUMERIC.test(type) ? Number(raw) : raw;

/* Parse one VALUE #( ... ) region into JS rows, typed by the row's fields.
 * `shape` decides what an unseeded field becomes: with it, the field is
 * present with its initial value and the row is marked as a known shape;
 * without it, the row carries only what the seed actually set. The two are
 * needed for different jobs - see buildModel. */
function parseRows(region, rowType, types, shape = false) {
  const fields = types.structs.get(rowType) || [];
  const fType = (n) => fields.find((f) => f.name.toLowerCase() === n.toLowerCase())?.type || 'string';
  const rows = [];
  let depth = 0;
  let str = null;
  let start = -1;
  for (let i = 0; i < region.length; i++) {
    const c = region[i];
    if (str) {
      // a template's `\{`, `\|` and `\\` are the character, never a boundary
      if (str === '|' && c === '\\') { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '`' || c === "'" || c === '|') { str = c; continue; }
    if (c === '(') { if (depth === 0) start = i + 1; depth++; }
    else if (c === ')') {
      depth--;
      if (depth === 0 && start >= 0) {
        rows.push(region.slice(start, i));
        start = -1;
      }
    }
  }
  /* An ABAP structure always has ALL its fields - a VALUE #( ) seed that
   * sets two of five does not make the other three absent, it leaves them
   * at their initial value. Starting from the field defaults keeps the mock
   * faithful (a binding to an unseeded field renders empty instead of
   * breaking) and marks the row as a KNOWN shape, which is what lets the
   * property gate judge a relative binding path at all. */
  const complete = shape && fields.length > 0;
  return rows.map((rowSrc) => {
    const row = complete
      ? Object.fromEntries(fields.map((f) => [up(f.name), defaultFor(f.type, types)]))
      : {};
    if (complete) markComplete(row);
    const pairRe = new RegExp(String.raw`(\w+)\s*=\s*(${SEED_LITERAL}|VALUE\s+(?:#|\w+)\s*\(|abap_true|abap_false|-?\d+(?:\.\d+)?|\w+)`, 'gi');
    let p;
    while ((p = pairRe.exec(rowSrc)) !== null) {
      const [, name, raw] = p;
      const t = fType(name);
      if (/^VALUE\b/i.test(raw)) {
        const open = rowSrc.indexOf('(', p.index + p[0].length - 1);
        const sub = parenRegion(rowSrc, open);
        if (types.structs.has(t)) {
          // a nested STRUCTURE, not a table: VALUE #( a = 1 b = 2 ) is one
          // row, not a list of them - wrapping it in the parens a row would
          // have makes it parse as exactly that
          row[up(name)] = parseRows(`(${sub.body})`, t, types, shape)[0]
            ?? (shape ? defaultFor(t, types) : {});
        } else {
          const subRow = types.tables.get(t) || t;
          row[up(name)] = parseRows(sub.body, subRow, types, shape);
        }
        pairRe.lastIndex = sub.end + 1;
      } else if (isLiteral(raw)) {
        const text = literalText(raw);
        row[up(name)] = NUMERIC.test(t) ? Number(text) || 0 : text;
      } else if (isTemplate(raw)) {
        // a template without an interpolation is its text; with one, the
        // value is composed at runtime and the field keeps its default
        const text = templateText(raw);
        row[up(name)] = text === null
          ? (shape ? defaultFor(t, types) : scalarDefault(t))
          : NUMERIC.test(t) ? Number(text) || 0 : text;
      } else if (ABAP_TRUE.test(raw)) row[up(name)] = true;
      else if (ABAP_FALSE.test(raw)) row[up(name)] = false;
      else if (/^-?\d/.test(raw)) row[up(name)] = NUMERIC.test(t) ? Number(raw) : raw;
      // bare identifiers (derived values) keep the field default:
      else row[up(name)] = shape ? defaultFor(t, types) : scalarDefault(t);
    }
    return row;
  });
}

function buildModel(content, boundVars, types, vars, notes, shape = false) {
  const model = {};
  // every seed map and lookup is keyed by the lower-cased name: `MT_ROWS =
  // VALUE #( )` seeds the table declared as `mt_rows`
  const scalarSeed = new Map();
  for (const m of content.matchAll(new RegExp(String.raw`^\s*(\w+)\s*=\s*(${SEED_LITERAL}|abap_true|abap_false|-?\d+(?:\.\d+)?)\s*\.\s*$`, 'gmi'))) {
    // a template with an interpolation is a runtime value, not a seed
    if (isTemplate(m[2]) && templateText(m[2]) === null) continue;
    scalarSeed.set(m[1].toLowerCase(), m[2]);
  }
  const tableSeed = new Map();
  for (const m of content.matchAll(/^\s*(\w+)\s*=\s*VALUE\s+(?:#|\w+)\s*\(/gmi)) {
    const open = content.indexOf('(', m.index + m[0].length - 1);
    tableSeed.set(m[1].toLowerCase(), parenRegion(content, open).body);
  }
  // derived seeds like `selected = t_items[ 1 ]-text.`
  const derivedSeed = [...content.matchAll(/^\s*(\w+)\s*=\s*(\w+)\[\s*(\d+)\s*\]-(\w+)\s*\.\s*$/gm)]
    .map((m) => ({ target: m[1].toLowerCase(), table: m[2].toLowerCase(), index: +m[3], field: m[4] }));
  for (const bound of boundVars) {
    const v = bound.toLowerCase();
    const decl = vars.get(v);
    if (!decl) { notes.push(`bound variable ${bound} has no DATA declaration — mocked as string`); model[up(v)] = ''; continue; }
    if (decl.kind === 'table') {
      const rowType = decl.type.startsWith('ty_') && types.structs.has(decl.type)
        ? decl.type : (types.tables.get(decl.type) || decl.type);
      /* An UNSEEDED table (filled in code — `t_pages = t_company.`) gets a
       * declared row in the SHAPE, so binding paths can still be judged, and
       * an EMPTY array in the render model: the same reason a scalar is not
       * invented above. A made-up all-empty row is instantiated by the render
       * gate and then fails strict validation on the first enum or date
       * property (`"" is of type string, expected sap.m.AvatarShape`) —
       * reporting the harness's own row, not the port. */
      model[up(v)] = tableSeed.has(v)
        ? parseRows(tableSeed.get(v), rowType, types, shape)
        : types.structs.has(rowType) && shape
          ? [defaultFor(rowType, types)]
          // scalar-row table bound to an array property: an empty array — a {}
          // row would fail strict property validation
          : [];
    } else if (types.structs.has(decl.type)) {
      /* A bound STRUCTURE: the framework flattens ms_x-field to /MS_X/FIELD,
       * so the model needs the object. Its fields are only known from the
       * type - what a seed assigns to a single component is not followed - so
       * the render model gets an empty object (bindings resolve to the
       * control's default) and the shape gets the declared fields. */
      model[up(v)] = shape ? defaultFor(decl.type, types) : {};
    } else if (shape && !SCALAR_TYPE.test(decl.type) && !decl.type.startsWith('ty_')) {
      // type not declared in this class (DDIC entity, another class's type):
      // shape unknown - accept whatever path the view addresses below it
      model[up(v)] = markUnknown({});
    } else {
      const t = decl.type;
      if (scalarSeed.has(v)) {
        model[up(v)] = coerceScalar(scalarSeed.get(v), t);
      } else if (decl.value != null) {
        model[up(v)] = coerceScalar(decl.value, t);
      } else {
        const d = derivedSeed.find((s) => s.target === v);
        const rows = d && tableSeed.has(d.table)
          ? parseRows(tableSeed.get(d.table),
            (vars.get(d.table)?.kind === 'table' && (types.structs.has(vars.get(d.table).type)
              ? vars.get(d.table).type : types.tables.get(vars.get(d.table).type))) || '', types)
          : null;
        model[up(v)] = rows?.[d.index - 1]?.[up(d.field)] ?? scalarDefault(t);
      }
    }
  }
  return model;
}

// ---------------------------------------------------------------------------
// ABAP class source -> { nodes, docs, model, notes, helperTokens }
// ---------------------------------------------------------------------------
export function prepareAbap(abapSource) {
  const content = scrub(abapSource);
  const notes = [];
  const boundVars = new Set();
  const bindMeta = new Map();
  const resolveExpr = makeResolver(content, boundVars, notes, bindMeta);
  /* Which reconstruction: the linear scanner walks every builder token in file
   * order against ONE cursor. That is exact for a single chain, and wrong the
   * moment the class holds a handle and comes back to it later (a LOOP filling
   * `columns`, a render step handed the container) - the cursor is then
   * wherever the previous statement stopped, so everything after it is
   * silently reparented. The handle-aware path resolves each statement against
   * the handle it is written on, so it is used as soon as the class shows that
   * idiom: a builder-typed method parameter or return, more than one captured
   * handle, or one that a later statement is written on. */
  const d = dialectOf(content);
  const hasBuilderHelper = new RegExp(`(?:RETURNING\\s+VALUE\\(\\w+\\)|\\w+)\\s+${d.handleType}`, 'i').test(content);
  const captured = [...content.matchAll(new RegExp(
    `(?:DATA\\()?(\\w+)\\)?\\s*=\\s*(?:${d.factory}\\(|\\w+\\s*->\\s*(?:${d.open}|${d.leaf}|${d.shut})\\s*\\()`, 'gi'
  ))].map((m) => m[1].toLowerCase());
  /* The linear scanner is wrong as soon as a captured handle starts TWO or
   * more statements: it concatenates them, so a statement that DESCENDS
   * (`page->ele( \`Panel\` )`) leaves the cursor inside itself and the next one
   * is reparented there. abap2UI5/samples app 382 reported a `footer` "nested
   * inside the aggregation content of SimpleForm" that way - the port is
   * correct, the reconstruction was not. Requiring two CAPTURES missed it,
   * because the later uses are not captures.
   *
   * One such statement is still left to the linear scanner: with nothing after
   * it there is nothing to reparent, and the two paths agree on everything
   * except where the cursor is parked at stringify( ). */
  const reuse = captured.length
    ? [...content.matchAll(new RegExp(
      `(?:^|\\.)\\s*(?:${[...new Set(captured)].join('|')})\\s*->\\s*(?:${d.open}|${d.leaf}|${d.shut})\\s*\\(`, 'gmi'
    ))].length
    : 0;
  const structure = [];
  const { docs: nodes, helperTokens } = hasBuilderHelper || captured.length > 1 || reuse > 1
    ? extractDocsWithHelpers(content, resolveExpr, notes, structure, d)
    : extractDocs(content, resolveExpr, notes, structure, d);
  for (const s of structure) {
    if (s.type === 'open-levels') notes.push(`${s.depth} level(s) left open at stringify( ) - harmless, render( ) closes the tree`);
  }
  /* docKinds is index-aligned with docs: how each document is LOADED, taken
   * from the consuming call rather than sniffed from its root tag. undefined
   * where no consumer was in the same statement - the renderer sniffs then. */
  const rendered = nodes.map((n) => ({ xml: toXml(n), kind: n.displayKind })).filter((r) => r.xml);
  const docs = rendered.map((r) => r.xml);
  const docKinds = rendered.map((r) => r.kind);
  const { model, modelShape } = deriveModel(content, boundVars, notes);
  applyOmit(model, bindMeta);
  /* The full paths bound with json = abap_true — the property gate judges a
   * scalar-typed property against them (json-bind-on-scalar-property). */
  const jsonPaths = new Set();
  for (const [, meta] of bindMeta) for (const p of meta.json) jsonPaths.add(p);
  /* Every attribute the class declares, whether or not a view binds it —
   * the model/shape only carry BOUND variables, so this is the one place
   * that knows a name like NAME belongs to the model root. */
  const rootFields = new Set([...parseData(content).keys()].map(up));
  /* What the class itself writes into those fields - the second author of
   * every two-way-bound string. See parseRootWrites( ) for why the model
   * cannot stand in for it. */
  const rootWrites = parseRootWrites(content);
  return {
    nodes, docs, docKinds, model, modelShape, notes, helperTokens, rootFields, rootWrites, jsonPaths,
    structure: structure.filter((s) => !s.note),
    usesBuilder: new RegExp(d.factory, 'i').test(content),
  };
}

/* Mirror the runtime's omit_initial semantics in the RENDER model: a field
 * listed in omit_initial_paths (or any field, under the blanket flag) whose
 * value is initial is not serialized at all, so the control keeps its own
 * default — which is the whole point of the parameter, and exactly what the
 * mock model used to get wrong: it handed the renderer the seeded `''` and
 * strict mode rejected it on the first enum property. The SHAPE keeps every
 * field, so binding paths stay judgeable — the same split unseeded tables
 * already have. */
function applyOmit(model, bindMeta) {
  const initial = (v) => v === '' || v === 0 || v === false;
  const strip = (row, meta) => {
    if (!row || typeof row !== 'object') return;
    for (const k of Object.keys(row)) {
      if ((meta.omitAll || meta.omitPaths.has(k)) && initial(row[k])) delete row[k];
    }
  };
  for (const [root, meta] of bindMeta) {
    if (!meta.omitAll && !meta.omitPaths.size) continue;
    const value = model[root];
    if (Array.isArray(value)) for (const row of value) strip(row, meta);
    else if (value && typeof value === 'object') strip(value, meta);
    else if (meta.omitAll && initial(value)) delete model[root];
  }
}

/* Two views of the same data, for two different jobs.
   *
   * `model` is what the RENDERER gets: only what a seed actually sets. A
   * field the class fills in code (a LOOP in model_init) cannot be followed
   * statically, and inventing an empty string for it makes UI5's strict mode
   * reject a perfectly good view - `state=""` is not a ValueState.
   *
 * `modelShape` is what the property gate ASKS ABOUT: every declared field
 * of every declared structure, so a binding path can be judged against
 * what the row HAS rather than against what the seed happened to set.
 *
 * (Kept as its own function so the two pictures are always built from the
 * same parse of the class.) */
export function deriveModel(content, boundVars, notes) {
  const types = parseTypes(content);
  const vars = parseData(content);
  /* A DATA declared with a NAMED table type is a table too:
   *   TYPES ty_t_x TYPE STANDARD TABLE OF ty_s_x WITH EMPTY KEY.
   *   DATA  t_x    TYPE ty_t_x.
   * parseData only sees the inline `STANDARD TABLE OF` form, so without this
   * the model gets a scalar '' where the view binds an aggregation - and every
   * relative binding in that aggregation's template then looks contextless. */
  for (const [name, decl] of vars) {
    if (decl.kind !== 'table' && (types.tables.has(decl.type) || SCALAR_TABLE_TYPE.test(decl.type))) {
      vars.set(name, { kind: 'table', type: decl.type });
    }
  }
  return {
    model: buildModel(content, boundVars, types, vars, notes),
    modelShape: buildModel(content, boundVars, types, vars, [], true),
  };
}
