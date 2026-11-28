import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'event-read-by-struct',
  summary: '`client->get( )-event` where `client->get_event( )` is the idiom',
  detail: '`get_event( )` returns the same field as `get( )-event` — `z2ui5_if_client` documents it as the shortcut, made for the dispatcher `CASE client->get_event( ).` Both work, so this is a hint. The struct read is what most code written before release 1.143 uses, and what an assistant trained on it writes beside API that has since been removed; the method is the form the app guide, the samples and the framework documentation use, so one spelling is what the next reader looks for. Only the event name is renamed: `get( )-t_event_arg` is the whole argument list, while `get_event_arg( )` reads one position, so that read is left as it is.',
  example: 'CASE client->get( )-event.',
  remedy: 'CASE client->get_event( ).',
  fixNote: 'The read `get( )-event` is replaced by `get_event( )`; the handle in front of it (`client->`, `me->client->`, `li_client->`) and everything around it stay.',
});
