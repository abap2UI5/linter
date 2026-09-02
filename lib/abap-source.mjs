/*
 * abap-source — the small readers every ABAP-side rule module shares.
 *
 * Split out when lib/abap-rules.mjs grew past 2,000 lines and its two biggest
 * functions moved into modules of their own. Nothing here judges anything: it
 * turns a scrubbed class source into the four views the rules ask it for - the
 * literal elements of a VALUE #( ) region, which methods sit on a display
 * path, where each METHOD begins and ends, and whether a property name is
 * bindable anywhere in the snapshot.
 *
 * Pure functions of their input, so they can be shared without any of the
 * modules learning about each other.
 */
import { parenRegion, blankLiterals, scrub, splitStatements } from './abap.mjs';

/** The literal t_arg elements of a `VALUE #( ( `a` ) ( `b` ) )` region, with
 *  the absolute offset of each. A non-literal element (a variable, an
 *  expression) is kept as null: its value is not statically knowable, and a
 *  rule that judged it would be guessing. */
export function literalElements(body, base) {
  const elements = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '(') continue;
    const { body: inner, end } = parenRegion(body, i);
    const literal = inner.match(/^\s*(?:([`'])((?:[^`'])*)\1|\|([^|]*)\|)\s*$/);
    /* a |…| template WITH an interpolation is not a literal — its value is
     * composed at runtime (`|pages/{ idx }|`), so it is kept as null like
     * any other expression rather than judged on its raw source text */
    const value = literal
      ? (literal[3] !== undefined && /(?<!\\)\{/.test(literal[3]) ? null : (literal[2] ?? literal[3]))
      : null;
    /* `offset` points at the row's own `(` — where a finding reads best. A
     * FIX needs the literal itself, quotes included, so its exact span is
     * carried alongside rather than re-derived by every caller. */
    const raw = literal ? literal[0].trim() : null;
    const litStart = raw ? base + i + 1 + literal[0].indexOf(raw) : null;
    elements.push({ value, offset: base + i, litStart, litEnd: raw ? litStart + raw.length : null });
    i = end;
  }
  return elements;
}

/* The display calls that REBUILD a slot's control tree, and therefore the
 * only calls that put live control state back. abap2UI5 does not patch a
 * view: `view_display( )` hands new XML to the VIEW_SLOTS action, whose
 * displayMain destroys the MAIN slot (taking POPUP and POPOVER with it) and
 * builds a fresh tree with `XMLView.create` — every control in it is a NEW
 * object, carrying exactly what the XML declares and nothing else. */
export const REBUILDS_A_SLOT = /\w*client\s*->\s*(?:(?:nest2?_)?view_display|popup_display|popover_display)\s*\(/i;

/** The methods that run whenever this class (re)builds a view: the ones that
 *  issue a display call, plus everything they call, a few levels deep. A wire
 *  in one of those is re-issued on every rebuild by construction — which is
 *  the whole remedy the rule below asks for, and `samples-controls` app 534
 *  writes it exactly that way (`view_display( )` ends on `path_apply( )`,
 *  and `path_apply( )` is where the setters live). */
export function displayPathMethods(src) {
  const bodies = new Map();
  for (const mm of src.matchAll(/\bMETHOD\s+([\w~]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
    bodies.set(mm[1].toLowerCase().replace(/^.*~/, ''), mm[2]);
  }
  const onPath = new Set();
  const walk = (name, depth) => {
    if (depth > 8 || onPath.has(name) || !bodies.has(name)) return;
    onPath.add(name);
    for (const call of bodies.get(name).matchAll(/(?:^|[^\w>])(?:me->)?(\w+)\s*\(/g)) {
      walk(call[1].toLowerCase(), depth + 1);
    }
  };
  for (const [name, body] of bodies) if (REBUILDS_A_SLOT.test(body)) walk(name, 0);
  return onPath;
}

/** name + span of every METHOD … ENDMETHOD, so an offset can be told which
 *  method it sits in. */
export function methodSpans(src) {
  const spans = [];
  for (const mm of src.matchAll(/\bMETHOD\s+([\w~]+)\s*\.([\s\S]*?)\bENDMETHOD\b/gi)) {
    spans.push({ name: mm[1].toLowerCase().replace(/^.*~/, ''), from: mm.index, to: mm.index + mm[0].length });
  }
  return spans;
}

/** A property type no JSON model can carry: a live callback, a DOM node, an
 *  untyped blob. Shared by the two setter rules — one reports the wire
 *  BECAUSE the property is bindable, the other only when it is not. */
export const UNBINDABLE_TYPES = ['function', 'object', 'any'];

/* Whether ANY control in the snapshot declares `prop` as a bindable property.
 * The fallback for a wire whose control cannot be resolved — a runtime id, an
 * id no view of this class declares, a control outside the snapshot. It can
 * only ever say "somewhere this IS bindable", which is the silent direction:
 * under-reporting a wire is what this rule prefers over guessing at one. */
const bindableAnywhereCache = new WeakMap();
export function bindableAnywhere(data, prop) {
  let cache = bindableAnywhereCache.get(data);
  if (!cache) { cache = new Map(); bindableAnywhereCache.set(data, cache); }
  if (cache.has(prop)) return cache.get(prop);
  let hit = false;
  for (const meta of Object.values(data)) {
    const decl = meta?.properties?.[prop];
    if (decl && !UNBINDABLE_TYPES.includes(decl.type)) { hit = true; break; }
  }
  cache.set(prop, hit);
  return hit;
}

/* Where the branch opened by an IF/ELSEIF condition ending at `from` ends:
 * the next ELSEIF/ELSE/ENDIF at ITS OWN nesting level (inner IFs open and
 * close below it), or ENDMETHOD as the hard stop. Both lifecycle rules read
 * branches with this. */
export function ifBranchEnd(src, from) {
  // `(` and `)` come along because ELSE is not only a statement: COND and
  // SWITCH carry their own WHEN/ELSE inside an expression -
  //
  //     status = COND #( WHEN i MOD 2 = 0 THEN `open` ELSE `closed` ).
  //
  // and that ELSE sits at IF-depth 0, so a scanner looking only for the word
  // ended the branch right there. On a real page that cut a
  // check_on_navigated( ) branch four statements before its view_display( )
  // and reported the branch as never re-displaying - a false positive on
  // idiomatic modern ABAP, which is the worst kind: it pushes people away
  // from COND to satisfy a rule about something else entirely.
  const tokenRe = /\b(IF|ELSEIF|ELSE|ENDIF|ENDMETHOD)\b|[()]/gi;
  // over the literal-free view: a MessageStrip whose text says "someone else"
  // used to end the branch there, four statements before its real ENDIF
  src = blankLiterals(src);
  tokenRe.lastIndex = from;
  let depth = 0;
  let paren = 0;
  let t;
  while ((t = tokenRe.exec(src)) !== null) {
    if (t[0] === '(') { paren++; continue; }
    if (t[0] === ')') { if (paren > 0) paren--; continue; }
    const kind = t[1].toUpperCase();
    // inside an expression, none of these words is a statement keyword
    if (paren > 0) continue;
    if (kind === 'IF') depth++;
    else if (kind === 'ENDIF') {
      if (depth === 0) return t.index;
      depth--;
    } else if ((kind === 'ELSEIF' || kind === 'ELSE') && depth === 0) {
      return t.index;
    } else if (kind === 'ENDMETHOD') return t.index;
  }
  return src.length;
}

/* The rest of the statement sequence `from` sits in, on ITS OWN level: the
 * text up to the next boundary of that level — an ELSEIF/ELSE/WHEN/CATCH,
 * the block's own END…, an ENDMETHOD, or a RETURN/LEAVE/EXIT/CHECK, after
 * which nothing on the level runs unconditionally — with every nested block
 * (IF, CASE, LOOP, DO, WHILE, TRY) blanked to spaces. So a regex over the
 * returned text matches only statements that run whenever `from` runs, and
 * an index into it is `from` + index in the source. Literals are blanked
 * first, and words inside parentheses do not count (COND's ELSE/WHEN). */
export function branchTail(src, from) {
  const OPEN = /^(?:IF|CASE|LOOP|DO|WHILE|TRY)$/i;
  const CLOSE = /^(?:ENDIF|ENDCASE|ENDLOOP|ENDDO|ENDWHILE|ENDTRY)$/i;
  const text = blankLiterals(src);
  const tokenRe = /\b(IF|CASE|LOOP|DO|WHILE|TRY|ENDIF|ENDCASE|ENDLOOP|ENDDO|ENDWHILE|ENDTRY|ELSEIF|ELSE|WHEN|CATCH|CLEANUP|ENDMETHOD|RETURN|LEAVE|EXIT|CHECK)\b|[()]/gi;
  tokenRe.lastIndex = from;
  let out = '';
  let cursor = from;
  let depth = 0;
  let paren = 0;
  let nestedFrom = 0;
  let t;
  const finish = (end) => {
    const keep = depth > 0 ? nestedFrom : end;
    out += text.slice(cursor, Math.max(cursor, keep));
    return { text: out.padEnd(Math.max(0, end - from), ' '), end };
  };
  while ((t = tokenRe.exec(text)) !== null) {
    if (t[0] === '(') { paren++; continue; }
    if (t[0] === ')') { if (paren > 0) paren--; continue; }
    if (paren > 0) continue;
    const word = t[1];
    if (OPEN.test(word)) {
      if (depth === 0) nestedFrom = t.index;
      depth++;
      continue;
    }
    if (CLOSE.test(word)) {
      if (depth === 0) return finish(t.index);
      depth--;
      if (depth === 0) {
        const after = t.index + t[0].length;
        out += text.slice(cursor, nestedFrom) + ' '.repeat(after - nestedFrom);
        cursor = after;
      }
      continue;
    }
    if (depth === 0) return finish(t.index);
  }
  return finish(text.length);
}

/* Where the whole IF … ENDIF CONSTRUCT ends — past its ENDIF, with every
 * ELSEIF/ELSE branch inside it. `ifBranchEnd` stops at the next branch of the
 * same construct; this one steps over them, which is what cutting a dispatcher
 * out of a method body needs. */
export function ifBlockEnd(src, from) {
  const tokenRe = /\b(IF|ENDIF|ENDMETHOD)\b/gi;
  src = blankLiterals(src);
  tokenRe.lastIndex = from;
  let depth = 0;
  let t;
  while ((t = tokenRe.exec(src)) !== null) {
    const kind = t[1].toUpperCase();
    if (kind === 'IF') depth++;
    else if (kind === 'ENDIF') {
      if (depth === 0) return t.index + t[0].length;
      depth--;
    } else if (kind === 'ENDMETHOD') return t.index;
  }
  return src.length;
}

// z2ui5_if_client=>cs_view - the constant NAME is not its value (nested -> NEST)
const CS_VIEW_VALUES = {
  main: 'MAIN', nested: 'NEST', nested2: 'NEST2', popup: 'POPUP', popover: 'POPOVER',
};
const VIEW_SLOT_NAMES = new Set(Object.values(CS_VIEW_VALUES));

/* Which view SLOTS the class element-binds at runtime.
 *
 * `cs_event-bind_element` makes the frontend call `view.bindElement( path )`
 * on ONE slot - `evBindElement` reads it out of the wire's `view` parameter
 * and defaults to MAIN - so every relative path in THAT document resolves
 * against a row the document never names, and every relative path in every
 * OTHER document is as contextless as it looks. Asking the question of the
 * whole CLASS is what let one popup wire disarm the check for the main slot
 * too: a single `cs_event-bind_element` anywhere turned the aggregation rule
 * off for every document of the class, main slot included.
 *
 * Returns `{ slots, all }`. `all` is the honest half: a wire whose slot is
 * not a literal (a variable, a computed name) could bind any of them, and a
 * wrong second guess is worse than silence - so it suppresses everywhere,
 * exactly as the class-wide flag did. */
export function elementBoundSlots(source) {
  const slots = new Set();
  let all = false;
  const src = scrub(String(source));
  if (!/cs_event-bind_element/i.test(src)) return { slots, all };
  for (const stmt of splitStatements(src)) {
    if (!/cs_event-bind_element/i.test(stmt.text)) continue;
    /* The slot as the wire spells it: the constant (`client->cs_view-popup`,
     * whose VALUE is `POPUP` - and `cs_view-nested` is `NEST`) or a literal
     * already carrying that value. With no `view =` at all the ABAP DEFAULT
     * applies, and it is `cs_view-main`. */
    const c = stmt.text.match(/\bview\s*=\s*(?:\w+\s*->\s*)?cs_view-(\w+)/i);
    if (c) {
      const slot = CS_VIEW_VALUES[c[1].toLowerCase()];
      if (slot) slots.add(slot); else all = true;
      continue;
    }
    const lit = stmt.text.match(/\bview\s*=\s*([`'])([^`']*)\1/);
    if (lit) {
      if (VIEW_SLOT_NAMES.has(lit[2])) slots.add(lit[2]); else all = true;
      continue;
    }
    if (/\bview\s*=/.test(stmt.text)) { all = true; continue; }
    slots.add('MAIN');
  }
  return { slots, all };
}
