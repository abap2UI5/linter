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
 *   a( t = <text> )                             -> the value, braces and
 *                                                  backslashes escaped the
 *                                                  escape_literal( ) way
 *   |...{ expr }...| templates, `lit` && chains -> resolved statically
 */
import { scrub, parenRegion, topSplit, splitStatements, parseNamedArgs, skipWs, wordEnd, ciAt, skipLiteral, blankPragmas, blankLiterals } from './abap.mjs';
import { dialectOf } from './builders.mjs';
import { initPath, methodSpans } from './abap-source.mjs';

export const SKIP = Symbol('skip');
const up = (s) => s.toUpperCase();

/* What `a( t = … )` does to its value before the XML escaping: the builder's
 * own `escape_literal( )` - the backslash first (UI5 unescapes `\\` back to
 * one in EVERY string property), then the braces, which would otherwise start
 * a binding. Mirrored here so a `t` attribute reconstructs to what the
 * running view carries. */
export const escapeLiteral = (s) => String(s).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');

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
/* A `b =` value the builder renders as `false` for certain: a literal that
 * is not `abap_true` - `abap_false`, `space`, a blank character or string
 * literal - read as the first token, since a named `n =` may follow it. */
const LITERAL_FALSE = /^(?:abap_false|space|' ?'|` ?`)(?=\s|$)/i;

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
  const m = s.match(/^client->_bind(_edit|_path)?\(/i);
  if (!m) return null;
  const open = m[0].length - 1;
  const { body, end } = parenRegion(s, open);
  if (end !== s.length - 1) return null; // trailing tokens - not a lone bind call
  /* `_bind_path( x )` is `_bind( val = x path = abap_true )` and nothing
   * else - the interface says so and gives it ONE parameter on purpose. So
   * it is the bare path of the one name it is handed, positional or as
   * `val =`, and any other argument makes it a call that does not compile. */
  const pathForm = /^_path$/i.test(m[1] ?? '');
  let name;
  let bare = pathForm;
  let json = false;
  let omit = null;
  if (/^\s*(?:me->)?\w+(?:-\w+)*\s*$/.test(body)) {
    name = body.trim(); // positional: _bind( var )
  } else if (pathForm) {
    const args = parseNamedArgs(body);
    name = args.val;
    if (!name || !BIND_NAME.test(name) || Object.keys(args).length !== 1) return null;
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
  const statements = splitStatements(content);
  /* SCOPES. A name is a variable of the method it is declared in - an inline
   * `DATA( name )`, a `DATA`/`STATICS`/`CONSTANTS` statement in the body, or
   * a parameter of the method - and an attribute of the class everywhere
   * else. A value the class gives a name is recorded for the scope it is
   * written in, and a name used inside a method is read from that method's
   * own writes when it is one of its variables: `DATA(type) = \`Bogus\`` in
   * main( ) says nothing about the `type` parameter of a helper, and two
   * helpers' `DATA(lv_text) = \`…\`` are two variables. Read class-wide, the
   * last literal anywhere won, whichever method it was in. */
  const spans = methodSpans(blankLiterals(content));
  const scopeAt = (at) => {
    if (at === null || at === undefined) return null;
    let lo = 0;
    let hi = spans.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (at < spans[mid].from) hi = mid - 1;
      else if (at >= spans[mid].to) lo = mid + 1;
      else return mid;
    }
    return -1;
  };
  /* every parameter of every method the class declares, read token by token:
   * a word followed by TYPE or LIKE, `VALUE( r )` and `REFERENCE( r )`
   * included */
  const paramsOf = new Map();
  for (const stmt of statements) {
    const m = stmt.text.match(/^\s*(?:CLASS-)?METHODS\b:?([\s\S]*)$/i);
    if (!m) continue;
    for (const el of topSplit(m[1], ',')) {
      const words = el.split(/[\s()!]+/).filter(Boolean);
      if (!words.length) continue;
      const params = new Set();
      for (let i = 1; i + 1 < words.length; i++) {
        if (/^(?:TYPE|LIKE)$/i.test(words[i + 1]) && /^\w+$/.test(words[i])) params.add(words[i].toLowerCase());
      }
      paramsOf.set(words[0].toLowerCase(), params);
    }
  }
  const scopeOf = statements.map((stmt) => scopeAt(stmt.offset + (stmt.text.length - stmt.text.trimStart().length)));
  const locals = spans.map((span) => new Set(paramsOf.get(span.name) ?? []));
  statements.forEach((stmt, i) => {
    const sc = scopeOf[i];
    if (sc < 0) return;
    for (const m of stmt.text.matchAll(/\b(?:DATA|FINAL)\(\s*(\w+)\s*\)/gi)) locals[sc].add(m[1].toLowerCase());
    const decl = stmt.text.match(/^\s*(?:DATA|STATICS|CONSTANTS)\b\s*:?([\s\S]*)$/i);
    if (decl) {
      for (const el of topSplit(decl[1], ',')) {
        const w = el.trim().match(/^(?:BEGIN\s+OF\s+)?(\w+)/i);
        if (w && !/^END$/i.test(w[1])) locals[sc].add(w[1].toLowerCase());
      }
    }
  });
  const CLASS_SCOPE = -1;
  // a name's own scope where it is used: the method's, if it is a variable of the method
  const ownerOf = (key, sc) => (sc !== null && sc >= 0 && locals[sc].has(key.split('-')[0]) ? sc : CLASS_SCOPE);
  const scopedKey = (owner, key) => `${owner}|${key}`;

  /* `literals` is the class-wide reading - the last literal anywhere -
   * kept for a value with no position (a helper body inlined with its
   * arguments substituted); `literalsIn` the same per scope, with the
   * offset of each write. */
  const literals = new Map();
  const literalsIn = new Map();
  const noteLiteral = (i, key, value) => {
    literals.set(key, value);
    const k = scopedKey(ownerOf(key, scopeOf[i]), key);
    if (!literalsIn.has(k)) literalsIn.set(k, []);
    literalsIn.get(k).push({ at: statements[i].offset, value });
  };
  const assignRe = new RegExp(String.raw`^\s*(?:DATA\()?(\w+)\)?\s*=\s*(${LIT}(?:\s*&&\s*${LIT})*)\s*$`, 'i');
  /* `CONSTANTS name TYPE … VALUE lit.` - also chained, and one level of
   * `BEGIN OF cs … END OF cs` read as `cs-name`: a constant is the one name
   * whose value is certain, and a port keeps its base URL or a status
   * colour in exactly that (`t = c_base_url && \`sample1.jpg\``). */
  const constRe = new RegExp(String.raw`^(\w+)\s+TYPE\s+[\w/=>-]+(?:\s+LENGTH\s+\d+)?\s+VALUE\s+(${LIT})$`, 'i');
  statements.forEach((stmt, i) => {
    const head = stmt.text.match(/^\s*CONSTANTS\b\s*:?/i);
    if (!head) return;
    const scope = [];
    for (const part of topSplit(stmt.text.slice(head[0].length), ',')) {
      const t = part.trim();
      let m;
      if ((m = t.match(/^BEGIN\s+OF\s+(\w+)$/i))) scope.push(m[1].toLowerCase());
      else if (/^END\s+OF\s+\w+$/i.test(t)) scope.pop();
      else if ((m = t.match(constRe)) && scope.length <= 1) noteLiteral(i, [...scope, m[1].toLowerCase()].join('-'), litText(m[2]));
    }
  });
  statements.forEach((stmt, i) => {
    const m = stmt.text.match(assignRe);
    if (!m) return;
    const joined = [...m[2].matchAll(new RegExp(LIT, 'g'))].map((p) => litText(p[0])).join('');
    noteLiteral(i, m[1].toLowerCase(), joined);
  });

  /* A name the class writes exactly ONCE, and that once with a string
   * template (or a `&&` chain of templates, literals and the
   * cl_abap_char_utilities characters - `DATA(line_break) =
   * cl_abap_char_utilities=>newline.`): `DATA(expr) =
   * |\{= $\{ client->_bind( flag ) \} ? 'A' : 'B' \}|.` and then `v = expr` -
   * the way a port spells one expression binding it hands to five controls.
   * The value is the template's, resolved where the name is used, so the
   * attribute is the binding it is at runtime rather than a value dropped as
   * unresolvable (and reported as unchecked). A second write of the name
   * anywhere in the class - another method's local of the same name, a
   * reassignment, `&&=` - makes it a variable again, which stays unresolved. */
  const writes = new Map();
  const templated = new Map();
  const writesIn = new Map();
  const templatedIn = new Map();
  const writeRe = /^\s*(?:DATA\()?(\w+)\)?\s*(&&)?=\s*([\s\S]*)$/i;
  statements.forEach((stmt, i) => {
    const m = stmt.text.match(writeRe);
    if (!m) return;
    const key = m[1].toLowerCase();
    const k = scopedKey(ownerOf(key, scopeOf[i]), key);
    writes.set(key, (writes.get(key) ?? 0) + 1);
    writesIn.set(k, (writesIn.get(k) ?? 0) + 1);
    if (m[2]) return;
    const pieces = topSplit(m[3].trim(), '&&').map((x) => x.trim());
    if (pieces.every((x) => /^\|[\s\S]*\|$/.test(x) || /^cl_abap_char_utilities=>(?:newline|horizontal_tab|cr_lf\(1\))$/i.test(x)
      || new RegExp(`^${LIT}$`).test(x))) {
      templated.set(key, pieces);
      templatedIn.set(k, { pieces, at: stmt.offset });
    }
  });
  /* …and, read without a position, the name is ONE variable: declared once
   * in the class. A method parameter of the same name (`IMPORTING type TYPE
   * string`) or a local declared in another method is a different variable,
   * which the one template does not describe. Counted over every typed
   * declaration (`name TYPE`, `VALUE( name ) TYPE`, `name LIKE`) and every
   * inline `DATA( name )`. With a position the scopes above decide. */
  const declarations = new Map();
  const declare = (name) => declarations.set(name.toLowerCase(), (declarations.get(name.toLowerCase()) ?? 0) + 1);
  for (const m of content.matchAll(/\b(\w+)(?=(?:\s*\))?\s+(?:TYPE|LIKE)\s)/gi)) declare(m[1]);
  for (const m of content.matchAll(/\bDATA\(\s*(\w+)\s*\)/gi)) declare(m[1]);
  const oneVariable = (key) => writes.get(key) === 1 && (declarations.get(key) ?? 0) <= 1;
  /* where the expression being resolved stands - set by resolveExpr( ), moved
   * to a template's own statement while that template is expanded */
  let useAt = null;
  const expanding = new Set();

  /* a template a name was written with, resolved where it was written - and
   * only WHOLE: a piece the scan cannot compute (`|{ tenths DIV 10 }em|`)
   * would leave a guess (`em`) standing for the name, and a guess on a
   * CSS-typed property is a render error the running view does not have */
  const expand = (key, pieces, at) => {
    const outer = useAt;
    const guessedBefore = unresolvedPiece;
    unresolvedPiece = false;
    expanding.add(key);
    if (at !== null) useAt = at;
    try {
      const parts = pieces.map(resolveOne);
      return parts.every((x) => x !== null) && !unresolvedPiece ? parts.join('') : null;
    } finally {
      expanding.delete(key);
      useAt = outer;
      unresolvedPiece = guessedBefore;
    }
  };

  const resolvePiece = (piece) => {
    const p = piece.trim();
    let m;
    if ((m = p.match(/^`((?:[^`]|``)*)`$/s))) return m[1].replace(/``/g, '`');
    if ((m = p.match(/^'((?:[^']|'')*)'$/s))) return charLiteral(m[1]);
    if (/^cl_abap_char_utilities=>newline$/i.test(p)) return '\n';
    if (/^cl_abap_char_utilities=>horizontal_tab$/i.test(p)) return '\t';
    if ((m = p.match(/^cl_abap_char_utilities=>cr_lf\(1\)$/i))) return '\r';
    if ((m = p.match(/^(\w+(?:-\w+)?)$/))) {
      const key = m[1].toLowerCase();
      const sc = scopeAt(useAt);
      if (sc === null) {
        if (literals.has(key)) return literals.get(key);
        if (templated.has(key) && oneVariable(key) && !expanding.has(key)) return expand(key, templated.get(key), null);
        return null;
      }
      const owner = ownerOf(key, sc);
      const k = scopedKey(owner, key);
      const written = literalsIn.get(k);
      if (written) {
        /* an attribute: the last literal the class gives it, as before. A
         * method's variable: the last one written before this use - one
         * written only after it is not its value here */
        let last = written.length - 1;
        if (owner !== CLASS_SCOPE) {
          let lo = 0;
          last = -1;
          for (let hi = written.length - 1; lo <= hi;) {
            const mid = (lo + hi) >> 1;
            if (written[mid].at < useAt) { last = mid; lo = mid + 1; } else hi = mid - 1;
          }
        }
        if (last >= 0) return written[last].value;
      }
      const tpl = templatedIn.get(k);
      if (tpl && writesIn.get(k) === 1 && (owner === CLASS_SCOPE || tpl.at < useAt) && !expanding.has(k)) return expand(k, tpl.pieces, tpl.at);
      // a parameter of the helper being replayed, never written in it: the
      // value this call passes (see inHelperCall)
      if (owner !== CLASS_SCOPE && !writesIn.has(k)) {
        for (let f = frames.length - 1; f >= 0; f--) {
          if (frames[f].scope === owner) return frames[f].values.get(key) ?? null;
        }
      }
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

  /* HELPER PARAMETERS. A void helper the replay enters (`add_row( page = page
   * text = \`Save\` )`) writes its parameter where the view needs a value
   * (`v = text`), and a parameter is the caller's - read on its own it stays
   * unresolved, dropped from the document with the rules that would judge it.
   * During the replay of ONE call the caller is known, so the parameter is
   * the value that call passes, resolved where the call stands (a forwarded
   * parameter through the frame of the helper it is forwarded from) - but
   * only when EVERY call of the helper in the class passes a value that
   * resolves: a call the replay never enters (a `me->` call, a `CALL
   * METHOD`, an argument computed at runtime) says the parameter is a
   * variable after all, and a document showing one caller's value would be
   * judged as if it were the only one. A parameter the helper writes itself
   * stays its own. */
  const frames = []; // [{ scope, values: Map(param -> value) }], innermost last
  const spanOf = (method) => spans.findIndex((sp) => sp.name === method);
  const callCode = blankLiterals(content);
  const quietly = (fn) => {
    const outerAt = useAt;
    const outerGuess = unresolvedPiece;
    const n = notes.length;
    try { return fn(); } finally {
      notes.length = n;
      useAt = outerAt;
      unresolvedPiece = outerGuess;
    }
  };
  // every call of `method` in the class: its argument list and position, or
  // null when one of them is a shape the replay does not enter
  const callsMemo = new Map();
  const callsOf = (method) => {
    if (callsMemo.has(method)) return callsMemo.get(method);
    const name = method.replace(/[^\w]/g, '');
    let calls = [];
    if (new RegExp(`\\bCALL\\s+METHOD\\s+(?:me\\s*->\\s*)?${name}\\b`, 'i').test(callCode)) calls = null;
    else {
      for (const m of callCode.matchAll(new RegExp(`(\\bme\\s*->\\s*|(?<![\\w>~=-]))${name}\\s*\\(`, 'gi'))) {
        const open = m.index + m[0].length - 1;
        calls.push({ at: m.index + m[1].length, viaMe: Boolean(m[1]), args: parseNamedArgs(parenRegion(content, open).body) });
      }
    }
    callsMemo.set(method, calls);
    return calls;
  };
  const resolvableMemo = new Map();
  const resolvable = (method, param, guard = new Set()) => {
    const key = `${method}|${param}`;
    if (resolvableMemo.has(key)) return resolvableMemo.get(key);
    if (guard.has(key)) return false;
    guard.add(key);
    const calls = callsOf(method);
    const ok = Boolean(calls?.length) && calls.every((call) => {
      const arg = call.args[param]?.trim();
      if (!arg || call.viaMe) return false;
      const sc = scopeAt(call.at);
      const caller = sc >= 0 ? spans[sc].name : null;
      // a parameter of the calling method, handed on as it is
      if (/^\w+$/.test(arg) && caller && paramsOf.get(caller)?.has(arg.toLowerCase())
        && !writesIn.has(scopedKey(sc, arg.toLowerCase()))) {
        return resolvable(caller, arg.toLowerCase(), guard);
      }
      // read with no call in progress, so the answer is one per parameter
      const outer = frames.splice(0);
      try {
        return quietly(() => {
          const v = resolveExpr(arg, call.at);
          return v !== SKIP && !unresolvedPiece;
        });
      } finally {
        frames.push(...outer);
      }
    });
    guard.delete(key);
    resolvableMemo.set(key, ok);
    return ok;
  };
  /* Run `fn` - the replay of `method`'s body - with its parameters bound to
   * the values the call at `at` passes (`args`, as parseNamedArgs reads
   * them). The replay's one entry into the frames. */
  const inHelperCall = (method, args, at, fn) => {
    const scope = spanOf(method);
    const values = new Map();
    if (scope >= 0) {
      for (const [param, arg] of Object.entries(args)) {
        if (!paramsOf.get(method)?.has(param) || !resolvable(method, param)) continue;
        const v = quietly(() => {
          const r = resolveExpr(arg, at);
          return r === SKIP || unresolvedPiece ? null : r;
        });
        if (v !== null) values.set(param, v);
      }
    }
    frames.push({ scope, values });
    try { return fn(); } finally { frames.pop(); }
  };

  function resolveExpr(expr, at = null) {
    unresolvedPiece = false;
    useAt = at;
    const e = blankPragmas(expr).trim();
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
    /* `_event_nav_app_leave( )` is the handler expression that LEAVES the app
     * on press (a Page's navButtonPress, a Cancel button) - an event wire like
     * `_event( )` whose action is fixed by the framework, so it raises no
     * event the class has to handle, but it is a handler on the attribute all
     * the same. */
    if (/client->_event\b|client->_event_client\b|client->_event_nav_app_leave\b|client->follow_up_action\b/i.test(e)) return '.eB()';
    // split any && chain FIRST (topSplit is template-aware, so a && inside a
    // |...| template — e.g. an expression binding — never splits)
    const pieces = topSplit(e, '&&').map(resolveOne);
    if (pieces.length && pieces.every((p) => p !== null)) return pieces.join('');
    notes.push(`unresolved value expression dropped: ${e.slice(0, 70)}`);
    return SKIP;
  }
  /* Whether the LAST resolveExpr( ) call had to guess at part of its value. */
  Object.defineProperty(resolveExpr, 'guessed', { get: () => unresolvedPiece });
  resolveExpr.inHelperCall = inHelperCall;
  return resolveExpr;
}

/* The values a conditional expression can take, when every one is written
 * out: `COND #( WHEN … THEN r1 [WHEN … THEN r2] ELSE r3 )` and `SWITCH #( x
 * WHEN … THEN r1 … ELSE r3 )` (any type in place of `#`) whose every result
 * resolves the way a plain value does - a literal, a `&&` chain of them, a
 * name the class assigns one literal, a nested conditional of
 * the same shape - and is not a guess. A branch that raises (`THEN THROW
 * …`) yields nothing and is left out. Null for anything else: no `ELSE` (the
 * initial value is then one of the values too), a `LET … IN`, a result that
 * does not resolve. The notes a failed attempt wrote are taken back - the
 * caller has already noted the whole expression. */
const COND_HEAD = /^(?:COND|SWITCH)\s+[\w#\/~=>-]+\s*\(/i;
const BRANCH_WORD = /(?<![\w-])(WHEN|THEN|ELSE|LET)(?![\w-])/gi;
function literalBranches(expr, resolveExpr, notes, depth = 0, at = null) {
  const e = blankPragmas(String(expr)).trim();
  const head = e.match(COND_HEAD);
  if (!head || depth > 4) return null;
  const { body, end } = parenRegion(e, head[0].length - 1);
  if (e.slice(end + 1).trim()) return null; // `COND #( … ) && \`x\``
  // the keywords at the top level of the body, outside literals and parens
  const blank = blankLiterals(body);
  const words = [];
  let level = 0;
  let last = 0;
  BRANCH_WORD.lastIndex = 0;
  for (let m = BRANCH_WORD.exec(blank); m; m = BRANCH_WORD.exec(blank)) {
    for (let i = last; i < m.index; i++) {
      if (blank[i] === '(') level++;
      else if (blank[i] === ')') level--;
    }
    last = m.index;
    if (level === 0) words.push({ word: m[1].toUpperCase(), at: m.index, after: m.index + m[0].length });
  }
  if (words.some((w) => w.word === 'LET') || !words.some((w) => w.word === 'ELSE')) return null;
  const mark = notes.length;
  const values = [];
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w.word !== 'THEN' && w.word !== 'ELSE') continue;
    const result = body.slice(w.after, k + 1 < words.length ? words[k + 1].at : body.length).trim();
    if (/^THROW(?![\w-])/i.test(result)) continue;
    const nested = COND_HEAD.test(result) ? literalBranches(result, resolveExpr, notes, depth + 1, at) : null;
    if (nested) { values.push(...nested); continue; }
    const v = result ? resolveExpr(result, at) : SKIP;
    if (v === SKIP || resolveExpr.guessed) { notes.length = mark; return null; }
    values.push(v);
  }
  notes.length = mark;
  return values.length ? [...new Set(values)] : null;
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
  /* The same for `$source>/name`: UI5 binds the event's SOURCE control as a
   * ManagedObjectModel, so the first segment is a member of that control -
   * a property, an aggregation, an association - and a typo resolves to
   * undefined with no error anywhere, exactly like a parameter. */
  for (const m of String(raw).matchAll(/\$source>\/(@?\w+)/g)) {
    (target.sourceParams ??= []).push({ name: m[1], member, offset });
  }
}

function addAttr(target, name, value, offset, structure) {
  const first = target.attrs.find(([n]) => n === name);
  if (first) {
    // where the first write is, so a fix can tell a repeat from a conflict
    structure?.push({ type: 'duplicate-property', control: target.name, member: name, offset, ...(Number.isInteger(first[2]) ? { firstOffset: first[2] } : {}) });
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
    /* The arguments by NAME, in whatever order they were written - ABAP
     * passes named parameters in any order, and `a( v = … n = … )` is the
     * call `a( n = … v = … )` is. `v`/`b`/`t` used to be read as everything
     * after their `=` up to the closing paren, so with the name written
     * second the value was `… n = \`value\`` - unresolvable, dropped with a
     * note, and the attribute gone from every gate's view of the class. The
     * splitter is paren- and literal-aware: a `_bind( val = … )` inside the
     * value is not an argument of `a( )`. Each match keeps the regex-match
     * shape the code below reads (`[1]` the value, `[2]` the name). */
    const args = parseNamedArgs(body);
    const argOf = (name) => (args[name] ? [null, args[name]] : null);
    const nameLit = args.n?.match(/^([`'])([^`']*)\1$/);
    const nm = nameLit ? [null, nameLit[1], nameLit[2]] : null;
    const vm = argOf('v');
    /* `a( b = flag )` renders `true`/`false` in the builder itself. Which
     * of the two it is at runtime is not statically knowable, so it
     * reconstructs as `true` — the attribute is validated as a boolean
     * either way, and only the VALUE would differ. Except where the value
     * is a LITERAL that is not `abap_true`: the builder writes
     * `COND #( WHEN b = abap_true THEN \`true\` ELSE \`false\` )`, so
     * `abap_false`, `space` and a blank literal are `false` as surely as
     * `abap_true` is `true` - and reading `enabled="false"` as "true" made
     * a disabled Input an input nobody reads back
     * (editable-control-without-binding on samples-stack app 484). */
    const bm = !vm && d.boolParam ? argOf('b') : null;
    /* `a( t = text )` is `v` with the builder's literal escaping applied: the
     * value resolves like a `v` value and is then escaped the way the class
     * escapes it, so the reconstructed attribute carries what the running
     * view carries. Before this branch a `t` attribute was an "unparsed
     * attribute call" - dropped from the view with nothing but a note. */
    const tm = !vm && !bm && d.textParam ? argOf('t') : null;
    if (!nm || !(vm || bm || tm)) { notes.push(`unparsed attribute call: ${body.slice(0, 60)}`); return; }
    const cur = stack[stack.length - 1];
    const target = cur.children.length ? cur.children[cur.children.length - 1] : cur;
    // an attribute on the bare factory root: there is no element to carry it,
    // and both builders assert on exactly that
    if (target.name === null) {
      structure?.push({ type: 'attribute-without-element', member: nm[2], offset });
      return;
    }
    if (bm) { addAttr(target, nm[2], LITERAL_FALSE.test(bm[1].trim()) ? 'false' : 'true', offset, structure); return; }
    const raw = (vm ?? tm)[1];
    const resolved = resolveExpr(raw, offset);
    const val = tm && resolved !== SKIP ? escapeLiteral(resolved) : resolved;
    /* An attribute whose value cannot be resolved AT ALL - `COND #( … )`,
     * `SWITCH #( … )` - is dropped rather than invented, because a made-up
     * value would be judged as if the author had written it. But the fact
     * that the attribute WAS written is real, and a rule asking only that
     * (is this button named? does this control have a press?) has to be able
     * to see it. Reading a dropped `text` as "no text" reported three
     * correctly labelled buttons as unusable with a screen reader. */
    if (val === SKIP) {
      (target.unresolvedAttrs ??= new Set()).add(nm[2]);
      /* …unless every value it can take is written out: a `COND #( )` or a
       * `SWITCH #( )` whose every branch is a literal - `COND #( WHEN n = 1
       * THEN \`Emphasized\` ELSE \`Default\` )` - has a closed set of
       * values, and each of them can be judged the way a literal is. Kept
       * apart from the document (it still carries neither), as the values
       * the rules judge one by one. */
      const values = literalBranches(raw, resolveExpr, notes, 0, offset);
      if (values) (target.branchValues ??= new Map()).set(nm[2], { values: tm ? values.map(escapeLiteral) : values, offset });
      return;
    }
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
    recordEventParams(target, raw, nm[2], offset);
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

/* A builder chain whose parentheses do not balance. One `)` too many at the
 * end of a chain (`… ) ) ).`) is a syntax error the class does not activate
 * with - and it is also the one defect that takes THIS gate down without a
 * word: splitStatements( ) counts depth, a stray `)` leaves it at -1, the
 * chain's own `.` is no longer a split point and the statement runs on into
 * the next one, so the helper-aware reconstruction reads the chain together
 * with the display call behind it and produces no document at all. Nothing
 * was reported; the run said "no findings". A missing `)` is the same in
 * the other direction: the statement never closes and swallows the rest of
 * the file. Read here, in a scan of its own that RECOVERS at the stray
 * paren, so the finding lands on the chain that carries it. Only a statement
 * with a builder call in it is judged: the rule is about the chain. */
function noteUnbalancedParens(content, d, structure) {
  const chainCall = new RegExp(`->\\s*${d.verbs}\\s*\\(|${d.factory}\\s*\\(`, 'i');
  let depth = 0;
  let start = 0;
  let stray = -1;
  const judge = (end) => {
    if (stray === -1 && depth <= 0) return;
    const text = content.slice(start, end);
    if (!chainCall.test(text)) return;
    structure.push({
      type: 'chain-unbalanced-parens',
      value: stray !== -1 ? 'one ) too many' : 'one ( never closed',
      offset: stray !== -1 ? stray : start + Math.max(0, text.search(/\S/)),
    });
  };
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '`' || c === '|' || c === "'") { i = skipLiteral(content, i) - 1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { if (depth === 0) { if (stray === -1) stray = i; } else depth--; }
    else if (c === '.' && (depth === 0 || i + 1 === content.length || /\s/.test(content[i + 1]))) {
      /* A `.` before a blank ends the statement even inside a parenthesis -
       * parenRegion's rule (abap.mjs): no ABAP call reaches past one. Read as
       * open to the end of the file, an unclosed `(` swallowed every
       * statement behind it, so a second broken chain went unreported and
       * a stray `)` further down was counted off against it. */
      judge(i);
      start = i + 1;
      depth = 0;
      stray = -1;
    }
  }
  if (depth > 0) judge(content.length); // the file ended inside a parenthesis
}

export function extractDocs(content, resolveExpr, notes, structure, d = dialectOf(content)) {
  const docs = [];
  let helperTokens = 0; // builder calls outside any factory chain
  /* The subset of those that BUILD something: a second `view->stringify( )`
   * after the first (the re-display in an `ELSEIF check_on_navigated( )`)
   * is outside a chain too, but it adds nothing to the view, so it does not
   * make the reconstruction incomplete. helperTokens keeps counting it - it
   * decides the render skip, and that is not this change's to move. */
  let unplacedTokens = 0;
  let stack = null;
  const stmts = splitStatements(content);
  const tokenRe = new RegExp(`${d.factory}\\(\\s*\\)|->\\s*${d.verbs}\\s*\\(`, 'gi');
  let m;
  while ((m = tokenRe.exec(content)) !== null) {
    if (!m[1]) {
      stack = [{ name: null, ns: null, attrs: [], children: [], offset: m.index }];
      continue;
    }
    if (!stack) {
      helperTokens++;
      if (d.kindOf(m[1]) !== 'stringify') unplacedTokens++;
      continue;
    }
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
  return { docs, helperTokens, unplacedTokens };
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

/* The parameter names of a signature, lower case: every word that blanks and
 * the word TYPE follow - what `/(\w+)\s+TYPE\b/gi` captured, read word by
 * word where that regex restarted inside every long word. A TYPE that ends
 * one match does not begin the next: `a TYPE TYPE i` names `a` alone. */
function typedNames(sig) {
  const names = [];
  let last = 0;
  for (const w of sig.matchAll(/\w+/g)) {
    if (w.index < last) continue;
    const end = w.index + w[0].length;
    const type = skipWs(sig, end);
    if (type === end || !ciAt(sig, type, 'type') || wordEnd(sig, type + 4) > type + 4) continue;
    names.push(w[0].toLowerCase());
    last = type + 4;
  }
  return names;
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
    const params = typedNames(d[2]);
    const body = bodyOf(name);
    if (!body) continue;
    const resStmt = splitStatements(body.text).find((s) => /^\s*result\s*=/i.test(s.text));
    if (!resStmt) continue;
    const rm = resStmt.text.match(/^\s*result\s*=\s*(\w+)\s*(->[\s\S]*)$/i);
    if (!rm) continue;
    helpers.set(name, { kind: 'chain', entryParam: rm[1].toLowerCase(), bodyChain: rm[2], params });
  }

  // void, taking a handle - the body is replayed against the passed handle.
  // `METHODS name IMPORTING … .` up to the first period, what
  // `/METHODS\s+(\w+)\s+IMPORTING([\s\S]*?)\./gi` read, with the period
  // looked up once per match: that lazy body searched the rest of the source
  // again from every METHODS … IMPORTING no period follows
  let done = 0;
  for (const head of content.matchAll(/METHODS\s+(\w+)\s+IMPORTING/gi)) {
    if (head.index < done) continue;
    const from = head.index + head[0].length;
    const dot = content.indexOf('.', from);
    if (dot < 0) break;
    done = dot + 1;
    const name = head[1].toLowerCase();
    if (helpers.has(name)) continue;
    const sig = content.slice(from, dot);
    if (/RETURNING|EXPORTING|CHANGING/i.test(sig)) continue;
    const entry = sig.match(new RegExp(`(\\w+)\\s+${dialect.handleType}\\b`, 'i'));
    if (!entry) continue;
    const body = bodyOf(name);
    if (!body) continue;
    const params = typedNames(sig);
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
  /* Nothing came out, and builder calls stand in methods the replay never
   * entered: the factory opened in one method, its handle stored in an
   * attribute (`mo_main_page = page.`) and built on or stringified in
   * another (`mo_main_page->stringify( )`) - the host shape of the
   * nested-view samples, where a sub-app created BY NAME builds into the
   * page in between. Which document that is depends on the call order at
   * runtime, so it is not statically reconstructable, and those calls are
   * counted as what they are - builder calls outside any chain the replay
   * can follow - instead of the run reporting "no view reconstructed".
   * Only where nothing came out: a class that does yield a document keeps
   * its render. */
  if (!ctx.docs.length && !ctx.helperTokens) {
    const verbRe = new RegExp(`->\\s*${d.verbs}\\s*\\(`, 'gi');
    methodRe.lastIndex = 0;
    while ((mm = methodRe.exec(content)) !== null) {
      if (factoryRe.test(mm[2]) || helpers.has(mm[1].toLowerCase())) continue;
      ctx.helperTokens += [...mm[2].matchAll(verbRe)].length;
    }
  }
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
  /* IF / CASE nesting. The replay runs every branch, so children added to a
   * held container in two exclusive branches all land in it: an edit-mode
   * and a display-mode row template come out as one template with both sets
   * of cells. Such a container is marked `branched`, so a rule that COUNTS
   * children can stand down instead of reporting the sum of the branches. */
  let branchDepth = 0;
  for (const stmt of splitStatements(text)) {
    const s = stmt.text.trim();
    if (!s) continue;
    if (/^(IF|CASE)\b/i.test(s)) branchDepth++;
    else if (/^(ENDIF|ENDCASE)\b/i.test(s)) branchDepth = Math.max(0, branchDepth - 1);
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
      const held = handles.get(lc(m[1]));
      if (branchDepth > 0 && held.length) held[held.length - 1].branched = true;
      processChain(m[2], held.slice(), resolveExpr, notes, structure, tail(m[2]), d);
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
        // the helper's parameters are the values THIS call passes
        const replay = () => runStatements(h.body, h.bodyBase, inner, ctx);
        if (resolveExpr.inHelperCall) resolveExpr.inHelperCall(lc(m[1]), args, at, replay);
        else replay();
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

/* Iterative, like every walk over a tree (tree.mjs): a closing tag waits on
 * the stack as a string while the children above it are written. */
export function toXml(root) {
  const out = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === 'string') { out.push(node); continue; }
    if (node.name !== null) {
      const q = node.ns ? `${node.ns}:${node.name}` : node.name;
      const attrs = node.attrs.map(([n, v]) => ` ${n}="${XML_ESC(v)}"`).join('');
      if (!node.children.length) { out.push(`<${q}${attrs}/>`); continue; }
      out.push(`<${q}${attrs}>`);
      pending.push(`</${q}>`);
    }
    for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
  }
  return out.join('');
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

/* The fields of one structure body: `name TYPE type`, then optionally
 * `LENGTH n`, `DECIMALS n`, `VALUE …` and `READ-ONLY`, up to a comma or a
 * period. What the regex
 *
 *   /(\w+)\s+TYPE\s+([\w~ ]+?(?:=>[\w~]+)?)\s*(?:LENGTH\s+\d+)?\s*(?:DECIMALS\s+\d+)?\s*
 *    (?:VALUE\s+(?:IS INITIAL|`(?:[^`]|``)*`|'(?:[^']|'')*'|abap_true|abap_false|-?\d+(?:\.\d+)?))?
 *    \s*(?:READ-ONLY\s*)?[,.]/gi
 *
 * matched, as match-shaped objects (`index`, `[1]` the name, `[2]` the type as
 * written), read by hand: the regex restarted inside every long word, and it
 * shared the blanks of a type no comma closes out between the lazy type and
 * the `\s*` after it in every way there is (CodeQL js/polynomial-redos).
 *
 * Its reading is kept to the letter, quirks included. The type is the
 * SHORTEST run of word characters, `~` and spaces - with one `=>name` at its
 * end, as long a name as the rest still follows - after which the rest
 * parses: `c LENGTH 10` types `c`, `ref to data` stays whole, `a TYPE b c
 * TYPE d,` is ONE field `a` of type `b c TYPE d`, and a type word that ends
 * in a keyword splits (`zvalue 5,` is type `z` with the value 5). When the
 * type cannot start where the blanks after TYPE end, it may begin with the
 * last space among them (`a TYPE  ,` is a field of type ` `). A number whose
 * fraction the rest does not follow ends at its own period. */
function fieldMatches(s) {
  const n = s.length;
  const isDigit = (c) => c >= '0' && c <= '9';
  const digitsEnd = (i) => { while (i < n && isDigit(s[i])) i++; return i; };
  const isType = (c) => c === ' ' || c === '~' || /\w/.test(c ?? '');
  const nameEnd = (i) => { while (i < n && (s[i] === '~' || /\w/.test(s[i]))) i++; return i; };
  // `\s*(?:READ-ONLY\s*)?[,.]` from i: the offset after the comma or period, or -1
  const close = (i) => {
    i = skipWs(s, i);
    if (ciAt(s, i, 'read-only')) i = skipWs(s, i + 9);
    return s[i] === ',' || s[i] === '.' ? i + 1 : -1;
  };
  // a `…` or '…' literal from its opening delimiter, a doubled one inside it
  // kept: the offset after it, or -1 when it is never closed
  const literalEnd = (i) => {
    for (let k = i + 1; k < n; k++) {
      if (s[k] !== s[i]) continue;
      if (s[k + 1] === s[i]) { k++; continue; }
      return k + 1;
    }
    return -1;
  };
  // the value after `VALUE `, its alternatives in the regex's order - no two
  // of them start alike, so the first that fits is the only one
  const valueClose = (i) => {
    if (ciAt(s, i, 'is initial')) return close(i + 10);
    if (s[i] === '`' || s[i] === "'") { const e = literalEnd(i); return e < 0 ? -1 : close(e); }
    if (ciAt(s, i, 'abap_true')) return close(i + 9);
    if (ciAt(s, i, 'abap_false')) return close(i + 10);
    const from = s[i] === '-' ? i + 1 : i;
    const int = digitsEnd(from);
    if (int === from) return -1;
    if (s[int] === '.' && isDigit(s[int + 1])) {
      const e = close(digitsEnd(int + 1));
      return e >= 0 ? e : int + 1;
    }
    return close(int);
  };
  // everything after the type, from i: the offset after the comma or period,
  // or -1. Each clause is told by its first letter, so none of them can be
  // skipped once its keyword stands there.
  const tails = new Map();
  const tail = (i) => {
    i = skipWs(s, i);
    if (!tails.has(i)) {
      let at = i;
      let e;
      for (const kw of ['length', 'decimals']) {
        if (e !== undefined || !ciAt(s, at, kw)) continue;
        const d = skipWs(s, at + kw.length);
        const end = digitsEnd(d);
        if (d === at + kw.length || end === d) e = -1;
        else at = skipWs(s, end);
      }
      if (e === undefined && ciAt(s, at, 'value')) {
        const v = skipWs(s, at + 5);
        e = v === at + 5 ? -1 : valueClose(v);
      }
      tails.set(i, e ?? close(at));
    }
    return tails.get(i);
  };
  // the type ending at p: `=>name` first, longest name first, then p itself
  const endsAt = (p) => {
    if (s[p] === '=' && s[p + 1] === '>') {
      for (let q = nameEnd(p + 2); q > p + 2; q--) {
        const e = tail(q);
        if (e >= 0) return { p, tEnd: q, end: e };
      }
    }
    const e = tail(p);
    return e >= 0 ? { p, tEnd: p, end: e } : null;
  };
  // the shortest type from t0 inside its run of type characters, the search
  // kept per run: a later field in the same run starts it where it stopped
  let run = { from: -1, to: -1 };
  let scan = null;
  const shortest = (t0) => {
    if (t0 < run.from || t0 >= run.to) {
      let to = t0;
      while (to < n && isType(s[to])) to++;
      run = { from: t0, to };
    }
    if (run.to === t0) return null;
    if (scan && scan.to === run.to && scan.from <= t0 + 1 && (!scan.hit || t0 + 1 <= scan.hit.p)) return scan.hit;
    let hit = null;
    for (let p = t0 + 1; p <= run.to;) {
      if (s[p] === ' ') {
        // the rest parses alike from every space of a run: from its end
        const e = tail(p);
        if (e >= 0) { hit = { p, tEnd: p, end: e }; break; }
        while (s[p] === ' ') p++;
        continue;
      }
      hit = endsAt(p);
      if (hit) break;
      p++;
    }
    scan = { from: t0 + 1, to: run.to, hit };
    return hit;
  };
  const out = [];
  let last = 0;
  for (const w of s.matchAll(/\w+/g)) {
    if (w.index < last) continue;
    const kw = skipWs(s, w.index + w[0].length);
    if (kw === w.index + w[0].length || !ciAt(s, kw, 'type')) continue;
    const b = kw + 4;
    const t0 = skipWs(s, b);
    if (t0 === b) continue;
    let hit = shortest(t0);
    let from = t0;
    if (!hit) {
      // `\s+` after TYPE gives back blanks down to one: the type may then
      // begin with the last space among them
      let k = t0 - 1;
      while (k > b && s[k] !== ' ') k--;
      if (k > b) {
        from = k;
        if (k === t0 - 1) hit = endsAt(t0);
        else {
          const e = tail(t0);
          hit = e >= 0 ? { p: k + 1, tEnd: k + 1, end: e } : null;
        }
      }
    }
    if (!hit) continue;
    out.push({ index: w.index, 1: w[0], 2: s.slice(from, hit.tEnd) });
    last = hit.end;
  }
  return out;
}
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
    structs.set(key, fieldMatches(m[2]).map(fieldOf));
    out = `${out.slice(0, m.index)}${m[1]} TYPE ${key},${out.slice(m.index + m[0].length)}`;
  }
  return out;
}

/* The BEGIN OF … END OF blocks of a source, in either statement form, as
 * match-shaped objects (`[1]` the name, `[2]` the body):
 *
 *   ','  `BEGIN OF name [READ-ONLY], … END OF name` - what
 *        /BEGIN OF (\w+)(?:\s+READ-ONLY)?\s*,([\s\S]*?)END OF \1\b/gi matched
 *   '.'  `BEGIN OF name. … [DATA] END OF name.` - what
 *        /BEGIN OF (\w+)\s*\.([\s\S]*?)(?:DATA\s+)?END OF \1\s*\./gi matched
 *
 * Each BEGIN takes the first END of its own name (any case) after its comma
 * or period, and a BEGIN inside a block already taken belongs to that block.
 * The lazy body with its backreference found the same, but searched the rest
 * of the source again from every BEGIN whose END never came; the markers are
 * paired in one pass instead, as collapseInlineStructures in abap-rules.mjs
 * does. The name is read after each marker, not by it: `END OF BEGIN OF x`
 * holds two. */
function structureBlocks(content, form) {
  const marks = [];
  for (const k of content.matchAll(/(BEGIN|END) OF /gi)) {
    const at = k.index + k[0].length;
    const end = wordEnd(content, at);
    if (end > at) marks.push({ begin: k[1].toUpperCase() === 'BEGIN', index: k.index, name: content.slice(at, end), nameEnd: end });
  }
  const ends = new Map();
  for (const m of marks) {
    if (m.begin) continue;
    const close = { at: m.index, dataAt: -1, to: m.nameEnd };
    if (form === '.') {
      const dot = skipWs(content, m.nameEnd);
      if (content[dot] !== '.') continue;
      close.to = dot + 1;
      // `DATA END OF name.`: the body stops before the DATA
      let ws = m.index;
      while (ws > 0 && /\s/.test(content[ws - 1])) ws--;
      if (ws < m.index && ciAt(content, ws - 4, 'data')) close.dataAt = ws - 4;
    }
    const key = m.name.toLowerCase();
    if (!ends.has(key)) ends.set(key, { list: [], next: 0 });
    ends.get(key).list.push(close);
  }
  const blocks = [];
  let done = 0;
  for (const m of marks) {
    if (!m.begin || m.index < done) continue;
    let at = skipWs(content, m.nameEnd);
    if (form === ',' && at > m.nameEnd && ciAt(content, at, 'read-only')) at = skipWs(content, at + 9);
    if (content[at] !== form) continue;
    const bodyAt = at + 1;
    const e = ends.get(m.name.toLowerCase());
    if (!e) continue;
    while (e.next < e.list.length && e.list[e.next].at < bodyAt) e.next++;
    if (e.next === e.list.length) continue;
    const close = e.list[e.next];
    blocks.push({ index: m.index, 1: m.name, 2: content.slice(bodyAt, close.dataAt >= bodyAt ? close.dataAt : close.at) });
    done = close.to;
  }
  return blocks;
}

function parseTypes(content) {
  const structs = new Map(); // ty_s_x -> [{name, type}]
  const seq = { n: 0 };      // names for lifted nested structures - see liftNested
  /* `READ-ONLY` may sit between the name and the comma - an inline
   * `DATA: BEGIN OF error READ-ONLY, … END OF error.` is a structure like any
   * other, and without it every binding path through such a field reads as
   * "the model has no such path" (see parseData). */
  /* The END's name is compared whole (structureBlocks; the regex had `\b`
   * after its backreference), or the body stops at the wrong END:
   * `BEGIN OF ms_data, BEGIN OF ms_data2, … END OF ms_data2, … END OF ms_data.`
   * has `END OF ms_data` as a PREFIX of `END OF ms_data2`, so without it the
   * outer structure ends at the inner one's close and keeps only the fields
   * written after it. */
  for (const m of structureBlocks(content, ',')) {
    // the type may be qualified (z2ui5_cl_x=>ty_t_y, if_x~ty_z) - dropping
    // such a field would make every binding path through it look wrong
    /* An inline structure carries per-field defaults (`type TYPE string VALUE
     * \`None\`,`, `text TYPE string VALUE IS INITIAL,`), which a named TYPES
     * block cannot. Without the VALUE tail the whole field is dropped and the
     * path through it reads as unknown. */
    const body = liftNested(m[2], structs, seq);
    structs.set(m[1].toLowerCase(), fieldMatches(body).map(fieldOf));
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
  for (const m of structureBlocks(content, '.')) {
    const fields = [];
    for (const line of m[2].split('\n')) {
      const inc = /^\s*INCLUDE\s+(?:TYPE|STRUCTURE)\s+(\w+)\s*\./i.exec(line);
      if (inc) { fields.push({ include: inc[1].toLowerCase() }); continue; }
      for (const f of fieldMatches(line)) fields.push(fieldOf(f));
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

/* The literal scalar seeds of a source text: `name = <literal>.`, keyed by
 * the lower-cased name, the last one winning. */
function scalarSeeds(text) {
  /* `^[^\S\r\n]*`, the line's own indentation, and never `^\s*` under /m:
   * that let every blank line start a scan over all the blank lines behind
   * it, quadratic in a run of them (100,000 took minutes). The matches are
   * the same - the last line start before the name still anchors one. */
  const seeds = new Map();
  for (const m of text.matchAll(new RegExp(String.raw`^[^\S\r\n]*(\w+)\s*=\s*(${SEED_LITERAL}|abap_true|abap_false|-?\d+(?:\.\d+)?)\s*\.\s*$`, 'gmi'))) {
    // a template with an interpolation is a runtime value, not a seed
    if (isTemplate(m[2]) && templateText(m[2]) === null) continue;
    seeds.set(m[1].toLowerCase(), m[2]);
  }
  return seeds;
}

/* The scalars a source text WRITES with something other than a literal - an
 * expression, a method result, a SELECT, an IMPORTING/CHANGING actual. Their
 * value is a runtime matter: a start-path model that found no literal for
 * one of them must not conclude the attribute is still initial. */
function scalarWrites(text) {
  const out = new Set();
  const add = (name) => out.add(name.toLowerCase());
  const literal = new RegExp(String.raw`^\s*\w+\s*=\s*(?:${SEED_LITERAL}|abap_true|abap_false|-?\d+(?:\.\d+)?)\s*\.\s*$`, 'i');
  for (const m of text.matchAll(/^([^\S\r\n]*(?:me->)?(\w+)\s*(?:=(?!=)|\?=)).*$/gmi)) {
    const rhs = m[0].replace(/^[^=]*=\s*/, '').replace(/\s*\.\s*$/, '');
    if (!literal.test(m[0]) || (isTemplate(rhs) && templateText(rhs) === null)) add(m[2]);
  }
  for (const m of text.matchAll(/\bINTO\s+(?:TABLE\s+)?@?\s*(?:DATA\(\s*)?(?:me->)?(\w+)/gi)) add(m[1]);
  for (const m of text.matchAll(/\b(?:IMPORTING|CHANGING|RECEIVING)\b([^.]*)/gi)) {
    for (const a of m[1].matchAll(/\b\w+\s*=\s*(?:me->)?(\w+)/g)) add(a[1]);
  }
  for (const m of text.matchAll(/\b(?:MOVE|ASSIGN)\b[^.]*\bTO\s+(?:me->)?(\w+)/gi)) add(m[1]);
  return out;
}

/* `init`, when given, is the class's start path (initPath( ) in
 * abap-source.mjs) and turns this into the model of the FIRST display: a
 * scalar takes its literal seed from the start path, then its declared
 * VALUE, and only a scalar the start path writes some other way keeps the
 * class-wide guess. Everything else stays initial - which is what an
 * attribute that only an event handler fills really is when the view is
 * first shown, and what the class-wide model hid by borrowing the handler's
 * value (samples-stack app 013: a MessageStrip type seeded `Error` in a CATCH
 * block, rendered with it, and shipped as "" on every start). Tables are
 * left as they are: a row the class builds at runtime is judged by
 * enum-field-unset-on-insert, and an empty array has no binding to resolve. */
function buildModel(content, boundVars, types, vars, notes, shape = false, init = null) {
  const model = {};
  // every seed map and lookup is keyed by the lower-cased name: `MT_ROWS =
  // VALUE #( )` seeds the table declared as `mt_rows`
  const scalarSeed = scalarSeeds(content);
  const initText = init ? init.spans.map((s) => content.slice(s.from, s.to)).join('\n.\n') : null;
  const initSeed = init ? scalarSeeds(initText) : null;
  const initWrites = init ? scalarWrites(initText) : null;
  const tableSeed = new Map();
  /* VALUE spelt in either case without the `i` flag: under it, CodeQL reads
   * the negated class [^\S\r\n] as overlapping \w and reports the scan as
   * polynomial on a line of letters. Nothing else here has a case. */
  for (const m of content.matchAll(/^[^\S\r\n]*(\w+)\s*=\s*[Vv][Aa][Ll][Uu][Ee]\s+(?:#|\w+)\s*\(/gm)) {
    const open = content.indexOf('(', m.index + m[0].length - 1);
    tableSeed.set(m[1].toLowerCase(), parenRegion(content, open).body);
  }
  // derived seeds like `selected = t_items[ 1 ]-text.`
  const derivedSeed = [...content.matchAll(/^[^\S\r\n]*(\w+)\s*=\s*(\w+)\[\s*(\d+)\s*\]-(\w+)\s*\.\s*$/gm)]
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
      /* A type this class does not declare and ABAP does not build in - a
       * DDIC type, or one owned by another class (`zcl_x=>ty_t_token`).
       * Whether it is a string, a structure or a table is not knowable from
       * this source, so without a seed the RENDER model leaves the variable
       * out and the control keeps its default. It used to get the '' of a
       * string, and strict validation rejects that on every property that is
       * not one: `"" is of type string, expected object for property
       * "addedTokens"` (abap2UI5-addons/popups sample_19, whose table type
       * lives in z2ui5_cl_popup_context). The shape above marks the same
       * variable unknown, so no binding path below it is judged either. */
      const foreign = !SCALAR_TYPE.test(t) && !t.startsWith('ty_');
      if (init && !foreign && !initWrites.has(v)) {
        if (initSeed.has(v)) model[up(v)] = coerceScalar(initSeed.get(v), t);
        else if (decl.value != null) model[up(v)] = coerceScalar(decl.value, t);
        else {
          model[up(v)] = scalarDefault(t);
          // nothing on the start path gives it a value: initial on first display
          init.initial.add(up(v));
        }
      } else if (scalarSeed.has(v)) {
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
        const seeded = rows?.[d.index - 1]?.[up(d.field)];
        if (seeded !== undefined) model[up(v)] = seeded;
        else if (!foreign) model[up(v)] = scalarDefault(t);
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
  /* Both reads start at a word boundary: a `\w+` begun inside a word ends
   * where the one begun at its start ends, so the match is the same - the
   * unanchored form only tried every letter first. */
  const hasBuilderHelper = new RegExp(`\\b(?:RETURNING\\s+VALUE\\(\\w+\\)|\\w+)\\s+${d.handleType}`, 'i').test(content);
  const captured = [...content.matchAll(new RegExp(
    `\\b(?:DATA\\()?(\\w+)\\)?\\s*=\\s*(?:${d.factory}\\(|\\w+\\s*->\\s*(?:${d.open}|${d.leaf}|${d.shut})\\s*\\()`, 'gi'
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
      `(?:^[^\\S\\r\\n]*|\\.\\s*)(?:${[...new Set(captured)].join('|')})\\s*->\\s*(?:${d.open}|${d.leaf}|${d.shut})\\s*\\(`, 'gmi'
    ))].length
    : 0;
  const structure = [];
  noteUnbalancedParens(content, d, structure);
  const { docs: nodes, helperTokens, unplacedTokens = helperTokens } = hasBuilderHelper || captured.length > 1 || reuse > 1
    ? extractDocsWithHelpers(content, resolveExpr, notes, structure, d)
    : extractDocs(content, resolveExpr, notes, structure, d);
  for (const s of structure) {
    if (s.type === 'open-levels') notes.push(`${s.depth} level(s) left open at stringify( ) - harmless, render( ) closes the tree`);
  }
  /* docKinds is index-aligned with docs: how each document is LOADED, taken
   * from the consuming call rather than sniffed from its root tag. undefined
   * where no consumer was in the same statement - the renderer sniffs then. */
  const { model, modelShape, init, initModel, initModelShape } = deriveModel(content, boundVars, notes);
  applyOmit(model, bindMeta);
  if (initModel) applyOmit(initModel, bindMeta);
  /* Which documents the FIRST display shows: those built on the start path
   * (initPath( )). They are judged and rendered against initModel; every
   * other document - a popup built in an event handler, a view that only a
   * later roundtrip displays - keeps the class-wide model, since the handler
   * that fills its attributes has run by the time it is shown. */
  const onInit = (n) => Boolean(init && typeof n.offset === 'number'
    && init.spans.some((s) => n.offset >= s.from && n.offset < s.to));
  const nodeOnInit = nodes.map(onInit);
  const rendered = nodes.map((n, i) => ({ xml: toXml(n), kind: n.displayKind, onInit: nodeOnInit[i] })).filter((r) => r.xml);
  const docs = rendered.map((r) => r.xml);
  const docKinds = rendered.map((r) => r.kind);
  const docOnInit = rendered.map((r) => r.onInit);
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
    nodes, docs, docKinds, model, modelShape, notes, helperTokens, unplacedTokens, rootFields, rootWrites, jsonPaths,
    initModel, initModelShape, initialFields: init?.initial ?? new Set(), nodeOnInit, docOnInit,
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
  const init = initPath(content);
  if (init) init.initial = new Set();
  return {
    model: buildModel(content, boundVars, types, vars, notes),
    modelShape: buildModel(content, boundVars, types, vars, [], true),
    init,
    initModel: init ? buildModel(content, boundVars, types, vars, [], false, init) : null,
    initModelShape: init ? buildModel(content, boundVars, types, vars, [], true, init) : null,
  };
}
