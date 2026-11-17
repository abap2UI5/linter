import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'invalid-property-value',
  summary: '`Button type="Emphasised"` — outside `sap.m.ButtonType`',
  detail: 'The literal is not a member of the enum the property is typed with, or it is not a number on an int/float property, or not a boolean on a boolean one. UI5 in future mode refuses the view rather than falling back to a default. Bindings and expressions are never value-checked — their value is a runtime matter. A UI5 enum is a `{ Key: "Value" }` map, and for the eight where the two differ (`CalendarIntervalType.OneMonth = "One Month"`, every `IllustratedMessageType`, `FileUploaderHttpRequestMethod.Post = "POST"`) the spelling an XML view needs is the KEY: an attribute goes through `parseValue( )`, which maps key to value, before it is validated, so the value form parses to `undefined` and the property keeps its default. Writing it is reported with its own message and a `--fix`.',
  example: 'view->tag( `Button` )->a( n = `type` v = `Emphasised` )',
  remedy: 'view->tag( `Button` )->a( n = `type` v = `Emphasized` )',
  fixNote: 'For an enum-typed property, where exactly one allowed value is the written value up to letter case (`emphasized` for `Emphasized`), the finding names it and `--fix` rewrites the value in place. The enum-VALUE form (`One Month` for `OneMonth`) is named the same way, from the metadata rather than by matching. A numeric or boolean property, and a value no single enum member matches that way, are reported without a suggestion.',
});
