import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'absent-boolean-overrides-default',
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
});
