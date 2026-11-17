import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'obsolete-binder',
  summary: '`client->_bind_edit( )` — superseded by `client->_bind( )`',
  detail: '`_bind` is two-way as well, and `_bind_edit` is a pure alias for it. A call passing `custom_mapper_back` or `custom_filter_back` used to be exempt, because `_bind` has no such parameters — that exemption is gone with the parameters\' meaning: they are still accepted for source compatibility but no longer evaluated, per-direction mapping does not exist any more. Such a call is reported like every other, but without the autofix: the arguments have to go with the rename, and dropping an argument is not a rename.',
  example: 'a( n = `value` v = client->_bind_edit( name ) )',
  remedy: 'a( n = `value` v = client->_bind( name ) )',
  fixNote: 'Rewritten to `client->_bind( )`, the arguments untouched — except where the call passes `custom_mapper_back`/`custom_filter_back`, which is reported without a fix.',
});
