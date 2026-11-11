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
import associationUnknownId from './association-unknown-id.mjs';
import bindPathAsValue from './bind-path-as-value.mjs';
import bindPathFlag from './bind-path-flag.mjs';
import bindingForEvent from './binding-for-event.mjs';
import bindingOnAssociation from './binding-on-association.mjs';
import bindingTypeMismatch from './binding-type-mismatch.mjs';
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.mjs';
import boundAggregationOverSizeLimit from './bound-aggregation-over-size-limit.mjs';
import boundAggregationWithoutTemplate from './bound-aggregation-without-template.mjs';
import byteOrderMark from './byte-order-mark.mjs';
import classConstructorVisibility from './class-constructor-visibility.mjs';
import clientHandleCapture from './client-handle-capture.mjs';
import closeOnlyRoundtrip from './close-only-roundtrip.mjs';
import collectionBoundToProperty from './collection-bound-to-property.mjs';
import columnCellCountMismatch from './column-cell-count-mismatch.mjs';
import controlDeprecated from './control-deprecated.mjs';
import controlTooNew from './control-too-new.mjs';
import crlfLineEnding from './crlf-line-ending.mjs';
import dateTypeWithoutSource from './date-type-without-source.mjs';
import defaultKeyTable from './default-key-table.mjs';
import deleteIndexInLoop from './delete-index-in-loop.mjs';
import deprecatedLibrary from './deprecated-library.mjs';
import duplicateAggregation from './duplicate-aggregation.mjs';
import duplicateForIterator from './duplicate-for-iterator.mjs';
import duplicateId from './duplicate-id.mjs';
import editableControlWithoutBinding from './editable-control-without-binding.mjs';
import emptyCatchBlock from './empty-catch-block.mjs';
import enumBoundToInitialField from './enum-bound-to-initial-field.mjs';
import escapeSequenceInBacktick from './escape-sequence-in-backtick.mjs';
import eventArgDefaultIndex from './event-arg-default-index.mjs';
import eventArgJsCallback from './event-arg-js-callback.mjs';
import eventForProperty from './event-for-property.mjs';
import eventOnDisabledControl from './event-on-disabled-control.mjs';
import eventParameterTooNew from './event-parameter-too-new.mjs';
import externalLinkWithoutTarget from './external-link-without-target.mjs';
import frontendActionAsBackendEvent from './frontend-action-as-backend-event.mjs';
import htmlContentNotMarkup from './html-content-not-markup.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.mjs';
import invalidAggregationChild from './invalid-aggregation-child.mjs';
import invalidExpressionBinding from './invalid-expression-binding.mjs';
import jsonBindOnScalarProperty from './json-bind-on-scalar-property.mjs';
import jsonLiteralInAttribute from './json-literal-in-attribute.mjs';
import lifecycleIsInitial from './lifecycle-is-initial.mjs';
import manualInitFlag from './manual-init-flag.mjs';
import memberDeprecated from './member-deprecated.mjs';
import memberTooNew from './member-too-new.mjs';
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
import relativeAggregationWithoutContext from './relative-aggregation-without-context.mjs';
import relativeBindingWithoutContext from './relative-binding-without-context.mjs';
import rowsHiddenByVisible from './rows-hidden-by-visible.mjs';
import sapui5OnlyControl from './sapui5-only-control.mjs';
import secondRoot from './second-root.mjs';
import separateLifecycleIfs from './separate-lifecycle-ifs.mjs';
import sourceLineTooLong from './source-line-too-long.mjs';
import tooManyChildren from './too-many-children.mjs';
import toolbarControlInBar from './toolbar-control-in-bar.mjs';
import trailingWhitespace from './trailing-whitespace.mjs';
import unconvertedAbapBoolean from './unconverted-abap-boolean.mjs';
import uncuratedFormatter from './uncurated-formatter.mjs';
import undeclaredNamespace from './undeclared-namespace.mjs';
import undefinedCssClass from './undefined-css-class.mjs';
import unescapedTextInAttribute from './unescaped-text-in-attribute.mjs';
import unknownAggregation from './unknown-aggregation.mjs';
import unknownBindingPath from './unknown-binding-path.mjs';
import unknownControl from './unknown-control.mjs';
import unknownEventParameter from './unknown-event-parameter.mjs';
import unknownModel from './unknown-model.mjs';
import unknownProperty from './unknown-property.mjs';
import unknownSourceProperty from './unknown-source-property.mjs';
import unresolvedAttributeValue from './unresolved-attribute-value.mjs';
import unusedNamespaceDeclaration from './unused-namespace-declaration.mjs';
import validatingSetterOutOfRange from './validating-setter-out-of-range.mjs';
import valueHeaderDefaultReassigned from './value-header-default-reassigned.mjs';
import viewNeverDisplayed from './view-never-displayed.mjs';

export const UNIT_RULES = Object.freeze([
  abapDateFormatterMismatch,
  abapdocHtmlTag,
  aggregationInAggregation,
  aggregationTooNew,
  associationUnknownId,
  bindPathAsValue,
  bindPathFlag,
  bindingForEvent,
  bindingOnAssociation,
  bindingTypeMismatch,
  boolcInsteadOfXsdbool,
  boundAggregationOverSizeLimit,
  boundAggregationWithoutTemplate,
  byteOrderMark,
  classConstructorVisibility,
  clientHandleCapture,
  closeOnlyRoundtrip,
  collectionBoundToProperty,
  columnCellCountMismatch,
  controlDeprecated,
  controlTooNew,
  crlfLineEnding,
  dateTypeWithoutSource,
  defaultKeyTable,
  deleteIndexInLoop,
  deprecatedLibrary,
  duplicateAggregation,
  duplicateForIterator,
  duplicateId,
  editableControlWithoutBinding,
  emptyCatchBlock,
  enumBoundToInitialField,
  escapeSequenceInBacktick,
  eventArgDefaultIndex,
  eventArgJsCallback,
  eventForProperty,
  eventOnDisabledControl,
  eventParameterTooNew,
  externalLinkWithoutTarget,
  frontendActionAsBackendEvent,
  htmlContentNotMarkup,
  intoCorrespondingInlineDecl,
  invalidAggregationChild,
  invalidExpressionBinding,
  jsonBindOnScalarProperty,
  jsonLiteralInAttribute,
  lifecycleIsInitial,
  manualInitFlag,
  memberDeprecated,
  memberTooNew,
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
  relativeAggregationWithoutContext,
  relativeBindingWithoutContext,
  rowsHiddenByVisible,
  sapui5OnlyControl,
  secondRoot,
  separateLifecycleIfs,
  sourceLineTooLong,
  tooManyChildren,
  toolbarControlInBar,
  trailingWhitespace,
  unconvertedAbapBoolean,
  uncuratedFormatter,
  undeclaredNamespace,
  undefinedCssClass,
  unescapedTextInAttribute,
  unknownAggregation,
  unknownBindingPath,
  unknownControl,
  unknownEventParameter,
  unknownModel,
  unknownProperty,
  unknownSourceProperty,
  unresolvedAttributeValue,
  unusedNamespaceDeclaration,
  validatingSetterOutOfRange,
  valueHeaderDefaultReassigned,
  viewNeverDisplayed,
]);

const BY_ID = new Map(UNIT_RULES.map((r) => [r.id, r]));
if (BY_ID.size !== UNIT_RULES.length) throw new Error('lib/rules/index.mjs: two rules share an id');

/** The rule defined as a unit under `id`, or undefined. */
export const unitRule = (id) => BY_ID.get(id);
