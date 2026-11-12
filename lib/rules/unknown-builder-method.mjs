import { defineRule } from '../rule.mjs';
import { splitStatements } from '../abap.mjs';
import { BUILDERS, isBuilderMethod } from '../builders.mjs';

/* Read the top-level `->name(` and `=>name(` calls of one statement: the ones
 * at parenthesis depth 0, so a `client->_bind( … )` written as an argument is
 * not the chain's. */
function topLevelCalls(text) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === '-' || c === '=') && text[i + 1] === '>') {
      const m = /^\s*(\w+)\s*\(/.exec(text.slice(i + 2));
      if (m) out.push({ name: m[1], at: i + 2 + m[0].indexOf(m[1]), static: c === '=' });
    }
  }
  return out;
}

function check({ code, report }) {
  /* A method the builder does not have. The frozen `z2ui5_cl_xml_view` has
   * one method per control (`->page( )`, `->input( )`, `->button( )`), and a
   * class that names the CURRENT builder but calls it that way does not
   * activate - and reconstructs no view, so until this rule it was "no view
   * built" and nothing else. Found by the eval pack (experimental/evals): a
   * model answering from memory wrote `z2ui5_cl_ui5_view_builder=>page( … )`
   * and `->input( … )` in every one of its twelve answers. Judged on a
   * statement that starts from the builder class or from a handle declared
   * with its type or captured from it; the calls read are the chain's own,
   * at depth 0. Read from `code`, literals blanked. */
  const classes = BUILDERS.map((b) => b.class).join('|');
  /* Handles per METHOD: a name is a builder handle in the method that
   * declares or captures it, and in every method when the DEFINITION part
   * types it (an attribute, a parameter). `lo_popup` is a builder in one
   * method of abap2UI5-addons/popups' range popup and a popup class in the
   * next. */
  const typed = new RegExp(`\\b(\\w+)\\s+TYPE\\s+REF\\s+TO\\s+(?:${classes})\\b`, 'gi');
  const impl = code.search(/\bCLASS\s+\S+\s+IMPLEMENTATION\b/i);
  const classWide = new Set();
  for (const m of (impl < 0 ? '' : code.slice(0, impl)).matchAll(typed)) classWide.add(m[1].toLowerCase());
  let handles = new Set(classWide);
  for (const st of splitStatements(code)) {
    const text = st.text;
    const lead = text.search(/\S/);
    const s = text.slice(lead);
    if (/^METHOD\s/i.test(s)) { handles = new Set(classWide); continue; }
    if (impl >= 0 && st.offset > impl) for (const m of s.matchAll(typed)) handles.add(m[1].toLowerCase());
    // `DATA(v) = <class>=>…` / `v = <handle>->…` - the capture makes v a handle
    const cap = s.match(new RegExp(`^(?:(?:DATA|FINAL)\\(\\s*(\\w+)\\s*\\)|(?:me->)?(\\w+))\\s*=\\s*(?:me->)?(\\w+)\\s*(=>|->)`, 'i'));
    const head = s.match(new RegExp(`^(?:me->)?(\\w+)\\s*(=>|->)`, 'i'));
    let from = null;
    let rhsAt = 0;
    if (cap) {
      const src = cap[3].toLowerCase();
      if ((cap[4] === '=>' && new RegExp(`^(?:${classes})$`, 'i').test(src)) || (cap[4] === '->' && handles.has(src))) {
        from = src;
        rhsAt = s.indexOf(cap[3], cap[0].indexOf('=') + 1);
        handles.add((cap[1] || cap[2]).toLowerCase());
      }
    } else if (head) {
      const src = head[1].toLowerCase();
      if ((head[2] === '=>' && new RegExp(`^(?:${classes})$`, 'i').test(src)) || (head[2] === '->' && handles.has(src))) from = src;
    }
    if (!from) continue;
    const chain = s.slice(rhsAt);
    for (const call of topLevelCalls(chain)) {
      if (isBuilderMethod(call.name, { statics: call.static })) continue;
      report({ member: call.name, value: call.static ? 'static' : 'instance', dedupe: String(st.offset + lead + rhsAt + call.at), offset: st.offset + lead + rhsAt + call.at });
    }
  }
}

export default defineRule({
  id: 'unknown-builder-method',
  severity: 'error',
  category: 'structure',
  scope: 'app',
  summary: 'a method `z2ui5_cl_ui5_view_builder` does not have — `->page( )`, `->input( )`: the frozen builder\'s API on the current one',
  detail: 'The view builder has four verbs and a renderer: `ele( )`, `tag( )`, `a( )`, `end( )` and `stringify( )`, plus the static `factory( )` and `escape_literal( )`. The frozen `z2ui5_cl_xml_view` had one method per control - `->page( )`, `->input( )`, `->button( )` - and every tutorial on the public web shows that API, so it is what an answer from memory writes, even when it names the current class. Such a class does not activate, and it reconstructs no view, so it used to pass as "no view built" with nothing reported. Judged on a statement that starts from the builder class or from a handle of it (declared `TYPE REF TO z2ui5_cl_ui5_view_builder`, or captured from a builder call); only the chain\'s own calls are read, so an argument like `client->_bind( … )` is not one. Write the control as `ele( \\`Page\\` )` / `tag( \\`Input\\` )` and its properties with `a( n = … v = … )`.',
  example: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->input( value = client->_bind( mv_text ) ).`,
  remedy: `DATA(view) = z2ui5_cl_ui5_view_builder=>factory( ).
view->ele( \`Page\` )->tag( \`Input\` )->a( n = \`value\` v = client->_bind( mv_text ) ).`,
  message: (f) => `${f.member}( ) is no method of z2ui5_cl_ui5_view_builder - it has ${f.value === 'static' ? 'the static factory( ) and escape_literal( )' : 'ele( ), tag( ), a( ), end( ) and stringify( )'}; a per-control method is the frozen z2ui5_cl_xml_view's API, and this class does not activate: write the control as ele( \`${f.member.charAt(0).toUpperCase()}${f.member.slice(1)}\` ) / tag( … ) and its properties with a( n = … v = … )`,
  check,
});
