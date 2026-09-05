/*
 * Synthetic UI5 module for the metadata generator's tests: example code in
 * a JSDoc block and in a line comment, as Control.js, Element.js and
 * UIComponent.js carry it, and a quoted call inside a string, as
 * mvc/Controller.js builds one for an error message. None of those is a
 * class.
 */
sap.ui.define(["sap/ui/core/Control"], function(Control) {
	"use strict";

	/**
	 * A control with documentation.
	 *
	 * @example
	 * Control.extend("my.example.NotAClass", {
	 *   metadata: { properties: { value: "string" } }
	 * });
	 */
	var Real = Control.extend("my.lib.Real", {
		metadata: { library: "my.lib" }
	});

	// Control.extend("my.example.LineComment", {});

	Real.prototype.explain = function() {
		throw new Error(`Controller.extend("...") and the View.extend("...") call differ.`);
	};

	return Real;
});
