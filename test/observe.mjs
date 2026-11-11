/*
 * observe — the check entry points, wrapped so the suite knows which rules it
 * actually made fire.
 *
 * Why: `npm test` asserted 83 of the 84 rules and nobody could tell. The one
 * that had no test (`escaped-brace-in-backtick`) was not skipped or disabled —
 * it was simply never written, and nothing in the repository was in a position
 * to say so. A linter's promise is that its rules fire; a rule that quietly
 * stopped firing would pass this suite, ship, and report nothing for as long
 * as it took someone to notice by hand.
 *
 * So the suite records every finding type it produces, and asserts at the end
 * that every id in the registry occurred at least once (test/run.mjs, "rule
 * coverage"). That is weaker than "every rule has a test asserting its exact
 * shape" — an incidental finding counts — but it is checkable rather than
 * regex-guessed from the test source, and it fails in the safe direction: a
 * new rule cannot reach main without a source somewhere that triggers it.
 *
 * Import these instead of `../lib/index.mjs` / `../lib/abap-rules.mjs` in
 * tests. Everything else those modules export is re-exported untouched.
 */
import * as index from '../lib/index.mjs';
import * as abapRules from '../lib/abap-rules.mjs';

/** Every rule id the suite has produced so far. */
export const produced = new Set();

const note = (findings) => {
  for (const finding of findings ?? []) if (finding?.type) produced.add(finding.type);
};

export const checkAbapRules = (...args) => {
  const findings = abapRules.checkAbapRules(...args);
  note(findings);
  return findings;
};

export const checkAbapSource = (...args) => {
  const result = index.checkAbapSource(...args);
  note(result?.findings);
  return result;
};

export const checkXmlSource = (...args) => {
  const result = index.checkXmlSource(...args);
  note(result?.findings);
  return result;
};

/* In the static half (test/run.mjs, `section.browser`) a call that does not
 * ASK for the render gate runs without it: the default is "on", and the
 * fixtures the suite loads before its first section would otherwise start a
 * browser the static half refuses. A call that says `render: true` keeps
 * saying it, and fails there unless its section is marked. */
const STATIC = process.env.ABAP2UI5LINT_TEST_STATIC === '1';

export const checkFiles = async (...args) => {
  if (STATIC && args[1]?.render === undefined) args[1] = { ...args[1], render: false };
  const results = await index.checkFiles(...args);
  for (const result of results ?? []) note(result?.findings);
  return results;
};

/** The source-side entry a class that builds no view is judged by. */
export const checkSourceRules = (...args) => {
  const findings = abapRules.checkSourceRules(...args);
  note(findings);
  return findings;
};

export const { namedModels } = abapRules;
export const { collectFiles } = index;
