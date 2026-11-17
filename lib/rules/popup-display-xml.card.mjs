import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'popup-display-xml',
  summary: '`popup_display( xml = … )` — the parameter is `val`',
  detail: 'The mirror of `popover-display-val`, the same asymmetry read from the other side: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. The guide (§6): "**Mind the asymmetry**: the popup takes its XML as `val`, the popover as `xml` — one of the most common first-try mistakes." An `xml =` guessed from the popover does not compile, and nothing in a systemless pipeline says so before activation — abaplint has no signature knowledge of `z2ui5_if_client`, and the render gate never sees the class fail.',
  example: 'client->popup_display( xml = popup->stringify( ) ).   " does not compile',
  remedy: 'client->popup_display( val = popup->stringify( ) ).',
  fixNote: 'The parameter name is rewritten to `val`, the argument untouched.',
});
