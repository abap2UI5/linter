import { defineRule } from '../rule.mjs';

/*
 * A start parameter read by hand in an app class.
 *
 * An app is started three ways, and each carries its parameters elsewhere:
 * the URL query (`?lgn=0001`), a launchpad tile's startupParameters, the query
 * of a launchpad intent (`#Object-action?lgn=0001`). The copies apps wrote -
 * "url_param_get( s_config-search ), else t_comp_params, then to_upper" -
 * read two of the three and drift apart; `client->get_start_param( name )`
 * (abap2UI5 4eed97a1) reads all three in a fixed order and matches the name
 * in any case.
 *
 * Reported, in a class that states `INTERFACES z2ui5_if_app`:
 *   - `t_comp_params` of `client->get( )` - directly (`client->get(
 *     )-t_comp_params[ … ]`, `READ TABLE`, `LOOP AT`) or of a variable
 *     assigned from `client->get( )` (`DATA(ls_get) = client->get( ).`);
 *   - a call `url_param_get( )` (or `url_param_get_tab( )`, the same read
 *     into a table) whose arguments hold `client->get( )-s_config-search`,
 *     of `client->get( )` or such a variable, or a variable assigned from
 *     exactly that.
 *
 * Not reported: `s_config-search` or `s_config-hash` read for anything else
 * (an origin, a route, a debug flag a tile never sets), and a class that is
 * not an app (a helper, the framework). A variable is followed through ONE
 * plain assignment in the same source, nothing further - a parameter handed
 * to a helper method is not followed.
 */
const APP = /\bINTERFACES\s+z2ui5_if_app\b/i;
const NAME = '[\\w/]+';
/* anchored at a word start: inside a long word every position would be tried */
const GET_CALL = `(?<![\\w/>-])(?:${NAME}->)*${NAME}->\\s*get\\s*\\(\\s*\\)`;
/* the statement is trimmed (and its period dropped) before: a lazy right side
 * followed by `\\s*` would try every split of a long blank run */
const ASSIGNMENT = new RegExp(`^(?:(?:DATA|FINAL)\\s*\\(\\s*(${NAME})\\s*\\)|(${NAME}))\\s*=([^]*)$`, 'i');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* The left and right side of every plain `x = …` / `DATA(x) = ….`. */
function assignments(model) {
  const out = [];
  for (const s of model.statements) {
    let text = model.code.slice(s.start, s.end).trimEnd();
    if (text.endsWith('.')) text = text.slice(0, -1);
    const m = ASSIGNMENT.exec(text);
    if (m) out.push({ name: (m[1] ?? m[2]).toLowerCase(), rhs: m[3].trim() });
  }
  return out;
}

/* Where the argument list of the call whose `(` is at `open` ends. */
function closeOf(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
    else if (code[i] === '.' && /\s/.test(code[i + 1] ?? ' ')) return i;
  }
  return code.length;
}

function check({ model, report }) {
  if (!APP.test(model.src)) return;
  const code = model.code;
  const assigned = assignments(model);
  const getCall = new RegExp(`^${GET_CALL}$`, 'i');
  const getVars = [...new Set(assigned.filter((a) => getCall.test(a.rhs)).map((a) => a.name))];
  const getExpr = `(?:${GET_CALL}${getVars.length ? `|(?<![\\w/>-])(?:${getVars.map(escape).join('|')})` : ''})`;

  for (const m of code.matchAll(new RegExp(`${getExpr}-t_comp_params\\b`, 'gi'))) {
    const offset = m.index + m[0].length - 't_comp_params'.length;
    report({ member: 't_comp_params', value: 't_comp_params', offset, dedupe: String(offset) });
  }

  const searchRead = `${getExpr}-s_config-search\\b`;
  const searchExact = new RegExp(`^${searchRead}$`, 'i');
  const searchVars = [...new Set(assigned.filter((a) => searchExact.test(a.rhs)).map((a) => a.name))];
  const inArgs = new RegExp(`${searchRead}${searchVars.length ? `|(?<![\\w/>-])(?:${searchVars.map(escape).join('|')})(?![\\w/-])` : ''}`, 'i');
  for (const m of code.matchAll(/(?<![\w/])url_param_get(?:_tab)?(?=\s*\()/gi)) {
    const open = code.indexOf('(', m.index);
    if (!inArgs.test(code.slice(open + 1, closeOf(code, open)))) continue;
    report({ member: m[0].toLowerCase(), value: 's_config-search', offset: m.index, dedupe: String(m.index) });
  }
}

export default defineRule({
  id: 'start-param-by-hand',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'class',
  message: (f) => `${f.member === 't_comp_params' ? 'the start parameter is read from client->get( )-t_comp_params, the launchpad tile only' : `the start parameter is read with ${f.member}( ) from s_config-search, the URL only`} - client->get_start_param( name ) reads the URL, the tile and the intent`,
  check,
});
