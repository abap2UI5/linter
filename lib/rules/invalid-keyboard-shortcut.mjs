import { defineRule } from '../rule.mjs';
import { SHORTCUT_ALIASES, SHORTCUT_MODIFIERS } from '../frontend-actions.mjs';

function check({ action, args, report }) {
  /* KEYBOARD_SHORTCUT: a combo that names no non-modifier key is logged
   * and never registered — `Ctrl+Shift` binds nothing. The scope (t_arg@2)
   * is a slot key or a declared control id; anything else makes the
   * registration permanently ineligible, silently. And the EVENT (t_arg@1)
   * is a backend event like any client->_event( ) one — collected for the
   * handler check below. */
  if (action !== 'keyboard_shortcut') return;
  const combo = args[0];
  if (combo && combo.value !== null) {
    const parts = String(combo.value).split('+')
      .map((p) => { const t = p.trim().toLowerCase(); return SHORTCUT_ALIASES[t] ?? t; })
      .filter((p) => p !== '');
    if (!parts.some((p) => !SHORTCUT_MODIFIERS.includes(p))) {
      report({ member: 'combo', value: String(combo.value).slice(0, 40), offset: combo.offset });
    }
  }
}

export default defineRule({
  id: 'invalid-keyboard-shortcut',
  severity: 'error',
  category: 'frontend-wires',
  scope: 'app',
  summary: 'a shortcut combo that names no key',
  detail: 'The registration normalizes the combo (`Ctrl+Shift+S` → `ctrl+shift+s`, aliases like `cmd`/`return` included) and refuses one that consists of modifiers only — logged once, never registered, and every later keydown simply does nothing. The scope argument is judged separately: a slot key or a declared control id (via `frontend-action-unknown-id`).',
  example: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift\` ) ( \`SAVE\` ) ) )   " modifiers only — binds nothing`,
  remedy: `client->follow_up_action( val   = client->cs_event-keyboard_shortcut
                          t_arg = VALUE #( ( \`Ctrl+Shift+S\` ) ( \`SAVE\` ) ) )`,
  message: (f) => `the combo '${f.value}' names no non-modifier key — the shortcut is logged and never registered`,
  check,
});
