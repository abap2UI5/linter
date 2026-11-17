import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'value-header-default-reassigned',
  summary: 'a `VALUE` component assigned in the header and again in a row',
  detail: 'A component assigned before the first line spec is a DEFAULT for all following lines, not an overridable one, so assigning it again inside a row makes the system\'s syntax check refuse the whole constructor: *"The component was specified more than once."* abaplint accepts the construct without a finding — its `VALUE` grammar does not model the one-assignment rule — so this reached a repository\'s main branch through a green CI and was found by a user running Code Inspector\'s SYNTAX_CHECK over a pulled copy. Write the value per row instead, or close the header\'s scope with a second group: the default binds only to the lines *after* it.',
  example: 'VALUE #( selectable = abap_true ( a = 1 ) ( a = 2 selectable = abap_false ) )',
  remedy: 'VALUE #( ( a = 1 selectable = abap_true ) ( a = 2 selectable = abap_false ) )',
});
