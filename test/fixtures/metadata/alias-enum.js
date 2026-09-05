/*
 * Synthetic UI5 module for the metadata generator's tests: an enum registered
 * under one name whose values live in a dependency - the shape of
 * sap/ui/core/CalendarType.js, which registers sap.ui.core.CalendarType for
 * the object sap/base/i18n/date/CalendarType exports.
 */
sap.ui.define(["sap/ui/base/DataType", "./values/Shape"], function(DataType, Shape) {
	"use strict";

	DataType.registerEnum("my.lib.Shape", Shape);

	return Shape;
});
