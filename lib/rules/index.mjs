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
import absentBooleanOverridesDefault from './absent-boolean-overrides-default.mjs';
import aggregationInAggregation from './aggregation-in-aggregation.mjs';
import aggregationTooNew from './aggregation-too-new.mjs';
import associationUnknownId from './association-unknown-id.mjs';
import attributeWithoutElement from './attribute-without-element.mjs';
import bindPathAsValue from './bind-path-as-value.mjs';
import bindPathFlag from './bind-path-flag.mjs';
import bindingForEvent from './binding-for-event.mjs';
import bindingOnAssociation from './binding-on-association.mjs';
import bindingToExpression from './binding-to-expression.mjs';
import bindingToLocal from './binding-to-local.mjs';
import bindingToNonpublic from './binding-to-nonpublic.mjs';
import bindingToReference from './binding-to-reference.mjs';
import bindingToStatic from './binding-to-static.mjs';
import bindingTypeMismatch from './binding-type-mismatch.mjs';
import bindingTypeTooNew from './binding-type-too-new.mjs';
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.mjs';
import boundAggregationOverSizeLimit from './bound-aggregation-over-size-limit.mjs';
import boundAggregationWithoutTemplate from './bound-aggregation-without-template.mjs';
import byteOrderMark from './byte-order-mark.mjs';
import chainElementPerLine from './chain-element-per-line.mjs';
import chainHouseLayout from './chain-house-layout.mjs';
import chainIndentation from './chain-indentation.mjs';
import chainUnbalancedParens from './chain-unbalanced-parens.mjs';
import classConstructorVisibility from './class-constructor-visibility.mjs';
import clientHandleCapture from './client-handle-capture.mjs';
import closeOnlyRoundtrip from './close-only-roundtrip.mjs';
import collapsedBraceInStyle from './collapsed-brace-in-style.mjs';
import collectionBoundToProperty from './collection-bound-to-property.mjs';
import columnCellCountMismatch from './column-cell-count-mismatch.mjs';
import commercialUi5Host from './commercial-ui5-host.mjs';
import controlCallArgCount from './control-call-arg-count.mjs';
import controlCallArgKind from './control-call-arg-kind.mjs';
import controlDeprecated from './control-deprecated.mjs';
import controlStateLostOnRebuild from './control-state-lost-on-rebuild.mjs';
import controlTooNew from './control-too-new.mjs';
import crlfLineEnding from './crlf-line-ending.mjs';
import dateTypeWithoutSource from './date-type-without-source.mjs';
import defaultKeyTable from './default-key-table.mjs';
import deleteIndexInLoop from './delete-index-in-loop.mjs';
import deniedControlMethod from './denied-control-method.mjs';
import deprecatedAfterTarget from './deprecated-after-target.mjs';
import deprecatedLibrary from './deprecated-library.mjs';
import displayAfterNavAppCall from './display-after-nav-app-call.mjs';
import displayRootMismatch from './display-root-mismatch.mjs';
import doubleDisplayInBranch from './double-display-in-branch.mjs';
import duplicateAggregation from './duplicate-aggregation.mjs';
import duplicateForIterator from './duplicate-for-iterator.mjs';
import duplicateId from './duplicate-id.mjs';
import duplicateProperty from './duplicate-property.mjs';
import editableControlWithoutBinding from './editable-control-without-binding.mjs';
import emptyCatchBlock from './empty-catch-block.mjs';
import enumBoundToInitialField from './enum-bound-to-initial-field.mjs';
import enumFieldUnsetOnInsert from './enum-field-unset-on-insert.mjs';
import enumValueTooNew from './enum-value-too-new.mjs';
import escapeSequenceInBacktick from './escape-sequence-in-backtick.mjs';
import escapedBraceInBacktick from './escaped-brace-in-backtick.mjs';
import eventArgDefaultIndex from './event-arg-default-index.mjs';
import eventArgJsCallback from './event-arg-js-callback.mjs';
import eventArgOutOfRange from './event-arg-out-of-range.mjs';
import eventArgSingleRowTable from './event-arg-single-row-table.mjs';
import eventArgUnresolved from './event-arg-unresolved.mjs';
import eventForProperty from './event-for-property.mjs';
import eventNameCaseMismatch from './event-name-case-mismatch.mjs';
import eventOnDisabledControl from './event-on-disabled-control.mjs';
import eventParameterTooNew from './event-parameter-too-new.mjs';
import eventWithoutHandler from './event-without-handler.mjs';
import excessShut from './excess-shut.mjs';
import externalLinkWithoutTarget from './external-link-without-target.mjs';
import filterGroupsNotArrays from './filter-groups-not-arrays.mjs';
import frontendActionAsBackendEvent from './frontend-action-as-backend-event.mjs';
import frontendActionTooNew from './frontend-action-too-new.mjs';
import frontendActionUnknownId from './frontend-action-unknown-id.mjs';
import frozenViewBuilder from './frozen-view-builder.mjs';
import getViewnameRemoved from './get-viewname-removed.mjs';
import handlerWithoutEvent from './handler-without-event.mjs';
import hardcodedBindingPath from './hardcoded-binding-path.mjs';
import htmlContentNotMarkup from './html-content-not-markup.mjs';
import iconRemoved from './icon-removed.mjs';
import iconTooNew from './icon-too-new.mjs';
import insecureAssetUrl from './insecure-asset-url.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.mjs';
import invalidActionPayload from './invalid-action-payload.mjs';
import invalidAggregationChild from './invalid-aggregation-child.mjs';
import invalidAggregationItem from './invalid-aggregation-item.mjs';
import invalidCssValue from './invalid-css-value.mjs';
import invalidExpressionBinding from './invalid-expression-binding.mjs';
import invalidFrontendAction from './invalid-frontend-action.mjs';
import invalidKeyboardShortcut from './invalid-keyboard-shortcut.mjs';
import invalidPropertyValue from './invalid-property-value.mjs';
import jsonBindOnScalarProperty from './json-bind-on-scalar-property.mjs';
import jsonLiteralInAttribute from './json-literal-in-attribute.mjs';
import lifecycleIsInitial from './lifecycle-is-initial.mjs';
import literalViewSlot from './literal-view-slot.mjs';
import liveEventRoundtrip from './live-event-roundtrip.mjs';
import loopWorkAreaBound from './loop-work-area-bound.mjs';
import malformedXml from './malformed-xml.mjs';
import manualInitFlag from './manual-init-flag.mjs';
import memberDeprecated from './member-deprecated.mjs';
import memberTooNew from './member-too-new.mjs';
import messageBoxRemovedParameter from './message-box-removed-parameter.mjs';
import missingAccessibility from './missing-accessibility.mjs';
import missingFinalNewline from './missing-final-newline.mjs';
import missingOnNavigatedBranch from './missing-on-navigated-branch.mjs';
import missingRequiredAggregation from './missing-required-aggregation.mjs';
import missingViewDisplayOnNavigated from './missing-view-display-on-navigated.mjs';
import nativeHtmlInView from './native-html-in-view.mjs';
import navigationLostOnRebuild from './navigation-lost-on-rebuild.mjs';
import nestViewWithoutDestroy from './nest-view-without-destroy.mjs';
import nonReleasedApi from './non-released-api.mjs';
import obsoleteBindArgument from './obsolete-bind-argument.mjs';
import obsoleteBinder from './obsolete-binder.mjs';
import obsoleteCustomControl from './obsolete-custom-control.mjs';
import obsoleteFrontendEvent from './obsolete-frontend-event.mjs';
import obsoleteModelUpdate from './obsolete-model-update.mjs';
import omitInitialDropsFalse from './omit-initial-drops-false.mjs';
import pickerValueWithoutFormat from './picker-value-without-format.mjs';
import popoverAnchorUnknownId from './popover-anchor-unknown-id.mjs';
import popoverDisplayVal from './popover-display-val.mjs';
import popupDisplayXml from './popup-display-xml.mjs';
import popupWithoutCloseWire from './popup-without-close-wire.mjs';
import privateAppAttribute from './private-app-attribute.mjs';
import queueLastWithoutNoBusy from './queue-last-without-no-busy.mjs';
import rawJavascriptToFrontend from './raw-javascript-to-frontend.mjs';
import redundantConvI from './redundant-conv-i.mjs';
import redundantInitDisplay from './redundant-init-display.mjs';
import redundantSerializable from './redundant-serializable.mjs';
import relativeAggregationWithoutContext from './relative-aggregation-without-context.mjs';
import relativeAssetUrl from './relative-asset-url.mjs';
import relativeBindingWithoutContext from './relative-binding-without-context.mjs';
import rowsHiddenByVisible from './rows-hidden-by-visible.mjs';
import sapui5OnlyControl from './sapui5-only-control.mjs';
import secondRoot from './second-root.mjs';
import separateLifecycleIfs from './separate-lifecycle-ifs.mjs';
import settablePropertyViaAction from './settable-property-via-action.mjs';
import smartVariantWithoutInit from './smart-variant-without-init.mjs';
import sourceLineTooLong from './source-line-too-long.mjs';
import tooManyChildren from './too-many-children.mjs';
import toolbarControlInBar from './toolbar-control-in-bar.mjs';
import trailingEmptyEventArg from './trailing-empty-event-arg.mjs';
import trailingWhitespace from './trailing-whitespace.mjs';
import ui5InternalAccess from './ui5-internal-access.mjs';
import unboundPublicAttribute from './unbound-public-attribute.mjs';
import unconditionalPopupDisplay from './unconditional-popup-display.mjs';
import unconvertedAbapBoolean from './unconverted-abap-boolean.mjs';
import uncuratedFormatter from './uncurated-formatter.mjs';
import undeclaredNamespace from './undeclared-namespace.mjs';
import undefinedCssClass from './undefined-css-class.mjs';
import unescapedBraceInStyle from './unescaped-brace-in-style.mjs';
import unescapedTextInAttribute from './unescaped-text-in-attribute.mjs';
import unknownAggregation from './unknown-aggregation.mjs';
import unknownBindingPath from './unknown-binding-path.mjs';
import unknownBindingType from './unknown-binding-type.mjs';
import unknownControl from './unknown-control.mjs';
import unknownEventParameter from './unknown-event-parameter.mjs';
import unknownFrontendAction from './unknown-frontend-action.mjs';
import unknownIcon from './unknown-icon.mjs';
import unknownMessageBoxType from './unknown-message-box-type.mjs';
import unknownModel from './unknown-model.mjs';
import unknownProperty from './unknown-property.mjs';
import unknownSourceProperty from './unknown-source-property.mjs';
import unknownViewSlot from './unknown-view-slot.mjs';
import unresolvedAttributeValue from './unresolved-attribute-value.mjs';
import unusedNamespaceDeclaration from './unused-namespace-declaration.mjs';
import unusedPublicAttribute from './unused-public-attribute.mjs';
import validatingSetterOutOfRange from './validating-setter-out-of-range.mjs';
import valueHeaderDefaultReassigned from './value-header-default-reassigned.mjs';
import viewNeverDisplayed from './view-never-displayed.mjs';

export const UNIT_RULES = Object.freeze([
  abapDateFormatterMismatch,
  abapdocHtmlTag,
  absentBooleanOverridesDefault,
  aggregationInAggregation,
  aggregationTooNew,
  associationUnknownId,
  attributeWithoutElement,
  bindPathAsValue,
  bindPathFlag,
  bindingForEvent,
  bindingOnAssociation,
  bindingToExpression,
  bindingToLocal,
  bindingToNonpublic,
  bindingToReference,
  bindingToStatic,
  bindingTypeMismatch,
  bindingTypeTooNew,
  boolcInsteadOfXsdbool,
  boundAggregationOverSizeLimit,
  boundAggregationWithoutTemplate,
  byteOrderMark,
  chainElementPerLine,
  chainHouseLayout,
  chainIndentation,
  chainUnbalancedParens,
  classConstructorVisibility,
  clientHandleCapture,
  closeOnlyRoundtrip,
  collapsedBraceInStyle,
  collectionBoundToProperty,
  columnCellCountMismatch,
  commercialUi5Host,
  controlCallArgCount,
  controlCallArgKind,
  controlDeprecated,
  controlStateLostOnRebuild,
  controlTooNew,
  crlfLineEnding,
  dateTypeWithoutSource,
  defaultKeyTable,
  deleteIndexInLoop,
  deniedControlMethod,
  deprecatedAfterTarget,
  deprecatedLibrary,
  displayAfterNavAppCall,
  displayRootMismatch,
  doubleDisplayInBranch,
  duplicateAggregation,
  duplicateForIterator,
  duplicateId,
  duplicateProperty,
  editableControlWithoutBinding,
  emptyCatchBlock,
  enumBoundToInitialField,
  enumFieldUnsetOnInsert,
  enumValueTooNew,
  escapeSequenceInBacktick,
  escapedBraceInBacktick,
  eventArgDefaultIndex,
  eventArgJsCallback,
  eventArgOutOfRange,
  eventArgSingleRowTable,
  eventArgUnresolved,
  eventForProperty,
  eventNameCaseMismatch,
  eventOnDisabledControl,
  eventParameterTooNew,
  eventWithoutHandler,
  excessShut,
  externalLinkWithoutTarget,
  filterGroupsNotArrays,
  frontendActionAsBackendEvent,
  frontendActionTooNew,
  frontendActionUnknownId,
  frozenViewBuilder,
  getViewnameRemoved,
  handlerWithoutEvent,
  hardcodedBindingPath,
  htmlContentNotMarkup,
  iconRemoved,
  iconTooNew,
  insecureAssetUrl,
  intoCorrespondingInlineDecl,
  invalidActionPayload,
  invalidAggregationChild,
  invalidAggregationItem,
  invalidCssValue,
  invalidExpressionBinding,
  invalidFrontendAction,
  invalidKeyboardShortcut,
  invalidPropertyValue,
  jsonBindOnScalarProperty,
  jsonLiteralInAttribute,
  lifecycleIsInitial,
  literalViewSlot,
  liveEventRoundtrip,
  loopWorkAreaBound,
  malformedXml,
  manualInitFlag,
  memberDeprecated,
  memberTooNew,
  messageBoxRemovedParameter,
  missingAccessibility,
  missingFinalNewline,
  missingOnNavigatedBranch,
  missingRequiredAggregation,
  missingViewDisplayOnNavigated,
  nativeHtmlInView,
  navigationLostOnRebuild,
  nestViewWithoutDestroy,
  nonReleasedApi,
  obsoleteBindArgument,
  obsoleteBinder,
  obsoleteCustomControl,
  obsoleteFrontendEvent,
  obsoleteModelUpdate,
  omitInitialDropsFalse,
  pickerValueWithoutFormat,
  popoverAnchorUnknownId,
  popoverDisplayVal,
  popupDisplayXml,
  popupWithoutCloseWire,
  privateAppAttribute,
  queueLastWithoutNoBusy,
  rawJavascriptToFrontend,
  redundantConvI,
  redundantInitDisplay,
  redundantSerializable,
  relativeAggregationWithoutContext,
  relativeAssetUrl,
  relativeBindingWithoutContext,
  rowsHiddenByVisible,
  sapui5OnlyControl,
  secondRoot,
  separateLifecycleIfs,
  settablePropertyViaAction,
  smartVariantWithoutInit,
  sourceLineTooLong,
  tooManyChildren,
  toolbarControlInBar,
  trailingEmptyEventArg,
  trailingWhitespace,
  ui5InternalAccess,
  unboundPublicAttribute,
  unconditionalPopupDisplay,
  unconvertedAbapBoolean,
  uncuratedFormatter,
  undeclaredNamespace,
  undefinedCssClass,
  unescapedBraceInStyle,
  unescapedTextInAttribute,
  unknownAggregation,
  unknownBindingPath,
  unknownBindingType,
  unknownControl,
  unknownEventParameter,
  unknownFrontendAction,
  unknownIcon,
  unknownMessageBoxType,
  unknownModel,
  unknownProperty,
  unknownSourceProperty,
  unknownViewSlot,
  unresolvedAttributeValue,
  unusedNamespaceDeclaration,
  unusedPublicAttribute,
  validatingSetterOutOfRange,
  valueHeaderDefaultReassigned,
  viewNeverDisplayed,
]);

const BY_ID = new Map(UNIT_RULES.map((r) => [r.id, r]));
if (BY_ID.size !== UNIT_RULES.length) throw new Error('lib/rules/index.mjs: two rules share an id');

/** The rule defined as a unit under `id`, or undefined. */
export const unitRule = (id) => BY_ID.get(id);
