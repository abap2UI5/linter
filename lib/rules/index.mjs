/*
 * The rules written as one unit each (lib/rule.mjs). The registries read
 * this list: findings.mjs (severity, sentence, opt-in), rule-docs.mjs (the
 * card), fix.mjs (the fixable list), abap-rules.mjs (the run).
 *
 * Imported statically, one line per rule, so a bundler sees every module and
 * nothing here walks a directory. Adding a rule is a file and a line.
 */
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.mjs';
import classConstructorVisibility from './class-constructor-visibility.mjs';
import emptyCatchBlock from './empty-catch-block.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.mjs';
import redundantConvI from './redundant-conv-i.mjs';

export const UNIT_RULES = Object.freeze([
  boolcInsteadOfXsdbool,
  classConstructorVisibility,
  emptyCatchBlock,
  intoCorrespondingInlineDecl,
  redundantConvI,
]);

const BY_ID = new Map(UNIT_RULES.map((r) => [r.id, r]));
if (BY_ID.size !== UNIT_RULES.length) throw new Error('lib/rules/index.mjs: two rules share an id');

/** The rule defined as a unit under `id`, or undefined. */
export const unitRule = (id) => BY_ID.get(id);
