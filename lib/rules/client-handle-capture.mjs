import { defineRule } from '../rule.mjs';
import { splitStatements, statementSpan } from '../abap.mjs';

export default defineRule({
  id: 'client-handle-capture',
  severity: 'warning',
  category: 'bindings',
  scope: 'class',
  summary: 'a `client->_bind( )` / `_event( )` handle captured into a variable',
  detail: 'The string a client handle returns is written at the control, not stored. The runtime does not mind either way; this linter does: the reconstructor resolves an attribute value that is a literal, a `&&` chain of literals or one of those calls IN PLACE, and a variable holding one is a runtime value to it — the attribute written from the variable is DROPPED from the reconstructed view, so every property, binding and version rule is blind to it, with no finding to say so (measured: `DATA(lv_b) = client->_bind( mv_text )` then `v = lv_b` reconstructs the Input without its `value`). Judged on statements — an inline `DATA( )` declaration or an assignment to a declared variable or field whose right-hand side is `_bind( )`, `_bind_edit( )`, `_event( )` or `_event_client( )`; a `v = client->_bind( … )` continuation line inside a builder call is the inline form and is not one. A warning, one notch above `unresolved-attribute-value`: there the check goes, here the attribute goes with it.',
  example: `DATA mv_text TYPE string.
DATA(lv_value) = client->_bind( mv_text ).
view->tag( \`Input\` )->a( n = \`value\` v = lv_value )   " reconstructed without its value`,
  remedy: `DATA mv_text TYPE string.
view->tag( \`Input\` )->a( n = \`value\` v = client->_bind( mv_text ) )`,
  fixNote: 'Where the captured name is read exactly once, as the `v =` of an attribute call, that read becomes the call\'s own text and the capturing statement is deleted (its whole line, when it has one to itself). A name read twice, read anywhere but as an attribute value, or a call spanning lines keeps the finding.',
  message: (f) => `${f.member} = client->${f.value}( ) captured into a variable — the reconstructor resolves the call in place only, so the attribute written from ${f.member} is dropped from the reconstructed view and no rule judges it; write the call at the control`,
  check({ model, source, report }) {
    const { src, code: blankHygiene } = model;
    /* A client handle — the string `_bind( )`, `_bind_edit( )`, `_bind_path( )`,
     * `_event( )`, `_event_client( )` or `_event_nav_app_leave( )` returns —
     * captured into a variable instead of written
     * at the control. The runtime does not mind; this linter does: the
     * reconstructor resolves an attribute value that is a literal, a `&&`
     * chain of literals, or one of those calls IN PLACE, and a variable holding
     * one is a runtime value to it — the attribute is DROPPED from the
     * reconstructed view, so every property, binding and version rule is
     * blind to it, with no finding to say so. Judged on statements, not lines:
     * a `v = client->_bind( )` continuation line inside a builder call starts
     * a line too, and is exactly the inline form. */
    /* The fix inlines the call: where the captured name is read exactly once,
     * as the `v =` of an attribute call, that read becomes the call's own text
     * and the capturing statement goes (its whole line, when it has one to
     * itself). A name read twice, read anywhere but as an attribute value, or
     * a call spanning lines is reported without a fix. */
    const statements = splitStatements(src);
    /* Where each name stands, read once: a use of `name` is a run of name
     * characters (`[\w-]`) that IS the name, which is what
     * `(?<![\w-])name(?![\w-])` matched - searched per capture, that was a
     * scan of the class per statement, quadratic in a class of captures. */
    let runsByName = null;
    const usesOf = (name) => {
      if (!runsByName) {
        runsByName = new Map();
        for (const r of blankHygiene.matchAll(/[\w-]+/g)) {
          const key = r[0].toLowerCase();
          if (!runsByName.has(key)) runsByName.set(key, []);
          runsByName.get(key).push(r.index);
        }
      }
      return runsByName.get(name.toLowerCase()) ?? [];
    };
    for (const st of statements) {
      const m = st.text.match(/^\s*(?:DATA\(\s*(\w+)\s*\)|(\w+))\s*=\s*(?:me->)?client->(_(?:bind(?:_edit|_path)?|event(?:_client|_nav_app_leave)?))\s*\(/i);
      if (!m) continue;
      const at = st.offset + st.text.search(/\S/);
      const name = m[1] || m[2];
      let fixes = null;
      {
        const stEnd = st.offset + st.text.length;
        // at most two uses outside the statement decide it: one is fixable, two are not
        const uses = [];
        for (const index of usesOf(name)) {
          if (index < st.offset || index >= stEnd) uses.push({ index });
          if (uses.length > 1) break;
        }
        const rhsAt = st.text.search(/(?:me->)?client->/i);
        const rhs = source.slice(st.offset + rhsAt, st.offset + st.text.trimEnd().length);
        if (uses.length === 1 && rhsAt !== -1 && !rhs.includes('\n')
            && /\bv\s*=\s*$/i.test(blankHygiene.slice(Math.max(0, uses[0].index - 20), uses[0].index))) {
          const decl = statementSpan(source, st.offset + st.text.search(/\S/), source[stEnd] === '.' ? stEnd + 1 : stEnd);
          fixes = [
            { start: decl.start, end: decl.end, text: '' },
            { start: uses[0].index, end: uses[0].index + name.length, text: rhs },
          ];
        }
      }
      report({ member: name, value: m[3], offset: at, ...(fixes ? { fixes } : {}) });
    }
  },
});
