import { defineRule } from '../rule.mjs';
import { rowLiteralFacts } from '../abap-helpers.mjs';
import { topAssigned } from '../abap.mjs';

function check({ boolFields, src, report }) {
  if (!boolFields?.size) return;
  const facts = rowLiteralFacts(src);
  if (facts.omitInitial) return;
  const { omitted, filledAfter } = facts;
  for (const { key, open, usable, carried } of facts.tables) {
    /* The BOOLEAN counterpart of the enum rule, and it needs a second signal
     * the enum one does not.
     *
     * `abap_bool` has no absent state, so a field a row leaves out still
     * ships as a real JSON `false` — which is correct almost everywhere, and
     * wrong exactly where the UI5 property's own default is `true`: the row
     * then renders the OPPOSITE of what it meant, with nothing failing. On
     * its own that would report every boolean seed there is, so the rule asks
     * for both signals the probe measured: the property defaults to true AND
     * the seed is INCONSISTENT — some rows of this very table set the field
     * and others do not. A table that never sets it is ordinary data (`unread`,
     * `active` are false for every row on purpose); a table that always sets
     * it has nothing missing. The gap between two rows of one literal is what
     * is almost never deliberate — app 291's notification items lost both
     * close buttons that way, and with them the port's only backend wire. */
    const boolNames = boolFields.get(key.toUpperCase());
    if (boolNames?.size && usable.length > 1) {
      const later = filledAfter.get(key.toUpperCase());
      for (const field of boolNames) {
        if (carried.has(field) || omitted.has(field) || later?.has(field)) continue;
        const sets = usable.filter((r) => topAssigned(r.body).has(field));
        if (!sets.length || sets.length === usable.length) continue;
        for (const r of usable) {
          if (topAssigned(r.body).has(field)) continue;
          report({
            member: field, offset: open + 1 + r.offset,
          });
        }
      }
    }
  }
}

export default defineRule({
  id: 'absent-boolean-overrides-default',
  severity: 'error',
  category: 'data',
  scope: 'app',
  summary: 'a row that omits a boolean the neighbouring rows set, where the property defaults to `true`',
  detail: '`abap_bool` has no absent state, so a field a row leaves out still ships as a real JSON `false` — correct almost everywhere, and wrong exactly where the UI5 property\'s own default is `true`: the row then renders the OPPOSITE of what it means, with nothing failing anywhere. On its own that would report every boolean seed there is, so the rule asks for both signals: the property defaults to `true` AND the seed is INCONSISTENT, meaning some rows of this very table set the field and others do not. A table that never sets it is ordinary data (`unread` and `active` are false for every row on purpose); a table that always sets it has nothing missing. The gap between two rows of one literal is what is almost never deliberate — one port\'s notification items lost both close buttons that way, and with them its only backend wire. A field named in `omit_initial_paths`, carried as a constructor-level default, or filled by a later LOOP is never reported.',
  example: `TYPES: BEGIN OF ty_note, title TYPE string, icon_inset TYPE abap_bool, END OF ty_note.
DATA t_notes TYPE STANDARD TABLE OF ty_note WITH DEFAULT KEY.
t_notes = VALUE #( ( title = \`a\` icon_inset = abap_true )
                   ( title = \`b\` ) ).   " iconInset defaults to true and is now false
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_notes )
    )->ele( \`StandardListItem\`
        )->a( n = \`title\` v = \`{TITLE}\`
        )->a( n = \`iconInset\` v = \`{ICON_INSET}\` )`,
  remedy: `TYPES: BEGIN OF ty_note, title TYPE string, icon_inset TYPE abap_bool, END OF ty_note.
DATA t_notes TYPE STANDARD TABLE OF ty_note WITH DEFAULT KEY.
t_notes = VALUE #( ( title = \`a\` icon_inset = abap_true )
                   ( title = \`b\` icon_inset = abap_true ) ).
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( t_notes )
    )->ele( \`StandardListItem\`
        )->a( n = \`title\` v = \`{TITLE}\`
        )->a( n = \`iconInset\` v = \`{ICON_INSET}\` )`,
  message: (f) => `the row is built without ${f.member} while other rows of the same table set it — an ABAP field is never absent, so it ships a real false and OVERRIDES the property's own default of true; the row then renders the opposite of what it means. Seed it or name it in omit_initial_paths`,
  check,
});
