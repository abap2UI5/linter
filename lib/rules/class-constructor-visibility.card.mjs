import { defineCard } from '../rule.mjs';

export default defineCard({
  id: 'class-constructor-visibility',
  summary: '`class_constructor` declared outside the `PUBLIC SECTION`',
  detail: 'The static constructor is called by the runtime itself, so its visibility is not a design choice: the compiler requires it public and a class declaring it PROTECTED or PRIVATE does not activate. Nothing in a systemless pipeline sees that — the class lints, the tests run, and the error appears the first time somebody imports the transport.',
  example: `PUBLIC SECTION.
  METHODS run.
PRIVATE SECTION.
  CLASS-METHODS class_constructor.`,
  remedy: `PUBLIC SECTION.
  CLASS-METHODS class_constructor.
  METHODS run.
PRIVATE SECTION.`,
  fixNote: 'The declaration line is deleted where it is and written again directly after the `PUBLIC SECTION.` of the same class definition, at its own indentation. Only for the one shape that is exactly that: `CLASS-METHODS class_constructor.` alone on its line, no chained colon form, no comment on the line, and a PROTECTED or PRIVATE SECTION between the public section and the line; anything else is reported without a fix.',
});
