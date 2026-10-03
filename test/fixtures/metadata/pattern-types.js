/*!
 * Synthetic library module: three createType shapes. Only the first two are a
 * single regex test the snapshot's typePatterns can carry.
 */
sap.ui.define(["sap/ui/base/DataType"], function (DataType) {
	"use strict";
	var thisLib = {};

	/**
	 * @classdesc A size with a unit.
	 * @public
	 */
	thisLib.Size = DataType.createType('my.lib.Size', {
			isValid : function(vValue) {
				// a comment line above the return, as sap.ui.core.CSSSize has
				return /^([0-9]+(px|rem)|auto|calc\(\s*[0-9]+px [-+] [0-9]+px\s*\))$/.test(vValue);
			}
		},
		DataType.getType('string')
	);

	thisLib.Span = DataType.createType("my.lib.Span", {
		isValid: function (v) { return /^([Ll](?:[1-9]|1[0-2]))?$/.test(v); }
	}, DataType.getType("string"));

	// two tests: not one regex, not carried
	thisLib.ColorOrEnum = DataType.createType("my.lib.ColorOrEnum", {
		isValid: function (vValue) {
			if (vValue === "Accent1") { return true; }
			return /^#[0-9a-f]{6}$/.test(vValue);
		}
	}, DataType.getType("string"));

	return thisLib;
});
