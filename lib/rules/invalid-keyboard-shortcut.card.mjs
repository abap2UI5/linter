import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-keyboard-shortcut',
  summary: 'a shortcut combo that names no key',
  detail: 'The registration normalizes the combo (`Ctrl+Shift+S` → `ctrl+shift+s`, aliases like `cmd`/`return` included) and refuses one that consists of modifiers only — logged once, never registered, and every later keydown simply does nothing. The scope argument is judged separately: a slot key or a declared control id (via `frontend-action-unknown-id`).',
  example: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift\` ) ( \`SAVE\` ) ) )   " modifiers only — binds nothing`,
  remedy: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift+S\` ) ( \`SAVE\` ) ) )`,
});
