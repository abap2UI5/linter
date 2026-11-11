import { defineRule } from '../rule.mjs';
import { BINDING_VOCAB, DATA_NAME, NON_TEXT_TYPE, VERBATIM_ATTRIBUTE, staticAttributes } from '../abap-helpers.mjs';
import { methodSpans } from '../abap-source.mjs';
import { namedArgMarks, parenRegion, splitStatements, topSplit } from '../abap.mjs';
import { builderOfVerb } from '../builders.mjs';
import { propertyDecl } from '../properties.mjs';

function check({ src, d, boolVars, report, data = null }) {
  /* The page bootstraps with complex binding syntax, so a `{` in an
   * attribute value is a BINDING to UI5, never text: a search string the user
   * typed, rendered into a title through `v =`, is resolved as a path into
   * the view model (or, as `{= … }`, evaluated as an expression) instead of
   * shown. The builder's `t` parameter is the way out: it applies
   * `escape_literal( )` to the whole value, so what carries data is written
   * as `a( t = … )` and what carries binding vocabulary stays on `v`.
   *
   * What is judged is the ORIGIN of the value, which is the half the roadmap
   * said no view-side test can see and which this one reads out of the class:
   *   - a `|…|` template that interpolates something (a bare `|text|` is a
   *     constant like a backtick literal) and shows no binding vocabulary,
   *   - a bare name (a variable, an attribute, a record field, a field symbol
   *     component) whose assignments in this class - every statement that
   *     writes the name, a seed row included - show no binding vocabulary. A
   *     name nothing in the class assigns is data by definition: a loop row,
   *     a public attribute the client writes back, a method parameter,
   *   - `CONV string( name )` and `name && \`literal\`` chains, judged by
   *     their names the same way.
   * Deliberately NOT judged: a literal or a chain of literals (a constant
   * needs no escaping, and the corpus writes thousands), a method call or a
   * COND/SWITCH (the origin is not one name), an ABAP boolean (that is
   * unconverted-abap-boolean's), and any value that carries the vocabulary
   * above - assembling a binding in a variable and passing it through `v` is
   * exactly what `v` is for, and reporting it would drown the finding that
   * matters. The corpus check is the guard: samples, samples-controls and
   * samples-stack report nothing under this rule after their migration.
   *
   * The fix is the parameter NAME, exactly like the boolean rule: `v`
   * becomes `t`, the value stays as written - the builder escapes it. */
  if (!d.textParam) return;

  /* every statement that writes a name: `name = …`, `DATA(name) = …`, a
   * `VALUE #( … name = … )` seed component, a `CONSTANTS name … VALUE …`,
   * and the statements that BUILD a string in place - `name &&= …`,
   * `CONCATENATE … INTO name`, `REPLACE … IN name WITH …`. Read per
   * statement so a multi-line template or COND is judged whole. A building
   * statement is marked `assembling`: a brace literal in it is a binding
   * being put together, not a value that happens to hold one. */
  const namesOf = (token) => {
    const t = token.replace(/^me->/i, '');
    const parts = t.split(/->|-/).map((p) => p.replace(/^<|>$/g, ''));
    return [parts[0], parts[parts.length - 1]];
  };
  const writes = new Map();
  const noteWrite = (name, text, assembling = false) => {
    const key = name.toLowerCase();
    if (!writes.has(key)) writes.set(key, []);
    writes.get(key).push({ text, assembling });
  };
  const noteTarget = (token, text, assembling) => {
    for (const name of new Set(namesOf(token).map((n) => n.toLowerCase()))) noteWrite(name, text, assembling);
  };
  const TARGET = String.raw`(?:DATA\(\s*)?((?:me->)?(?:<\w+>|\w+)(?:(?:-|->)\w+)*)`;
  const headWrite = new RegExp(String.raw`^\s*${TARGET}\s*(?:\)\s*)?(&&)?=(?![>=])`, 'i');
  const concatInto = new RegExp(String.raw`^\s*CONCATENATE\b[\s\S]*\bINTO\s+${TARGET}`, 'i');
  const replaceIn = new RegExp(String.raw`^\s*REPLACE\b[\s\S]*?\b(?:IN|OF)\s+${TARGET}\s+WITH\b|^\s*REPLACE\b[\s\S]*\bINTO\s+${TARGET}`, 'i');
  const attCall = new RegExp(`->\\s*(?:${d.att})\\s*\\(`, 'i');
  for (const stmt of splitStatements(src)) {
    const text = stmt.text;
    if (attCall.test(text)) continue; // a builder call is a read, not a write
    for (const m of text.matchAll(/(?:^|[\s(])(?:DATA\()?(\w+)\)?\s*=(?![>=])/g)) noteWrite(m[1], text);
    const decl = text.match(/^\s*(?:CONSTANTS|CLASS-DATA|DATA)\s+(\w+)\s+[\s\S]*\bVALUE\b/i);
    if (decl) noteWrite(decl[1], text);
    let m;
    // `me->mv_x = …`, `ls_row-f = …` and `x &&= …`: targets the scan above does not reach
    if ((m = text.match(headWrite))) noteTarget(m[1], text, Boolean(m[2]));
    if ((m = text.match(concatInto))) noteTarget(m[1], text, true);
    if ((m = text.match(replaceIn))) noteTarget(m[1] ?? m[2], text, true);
  }

  /* Does a write carry binding vocabulary? Directly: the vocabulary above,
   * or - in a statement that assembles a string (`CONCATENATE`, `&&=`,
   * `REPLACE`, an operand of `&&`) - a literal holding a brace: the
   * `{path:'` … `'}` around a `_bind( path = abap_true )` result. A lone
   * brace literal assigned whole (`label = \`{/X}\``) is NOT one: that is a
   * value holding a brace, the case this rule exists for. Transitively: a
   * name the statement reads whose own writes carry it - the path a
   * `_bind( )` returned, concatenated into the binding info one statement
   * later. Found live: `CONCATENATE \`{path:'\` lv_path \`'}\` INTO lv_bind`
   * was read as a name nothing writes, and `--fix` moved it onto `t`, which
   * escaped the Tree's `items` binding into text. */
  const LITERALS = /\|(?:[^|\\]|\\.)*\||`(?:[^`]|``)*`|'(?:[^']|'')*'/g;
  const assemblesBinding = ({ text, assembling }) => {
    if (BINDING_VOCAB.test(text)) return true;
    for (const lit of text.matchAll(LITERALS)) {
      if (lit[0][0] === '|' || !/[{}]/.test(lit[0])) continue;
      if (assembling) return true;
      const before = text.slice(0, lit.index).trimEnd();
      const after = text.slice(lit.index + lit[0].length).trimStart();
      if (before.endsWith('&&') || after.startsWith('&&')) return true;
    }
    return false;
  };
  const NOT_A_READ = new Set(['data', 'final', 'value', 'conv', 'cond', 'switch', 'exact', 'ref', 'new', 'corresponding',
    'when', 'then', 'else', 'others', 'and', 'or', 'not', 'is', 'initial', 'bound', 'concatenate', 'lines', 'of',
    'into', 'separated', 'by', 'respecting', 'blanks', 'in', 'character', 'byte', 'mode', 'replace', 'all', 'first',
    'occurrences', 'occurrence', 'regex', 'pcre', 'substring', 'section', 'offset', 'length', 'with', 'ignoring',
    'case', 'table', 'type', 'like', 'string', 'me', 'let', 'for', 'base', 'where', 'index']);
  /* the names a write reads: outside literals (a template's `{ … }` parts
   * are read), neither a target nor a component written in it, no call, no
   * keyword */
  const readsOf = (text) => {
    const bare = text.replace(LITERALS, (lit) => (lit[0] !== '|' ? ' '
      : ` ${[...lit.matchAll(/(?<!\\)\{([^{}]*)\}/g)].map((x) => x[1].replace(LITERALS, ' ')).join(' ')} `));
    const reads = new Set();
    for (const t of bare.matchAll(/(?<![\w>=-])(?:me->)?(?:<\w+>|\w+)(?:(?:-|->)\w+)*(?!\s*(?:=(?!=)|\(|#)|[\w-])/gi)) {
      for (const n of namesOf(t[0])) if (!NOT_A_READ.has(n.toLowerCase())) reads.add(n.toLowerCase());
    }
    return reads;
  };
  const bindingNames = new Map(); // name -> verdict, decided once
  const carriesBinding = (name, seen = new Set()) => {
    const key = name.toLowerCase();
    if (bindingNames.has(key)) return bindingNames.get(key);
    if (seen.has(key)) return false; // a reachability walk: each name once
    const top = seen.size === 0;
    seen.add(key);
    const own = writes.get(key) ?? [];
    const verdict = own.some(assemblesBinding)
      || own.some((w) => [...readsOf(w.text)].some((r) => r !== key && carriesBinding(r, seen)));
    // a `false` reached inside the walk may still depend on a name above it
    if (verdict || top) bindingNames.set(key, verdict);
    return verdict;
  };
  const isBool = (token) => {
    const name = token.replace(/^me->/i, '');
    return /^abap_(true|false|undefined)$/i.test(name) || (/^\w+$/.test(name) && boolVars.has(name.toUpperCase()));
  };
  const LITERAL = /^(?:`(?:[^`]|``)*`|'(?:[^']|'')*')$/;

  /* A CONSTANTS is a literal with a name, never data: its one write is the
   * declaration, and nothing at runtime can put a brace into it. The write
   * map above saw the declaration as an assignment without binding
   * vocabulary and judged `v = c_icon_size` as text on ten lines of
   * abap2UI5's own start app. A structured constant counts by its root. */
  const constants = new Set([...staticAttributes(src)].filter(([, k]) => k === 'CONSTANTS').map(([n]) => n));
  const isConstant = (name) => constants.has(name.replace(/^me->/i, '').toUpperCase());
  /* a value that is PROVABLY a literal: a literal, a constant, a template
   * with nothing interpolated, a parameter every call passes one of those
   * (`render_samples( name = \`Stack\` )` handing `name` on as `text = name`),
   * or a `&&` chain of those */
  const literalOnly = (value, inMethod) => topSplit(value.trim(), '&&').every((p) => {
    const t = p.trim();
    return LITERAL.test(t) || /^\|[^{}|]*\|$/.test(t) || isConstant(t)
      || (/^\w+$/.test(t) && Boolean(inMethod) && paramIsLiteral(inMethod, t));
  });

  /* A method PARAMETER is written by the call sites, not by an assignment,
   * and a helper that renders a row (`render_text( form = form text = \`Hi\`
   * )`) is the corpus's way of writing a literal several times. So an
   * IMPORTING parameter of this class's own method is a literal when every
   * call of that method in the class passes it a literal-only value, or
   * leaves it to its default - and data, as before, when any call passes a
   * name, or when the class never calls the method itself (the caller is
   * elsewhere, and so is the value). Judged per METHOD and parameter: `text`
   * is a parameter of the row helper AND of the text helper, and only the
   * method the `v = text` is written in says which one is meant. */
  const spans = methodSpans(src);
  const methodAt = (at) => spans.find((s) => at >= s.from && at < s.to)?.name ?? null;
  const paramsOf = new Map(); // method -> Set of its IMPORTING parameter names, lower-cased
  for (const stmt of splitStatements(src)) {
    const m = stmt.text.match(/^\s*(?:CLASS-)?METHODS:?\s+([\s\S]*)$/i);
    if (!m) continue;
    for (const el of topSplit(m[1], ',')) {
      const name = el.trim().match(/^!?(\w+)/);
      const imp = el.match(/\bIMPORTING\b([\s\S]*?)(?=\b(?:EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS)\b|$)/i);
      if (!name || !imp) continue;
      const params = new Set();
      for (const p of imp[1].matchAll(/(?:^|\s)!?(?:VALUE\(\s*)?(\w+)\s*\)?\s+(?:TYPE|LIKE)\b/gi)) params.add(p[1].toLowerCase());
      paramsOf.set(name[1].toLowerCase(), params);
    }
  }
  const statements = splitStatements(src);
  const literalParams = new Map(); // `method.parameter` -> decided once
  const deciding = new Set(); // a parameter handed to itself (a recursive helper) decides nothing
  const paramIsLiteral = (method, name) => {
    const param = name.toLowerCase();
    const params = paramsOf.get(method);
    if (!params?.has(param)) return false;
    const key = `${method}.${param}`;
    if (literalParams.has(key)) return literalParams.get(key);
    if (deciding.has(key)) return true;
    let calls = 0;
    let literal = true;
    deciding.add(key);
    const callRe = new RegExp(`(?:^|[^\\w>=-])(?:me->)?${method}\\s*\\(`, 'gi');
    for (const stmt of statements) {
      if (/^\s*(?:CLASS-)?METHODS?\b/i.test(stmt.text)) continue; // the declaration, the body's head
      for (const c of stmt.text.matchAll(callRe)) {
        calls++;
        const { body } = parenRegion(stmt.text, c.index + c[0].length - 1);
        const marks = namedArgMarks(body);
        const value = marks.length ? marks.find((a) => a.name === param)?.value
          : params.size === 1 ? body.trim() : undefined;
        // a name in the argument is read in the CALLER's method
        if (value !== undefined && value !== '' && !literalOnly(value, methodAt(stmt.offset + c.index))) literal = false;
      }
    }
    deciding.delete(key);
    const verdict = calls > 0 && literal;
    literalParams.set(key, verdict);
    return verdict;
  };

  /* a bare name is text when nothing that writes it shows binding vocabulary */
  let judgingIn = null; // the method the attribute call being judged sits in
  const nameIsText = (token) => {
    if (!DATA_NAME.test(token) || isBool(token)) return false;
    const [root] = namesOf(token);
    if (isConstant(root)) return false;
    if (/^\w+$/.test(token) && judgingIn && paramIsLiteral(judgingIn, token)) return false;
    return !namesOf(token).some((name) => carriesBinding(name));
  };
  /* A CONSTANTS whose declared value holds a brace is a binding with a
   * name (`VALUE \`{/NAME}\``): interpolated into a template it makes the
   * template's text a binding, and the `t` fix would escape it - the
   * reconstruction renders exactly that binding, so the rule must not
   * contradict the view it has in hand. Read off the declaration the write
   * map recorded (a structured constant's components sit in the same
   * statement as its root). */
  const constantHoldsBrace = (token) => namesOf(token).some((name) =>
    (writes.get(name.toLowerCase()) ?? []).some(({ text }) =>
      [...text.matchAll(LITERALS)].some((lit) => lit[0][0] !== '|' && /[{}]/.test(lit[0]))));
  const valueIsText = (value) => {
    const v = value.trim();
    if (BINDING_VOCAB.test(v)) return false;
    if (/^\|/.test(v) && /\|$/.test(v)) {
      /* a template: judged by what it interpolates, piece by piece, like a
       * `&&` chain - a literal, a constant or a literal-only parameter is
       * text that needs no escaping, a name is judged by its writes, and
       * anything else (a call, an expression) is data. Judged by its SHAPE
       * alone - "it interpolates, so it carries data" - it reported
       * `|{ gc_label }: 5|` with the constant holding `{/NAME}`, and the fix
       * escaped a working binding. (A `\{` is caught above - the vocabulary
       * test sees the backslash.) */
      let named = 0;
      for (const piece of v.matchAll(/(?<!\\)\{([^{}]*)\}/g)) {
        const t = piece[1].trim();
        if (t === '' || LITERAL.test(t) || /^\|[^{}|]*\|$/.test(t)) continue;
        if (DATA_NAME.test(t) && isConstant(namesOf(t)[0])) {
          if (constantHoldsBrace(t)) return false;
          continue;
        }
        if (/^\w+$/.test(t) && judgingIn && paramIsLiteral(judgingIn, t)) continue;
        if (DATA_NAME.test(t)) {
          if (!nameIsText(t)) return false;
        }
        named++;
      }
      return named > 0;
    }
    let m;
    if ((m = v.match(/^CONV\s+string\(\s*([\s\S]+?)\s*\)$/i))) return nameIsText(m[1]);
    const pieces = topSplit(v, '&&').map((p) => p.trim());
    if (pieces.length > 1) {
      // `base && \`file.jpg\``: text when every non-literal piece is a text name
      let named = 0;
      for (const p of pieces) {
        // a literal piece that carries a brace is the chain ASSEMBLING a
        // binding around the name (`{` && comp-name && `}`) - vocabulary
        if (LITERAL.test(p)) { if (/[{}]/.test(p)) return false; continue; }
        if (!nameIsText(p)) return false;
        named++;
      }
      return named > 0;
    }
    return nameIsText(v);
  };

  /* The control an attribute call lands on, as far as the source text can
   * say: the element literal opened or added most recently before it in the
   * same method - which is the attribute target rule (`IF t_child IS
   * INITIAL` → self, else the last child) for every chain that does not
   * close a level between the two. Read together with the class's own
   * `xmlns` declarations, it names a snapshot control; where it names none,
   * or the snapshot is not there, the value is judged as before. A wrong
   * guess (a handle walked up past an `end( )`) can only make the rule stand
   * down, never report - the silent direction. */
  const xmlns = new Map();
  for (const x of src.matchAll(/\bn\s*=\s*[`']xmlns(?::(\w+))?[`']\s+v\s*=\s*[`']([\w.]+)[`']/gi)) {
    const prefix = x[1] ?? '';
    if (!xmlns.has(prefix)) xmlns.set(prefix, x[2]);
  }
  const elements = data
    ? [...src.matchAll(new RegExp(`(?:\\bMETHOD\\b)|->\\s*(?:${d.open}|${d.leaf})\\s*\\(\\s*(?:n\\s*=\\s*)?[\`'](\\w+)[\`'](?:\\s+ns\\s*=\\s*[\`'](\\w+)[\`'])?`, 'gi'))]
    : [];
  let cursor = 0;
  let found = null; // the last element passed - it stays the target across the attributes that follow it
  const controlBefore = (at) => {
    for (; cursor < elements.length && elements[cursor].index < at; cursor++) {
      found = elements[cursor][1] ? elements[cursor] : null; // a METHOD keyword resets the search
    }
    if (!found) return null;
    const lib = xmlns.get(found[2] ?? '') ?? (found[2] ? null : 'sap.m');
    return lib && data[`${lib}.${found[1]}`] ? `${lib}.${found[1]}` : null;
  };
  const enums = data?.__enums ?? {};
  const cannotShowText = (control, member) => {
    if (!control) return false;
    const type = propertyDecl(data, control, member)?.type;
    return Boolean(type) && (NON_TEXT_TYPE.test(type) || Boolean(enums[type]));
  };

  for (const m of src.matchAll(new RegExp(`->\\s*(${d.att})\\s*\\(`, 'gi'))) {
    const open = m.index + m[0].length - 1;
    const { body } = parenRegion(src, open);
    const marks = namedArgMarks(body);
    const nArg = marks.find((a) => a.name === 'n');
    const vArg = marks.find((a) => a.name === 'v');
    if (!nArg || !vArg) continue;
    const attrLit = nArg.value.match(/^[`'|]([\w:]+)[`'|]$/);
    if (!attrLit) continue;
    /* `id` and `class` are not properties: the XMLTemplateProcessor takes
     * them verbatim (getId( ), addStyleClass( )) and never reads a brace in
     * them as a binding - and the `t` the fix writes would put a backslash
     * into the id or the class token. */
    if (VERBATIM_ATTRIBUTE.test(attrLit[1])) continue;
    judgingIn = methodAt(m.index);
    if (!valueIsText(vArg.value)) continue;
    if (cannotShowText(controlBefore(m.index), attrLit[1])) continue;
    const at = open + 1 + vArg.nameStart;
    report({
      member: attrLit[1], value: vArg.value.slice(0, 40),
      fixHint: builderOfVerb(m[1]).textFix, offset: m.index,
      fixes: [{ start: at, end: at + 1, text: d.textParam }],
    });
  }
}

export default defineRule({
  id: 'unescaped-text-in-attribute',
  severity: 'warning',
  category: 'bindings',
  scope: 'app',
  summary: 'a value carrying data written into the view through `v`',
  detail: 'The page bootstraps with complex binding syntax, so UI5 reads a `{` in ANY attribute value as a binding — a search string the user typed, rendered into a title, resolves as a path into the view model (or, as `{= … }`, is evaluated as an expression) instead of being shown. The builder\'s `t` parameter is the way out: `a( t = … )` applies `escape_literal( )` to the whole value, so a brace or backslash in it is shown. Reported for a value whose ORIGIN is data — a `|…|` template that interpolates, a variable or record field whose assignments in the class (`=`, `&&=`, `CONCATENATE … INTO`, `REPLACE … IN … WITH`, and through them the names they read) carry no binding vocabulary — in a statement that assembles a string, a literal holding a brace counts as vocabulary, `CONV string( )` and `name && `literal`` chains — and never for a literal, a method call, a `COND`/`SWITCH`, an ABAP boolean (`unconverted-abap-boolean`), or anything that shows a bind, an event, a wire, an `escape_literal( )` or an escaped brace: assembling a binding in a variable and passing it through `v` is what `v` is for. A value that mixes text with a binding in ONE attribute keeps `v` and escapes the text part with `z2ui5_cl_ui5_view_builder=>escape_literal( )` itself. `id` and `class` are never judged: the XML view takes both verbatim and reads no binding in them.',
  example: 'view->ele( `Page` )->a( n = `title` v = |Results for { mv_search }| )   " {/X} typed by the user is a binding',
  remedy: 'view->ele( `Page` )->a( n = `title` t = |Results for { mv_search }| )   " the builder escapes it',
  fixNote: 'The parameter is renamed — `a( v = … )` becomes `a( t = … )`; the value stays as written, the builder escapes it.',
  message: (f) => `${f.member}: ${f.value} carries data, and a brace in it is read as a binding, not shown — ${
        f.fixHint || 'pass it as a( t = … ), which escapes it as literal text'}`,
  check,
});
