import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'control-deprecated',
  summary: 'control already deprecated at your target version',
  detail: 'Reported only once the deprecation is in effect at the version you target — a control deprecated as of 1.149 stays silent for a 1.71 target.',
  example: 'view->tag( `DateTimeInput` )   " deprecated as of 1.32.8',
  remedy: 'view->tag( `DateTimePicker` )',
});
