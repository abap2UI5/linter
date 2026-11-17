import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'member-deprecated',
  summary: 'property or event already deprecated at your target version',
  detail: 'As `control-deprecated`, per member. The replacement is usually named in the deprecation text the finding quotes.',
  example: 'view->tag( `Bar` )->a( n = `translucent` v = `true` )   " deprecated since 1.18.6',
  remedy: 'view->tag( `Bar` )   " the property has no effect any more - drop it',
});
