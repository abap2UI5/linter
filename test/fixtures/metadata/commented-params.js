/*
 * Synthetic UI5 module for the metadata generator's tests: comments inside
 * the dependency list and the parameter list (MonthPicker, MonthsRow,
 * TimesRow, SinglePlanningCalendarMonthGrid carry one; DragDropBase comments
 * two dependencies out), plus a subclass of a class defined in the same file
 * (LocaleData.js declares CustomLocaleData that way).
 */
sap.ui.define([
	"sap/ui/core/Element",
	"sap/base/Log", // the reader must not split on this comma: a, b
	"sap/ui/core/library" /*, "sap/m/library" */
], function(
	Element,
	Log, // and not on this one: c, d
	coreLibrary /*, mLibrary, DragAndDrop */
) {
	"use strict";

	var CommentedElement = Element.extend("my.lib.CommentedElement", {
		metadata: { library: "my.lib" }
	});

	// the receiver is not a dependency, it is the class above
	var SameFileSub = CommentedElement.extend("my.lib.SameFileSub", {
		metadata: {
			library: "my.lib",
			properties: { x: "string" }
		}
	});

	return SameFileSub;
});
