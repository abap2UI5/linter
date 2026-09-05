/*
 * Synthetic UI5 module for the metadata generator's tests: the values behind
 * alias-enum.js, exported under their own module name.
 */
sap.ui.define([], function() {
	"use strict";

	/**
	 * @enum {string}
	 */
	var Shape = {
		/**
		 * Round.
		 */
		Round: "Round",
		/**
		 * Square.
		 * @since 1.40
		 */
		Square: "Square"
	};

	return Shape;
});
