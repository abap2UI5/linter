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
import aggregationInAggregation from './aggregation-in-aggregation.mjs';
import aggregationTooNew from './aggregation-too-new.mjs';
import bindPathAsValue from './bind-path-as-value.mjs';
import bindPathFlag from './bind-path-flag.mjs';
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.mjs';
import boundAggregationOverSizeLimit from './bound-aggregation-over-size-limit.mjs';
import byteOrderMark from './byte-order-mark.mjs';
import classConstructorVisibility from './class-constructor-visibility.mjs';
import clientHandleCapture from './client-handle-capture.mjs';
import closeOnlyRoundtrip from './close-only-roundtrip.mjs';
import columnCellCountMismatch from './column-cell-count-mismatch.mjs';
import controlDeprecated from './control-deprecated.mjs';
import controlTooNew from './control-too-new.mjs';
import crlfLineEnding from './crlf-line-ending.mjs';
import defaultKeyTable from './default-key-table.mjs';
import deleteIndexInLoop from './delete-index-in-loop.mjs';
import deprecatedLibrary from './deprecated-library.mjs';
import duplicateAggregation from './duplicate-aggregation.mjs';
import duplicateForIterator from './duplicate-for-iterator.mjs';
import duplicateId from './duplicate-id.mjs';
import editableControlWithoutBinding from './editable-control-without-binding.mjs';
import emptyCatchBlock from './empty-catch-block.mjs';
import escapeSequenceInBacktick from './escape-sequence-in-backtick.mjs';
import eventArgDefaultIndex from './event-arg-default-index.mjs';
import eventArgJsCallback from './event-arg-js-callback.mjs';
import eventOnDisabledControl from './event-on-disabled-control.mjs';
import externalLinkWithoutTarget from './external-link-without-target.mjs';
import frontendActionAsBackendEvent from './frontend-action-as-backend-event.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.mjs';
import invalidAggregationChild from './invalid-aggregation-child.mjs';
import lifecycleIsInitial from './lifecycle-is-initial.mjs';
import manualInitFlag from './manual-init-flag.mjs';
import missingAccessibility from './missing-accessibility.mjs';
import missingFinalNewline from './missing-final-newline.mjs';
import missingRequiredAggregation from './missing-required-aggregation.mjs';
import nativeHtmlInView from './native-html-in-view.mjs';
import nestViewWithoutDestroy from './nest-view-without-destroy.mjs';
import nonReleasedApi from './non-released-api.mjs';
import omitInitialDropsFalse from './omit-initial-drops-false.mjs';
import pickerValueWithoutFormat from './picker-value-without-format.mjs';
import popupDisplayXml from './popup-display-xml.mjs';
import queueLastWithoutNoBusy from './queue-last-without-no-busy.mjs';
import redundantConvI from './redundant-conv-i.mjs';
import redundantInitDisplay from './redundant-init-display.mjs';
import rowsHiddenByVisible from './rows-hidden-by-visible.mjs';
import sapui5OnlyControl from './sapui5-only-control.mjs';
import secondRoot from './second-root.mjs';
import separateLifecycleIfs from './separate-lifecycle-ifs.mjs';
import sourceLineTooLong from './source-line-too-long.mjs';
import tooManyChildren from './too-many-children.mjs';
import toolbarControlInBar from './toolbar-control-in-bar.mjs';
import trailingWhitespace from './trailing-whitespace.mjs';
import unconvertedAbapBoolean from './unconverted-abap-boolean.mjs';
import undeclaredNamespace from './undeclared-namespace.mjs';
import undefinedCssClass from './undefined-css-class.mjs';
import unescapedTextInAttribute from './unescaped-text-in-attribute.mjs';
import unknownAggregation from './unknown-aggregation.mjs';
import unknownControl from './unknown-control.mjs';
import unknownSourceProperty from './unknown-source-property.mjs';
import unusedNamespaceDeclaration from './unused-namespace-declaration.mjs';
import valueHeaderDefaultReassigned from './value-header-default-reassigned.mjs';
import viewNeverDisplayed from './view-never-displayed.mjs';

export const UNIT_RULES = Object.freeze([
  abapDateFormatterMismatch,
  abapdocHtmlTag,
  aggregationInAggregation,
  aggregationTooNew,
  bindPathAsValue,
  bindPathFlag,
  boolcInsteadOfXsdbool,
  boundAggregationOverSizeLimit,
  byteOrderMark,
  classConstructorVisibility,
  clientHandleCapture,
  closeOnlyRoundtrip,
  columnCellCountMismatch,
  controlDeprecated,
  controlTooNew,
  crlfLineEnding,
  defaultKeyTable,
  deleteIndexInLoop,
  deprecatedLibrary,
  duplicateAggregation,
  duplicateForIterator,
  duplicateId,
  editableControlWithoutBinding,
  emptyCatchBlock,
  escapeSequenceInBacktick,
  eventArgDefaultIndex,
  eventArgJsCallback,
  eventOnDisabledControl,
  externalLinkWithoutTarget,
  frontendActionAsBackendEvent,
  intoCorrespondingInlineDecl,
  invalidAggregationChild,
  lifecycleIsInitial,
  manualInitFlag,
  missingAccessibility,
  missingFinalNewline,
  missingRequiredAggregation,
  nativeHtmlInView,
  nestViewWithoutDestroy,
  nonReleasedApi,
  omitInitialDropsFalse,
  pickerValueWithoutFormat,
  popupDisplayXml,
  queueLastWithoutNoBusy,
  redundantConvI,
  redundantInitDisplay,
  rowsHiddenByVisible,
  sapui5OnlyControl,
  secondRoot,
  separateLifecycleIfs,
  sourceLineTooLong,
  tooManyChildren,
  toolbarControlInBar,
  trailingWhitespace,
  unconvertedAbapBoolean,
  undeclaredNamespace,
  undefinedCssClass,
  unescapedTextInAttribute,
  unknownAggregation,
  unknownControl,
  unknownSourceProperty,
  unusedNamespaceDeclaration,
  valueHeaderDefaultReassigned,
  viewNeverDisplayed,
]);

const BY_ID = new Map(UNIT_RULES.map((r) => [r.id, r]));
if (BY_ID.size !== UNIT_RULES.length) throw new Error('lib/rules/index.mjs: two rules share an id');

/** The rule defined as a unit under `id`, or undefined. */
export const unitRule = (id) => BY_ID.get(id);
