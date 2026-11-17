import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'omit-initial-drops-false',
  summary: '`omit_initial = abap_true` on a table whose boolean the control defaults to `true`',
  detail: 'An ABAP field is never absent — it is initial — so by default every field reaches the browser as an explicit `""`/`0`/`false` and overrides the control\'s own default; `omit_initial = abap_true` is the blanket answer, keeping initial fields out of the model so each control keeps its UI5 default. A boolean the view binds to a property that defaults to `true` is the one field that turns that around: `abap_false` is itself initial, so the flag drops exactly the value that had to arrive, and the control shows `true`. The interface\'s ABAP Doc on `omit_initial_paths`: "an abap_false that MUST reach the client is itself initial, so omit_initial would drop it and the control would fall back to its own default — list the numeric/enum columns instead and leave the booleans". Judged from what the entry point already knows — the row field is bound to a boolean property whose snapshot `defaultValue` is `true` (the same read `absent-boolean-overrides-default` makes), and the class declares that component with a boolean type. No fix: which columns to list in `omit_initial_paths` is the author\'s call.',
  example: `TYPES: BEGIN OF ty_row, title TYPE string, enabled TYPE abap_bool, END OF ty_row.
DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial = abap_true )
    )->tag( \`StandardListItem\`
        )->a( n = \`title\`   v = \`{TITLE}\`
        )->a( n = \`visible\` v = \`{ENABLED}\` )   " an abap_false row is dropped and shows`,
  remedy: `TYPES: BEGIN OF ty_row, title TYPE string, enabled TYPE abap_bool, END OF ty_row.
DATA t_rows TYPE STANDARD TABLE OF ty_row WITH EMPTY KEY.
view->ele( \`List\` )->a( n = \`items\` v = client->_bind( val = t_rows omit_initial_paths = VALUE #( ( \`TITLE\` ) ) )
    )->tag( \`StandardListItem\`
        )->a( n = \`title\`   v = \`{TITLE}\`
        )->a( n = \`visible\` v = \`{ENABLED}\` )`,
});
