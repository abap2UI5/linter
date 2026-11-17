import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'redundant-serializable',
  summary: '`INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`',
  detail: '`z2ui5_if_app` includes `if_serializable_object` — it has since the interface existed, because the framework persists the app instance with `CALL TRANSFORMATION id` between roundtrips and an app that cannot be serialized is not an app. Declaring it a second time compiles and changes nothing; what it costs is the reading. An app class is the most copied piece of ABAP in this ecosystem, and the extra line says that serialization is something an app has to ask for — so the next class is written with it too, and a reader who removes it wonders what broke. Only the class definition is read. A hint: the code is correct, it just says something that is not true.',
  example: `PUBLIC SECTION.
  INTERFACES if_serializable_object.
  DATA value TYPE string.`,
  remedy: `PUBLIC SECTION.
  DATA value TYPE string.`,
  fixNote: 'The whole line is deleted, which is what it is: a statement of its own whose only effect the surviving `INTERFACES z2ui5_if_app.` already has. A CHAINED declaration (`INTERFACES: if_serializable_object, z2ui5_if_app.`) names both in one statement and is reported without a fix — deleting a line out of it would leave a dangling comma.',
});
