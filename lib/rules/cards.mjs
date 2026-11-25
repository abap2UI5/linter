/*
 * The cards of the rules in index.mjs - one <id>.card.mjs beside each
 * <id>.mjs, holding the prose a reader is shown: summary, detail, example,
 * remedy and, for a rule that fixes, fixNote (lib/rule.mjs, defineCard( )).
 *
 * A registry of its own, and the only one that imports the cards: what
 * judges a view (index.mjs and everything ./check reaches) imports none of
 * them, so a browser bundle of ./check carries no card text. rule-docs.mjs
 * pairs the two lists and throws on a rule without a card or a card without
 * a rule; test/review/rule-units.mjs holds the files to the same pairing.
 *
 * Imported statically, one line per card, in the order of index.mjs.
 */
import abap2ui5ApiTooNew from './abap2ui5-api-too-new.card.mjs';
import abapDateFormatterMismatch from './abap-date-formatter-mismatch.card.mjs';
import abapdocHtmlTag from './abapdoc-html-tag.card.mjs';
import absentBooleanOverridesDefault from './absent-boolean-overrides-default.card.mjs';
import aggregationInAggregation from './aggregation-in-aggregation.card.mjs';
import aggregationTooNew from './aggregation-too-new.card.mjs';
import associationUnknownId from './association-unknown-id.card.mjs';
import attributeWithoutElement from './attribute-without-element.card.mjs';
import bindPathAsValue from './bind-path-as-value.card.mjs';
import bindPathFlag from './bind-path-flag.card.mjs';
import bindingForEvent from './binding-for-event.card.mjs';
import bindingOnAssociation from './binding-on-association.card.mjs';
import bindingToExpression from './binding-to-expression.card.mjs';
import bindingToLocal from './binding-to-local.card.mjs';
import bindingToNonpublic from './binding-to-nonpublic.card.mjs';
import bindingToReference from './binding-to-reference.card.mjs';
import bindingToStatic from './binding-to-static.card.mjs';
import bindingTypeMismatch from './binding-type-mismatch.card.mjs';
import bindingTypeTooNew from './binding-type-too-new.card.mjs';
import boolcInsteadOfXsdbool from './boolc-instead-of-xsdbool.card.mjs';
import boundAggregationOverSizeLimit from './bound-aggregation-over-size-limit.card.mjs';
import boundAggregationWithoutTemplate from './bound-aggregation-without-template.card.mjs';
import byteOrderMark from './byte-order-mark.card.mjs';
import chainElementPerLine from './chain-element-per-line.card.mjs';
import chainHouseLayout from './chain-house-layout.card.mjs';
import chainIndentation from './chain-indentation.card.mjs';
import chainUnbalancedParens from './chain-unbalanced-parens.card.mjs';
import classConstructorVisibility from './class-constructor-visibility.card.mjs';
import clientHandleCapture from './client-handle-capture.card.mjs';
import closeOnlyRoundtrip from './close-only-roundtrip.card.mjs';
import collapsedBraceInStyle from './collapsed-brace-in-style.card.mjs';
import collectionBoundToProperty from './collection-bound-to-property.card.mjs';
import columnCellCountMismatch from './column-cell-count-mismatch.card.mjs';
import commercialUi5Host from './commercial-ui5-host.card.mjs';
import controlCallArgCount from './control-call-arg-count.card.mjs';
import controlCallArgKind from './control-call-arg-kind.card.mjs';
import controlDeprecated from './control-deprecated.card.mjs';
import controlStateLostOnRebuild from './control-state-lost-on-rebuild.card.mjs';
import controlTooNew from './control-too-new.card.mjs';
import crlfLineEnding from './crlf-line-ending.card.mjs';
import dateTypeWithoutSource from './date-type-without-source.card.mjs';
import defaultKeyTable from './default-key-table.card.mjs';
import deleteIndexInLoop from './delete-index-in-loop.card.mjs';
import deniedControlMethod from './denied-control-method.card.mjs';
import deprecatedAfterTarget from './deprecated-after-target.card.mjs';
import deprecatedLibrary from './deprecated-library.card.mjs';
import displayAfterNavAppCall from './display-after-nav-app-call.card.mjs';
import displayRootMismatch from './display-root-mismatch.card.mjs';
import doubleDisplayInBranch from './double-display-in-branch.card.mjs';
import duplicateAggregation from './duplicate-aggregation.card.mjs';
import duplicateForIterator from './duplicate-for-iterator.card.mjs';
import duplicateId from './duplicate-id.card.mjs';
import duplicateProperty from './duplicate-property.card.mjs';
import editableControlWithoutBinding from './editable-control-without-binding.card.mjs';
import emptyCatchBlock from './empty-catch-block.card.mjs';
import enumBindingNoFallback from './enum-binding-no-fallback.card.mjs';
import enumBoundToConditionalField from './enum-bound-to-conditional-field.card.mjs';
import enumBoundToInitialField from './enum-bound-to-initial-field.card.mjs';
import enumCondWithoutElse from './enum-cond-without-else.card.mjs';
import escapeHandlerAsString from './escape-handler-as-string.card.mjs';
import enumFieldUnsetOnInsert from './enum-field-unset-on-insert.card.mjs';
import enumValueTooNew from './enum-value-too-new.card.mjs';
import escapeSequenceInBacktick from './escape-sequence-in-backtick.card.mjs';
import escapedBraceInBacktick from './escaped-brace-in-backtick.card.mjs';
import eventArgDefaultIndex from './event-arg-default-index.card.mjs';
import eventArgJsCallback from './event-arg-js-callback.card.mjs';
import eventArgOutOfRange from './event-arg-out-of-range.card.mjs';
import eventArgSingleRowTable from './event-arg-single-row-table.card.mjs';
import eventArgUnresolved from './event-arg-unresolved.card.mjs';
import eventForProperty from './event-for-property.card.mjs';
import eventNameCaseMismatch from './event-name-case-mismatch.card.mjs';
import eventOnDisabledControl from './event-on-disabled-control.card.mjs';
import eventParameterTooNew from './event-parameter-too-new.card.mjs';
import eventWithoutHandler from './event-without-handler.card.mjs';
import excessShut from './excess-shut.card.mjs';
import externalLinkWithoutTarget from './external-link-without-target.card.mjs';
import filterGroupsNotArrays from './filter-groups-not-arrays.card.mjs';
import frontendActionAsBackendEvent from './frontend-action-as-backend-event.card.mjs';
import frontendActionTooNew from './frontend-action-too-new.card.mjs';
import frontendActionUnknownId from './frontend-action-unknown-id.card.mjs';
import frozenViewBuilder from './frozen-view-builder.card.mjs';
import getViewnameRemoved from './get-viewname-removed.card.mjs';
import handlerWithoutEvent from './handler-without-event.card.mjs';
import hardcodedBindingPath from './hardcoded-binding-path.card.mjs';
import htmlContentNotMarkup from './html-content-not-markup.card.mjs';
import iconRemoved from './icon-removed.card.mjs';
import iconTooNew from './icon-too-new.card.mjs';
import insecureAssetUrl from './insecure-asset-url.card.mjs';
import intoCorrespondingInlineDecl from './into-corresponding-inline-decl.card.mjs';
import invalidActionPayload from './invalid-action-payload.card.mjs';
import invalidAggregationChild from './invalid-aggregation-child.card.mjs';
import invalidAggregationItem from './invalid-aggregation-item.card.mjs';
import invalidCssValue from './invalid-css-value.card.mjs';
import invalidExpressionBinding from './invalid-expression-binding.card.mjs';
import invalidFrontendAction from './invalid-frontend-action.card.mjs';
import invalidKeyboardShortcut from './invalid-keyboard-shortcut.card.mjs';
import invalidPropertyValue from './invalid-property-value.card.mjs';
import jsonBindOnScalarProperty from './json-bind-on-scalar-property.card.mjs';
import jsonLiteralInAttribute from './json-literal-in-attribute.card.mjs';
import lifecycleIsInitial from './lifecycle-is-initial.card.mjs';
import literalViewSlot from './literal-view-slot.card.mjs';
import liveEventRoundtrip from './live-event-roundtrip.card.mjs';
import loopWorkAreaBound from './loop-work-area-bound.card.mjs';
import malformedXml from './malformed-xml.card.mjs';
import manualInitFlag from './manual-init-flag.card.mjs';
import memberDeprecated from './member-deprecated.card.mjs';
import memberTooNew from './member-too-new.card.mjs';
import messageBeforeNavigation from './message-before-navigation.card.mjs';
import messageBoxRemovedParameter from './message-box-removed-parameter.card.mjs';
import missingAccessibility from './missing-accessibility.card.mjs';
import missingFinalNewline from './missing-final-newline.card.mjs';
import missingOnNavigatedBranch from './missing-on-navigated-branch.card.mjs';
import missingRequiredAggregation from './missing-required-aggregation.card.mjs';
import missingViewDisplayOnNavigated from './missing-view-display-on-navigated.card.mjs';
import nativeHtmlInView from './native-html-in-view.card.mjs';
import navigationLostOnRebuild from './navigation-lost-on-rebuild.card.mjs';
import navTargetNeverDisplays from './nav-target-never-displays.card.mjs';
import namespacedRowBinding from './namespaced-row-binding.card.mjs';
import nestViewWithoutDestroy from './nest-view-without-destroy.card.mjs';
import nonReleasedApi from './non-released-api.card.mjs';
import obsoleteBindArgument from './obsolete-bind-argument.card.mjs';
import obsoleteBinder from './obsolete-binder.card.mjs';
import obsoleteCustomControl from './obsolete-custom-control.card.mjs';
import obsoleteFrontendEvent from './obsolete-frontend-event.card.mjs';
import obsoleteModelUpdate from './obsolete-model-update.card.mjs';
import omitInitialDropsFalse from './omit-initial-drops-false.card.mjs';
import pickerValueWithoutFormat from './picker-value-without-format.card.mjs';
import popoverAnchorUnknownId from './popover-anchor-unknown-id.card.mjs';
import popoverDisplayVal from './popover-display-val.card.mjs';
import popupDisplayXml from './popup-display-xml.card.mjs';
import popupWithoutCloseWire from './popup-without-close-wire.card.mjs';
import portableApp from './portable-app.card.mjs';
import nonpublicDataReference from './nonpublic-data-reference.card.mjs';
import privateAppAttribute from './private-app-attribute.card.mjs';
import queueLastWithoutNoBusy from './queue-last-without-no-busy.card.mjs';
import rawJavascriptToFrontend from './raw-javascript-to-frontend.card.mjs';
import redundantConvI from './redundant-conv-i.card.mjs';
import redundantInitDisplay from './redundant-init-display.card.mjs';
import redundantSerializable from './redundant-serializable.card.mjs';
import relativeAggregationWithoutContext from './relative-aggregation-without-context.card.mjs';
import relativeAssetUrl from './relative-asset-url.card.mjs';
import relativeBindingWithoutContext from './relative-binding-without-context.card.mjs';
import rowsHiddenByVisible from './rows-hidden-by-visible.card.mjs';
import sapui5OnlyControl from './sapui5-only-control.card.mjs';
import secondRoot from './second-root.card.mjs';
import separateLifecycleIfs from './separate-lifecycle-ifs.card.mjs';
import settablePropertyViaAction from './settable-property-via-action.card.mjs';
import statefulWithoutRelease from './stateful-without-release.card.mjs';
import smartVariantWithoutInit from './smart-variant-without-init.card.mjs';
import sourceLineTooLong from './source-line-too-long.card.mjs';
import tooManyChildren from './too-many-children.card.mjs';
import toolbarControlInBar from './toolbar-control-in-bar.card.mjs';
import trailingEmptyEventArg from './trailing-empty-event-arg.card.mjs';
import trailingWhitespace from './trailing-whitespace.card.mjs';
import ui5InternalAccess from './ui5-internal-access.card.mjs';
import unboundPublicAttribute from './unbound-public-attribute.card.mjs';
import unconditionalPopupDisplay from './unconditional-popup-display.card.mjs';
import unconvertedAbapBoolean from './unconverted-abap-boolean.card.mjs';
import uncuratedFormatter from './uncurated-formatter.card.mjs';
import undeclaredNamespace from './undeclared-namespace.card.mjs';
import undefinedCssClass from './undefined-css-class.card.mjs';
import unescapedBraceInStyle from './unescaped-brace-in-style.card.mjs';
import unescapedTextInAttribute from './unescaped-text-in-attribute.card.mjs';
import unknownAggregation from './unknown-aggregation.card.mjs';
import unknownBuilderMethod from './unknown-builder-method.card.mjs';
import unknownBindingPath from './unknown-binding-path.card.mjs';
import unknownBindingType from './unknown-binding-type.card.mjs';
import unknownControl from './unknown-control.card.mjs';
import unknownDirectiveRule from './unknown-directive-rule.card.mjs';
import unknownEventParameter from './unknown-event-parameter.card.mjs';
import unknownFrontendAction from './unknown-frontend-action.card.mjs';
import unknownIcon from './unknown-icon.card.mjs';
import unknownMessageBoxType from './unknown-message-box-type.card.mjs';
import unknownModel from './unknown-model.card.mjs';
import unknownProperty from './unknown-property.card.mjs';
import unknownSourceProperty from './unknown-source-property.card.mjs';
import unknownViewSlot from './unknown-view-slot.card.mjs';
import unresolvedAttributeValue from './unresolved-attribute-value.card.mjs';
import unusedDirective from './unused-directive.card.mjs';
import unusedNamespaceDeclaration from './unused-namespace-declaration.card.mjs';
import unusedPublicAttribute from './unused-public-attribute.card.mjs';
import validatingSetterOutOfRange from './validating-setter-out-of-range.card.mjs';
import valueHeaderDefaultReassigned from './value-header-default-reassigned.card.mjs';
import viewNeverDisplayed from './view-never-displayed.card.mjs';
import xmlIndentation from './xml-indentation.card.mjs';

export const UNIT_CARDS = Object.freeze([
  abap2ui5ApiTooNew,
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
  enumBindingNoFallback,
  enumBoundToConditionalField,
  enumBoundToInitialField,
  enumCondWithoutElse,
  escapeHandlerAsString,
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
  messageBeforeNavigation,
  messageBoxRemovedParameter,
  missingAccessibility,
  missingFinalNewline,
  missingOnNavigatedBranch,
  missingRequiredAggregation,
  missingViewDisplayOnNavigated,
  nativeHtmlInView,
  navigationLostOnRebuild,
  navTargetNeverDisplays,
  namespacedRowBinding,
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
  portableApp,
  nonpublicDataReference,
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
  statefulWithoutRelease,
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
  unknownBuilderMethod,
  unknownBindingType,
  unknownControl,
  unknownDirectiveRule,
  unknownEventParameter,
  unknownFrontendAction,
  unknownIcon,
  unknownMessageBoxType,
  unknownModel,
  unknownProperty,
  unknownSourceProperty,
  unknownViewSlot,
  unresolvedAttributeValue,
  unusedDirective,
  unusedNamespaceDeclaration,
  unusedPublicAttribute,
  validatingSetterOutOfRange,
  valueHeaderDefaultReassigned,
  viewNeverDisplayed,
  xmlIndentation,
]);
