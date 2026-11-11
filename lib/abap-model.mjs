/*
 * abap-model — ONE reading of a class, shared by the rules that ask about it.
 *
 * Every rule in abap-rules.mjs reads the source with regular expressions of
 * its own, and each of them had to learn the same things separately: that a
 * keyword may be written in any case, that a `CATCH` inside a string literal
 * is prose, that `DATA:` chains declare several names, where a method ends.
 * Most of the "a shape the rule did not see" entries in the changelog are one
 * of those lessons, learned once more by another rule.
 *
 * This module learns them once. It reads a source into
 *
 *   tokens       words, literals, operators, pragmas - each with its offsets
 *                into the ORIGINAL source, so a finding and a fix span need
 *                no translation
 *   statements   the tokens up to a period, with the keyword folded to upper
 *                case, the pragmas the statement carries, and - for a chained
 *                `KEYWORD: a, b.` - one element per name
 *   classes      DEFINITION and IMPLEMENTATION parts with the visibility
 *                sections of a definition
 *   methods      every METHOD … ENDMETHOD with the statements in it
 *   attributes   what the class declares (DATA, CLASS-DATA, CONSTANTS), with
 *                section, kind and type as written
 *   locals       per method: DATA, inline DATA( )/FINAL( ), FIELD-SYMBOLS
 *
 * and answers the questions rules ask (`statementsOf`, `next`, `methodAt`,
 * `sectionAt`, `attribute`). Everything is computed on first use and kept for
 * the source, so ten rules asking cost one reading.
 *
 * WHAT IT DOES NOT REPLACE. The reconstructor and the value resolver
 * (lib/reconstruct.mjs) follow a builder chain through helper calls and
 * resolve names to literals; that is a different job and stays where it is.
 * Nor is this a parser of ABAP - it knows statements and declarations, not
 * expressions. A rule that needs more than it offers still has `src` and
 * `code`, the two views every older rule reads; they are the same strings
 * `scrub( )` and `blankLiterals( )` return, so old and new readers agree
 * about what a comment and a literal are by construction.
 *
 * It builds on lib/abap.mjs and nothing else: a leaf module, importable from
 * any rule without a cycle.
 */
import { scrub, blankLiterals, skipLiteral } from './abap.mjs';

/* A word: an identifier, a keyword, a number, a field symbol (`<fs>`), with
 * the `-` that joins a component or a compound keyword (`ls_row-name`,
 * `CLASS-DATA`, `sy-subrc`) kept inside it - ABAP tells that `-` from the
 * minus operator by the missing blanks around it, and so does this. A
 * namespace (`/ns/cl_x`) is part of the word. */
const WORD_START = /[A-Za-z_/]/;
const WORD_CHAR = /[\w/]/;
const FIELD_SYMBOL = /<[\w/]+>/y;
const TWO_CHAR_OPS = new Set(['->', '=>', '?=', '<=', '>=', '<>', '+=', '-=', '*=', '/=', '&&']);

/** The tokens of a source. `code` is the source with comments and literal
 *  contents blanked (offset for offset), `src` the one with only comments
 *  blanked - a literal token's text is read from there. */
function tokenize(code, src) {
  const tokens = [];
  const n = code.length;
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
    if (c === '`' || c === "'" || c === '|') {
      // a doubled delimiter (`'it''s'`) is an escaped one: still one literal
      let end = Math.max(i + 1, skipLiteral(src, i));
      while (c !== '|' && src[end] === c && src[end - 1] === c && end - i > 1) end = Math.max(end + 1, skipLiteral(src, end));
      tokens.push({ kind: 'literal', text: src.slice(i, end), upper: '', start: i, end });
      i = end;
      continue;
    }
    if (c === '#' && code[i + 1] === '#') {
      let e = i + 2;
      while (e < n && WORD_CHAR.test(code[e])) e++;
      tokens.push({ kind: 'pragma', text: code.slice(i, e), upper: code.slice(i, e).toUpperCase(), start: i, end: e });
      i = e;
      continue;
    }
    if (c === '<') {
      FIELD_SYMBOL.lastIndex = i;
      const m = FIELD_SYMBOL.exec(code);
      if (m) {
        let e = i + m[0].length;
        e = wordTail(code, e, n);
        tokens.push({ kind: 'word', text: code.slice(i, e), upper: code.slice(i, e).toUpperCase(), start: i, end: e });
        i = e;
        continue;
      }
    }
    if (WORD_START.test(c) || (c >= '0' && c <= '9')) {
      let e = i + 1;
      while (e < n && WORD_CHAR.test(code[e])) e++;
      e = wordTail(code, e, n);
      tokens.push({ kind: 'word', text: code.slice(i, e), upper: code.slice(i, e).toUpperCase(), start: i, end: e });
      i = e;
      continue;
    }
    const two = code.slice(i, i + 2);
    const text = TWO_CHAR_OPS.has(two) ? two : c;
    tokens.push({ kind: 'op', text, upper: text, start: i, end: i + text.length });
    i += text.length;
  }
  return tokens;
}

/* `-name` directly behind a word, any number of times: the component
 * selector and the compound keyword. A `-` followed by `>` is `->`. */
function wordTail(code, e, n) {
  while (e + 1 < n && code[e] === '-' && WORD_CHAR.test(code[e + 1])) {
    e += 2;
    while (e < n && WORD_CHAR.test(code[e])) e++;
  }
  return e;
}

/* Statements: the tokens up to a period outside every parenthesis - the rule
 * splitStatements( ) in lib/abap.mjs follows, so on a class that compiles
 * both agree on where every statement ends.
 *
 * On one that does not, this reader RECOVERS where that one cannot: a chain
 * with a `)` too many, or a `(` never closed, leaves the old count off zero
 * for the rest of the file, so every later period is "inside a parenthesis"
 * and the chain swallows the statements behind it (ENDMETHOD and ENDCLASS
 * included - the class then has no method that ends). Two facts of the
 * language end that here: a `)` cannot close what was never opened, so the
 * depth does not go below zero; and a period followed by a blank or a line
 * end is never part of an expression (a literal is one token), so it ends
 * the statement at any depth. */
function statementsOf(tokens, code) {
  const out = [];
  let depth = 0;
  let from = 0;
  const push = (to, end) => {
    if (to <= from) { from = to + 1; return; }
    const toks = tokens.slice(from, to);
    const first = toks[0];
    const chained = toks[1]?.kind === 'op' && toks[1].text === ':';
    out.push({
      index: out.length,
      tokens: toks,
      keyword: first.kind === 'word' ? first.upper : '',
      chained,
      pragmas: toks.filter((t) => t.kind === 'pragma').map((t) => t.upper),
      start: first.start,
      end, // the offset after the closing period (or the last token)
    });
    from = to + 1;
  };
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind !== 'op') continue;
    if (t.text === '(') depth++;
    else if (t.text === ')') depth = Math.max(0, depth - 1);
    else if (t.text === '.' && (depth === 0 || t.end >= code.length || /\s/.test(code[t.end]))) { push(k, t.end); depth = 0; }
  }
  if (from < tokens.length) push(tokens.length, tokens[tokens.length - 1].end);
  return out;
}

/** The elements of a statement: for `KEYWORD: a …, b ….` one token list per
 *  comma-separated element (the keyword not repeated), for any other
 *  statement the tokens behind the keyword as the single element. Commas
 *  inside parentheses do not separate. */
export function elementsOf(statement) {
  const toks = statement.tokens.filter((t) => t.kind !== 'pragma');
  if (!statement.chained) return [toks.slice(statement.keyword ? 1 : 0)];
  const out = [];
  let cur = [];
  let depth = 0;
  for (const t of toks.slice(2)) {
    if (t.kind === 'op' && t.text === '(') depth++;
    else if (t.kind === 'op' && t.text === ')') depth--;
    if (t.kind === 'op' && t.text === ',' && depth === 0) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Where the WORDS `words` (upper case) stand one after another in `tokens`:
 *  the index of the first, for every occurrence. Blanks, line breaks and
 *  comments between them are no tokens, so none of them has to be allowed
 *  for. */
export function* findWords(tokens, words) {
  for (let k = 0; k + words.length <= tokens.length; k++) {
    let hit = true;
    for (let j = 0; j < words.length && hit; j++) {
      const t = tokens[k + j];
      hit = t.kind === 'word' && t.upper === words[j];
    }
    if (hit) yield k;
  }
}

const DECLARING = new Map([['DATA', 'data'], ['CLASS-DATA', 'class-data'], ['CONSTANTS', 'constant'], ['STATICS', 'static']]);
const VISIBILITY = new Set(['PUBLIC', 'PROTECTED', 'PRIVATE']);

/* The names one declaring statement declares, a structure (`BEGIN OF x, …,
 * END OF x`) as ONE name with its components beneath it. `depth` carries a
 * structure that is open across period-terminated statements
 * (`DATA BEGIN OF x.` … `DATA END OF x.`). */
function declarationsOf(statement, kind, state) {
  const out = [];
  for (const el of elementsOf(statement)) {
    if (!el.length) continue;
    const w = (k) => (el[k]?.kind === 'word' ? el[k].upper : '');
    if (w(0) === 'BEGIN' && w(1) === 'OF') {
      if (state.depth === 0 && el[2]?.kind === 'word') {
        out.push({ name: el[2].text.toLowerCase(), kind, structure: true, type: '', readOnly: el.some((t) => t.upper === 'READ-ONLY'), start: el[2].start });
      }
      state.depth++;
      continue;
    }
    if (w(0) === 'END' && w(1) === 'OF') { state.depth = Math.max(0, state.depth - 1); continue; }
    if (state.depth > 0 || el[0].kind !== 'word') continue;
    if (w(0) === 'INCLUDE') continue;
    // `name(10) TYPE c` - the length in parentheses belongs to the name
    let k = 1;
    if (el[k]?.text === '(') { while (k < el.length && el[k].text !== ')') k++; k++; }
    const typed = el[k]?.kind === 'word' && (el[k].upper === 'TYPE' || el[k].upper === 'LIKE');
    const tail = el.slice(typed ? k + 1 : k);
    const stop = tail.findIndex((t) => t.kind === 'word' && (t.upper === 'VALUE' || t.upper === 'READ-ONLY' || t.upper === 'LENGTH' || t.upper === 'DECIMALS'));
    const typeTokens = stop < 0 ? tail : tail.slice(0, stop);
    out.push({
      name: el[0].text.toLowerCase(),
      kind,
      structure: false,
      type: typeTokens.map((t) => t.text).join(' ').replace(/ ?(=>|->|~) ?/g, '$1').toLowerCase(),
      readOnly: el.some((t) => t.upper === 'READ-ONLY'),
      start: el[0].start,
    });
  }
  return out;
}

const DIRECTIONS = new Map([['IMPORTING', 'importing'], ['EXPORTING', 'exporting'], ['CHANGING', 'changing'], ['RETURNING', 'returning']]);
const SIGNATURE_END = new Set(['RAISING', 'EXCEPTIONS', 'REDEFINITION', 'ABSTRACT', 'FINAL', 'FOR', 'DEFAULT']);

/* The methods one METHODS / CLASS-METHODS statement declares, each with its
 * parameters: `name [IMPORTING a TYPE x b TYPE y] [RETURNING VALUE(r) TYPE z]`.
 * A parameter is `name`, `VALUE(name)` or `REFERENCE(name)`, then TYPE or
 * LIKE and a type that runs up to the next parameter or direction. */
function signaturesOf(statement, isStatic) {
  const out = [];
  for (const el of elementsOf(statement)) {
    if (el[0]?.kind !== 'word') continue;
    const sig = { name: el[0].text.toLowerCase(), static: isStatic, params: [], start: el[0].start };
    let direction = null;
    let k = 1;
    while (k < el.length) {
      const t = el[k];
      if (t.kind === 'word' && DIRECTIONS.has(t.upper)) { direction = DIRECTIONS.get(t.upper); k++; continue; }
      if (t.kind === 'word' && SIGNATURE_END.has(t.upper)) { direction = null; k++; continue; }
      if (!direction || t.kind !== 'word') { k++; continue; }
      // the parameter's name
      let name = t;
      let byValue = false;
      if ((t.upper === 'VALUE' || t.upper === 'REFERENCE') && el[k + 1]?.text === '(' && el[k + 2]?.kind === 'word' && el[k + 3]?.text === ')') {
        name = el[k + 2];
        byValue = t.upper === 'VALUE';
        k += 4;
      } else k++;
      if (el[k]?.kind !== 'word' || (el[k].upper !== 'TYPE' && el[k].upper !== 'LIKE')) continue;
      k++;
      const from = k;
      // the type ends where the next parameter (`x TYPE`, `VALUE(`) or clause starts
      while (k < el.length) {
        const u = el[k];
        if (u.kind === 'word' && (DIRECTIONS.has(u.upper) || SIGNATURE_END.has(u.upper) || u.upper === 'OPTIONAL')) break;
        const after = el[k + 1];
        if (k > from && u.kind === 'word' && after?.kind === 'word' && (after.upper === 'TYPE' || after.upper === 'LIKE')) break;
        if (k > from && u.kind === 'word' && (u.upper === 'VALUE' || u.upper === 'REFERENCE') && after?.text === '(') break;
        k++;
      }
      sig.params.push({
        name: name.text.toLowerCase(),
        direction,
        byValue,
        type: el.slice(from, k).map((x) => x.text).join(' ').replace(/ ?(=>|->|~) ?/g, '$1').toLowerCase(),
        start: name.start,
      });
    }
    out.push(sig);
  }
  return out;
}

function structureOf(statements) {
  const classes = [];
  const methods = [];
  /* Declarations outside any class and method: what a snippet declares (a
   * card's example, a selection an editor hands over). */
  const loose = [];
  let cls = null;
  let method = null;
  let section = null;
  const decl = { depth: 0 };
  for (const s of statements) {
    const w = (k) => (s.tokens[k]?.kind === 'word' ? s.tokens[k].upper : '');
    if (s.keyword === 'CLASS' && !method) {
      const part = s.tokens.some((t) => t.upper === 'DEFINITION') ? 'definition'
        : s.tokens.some((t) => t.upper === 'IMPLEMENTATION') ? 'implementation' : null;
      // `CLASS x DEFINITION DEFERRED.` / `… LOAD.` open nothing
      if (part && !s.tokens.some((t) => t.upper === 'DEFERRED' || t.upper === 'LOAD')) {
        cls = { name: (s.tokens[1]?.text ?? '').toLowerCase(), part, start: s.start, end: Infinity, sections: [], attributes: [], signatures: [], statement: s };
        classes.push(cls);
        section = null;
        decl.depth = 0;
      }
      continue;
    }
    if (s.keyword === 'ENDCLASS') {
      if (cls) cls.end = s.end;
      if (section) section.end = s.start;
      cls = null; section = null;
      continue;
    }
    /* A snippet that starts at a section (a card's example, a selection an
     * editor hands over) has no CLASS statement: its sections belong to a
     * definition nobody wrote down. */
    if (!cls && !method && VISIBILITY.has(s.keyword) && w(1) === 'SECTION') {
      cls = { name: '', part: 'definition', start: s.start, end: Infinity, sections: [], attributes: [], signatures: [], statement: null };
      classes.push(cls);
    }
    if (cls?.part === 'definition' && VISIBILITY.has(s.keyword) && w(1) === 'SECTION') {
      if (section) section.end = s.start;
      section = { visibility: s.keyword.toLowerCase(), start: s.start, end: Infinity };
      cls.sections.push(section);
      continue;
    }
    if (s.keyword === 'METHOD' && cls?.part === 'implementation') {
      // `METHOD z2ui5_if_app~main.` - the interface prefix is part of the name
      const full = s.tokens.slice(1).map((t) => t.text).join('').toLowerCase();
      method = { name: full.replace(/^.*~/, ''), fullName: full, class: cls.name, start: s.start, bodyStart: s.end, end: s.end, statements: [], locals: [] };
      methods.push(method);
      decl.depth = 0;
      continue;
    }
    if (s.keyword === 'ENDMETHOD') {
      if (method) method.end = s.end;
      method = null;
      continue;
    }
    if (method) {
      method.statements.push(s);
      method.end = s.end;
      const kind = DECLARING.get(s.keyword);
      if (kind) method.locals.push(...declarationsOf(s, kind, decl));
      else if (s.keyword === 'FIELD-SYMBOLS') {
        for (const el of elementsOf(s)) if (el[0]?.kind === 'word') method.locals.push({ name: el[0].text.toLowerCase(), kind: 'field-symbol', structure: false, type: '', readOnly: false, start: el[0].start });
      }
      // inline declarations: DATA(x), FINAL(x), FIELD-SYMBOL(<x>)
      for (let k = 0; k + 3 < s.tokens.length + 1; k++) {
        const t = s.tokens[k];
        if (t.kind !== 'word' || (t.upper !== 'DATA' && t.upper !== 'FINAL' && t.upper !== 'FIELD-SYMBOL')) continue;
        const open = s.tokens[k + 1];
        const name = s.tokens[k + 2];
        const close = s.tokens[k + 3];
        if (open?.text === '(' && open.start === t.end && name?.kind === 'word' && close?.text === ')') {
          method.locals.push({ name: name.text.toLowerCase(), kind: t.upper === 'FIELD-SYMBOL' ? 'field-symbol' : 'inline', structure: false, type: '', readOnly: t.upper === 'FINAL', start: name.start });
        }
      }
      continue;
    }
    if (!cls) {
      const kind = DECLARING.get(s.keyword);
      if (kind) loose.push(...declarationsOf(s, kind, decl));
      continue;
    }
    if (cls?.part === 'definition') {
      if (s.keyword === 'METHODS' || s.keyword === 'CLASS-METHODS') {
        for (const sig of signaturesOf(s, s.keyword === 'CLASS-METHODS')) {
          cls.signatures.push({ ...sig, visibility: section?.visibility ?? null, class: cls.name });
        }
        continue;
      }
      const kind = DECLARING.get(s.keyword);
      if (!kind) continue;
      for (const d of declarationsOf(s, kind, decl)) {
        cls.attributes.push({ ...d, visibility: section?.visibility ?? null, class: cls.name });
      }
    }
  }
  return { classes, methods, loose };
}

/** Whether offset `at` lies in [span.start, span.end). */
const within = (span, at) => at >= span.start && at < span.end;

class AbapModel {
  constructor(source) {
    /** The source as it was handed over. */
    this.source = source;
    /** Comments blanked - what `scrub( )` returns. */
    this.src = scrub(source);
    /** Comments and literal contents blanked - `blankLiterals( scrub( ) )`. */
    this.code = blankLiterals(this.src);
    this._tokens = null;
    this._statements = null;
    this._structure = null;
    this._byKeyword = null;
  }

  get tokens() { return (this._tokens ??= tokenize(this.code, this.src)); }

  get statements() { return (this._statements ??= statementsOf(this.tokens, this.code)); }

  get classes() { return (this._structure ??= structureOf(this.statements)).classes; }

  get methods() { return (this._structure ??= structureOf(this.statements)).methods; }

  /** Every attribute the class definitions declare. */
  get attributes() { return this.classes.flatMap((c) => c.attributes); }

  /** The statements that start with one of `keywords` (any case), in source
   *  order. */
  statementsOf(...keywords) {
    if (!this._byKeyword) {
      this._byKeyword = new Map();
      for (const s of this.statements) {
        if (!this._byKeyword.has(s.keyword)) this._byKeyword.set(s.keyword, []);
        this._byKeyword.get(s.keyword).push(s);
      }
    }
    const lists = keywords.map((k) => this._byKeyword.get(String(k).toUpperCase()) ?? []);
    return lists.length === 1 ? lists[0] : lists.flat().sort((a, b) => a.start - b.start);
  }

  /** The statement after `statement`, or null. */
  next(statement) { return this.statements[statement.index + 1] ?? null; }

  /** The statement before `statement`, or null. */
  previous(statement) { return this.statements[statement.index - 1] ?? null; }

  /** The method whose METHOD … ENDMETHOD holds offset `at`, or null. */
  methodAt(at) { return this.methods.find((m) => within(m, at)) ?? null; }

  /** The class part (definition or implementation) holding `at`, or null. */
  classAt(at) { return this.classes.find((c) => within(c, at)) ?? null; }

  /** 'public' | 'protected' | 'private' for an offset inside a definition's
   *  section, null anywhere else (before the first section too). */
  sectionAt(at) {
    const cls = this.classAt(at);
    if (cls?.part !== 'definition') return null;
    return cls.sections.find((s) => within(s, at))?.visibility ?? null;
  }

  /** The attribute `name` (any case) of the class, or null. */
  attribute(name) {
    const n = String(name).toLowerCase();
    return this.attributes.find((a) => a.name === n) ?? null;
  }

  /** The declared signature of method `name` (any case, with or without an
   *  interface prefix), or null - a method of an interface has none here. */
  signature(name) {
    const n = String(name).toLowerCase().replace(/^.*~/, '');
    for (const c of this.classes) {
      const hit = c.signatures?.find((s) => s.name === n);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * What the NAME `name` is at offset `at`: a local of the method there, a
   * parameter of that method, or an attribute of the class - in that order,
   * the order ABAP resolves it in. null for a name declared nowhere in this
   * source (another class's, an interface's, a system field).
   */
  resolve(name, at) {
    const n = String(name).toLowerCase();
    const method = this.methodAt(at);
    if (method) {
      const local = method.locals.find((l) => l.name === n);
      if (local) return { ...local, origin: 'local' };
      const param = this.signature(method.name)?.params.find((p) => p.name === n);
      if (param) return { ...param, kind: 'parameter', origin: 'parameter' };
    }
    const attr = this.attribute(n);
    if (attr) return { ...attr, origin: 'attribute' };
    const loose = (this._structure ??= structureOf(this.statements)).loose.find((l) => l.name === n);
    return loose ? { ...loose, origin: 'snippet' } : null;
  }

  /** The text of a statement or token span as written (comments blanked). */
  text(span) { return this.src.slice(span.start, span.end); }
}

/* The last few sources read: every rule of a run asks for the model of the
 * same source, and a watch or an editor asks again for the one it just had. */
const MODELS = new Map();
const MODEL_LIMIT = 4;

/** The model of `source` - read once, shared by everyone who asks. */
export function abapModel(source) {
  const key = String(source);
  const hit = MODELS.get(key);
  if (hit) { MODELS.delete(key); MODELS.set(key, hit); return hit; }
  const model = new AbapModel(key);
  MODELS.set(key, model);
  if (MODELS.size > MODEL_LIMIT) MODELS.delete(MODELS.keys().next().value);
  return model;
}
