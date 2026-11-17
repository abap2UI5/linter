import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'bind-path-flag',
  summary: '`_bind( val = x path = abap_true )` where `_bind_path( x )` says the same',
  detail: '`_bind_path( )` is the path form of `_bind( )` under a name of its own and delegates to it, so the two calls return the same text byte for byte. It exists because the flag reads like nothing: a named `val` and a boolean whose meaning the reader has to know already. One spelling for one thing also keeps the corpora searchable. Judged only where the call passes exactly `val` and `path = abap_true`: with a third argument (`json`, `tab`, `switch_default_model`, …) `_bind( )` is the right call and the flag stays. A call that is the whole `v =` value of an attribute is `bind-path-as-value`\'s, which reports the bare path itself.',
  example: `|\\{ path: '{ client->_bind( val = mt_rows path = abap_true ) }', templateShareable: false \\}|`,
  remedy: `|\\{ path: '{ client->_bind_path( mt_rows ) }', templateShareable: false \\}|`,
  fixNote: 'The call is rewritten to `_bind_path( <val> )`, keeping the value expression as written. Only for the two-argument shape the rule reports.',
});
