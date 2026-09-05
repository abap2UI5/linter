/*
 * Synthetic UI5 module for the metadata generator's tests: a factory with a
 * single bare arrow parameter.
 */
sap.ui.define(["sap/ui/core/Element"], Element => {
	"use strict";

	return Element.extend("my.lib.BareArrow", {
		metadata: { library: "my.lib" }
	});
});
