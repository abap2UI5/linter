import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'popover-display-val',
  summary: '`popover_display( val = … )` — the parameter is `xml`',
  detail: 'The one asymmetry in the display family: `popup_display( )` imports `val`, `popover_display( )` imports `xml`. A `val =` guessed by analogy does not compile — but nothing in a systemless pipeline says so before activation, so the mistake rides along until the class first meets a compiler. One of the most common first-try mistakes in generated code.',
  example: 'client->popover_display( val = popover->stringify( ) ).   " does not compile',
  remedy: 'client->popover_display( xml = popover->stringify( ) ).',
  fixNote: 'The parameter name is rewritten to `xml`, the argument untouched.',
});
