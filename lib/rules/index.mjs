/*
 * The rules written as one unit each (lib/rule.mjs). The registries read
 * this list: findings.mjs (severity, sentence, opt-in), rule-docs.mjs (the
 * card), fix.mjs (the fixable list), abap-rules.mjs (the run).
 *
 * Imported statically, one line per rule, so a bundler sees every module and
 * nothing here walks a directory. Adding a rule is a file and a line.
 */
import abapDateFormatterMismatch from './abap-date-formatter-mismatch.mjs';
import abapdocHtmlTag from './abapdoc-html-tag.mjs';
import bindPathAsValue from './bind-path-as-value.mjs';
import bindPathFlag from './bind-path-flag.mjs';
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.mjs';
import byteOrderMark from './byte-order-mark.mjs';
import classConstructorVisibility from './class-constructor-visibility.mjs';
import clientHandleCapture from './client-handle-capture.mjs';
import closeOnlyRoundtrip from './close-only-roundtrip.mjs';
import crlfLineEnding from './crlf-line-ending.mjs';
import defaultKeyTable from './default-key-table.mjs';
import deleteIndexInLoop from './delete-index-in-loop.mjs';
import duplicateForIterator from './duplicate-for-iterator.mjs';
import emptyCatchBlock from './empty-catch-block.mjs';
import escapeSequenceInBacktick from './escape-sequence-in-backtick.mjs';
import eventArgDefaultIndex from './event-arg-default-index.mjs';
import eventArgJsCallback from './event-arg-js-callback.mjs';
import frontendActionAsBackendEvent from './frontend-action-as-backend-event.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.mjs';
import lifecycleIsInitial from './lifecycle-is-initial.mjs';
import manualInitFlag from './manual-init-flag.mjs';
import missingFinalNewline from './missing-final-newline.mjs';
import nestViewWithoutDestroy from './nest-view-without-destroy.mjs';
import nonReleasedApi from './non-released-api.mjs';
import omitInitialDropsFalse from './omit-initial-drops-false.mjs';
import popupDisplayXml from './popup-display-xml.mjs';
import queueLastWithoutNoBusy from './queue-last-without-no-busy.mjs';
import redundantConvI from './redundant-conv-i.mjs';
import redundantInitDisplay from './redundant-init-display.mjs';
import separateLifecycleIfs from './separate-lifecycle-ifs.mjs';
import sourceLineTooLong from './source-line-too-long.mjs';
import trailingWhitespace from './trailing-whitespace.mjs';
import unconvertedAbapBoolean from './unconverted-abap-boolean.mjs';
import unescapedTextInAttribute from './unescaped-text-in-attribute.mjs';
import valueHeaderDefaultReassigned from './value-header-default-reassigned.mjs';
import viewNeverDisplayed from './view-never-displayed.mjs';

export const UNIT_RULES = Object.freeze([
  abapDateFormatterMismatch,
  abapdocHtmlTag,
  bindPathAsValue,
  bindPathFlag,
  boolcInsteadOfXsdbool,
  byteOrderMark,
  classConstructorVisibility,
  clientHandleCapture,
  closeOnlyRoundtrip,
  crlfLineEnding,
  defaultKeyTable,
  deleteIndexInLoop,
  duplicateForIterator,
  emptyCatchBlock,
  escapeSequenceInBacktick,
  eventArgDefaultIndex,
  eventArgJsCallback,
  frontendActionAsBackendEvent,
  intoCorrespondingInlineDecl,
  lifecycleIsInitial,
  manualInitFlag,
  missingFinalNewline,
  nestViewWithoutDestroy,
  nonReleasedApi,
  omitInitialDropsFalse,
  popupDisplayXml,
  queueLastWithoutNoBusy,
  redundantConvI,
  redundantInitDisplay,
  separateLifecycleIfs,
  sourceLineTooLong,
  trailingWhitespace,
  unconvertedAbapBoolean,
  unescapedTextInAttribute,
  valueHeaderDefaultReassigned,
  viewNeverDisplayed,
]);

const BY_ID = new Map(UNIT_RULES.map((r) => [r.id, r]));
if (BY_ID.size !== UNIT_RULES.length) throw new Error('lib/rules/index.mjs: two rules share an id');

/** The rule defined as a unit under `id`, or undefined. */
export const unitRule = (id) => BY_ID.get(id);
