import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'icon-too-new',
  summary: 'an icon that reached the font after your target version',
  detail: 'The same silence as `unknown-icon`, one release boundary later: the glyph exists today and did not exist on the release you target, so the control renders without an icon there and nowhere else. `information` arrived in 1.80 (use `message-information`) and `clear-all` in 1.86 (use `eraser`) — both shipped past a green CI and were found by a user on 1.71. The registry\'s floor is 1.71, so a name already present there is recorded as "at or before" and a target below 1.71 is never judged.',
  example: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://information` )   " @since 1.80 on a 1.71 target',
  remedy: 'view->tag( `Button` )->a( n = `icon` v = `sap-icon://message-information` )   " in 1.71',
});
