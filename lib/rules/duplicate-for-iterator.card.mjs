import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'duplicate-for-iterator',
  summary: 'the same `FOR` iterator name twice in one method',
  detail: 'Fine on ABAP 7.50+, where the iterator is local to its `VALUE #( )` expression — but a 7.02 downport (abaplint `--fix`, and the transpiler behind a Node-based runtime) materializes each one as `DATA <name> TYPE i` in the method body, and the second declaration fails activation with "variable already defined". Use distinct names (`i`, `j`, `k`) per `VALUE` block.',
  example: `DATA(a) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).
DATA(b) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).   " downported: i declared twice`,
  remedy: `DATA(a) = VALUE ty_t( FOR i = 1 WHILE i <= 3 ( i ) ).
DATA(b) = VALUE ty_t( FOR j = 1 WHILE j <= 3 ( j ) ).`,
});
