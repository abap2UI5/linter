import { defineRule } from '../rule.mjs';

function check({ source, src, report }) {
  /* `INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`.
   *
   * z2ui5_if_app INCLUDES if_serializable_object - it has since the interface
   * existed, because the framework persists the app instance with
   * CALL TRANSFORMATION id between roundtrips and an app that cannot be
   * serialized is not an app. Declaring it a second time compiles and changes
   * nothing; what it costs is the reading. An app class is the most copied
   * piece of ABAP in this ecosystem, and the extra line says that
   * serialization is something an app has to ask for - so the next class is
   * written with it too, and a reader who removes it wonders what broke.
   *
   * A hint, like redundant-conv-i: the code is correct, it just says
   * something that is not true any more.
   *
   * Only the DEFINITION is read, and only the statement's own line is
   * offered as a fix: a chained `INTERFACES: if_serializable_object,
   * z2ui5_if_app.` names both in one statement, and deleting a line out of it
   * would leave a dangling comma. That one is reported without a fix. */
  const defEnd0 = src.search(/\bENDCLASS\b/i);
  const definition = defEnd0 === -1 ? src : src.slice(0, defEnd0);
  /* Both names are read out of INTERFACES STATEMENTS rather than out of the
   * source at large: the guard every other rule here uses
   * (`INTERFACES z2ui5_if_app`) does not see the chained `INTERFACES:
   * if_serializable_object, z2ui5_if_app.`, which is exactly the shape that
   * carries the redundancy most often. */
  const statements = [...definition.matchAll(/\bINTERFACES\b:?[^.]*\./gi)];
  const isApp = statements.some((m) => /\bz2ui5_if_app\b/i.test(m[0]));
  const carries = statements.find((m) => /\bif_serializable_object\b/i.test(m[0]));
  if (isApp && carries) {
    const own = /^([ \t]*)INTERFACES[ \t]+if_serializable_object[ \t]*\.[ \t]*\r?\n/im.exec(definition);
    /* The scan runs over the SCRUBBED copy, where a trailing comment is
     * blanked to spaces and matched by the `[ \t]*` before the line break -
     * so `INTERFACES if_serializable_object. " keep: …` was deleted with
     * its comment. Only a line the original spells the same is fixed; one
     * carrying a comment is reported without a fix. */
    const same = own && source.slice(own.index, own.index + own[0].length) === own[0];
    report({
      offset: own ? own.index + own[1].length : carries.index,
      ...(same ? { fixes: [{ start: own.index, end: own.index + own[0].length, text: '' }] } : {}),
    });
  }
}

export default defineRule({
  id: 'redundant-serializable',
  severity: 'hint',
  category: 'lifecycle',
  scope: 'app',
  summary: '`INTERFACES if_serializable_object.` beside `INTERFACES z2ui5_if_app.`',
  detail: '`z2ui5_if_app` includes `if_serializable_object` — it has since the interface existed, because the framework persists the app instance with `CALL TRANSFORMATION id` between roundtrips and an app that cannot be serialized is not an app. Declaring it a second time compiles and changes nothing; what it costs is the reading. An app class is the most copied piece of ABAP in this ecosystem, and the extra line says that serialization is something an app has to ask for — so the next class is written with it too, and a reader who removes it wonders what broke. Only the class definition is read. A hint: the code is correct, it just says something that is not true.',
  example: `PUBLIC SECTION.
  INTERFACES if_serializable_object.
  DATA value TYPE string.`,
  remedy: `PUBLIC SECTION.
  DATA value TYPE string.`,
  fixNote: 'The whole line is deleted, which is what it is: a statement of its own whose only effect the surviving `INTERFACES z2ui5_if_app.` already has. A CHAINED declaration (`INTERFACES: if_serializable_object, z2ui5_if_app.`) names both in one statement and is reported without a fix — deleting a line out of it would leave a dangling comma.',
  message: (f) => 'the class declares INTERFACES if_serializable_object beside z2ui5_if_app — z2ui5_if_app already includes it, so the line adds nothing and reads as if an app had to ask for serialization',
  check,
});
